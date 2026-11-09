import React from 'react';

const host = (name: string) => (props: any) => React.createElement(name, props, props.children);
export const View = host('View');
export const Text = host('Text');
export const TextInput = host('TextInput');
export const TouchableOpacity = host('TouchableOpacity');
export const ScrollView = host('ScrollView');
export const KeyboardAvoidingView = host('KeyboardAvoidingView');
export const Modal = host('Modal');
export const ActivityIndicator = host('ActivityIndicator');
export const Ionicons = host('Ionicons');
export const BookCover = host('BookCover');
export const Platform = { OS: 'ios' };
export const StyleSheet = { create: (value: any) => value, hairlineWidth: 1 };
export const NotificationFeedbackType = { Success: 'success' };
export async function notificationAsync() {}
export const runtime = {
  authenticated: true,
  noteFailure: false,
  cleanupFailure: false,
  logCalls: [] as any[][],
  noteCalls: [] as any[],
  loginCalls: [] as any[][],
  registerCalls: [] as any[][],
  navigation: [] as any[],
  removed: [] as string[],
};
export function resetRuntime() {
  runtime.authenticated = true;
  runtime.noteFailure = false;
  runtime.cleanupFailure = false;
  for (const key of ['logCalls', 'noteCalls', 'loginCalls', 'registerCalls', 'navigation', 'removed'] as const) runtime[key].length = 0;
}
export function useAuth() {
  return {
    isAuthenticated: runtime.authenticated, user: { id: 'account-a' },
    login: async (...args: any[]) => { runtime.loginCalls.push(args); },
    register: async (...args: any[]) => { runtime.registerCalls.push(args); },
    requestPasswordReset: async () => 'sent',
  };
}
export function useSocial() { return { socialProfile: null, registerUser: async () => {} }; }
export function useColors() { return new Proxy({} as Record<string, string>, { get: () => '#123456' }); }
export function useSafeAreaInsets() { return { top: 0, bottom: 0 }; }
export function useRouter() { return { replace: (destination: any) => { runtime.navigation.push(destination); } }; }
export function useLocalSearchParams() { return { bookId: 'book-a', minutes: '10', startPage: '20', sessionId: 'stable-session' }; }
export function useStore() {
  return {
    getBook: () => ({ id: 'book-a', title: 'Title', author: 'Author', totalPages: 100, currentPage: 20, coverColor: '#123456' }),
    logSession: async (...args: any[]) => { runtime.logCalls.push(args); },
  };
}
export async function apiFetch(_url: string, options: any) {
  runtime.noteCalls.push(JSON.parse(options.body));
  if (runtime.noteFailure) throw new Error('offline');
  return { id: 'saved-note' };
}
export default {
  removeItem: async (key: string) => {
    if (runtime.cleanupFailure) throw new Error('storage unavailable');
    runtime.removed.push(key);
  },
};
