// Run only against a disposable local API and database named everpage_test.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const api = process.env.EVERPAGE_TEST_API;
const database = process.env.EVERPAGE_TEST_DATABASE_URL;
for (const [name, value] of Object.entries({ api, database })) {
  if (!value || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)) {
    throw new Error(`${name} must explicitly point to a disposable local service`);
  }
}
if (new URL(database).pathname !== '/everpage_test') throw new Error('Refusing a database not named everpage_test');
const require = createRequire(new URL('../lib/db/package.json', import.meta.url));
const { Pool } = require('pg');
const db = new Pool({ connectionString: database });
const suffix = randomBytes(5).toString('hex');
const password = 'Local-Notes-Test-Password!';
async function request(path, { token, body, method = 'POST' } = {}) {
  const response = await fetch(`${api}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
async function account(label) {
  const result = await request('/local-auth/register', { body: {
    email: `${label}-${suffix}@example.invalid`, password, username: `${label}_${suffix}`,
    displayName: `Test ${label}`, birthday: '1990-01-01',
  } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return { id: result.body.user.id, token: result.body.token };
}

test('note retry API boundaries (disposable database)', async t => {
  const accounts = [];
  t.after(async () => {
    try {
      for (const owner of accounts) await request('/local-auth/account', { token: owner.token, body: { password }, method: 'DELETE' });
    } finally { await db.end(); }
  });
  const a = await account('notes_a'); accounts.push(a);
  const b = await account('notes_b'); accounts.push(b);
  const note = { id: `session_${suffix}`, bookTitle: 'Test Book', bookAuthor: 'Test Author', page: 42, noteText: 'Keep this note' };
  let savedId;

  await t.test('concurrent retry and later replay create exactly one note', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => request('/notes', { token: a.token, body: note })));
    assert.equal(results.filter(result => result.status === 201).length, 1);
    assert.equal(results.filter(result => result.status === 200).length, 3);
    assert.equal(new Set(results.map(result => result.body.id)).size, 1);
    savedId = results[0].body.id;
    const replay = await request('/notes', { token: a.token, body: note });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.id, savedId);
    const rows = await db.query('SELECT count(*)::int AS count FROM np_margin_notes WHERE user_id=$1', [a.id]);
    assert.equal(rows.rows[0].count, 1);
  });
  await t.test('changed replay fails without overwriting the saved note', async () => {
    const changed = await request('/notes', { token: a.token, body: { ...note, noteText: 'Different note' } });
    assert.equal(changed.status, 409);
    const result = await db.query('SELECT note_text FROM np_margin_notes WHERE id=$1 AND user_id=$2', [savedId, a.id]);
    assert.equal(result.rows[0].note_text, note.noteText);
  });
  await t.test('same client ID in another account is isolated', async () => {
    const result = await request('/notes', { token: b.token, body: { ...note, noteText: 'Other account note' } });
    assert.equal(result.status, 201);
    assert.notEqual(result.body.id, savedId);
    const rows = await db.query('SELECT id, user_id FROM np_margin_notes WHERE id = ANY($1::text[])', [[savedId, result.body.id]]);
    assert.equal(rows.rows.find(row => row.id === savedId).user_id, a.id);
    assert.equal(rows.rows.find(row => row.id === result.body.id).user_id, b.id);
  });
  await t.test('legacy clients without IDs still create independent notes', async () => {
    const { id, ...legacy } = note;
    const first = await request('/notes', { token: a.token, body: legacy });
    const second = await request('/notes', { token: a.token, body: legacy });
    assert.equal(first.status, 201); assert.equal(second.status, 201);
    assert.notEqual(first.body.id, second.body.id);
  });
});
