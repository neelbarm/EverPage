// Local-only substitutes for the native modules used by lib/notifications.ts.
// No function in this fixture contacts Expo, APNs, or the application backend.
export const Platform = { OS: 'ios' };
export let isDevice = true;

const constants: {
  easConfig: { projectId?: string } | null;
  expoConfig: { extra?: { eas?: { projectId?: string } } } | null;
} = { easConfig: null, expoConfig: null };

export default constants;

export const notificationRuntime = {
  constants,
  permission: 'granted',
  permissionError: null as Error | null,
  token: 'ExponentPushToken[local-unit-test]',
  tokenError: null as Error | null,
  calls: [] as string[],
  tokenRequests: [] as { projectId: string }[],
  networkCalls: 0,
};

export function resetNotificationRuntime() {
  Platform.OS = 'ios';
  isDevice = true;
  constants.easConfig = { projectId: '11111111-1111-4111-8111-111111111111' };
  constants.expoConfig = null;
  notificationRuntime.permission = 'granted';
  notificationRuntime.permissionError = null;
  notificationRuntime.token = 'ExponentPushToken[local-unit-test]';
  notificationRuntime.tokenError = null;
  notificationRuntime.calls = [];
  notificationRuntime.tokenRequests = [];
  notificationRuntime.networkCalls = 0;
}

export function setPhysicalDevice(value: boolean) {
  isDevice = value;
}

export function setNotificationHandler() {}
export const AndroidImportance = { MAX: 5 };
export const AndroidNotificationVisibility = { PUBLIC: 1 };
export async function setNotificationChannelAsync() {
  notificationRuntime.calls.push('channel');
}
export async function getPermissionsAsync() {
  notificationRuntime.calls.push('permission');
  if (notificationRuntime.permissionError) throw notificationRuntime.permissionError;
  return { status: notificationRuntime.permission };
}
export async function getExpoPushTokenAsync(options: { projectId: string }) {
  notificationRuntime.calls.push('token');
  notificationRuntime.tokenRequests.push({ ...options });
  if (notificationRuntime.tokenError) throw notificationRuntime.tokenError;
  return { data: notificationRuntime.token };
}

function unexpectedCall(): never {
  notificationRuntime.calls.push('unexpected');
  throw new Error('This isolated token test must not schedule, request permission, or navigate.');
}
export const requestPermissionsAsync = unexpectedCall;
export const scheduleNotificationAsync = unexpectedCall;
export const cancelScheduledNotificationAsync = unexpectedCall;
export const addNotificationResponseReceivedListener = unexpectedCall;
export const SchedulableTriggerInputTypes = { DAILY: 'daily', DATE: 'date' };
export const router = { navigate: unexpectedCall };
