export const storage = new Map<string, string>();
export const runtime = {
  user: { id: 'account-a' } as { id: string } | null,
  token: 'token-a' as string | null,
  beforeWrite: null as null | ((key: string, value: string) => Promise<void>),
};
export const Platform = { OS: 'ios' };
export const AppState = { addEventListener: () => ({ remove() {} }) };
export function useAuth() {
  return { user: runtime.user, isAuthenticated: !!runtime.user, isLoading: false };
}
export async function getItem(key: string) {
  return key === 'auth_session_token' ? runtime.token : storage.get(key) ?? null;
}
export async function setItem(key: string, value: string) {
  if (key === 'auth_session_token') runtime.token = value;
  storage.set(key, value);
}
export async function deleteItem(key: string) {
  if (key === 'auth_session_token') runtime.token = null;
  storage.delete(key);
}
export default {
  getItem: async (key: string) => storage.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    await runtime.beforeWrite?.(key, value);
    storage.set(key, value);
  },
  removeItem: async (key: string) => { storage.delete(key); },
};
export const cancelStreakRescueNotification = async () => {};
export const getStreakRescueScheduledDate = async () => null;
export const rescheduleStreakRescueForTomorrow = async () => {};
export const scheduleStreakRescueNotification = async () => {};
