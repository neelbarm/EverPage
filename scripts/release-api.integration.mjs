// Run only against a disposable local database and local API process.
// EVERPAGE_TEST_API=http://127.0.0.1:55440
// EVERPAGE_TEST_DATABASE_URL=postgresql://.../everpage_test
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const api = process.env.EVERPAGE_TEST_API;
const database = process.env.EVERPAGE_TEST_DATABASE_URL;
for (const [name, value] of Object.entries({ api, database })) {
  if (!value || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)) {
    throw new Error(`${name} must explicitly point to a disposable local service`);
  }
}
if (!new URL(database).pathname.endsWith('/everpage_test')) {
  throw new Error('Refusing a database not named everpage_test');
}
const require = createRequire(new URL('../lib/db/package.json', import.meta.url));
const { Pool } = require('pg');
const db = new Pool({ connectionString: database });
const suffix = randomBytes(5).toString('hex');
const password = 'Local-Test-Password-2026!';

async function request(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const response = await fetch(`${api}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { nonJson: true }; }
  return { status: response.status, body: json };
}

async function account(label) {
  const email = `${label}-${suffix}@example.invalid`;
  const result = await request('/local-auth/register', { body: {
    email, password, username: `${label}_${suffix}`, displayName: `Test ${label}`, birthday: '1990-01-01',
  } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.ok(result.body.token);
  return { email, id: result.body.user.id, token: result.body.token };
}

test('release API regression boundaries (disposable database)', async (t) => {
  t.after(() => db.end());
  const a = await account('reader_a');
  const b = await account('reader_b');
  const bookId = `book_${suffix}`;

  await t.test('malformed login is a controlled client error', async () => {
    const result = await request('/local-auth/login', { body: { email: {}, password: [] } });
    assert.equal(result.status, 400);
  });

  await t.test('concurrent session replay creates one session and one activity', async () => {
    const book = await request('/bookshelf/books', { token: a.token, body: {
      id: bookId, title: 'Integration Book', author: 'Integration Author', totalPages: 200, currentPage: 10,
    } });
    assert.equal(book.status, 201);
    const body = { id: `session_${suffix}`, bookId, durationMinutes: 5, startPage: 0, endPage: 10,
      date: '2026-09-13', createdAt: Date.now() };
    const responses = await Promise.all(Array.from({ length: 4 }, () => request('/bookshelf/sessions', { token: a.token, body })));
    for (const response of responses) assert.ok(response.status < 300, JSON.stringify(response.body));
    const sessions = await db.query('SELECT count(*)::int AS count FROM np_sessions WHERE user_id=$1 AND id=$2', [a.id, body.id]);
    assert.equal(sessions.rows[0].count, 1);
    const activity = await db.query("SELECT count(*)::int AS count FROM np_activity WHERE user_id=$1 AND activity_type='session'", [a.id]);
    assert.equal(activity.rows[0].count, 1);
    const otherShelf = await request('/bookshelf?today=2026-09-13', { token: b.token });
    assert.equal(otherShelf.body.sessions.length, 0);
  });

  let code;
  await t.test('concurrent room creation yields one membership/room', async () => {
    const body = { bookTitle: `Room ${suffix}`, bookAuthor: 'Integration Author', weeklyTargetPages: 50 };
    const responses = await Promise.all(Array.from({ length: 4 }, () => request('/rooms', { token: a.token, body })));
    for (const response of responses) assert.ok(response.status < 300, JSON.stringify(response.body));
    assert.equal(new Set(responses.map(response => response.body.code)).size, 1);
    code = responses[0].body.code;
    assert.ok(code);
  });

  await t.test('room messages deny nonmembers, then allow explicit join', async () => {
    const denied = await request(`/rooms/${code}/messages`, { token: b.token });
    assert.equal(denied.status, 403);
    const joined = await request(`/rooms/${code}/join`, { token: b.token, body: { currentPage: 0 } });
    assert.ok(joined.status < 300);
    const allowed = await request(`/rooms/${code}/messages`, { token: b.token });
    assert.equal(allowed.status, 200);
  });

  await t.test('simultaneous nudges create one in-app nudge without a push token', async () => {
    // Test accounts have no device token: this never contacts Expo/APNs.
    const follow = await request(`/social/users/${b.id}/follow`, { token: a.token, body: {} });
    assert.ok(follow.status < 300, JSON.stringify(follow.body));
    const responses = await Promise.all(Array.from({ length: 3 }, () => request(`/social/nudge/${b.id}`, { token: a.token, body: {} })));
    assert.equal(responses.filter(response => response.status < 300).length, 1, JSON.stringify(responses));
    assert.equal(responses.filter(response => response.status === 429).length, 2);
    const rows = await db.query('SELECT count(*)::int AS count FROM np_nudges WHERE sender_id=$1 AND recipient_id=$2', [a.id, b.id]);
    assert.equal(rows.rows[0].count, 1);
  });

  await t.test('friends totals use reading dates and reset at the same Monday boundary', async () => {
    await request(`/social/users/${a.id}/follow`, { token: b.token, body: {} });
    await request('/bookshelf/sessions', { token: a.token, body: {
      id: `monday_${suffix}`, bookId, durationMinutes: 7, startPage: 10, endPage: 12,
      date: '2026-09-07', createdAt: Date.now(),
    } });
    const sunday = await request('/social/leaderboard?today=2026-09-13', { token: b.token });
    assert.equal(sunday.status, 200, JSON.stringify(sunday.body));
    const reader = sunday.body.find(row => row.userId === a.id);
    assert.equal(reader.todayMinutes, 5);
    assert.equal(reader.weekMinutes, 12);
    const monday = await request('/social/leaderboard?today=2026-09-14', { token: b.token });
    const nextWeek = monday.body.find(row => row.userId === a.id);
    assert.equal(nextWeek.todayMinutes, 0);
    assert.equal(nextWeek.weekMinutes, 0);
  });

  await t.test('concurrent reset consumes one token and revokes existing sessions', async () => {
    const token = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(token).digest('hex');
    await db.query('INSERT INTO np_password_reset_tokens (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)',
      [`reset_${suffix}`, a.id, hash, new Date(Date.now() + 3600000).toISOString()]);
    const responses = await Promise.all([
      request('/local-auth/reset-password', { body: { token, newPassword: 'First-New-Password-2026!' } }),
      request('/local-auth/reset-password', { body: { token, newPassword: 'Second-New-Password-2026!' } }),
    ]);
    assert.equal(responses.filter(response => response.status === 200).length, 1, JSON.stringify(responses));
    assert.equal(responses.filter(response => response.status >= 400 && response.status < 500).length, 1);
    assert.equal((await request('/local-auth/me', { token: a.token })).status, 401);
  });

  await t.test('account deletion revokes all tokens, not just the current token', async () => {
    const login = await request('/local-auth/login', { body: { email: b.email, password } });
    assert.equal(login.status, 200);
    const deleted = await request('/local-auth/account', { method: 'DELETE', token: b.token, body: { password } });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    assert.equal((await request('/local-auth/me', { token: login.body.token })).status, 401);
    const shelf = await request('/bookshelf', { token: login.body.token });
    assert.equal(shelf.status, 401);
  });
});
