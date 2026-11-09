// Run against a disposable local API/database only; never sends a notification.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const api = process.env.EVERPAGE_TEST_API;
const database = process.env.EVERPAGE_TEST_DATABASE_URL;
for (const value of [api, database]) {
  if (!value || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)) {
    throw new Error('Explicit disposable local API/database required');
  }
}
if (new URL(database).pathname !== '/everpage_test') throw new Error('Disposable everpage_test database required');
const require = createRequire(new URL('../lib/db/package.json', import.meta.url));
const { Pool } = require('pg');
const db = new Pool({ connectionString: database });
const suffix = randomBytes(5).toString('hex');
const password = 'Disposable-push-test!';

async function post(path, token, body = {}) {
  const response = await fetch(`${api}/api${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: response.status, body: await response.json() };
}
async function account(name) {
  const email = `${name}${suffix}@example.invalid`;
  const r = await post('/local-auth/register', null, { email, password, username: `${name}${suffix}`, displayName: name, birthday: '1990-01-01' });
  assert.equal(r.status, 201);
  return { ...r.body, email };
}
async function owners(token) {
  return (await db.query('SELECT id FROM np_users WHERE push_token=$1 ORDER BY id', [token])).rows.map(r => r.id);
}
const device = label => `ExpoPushToken[disposable-${label}-${suffix}]`;
const register = (account, token) => post('/social/push-token', account.token, { token });

async function waitForBlockedRequest(blockerPid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { rows } = await db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))", [blockerPid]);
    if (rows[0].count > 0) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Push registration did not reach the locked account row');
}

test('push device ownership and logout boundaries', async t => {
  t.after(() => db.end());
  const a = await account('push_a');
  const b = await account('push_b');
  await t.test('legacy-session logout removes an unclaimed pre-update device token', async () => {
    const legacy = await account('push_legacy');
    const token = device('legacy');
    await db.query('UPDATE np_users SET push_token=$1 WHERE id=$2', [token, legacy.user.id]);
    assert.equal((await post('/local-auth/logout', legacy.token)).status, 200);
    assert.deepEqual(await owners(token), []);
  });
  await t.test('legacy logout preserves a device explicitly owned by another live session', async () => {
    const legacy = await account('push_legacy_other');
    const login = await post('/local-auth/login', null, { email: legacy.email, password });
    assert.equal(login.status, 200);
    const token = device('legacy-other');
    assert.equal((await register({ ...legacy, token: login.body.token }, token)).status, 200);
    assert.equal((await post('/local-auth/logout', legacy.token)).status, 200);
    assert.deepEqual(await owners(token), [legacy.user.id]);
  });
  await t.test('logout removes its registered device and revokes the session', async () => {
    const token = device('logout');
    assert.equal((await register(a, token)).status, 200);
    assert.deepEqual(await owners(token), [a.user.id]);
    assert.equal((await post('/local-auth/logout', a.token)).status, 200);
    assert.deepEqual(await owners(token), []);
    assert.equal((await register(a, token)).status, 401);
  });
  const login = await post('/local-auth/login', null, { email: a.email, password });
  assert.equal(login.status, 200);
  a.token = login.body.token;
  await t.test('new account takes ownership even without a successful prior logout', async () => {
    const token = device('transfer');
    assert.equal((await register(a, token)).status, 200);
    assert.equal((await register(b, token)).status, 200);
    assert.deepEqual(await owners(token), [b.user.id]);
    assert.equal((await post('/local-auth/logout', a.token)).status, 200);
    assert.deepEqual(await owners(token), [b.user.id]);
  });
  await t.test('logging out an older device does not clear the current device', async () => {
    const secondLogin = await post('/local-auth/login', null, { email: b.email, password });
    assert.equal(secondLogin.status, 200);
    const otherDevice = { ...b, token: secondLogin.body.token };
    assert.equal((await register(otherDevice, device('second'))).status, 200);
    assert.equal((await post('/local-auth/logout', b.token)).status, 200);
    assert.deepEqual(await owners(device('second')), [b.user.id]);
    b.token = secondLogin.body.token;
  });
  await t.test('concurrent registrations cannot retain two owners', async () => {
    const again = await post('/local-auth/login', null, { email: a.email, password });
    assert.equal(again.status, 200);
    a.token = again.body.token;
    const token = device('race');
    const results = await Promise.all([register(a, token), register(b, token)]);
    assert.ok(results.every(r => r.status === 200));
    assert.equal((await owners(token)).length, 1);
  });
  await t.test('registration racing logout cannot restore the logged-out device', async () => {
    const token = device('logout-race');
    const results = await Promise.all([register(a, token), post('/local-auth/logout', a.token)]);
    assert.ok([200, 401].includes(results[0].status));
    assert.equal(results[1].status, 200);
    assert.deepEqual(await owners(token), []);
  });
  await t.test('registration waiting for an account row does not lock its session ahead of credential revocation', async () => {
    const user = await account('push_lock');
    const locker = await db.connect();
    let pending;
    try {
      await locker.query('BEGIN');
      await locker.query('SELECT id FROM np_users WHERE id=$1 FOR UPDATE', [user.user.id]);
      pending = register(user, device('lock-order'));
      await waitForBlockedRequest(locker.processID);
      // Password change/reset updates the user row, then revokes sessions. A
      // session->user push lock order would block this DELETE and deadlock.
      // Bound the regression to 500ms instead of waiting for PG's deadlock detector.
      await locker.query("SET LOCAL lock_timeout='500ms'");
      const deleted = await locker.query('DELETE FROM sessions WHERE sid=$1 RETURNING sid', [user.token]);
      assert.equal(deleted.rowCount, 1);
      await locker.query('COMMIT');
      assert.equal((await pending).status, 401);
      assert.deepEqual(await owners(device('lock-order')), []);
    } finally {
      await locker.query('ROLLBACK');
      locker.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });
  await t.test('concurrent password change and push registration do not fail or restore a revoked session', async () => {
    const user = await account('push_password');
    const results = await Promise.all([
      post('/local-auth/change-password', user.token, { currentPassword: password, newPassword: 'Disposable-push-changed!' }),
      register(user, device('password-race')),
    ]);
    assert.equal(results[0].status, 200);
    assert.ok([200, 401].includes(results[1].status));
    assert.equal((await register(user, device('password-after'))).status, 401);
  });
});
