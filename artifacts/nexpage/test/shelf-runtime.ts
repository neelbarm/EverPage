import React from 'react';
import type { Book, RecommendedBook } from '../context/StoreContext';

const host = (name: string) => (props: any) => React.createElement(name, props, props.children);
export const View = host('View');
export const Text = host('Text');
export const TextInput = host('TextInput');
export const TouchableOpacity = host('TouchableOpacity');
export const Pressable = host('Pressable');
export const ScrollView = host('ScrollView');
export const Modal = host('Modal');
export const Ionicons = host('Ionicons');
export const Feather = host('Feather');
export const BookCover = host('BookCover');
export const DailyGoalModal = host('DailyGoalModal');
export const Platform = { OS: 'ios' };
export const StyleSheet = { create: (value: any) => value, hairlineWidth: 1 };
export const PanResponder = { create: () => ({ panHandlers: {} }) };
export const Animated = {
  Value: class {
    constructor(public value: number) {}
    setValue(value: number) { this.value = value; }
  },
  View: host('Animated.View'),
};

export const runtime = {
  books: [{ id: 'book-a', title: 'Current book', author: 'Author', totalPages: 100, currentPage: 0, genre: 'Mystery', coverColor: '#123456', addedAt: 1, friendsReading: [] }] as Book[],
  recommendations: Array.from({ length: 8 }, (_, index): RecommendedBook => ({
    id: `rec-${index}`, title: `Recommendation ${index}`, author: 'Author', genre: 'Mystery', coverColor: '#123456', reason: 'you read mystery', friendsCount: 0,
  })),
  adds: [] as any[][],
  refreshes: 0,
  navigation: [] as any[],
};
export function resetRuntime() {
  runtime.adds.length = 0;
  runtime.refreshes = 0;
  runtime.navigation.length = 0;
}
export function useStore() {
  return {
    books: runtime.books,
    recommendedBooks: runtime.recommendations,
    streak: { currentStreak: 0, dailyGoalMinutes: 10, todayMinutes: 0, freezesLeft: 0 },
    refreshRecommendations: async () => { runtime.refreshes += 1; },
    addBook: (...args: any[]) => { runtime.adds.push(args); },
    setDailyGoal: () => {},
    clearPendingFreezeEarned: () => {},
    clearPendingGoalMet: () => {},
  };
}
export function useRouter() {
  return {
    push: (destination: any) => { runtime.navigation.push(destination); },
    navigate: (destination: any) => { runtime.navigation.push(destination); },
  };
}
export function useSafeAreaInsets() { return { top: 0, bottom: 0 }; }
export function useColors() { return new Proxy({} as Record<string, string>, { get: () => '#123456' }); }
export function useTheme() { return {}; }
