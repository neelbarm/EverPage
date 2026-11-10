import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { getExpoPushToken } from '../lib/notifications';
import {
  notificationRuntime as runtime,
  Platform,
  resetNotificationRuntime,
  setPhysicalDevice,
} from './notifications-runtime';

const primaryProject = '11111111-1111-4111-8111-111111111111';
const fallbackProject = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  resetNotificationRuntime();
  mock.method(globalThis, 'fetch', async () => {
    runtime.networkCalls += 1;
    throw new Error('Network access is forbidden in notification unit tests.');
  });
});

afterEach(() => {
  try {
    assert.equal(runtime.networkCalls, 0, 'No test may contact an external service');
    assert.ok(!runtime.calls.includes('unexpected'), 'Only token-helper native operations are allowed');
  } finally {
    mock.restoreAll();
  }
});

test('uses the EAS project UUID and returns the Expo token', async () => {
  assert.equal(await getExpoPushToken(), runtime.token);
  assert.deepEqual(runtime.tokenRequests, [{ projectId: primaryProject }]);
  assert.deepEqual(runtime.calls, ['permission', 'token']);
});

test('falls back to expoConfig.extra.eas.projectId', async () => {
  runtime.constants.easConfig = null;
  runtime.constants.expoConfig = { extra: { eas: { projectId: fallbackProject } } };
  assert.equal(await getExpoPushToken(), runtime.token);
  assert.deepEqual(runtime.tokenRequests, [{ projectId: fallbackProject }]);
});

test('prefers the EAS UUID when both config sources provide one', async () => {
  runtime.constants.expoConfig = { extra: { eas: { projectId: fallbackProject } } };
  assert.equal(await getExpoPushToken(), runtime.token);
  assert.deepEqual(runtime.tokenRequests, [{ projectId: primaryProject }]);
});

test('does not acquire a token when permission is denied', async () => {
  runtime.permission = 'denied';
  assert.equal(await getExpoPushToken(), null);
  assert.deepEqual(runtime.calls, ['permission']);
  assert.deepEqual(runtime.tokenRequests, []);
});

test('fails closed when neither configuration contains a project UUID', async () => {
  runtime.constants.easConfig = {};
  runtime.constants.expoConfig = { extra: {} };
  assert.equal(await getExpoPushToken(), null);
  assert.deepEqual(runtime.calls, ['permission']);
  assert.deepEqual(runtime.tokenRequests, []);
});

test('returns null after token acquisition rejects and can retry successfully', async () => {
  runtime.tokenError = new Error('Mock Expo token acquisition failed');
  assert.equal(await getExpoPushToken(), null);
  runtime.tokenError = null;
  assert.equal(await getExpoPushToken(), runtime.token);
  assert.deepEqual(runtime.tokenRequests, [
    { projectId: primaryProject },
    { projectId: primaryProject },
  ]);
});

test('returns null when checking notification permission rejects', async () => {
  runtime.permissionError = new Error('Mock native permission read failed');
  assert.equal(await getExpoPushToken(), null);
  assert.deepEqual(runtime.tokenRequests, []);
});

test('skips native notification work on non-physical devices', async () => {
  setPhysicalDevice(false);
  assert.equal(await getExpoPushToken(), null);
  assert.deepEqual(runtime.calls, []);
});

test('skips native notification work on web', async () => {
  Platform.OS = 'web';
  assert.equal(await getExpoPushToken(), null);
  assert.deepEqual(runtime.calls, []);
});

test('obtains a fresh token on subsequent registration attempts', async () => {
  const firstToken = await getExpoPushToken();
  runtime.token = 'ExponentPushToken[local-unit-test-refreshed]';
  assert.equal(await getExpoPushToken(), runtime.token);
  assert.notEqual(firstToken, runtime.token);
  assert.equal(runtime.tokenRequests.length, 2);
});

test('creates the Android channel before permission and token checks', async () => {
  Platform.OS = 'android';
  assert.equal(await getExpoPushToken(), runtime.token);
  assert.deepEqual(runtime.calls, ['channel', 'permission', 'token']);
});
