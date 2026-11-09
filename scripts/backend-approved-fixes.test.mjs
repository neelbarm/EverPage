// Run only with a disposable local API/everpage_test database. Start the API
// without RESEND_API_KEY or EMAIL_FROM, then set EVERPAGE_TEST_EMAIL_DISABLED=1.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const api = process.env.EVERPAGE_TEST_API;
const database = process.env.EVERPAGE_TEST_DATABASE_URL;
for (const [name, value] of Object.entries({ api, database })) {
  if (!value || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)) {
    throw new Error(`${name} must point to a disposable local service`);
  }
}
if (new URL(database).pathname !== '/everpage_test') throw new Error('Expected disposable everpage_test database');
if (process.env.EVERPAGE_TEST_EMAIL_DISABLED !== '1') throw new Error('Confirm the local API has email sending disabled');
const { Pool } = createRequire(new URL('../lib/db/package.json', import.meta.url))('pg');
const db = new Pool({ connectionString: database });
const password = 'Disposable-Original-Password!';
const suffix = randomBytes(5).toString('hex');

async function request(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const response = await fetch(`${api}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

async function account(label) {
  const email = `${label}-${suffix}@example.invalid`;
  const result = await request('/local-auth/register', { body: {
    email, password, username: `${label}_${suffix}`, displayName: 'Regression reader', birthday: '1990-01-01',
  } });
  assert.equal(result.status, 201);
  return { email, id: result.body.user.id, token: result.body.token };
}

async function resetLink(userId) {
  const token = randomBytes(32).toString('base64url');
  await db.query('INSERT INTO np_password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',
    [randomBytes(16).toString('hex'), userId, createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 3_600_000).toISOString()]);
  return token;
}

async function waitForCredentialWaiters(count, blockerPid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { rows } = await db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND $1=ANY(pg_blocking_pids(pid))", [blockerPid]);
    if (rows[0].count >= count) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`Expected ${count} credential requests waiting on the advisory lock`);
}

test('approved backend fixes (disposable database)', async t => {
  t.after(() => db.end());

  await t.test('password change revokes all older recovery links and sessions; new links still work', async () => {
    const user = await account('change');
    const links = [await resetLink(user.id), await resetLink(user.id)];
    const changed = await request('/local-auth/change-password', { token: user.token,
      body: { currentPassword: password, newPassword: 'Disposable-Changed-Password!' } });
    assert.equal(changed.status, 200);
    assert.equal((await request('/local-auth/me', { token: user.token })).status, 401);
    for (const token of links) {
      assert.equal((await request('/local-auth/reset-password', { body: { token, newPassword: 'Must-Not-Replace-Password!' } })).status, 400);
    }
    const login = await request('/local-auth/login', { body: { email: user.email, password: 'Disposable-Changed-Password!' } });
    assert.equal(login.status, 200);
    const fresh = await resetLink(user.id);
    assert.equal((await request('/local-auth/reset-password', { body: { token: fresh, newPassword: 'Disposable-Recovered-Password!' } })).status, 200);
    assert.equal((await request('/local-auth/me', { token: login.body.token })).status, 401);
    assert.equal((await request('/local-auth/login', { body: { email: user.email, password: 'Disposable-Recovered-Password!' } })).status, 200);
  });

  await t.test('concurrent reset and password change cannot both replace the credential', async () => {
    const user = await account('race');
    const token = await resetLink(user.id);
    const results = await Promise.all([
      request('/local-auth/change-password', { token: user.token, body: { currentPassword: password, newPassword: 'Disposable-Race-Change!' } }),
      request('/local-auth/reset-password', { body: { token, newPassword: 'Disposable-Race-Reset!' } }),
    ]);
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.ok(results.every(result => [200, 400, 401].includes(result.status)));
  });

  await t.test('forgot-password cannot issue a stale link while a password change is completing', async () => {
    const user = await account('issuance');
    // Permit repeat runs in the disposable database without inheriting the
    // previous run's localhost mail-request quota.
    for (const address of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
      const key = `forgot-ip:${createHash('sha256').update(address).digest('hex')}`;
      await db.query('DELETE FROM np_auth_rate_limits WHERE key=$1', [key]);
    }
    const locker = await db.connect();
    const requests = [];
    try {
      await locker.query('BEGIN');
      await locker.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`password-reset:${user.id}`]);
      requests.push(request('/local-auth/change-password', { token: user.token, body: { currentPassword: password, newPassword: 'Disposable-Issuance-Change!' } }));
      await waitForCredentialWaiters(1, locker.processID);
      requests.push(request('/local-auth/forgot-password', { body: { email: user.email } }));
      await waitForCredentialWaiters(2, locker.processID);
      await locker.query('COMMIT');
      const results = await Promise.all(requests);
      assert.deepEqual(results.map(result => result.status), [200, 200]);
      const { rows } = await db.query('SELECT count(*)::int AS count FROM np_password_reset_tokens WHERE user_id=$1 AND used_at IS NULL', [user.id]);
      assert.equal(rows[0].count, 0);
      // A genuinely new request after the change must still issue a link.
      assert.equal((await request('/local-auth/forgot-password', { body: { email: user.email } })).status, 200);
      const after = await db.query('SELECT count(*)::int AS count FROM np_password_reset_tokens WHERE user_id=$1 AND used_at IS NULL', [user.id]);
      assert.equal(after.rows[0].count, 1);
    } finally {
      await locker.query('ROLLBACK');
      locker.release();
      await Promise.allSettled(requests);
    }
  });

  await t.test('Wrapped reports historical best instead of current streak, with unique days', async () => {
    const user = await account('wrapped');
    for (const [i, date] of ['2026-01-01', '2026-01-02', '2026-01-02', '2026-01-03', '2026-11-09'].entries()) {
      await db.query('INSERT INTO np_sessions(id,user_id,book_id,duration_minutes,start_page,end_page,date,created_at) VALUES($1,$2,$3,10,0,1,$4,$5)',
        [`wrapped_${i}`, user.id, 'test-book', date, Date.now()]);
    }
    await db.query('INSERT INTO np_streak(user_id,current_streak,checked_days) VALUES($1,1,$2)', [user.id, '["2026-11-09"]']);
    const result = await request('/wrapped/2026', { token: user.token });
    assert.equal(result.status, 200);
    assert.equal(result.body.longestStreak, 3);
  });

  await t.test('Wrapped includes saved freeze days but clips runs to the requested year', async () => {
    const user = await account('freeze');
    await db.query('INSERT INTO np_streak(user_id,current_streak,checked_days) VALUES($1,99,$2)',
      [user.id, JSON.stringify(['2025-12-31', '2026-01-01', '2026-06-01', '2026-06-02', '2026-06-03', '2026-12-31', '2027-01-01'])]);
    for (const [i, date] of ['2026-06-01', '2026-06-03'].entries()) {
      await db.query('INSERT INTO np_sessions(id,user_id,book_id,date,created_at) VALUES($1,$2,$3,$4,$5)',
        [`freeze_${i}`, user.id, 'test-book', date, Date.now()]);
    }
    assert.equal((await request('/wrapped/2026', { token: user.token })).body.longestStreak, 3);
    assert.equal((await request('/wrapped/2025', { token: user.token })).body.longestStreak, 1);
    assert.equal((await request('/wrapped/2027', { token: user.token })).body.longestStreak, 1);
  });

  await t.test('Wrapped ignores malformed saved days and has zero streak for an empty year', async () => {
    const user = await account('invalid');
    await db.query('INSERT INTO np_streak(user_id,current_streak,checked_days) VALUES($1,99,$2)',
      [user.id, JSON.stringify(['2026-02-30', '2026-03-01', null, 42, 'garbage'])]);
    assert.equal((await request('/wrapped/2026', { token: user.token })).body.longestStreak, 1);
    assert.equal((await request('/wrapped/2024', { token: user.token })).body.longestStreak, 0);
    await db.query('UPDATE np_streak SET checked_days=$1 WHERE user_id=$2', ['invalid json', user.id]);
    assert.equal((await request('/wrapped/2026', { token: user.token })).body.longestStreak, 0);
  });
});
