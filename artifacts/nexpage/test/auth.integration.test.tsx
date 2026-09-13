import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthProvider, useAuth } from '../lib/auth';
import { runtime, storage } from './store-runtime';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let auth: ReturnType<typeof useAuth>;
function Probe() { auth = useAuth(); return null; }
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5));
test('real AuthProvider preserves identity only for the matching cached token', async t => {
  for (const scenario of [
    { name: 'offline keeps cached account', status: 0, cachedToken: 'token-a', expected: 'account-a' },
    { name: 'server outage keeps cached account', status: 503, cachedToken: 'token-a', expected: 'account-a' },
    { name: 'explicit rejection removes identity and token', status: 401, cachedToken: 'token-a', expected: null },
    { name: 'a mismatched cached token never unlocks another account', status: 0, cachedToken: 'token-b', expected: null },
  ]) {
    await t.test(scenario.name, async () => {
      storage.clear();
      runtime.token = 'token-a';
      storage.set('auth_session_identity', JSON.stringify({ token: scenario.cachedToken, user: { id: 'account-a' } }));
      globalThis.fetch = async () => {
        if (!scenario.status) throw new Error('offline');
        return new Response('{}', { status: scenario.status });
      };
      let root!: ReactTestRenderer;
      await act(async () => { root = create(<AuthProvider><Probe /></AuthProvider>); await tick(); });
      try {
        assert.equal(auth.user?.id ?? null, scenario.expected);
        assert.equal(auth.isLoading, false);
        assert.equal(runtime.token, scenario.status === 401 ? null : 'token-a');
      } finally { await act(() => root.unmount()); }
    });
  }
});
