import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/lib/auth';
import {
  cancelStreakRescueNotification,
  getStreakRescueScheduledDate,
  rescheduleStreakRescueForTomorrow,
  scheduleStreakRescueNotification,
} from '@/lib/notifications';

export interface Book {
  id: string;
  title: string;
  author: string;
  totalPages: number;
  currentPage: number;
  coverColor: string;
  coverImageUri?: string;
  genre: string;
  addedAt: number;
  finishedAt?: number;
  favoriteQuote?: string;
  friendsReading: string[];
}

export interface ReadingSession {
  id: string;
  bookId: string;
  durationMinutes: number;
  startPage: number;
  endPage: number;
  date: string;
  createdAt: number;
}

export interface Friend {
  id: string;
  name: string;
  initial: string;
  color: string;
  currentBookTitle: string;
  streakDays: number;
  streakAtRisk: boolean;
  todayMinutes: number;
  todayPages: number;
  weekPages: number;
  weeklyMinutes: number;
  booksReadingIds: string[];
}

export interface StreakData {
  currentStreak: number;
  lastReadDate: string;
  checkedDays: string[];
  dailyGoalMinutes: number;
  todayMinutes: number;
  freezesLeft: number;
}

export interface ReminderSettings {
  enabled: boolean;
  hour: number;
  minute: number;
}

export interface UserProfile {
  name: string;
  initial: string;
  color: string;
  booksFinished: number;
  totalMinutes: number;
  totalPages: number;
  longestStreak: number;
  weeklyMinutes: number[];
  weeklyPages: number;
  globalPercentile: number;
  genres: { name: string; count: number }[];
}

export interface RecommendedBook {
  id: string;
  title: string;
  author: string;
  coverColor: string;
  coverImageUri?: string;
  reason: string;
  friendsCount: number;
}

export interface SuggestedFriend {
  id: string;
  name: string;
  initial: string;
  color: string;
  mutualCount: number;
  genre: string;
}

const MAX_FREEZES = 3;

interface StoreContextType {
  books: Book[];
  sessions: ReadingSession[];
  friends: Friend[];
  streak: StreakData;
  profile: UserProfile;
  reminder: ReminderSettings;
  recommendedBooks: RecommendedBook[];
  suggestedFriends: SuggestedFriend[];
  isLoaded: boolean;
  pendingFreezeEarned: boolean;
  clearPendingFreezeEarned: () => void;
  logSession: (bookId: string, durationMinutes: number, startPage: number, endPage: number) => Promise<void>;
  finishBook: (bookId: string, favoriteQuote?: string) => void;
  useStreakFreeze: () => void;
  addBook: (title: string, author: string, totalPages: number, genre: string, coverImageUri?: string) => void;
  updateBook: (id: string, updates: Partial<Pick<Book, 'title' | 'author' | 'totalPages' | 'genre' | 'coverImageUri'>>) => void;
  getBook: (id: string) => Book | undefined;
  setReminder: (settings: ReminderSettings) => Promise<void>;
  setDailyGoal: (minutes: number) => Promise<void>;
  updateProfile: (name: string, color: string) => Promise<void>;
}

const StoreContext = createContext<StoreContextType | null>(null);

const AUTH_TOKEN_KEY = 'auth_session_token';

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

const MOCK_BOOKS: Book[] = [
  {
    id: 'klara',
    title: 'Klara and the Sun',
    author: 'Kazuo Ishiguro',
    totalPages: 303,
    currentPage: 184,
    coverColor: '#5C849E',
    genre: 'Literary Fiction',
    addedAt: Date.now() - 15 * 24 * 3600000,
    friendsReading: [],
    favoriteQuote: 'The Sun always has a way to reach us.',
  },
  {
    id: 'pachinko',
    title: 'Pachinko',
    author: 'Min Jin Lee',
    totalPages: 485,
    currentPage: 162,
    coverColor: '#B54935',
    genre: 'Historical Fiction',
    addedAt: Date.now() - 20 * 24 * 3600000,
    friendsReading: ['priya', 'maya', 'jordan'],
  },
  {
    id: 'overstory',
    title: 'The Overstory',
    author: 'Richard Powers',
    totalPages: 502,
    currentPage: 58,
    coverColor: '#3A6645',
    genre: 'Literary Fiction',
    addedAt: Date.now() - 8 * 24 * 3600000,
    friendsReading: ['jordan', 'leo'],
  },
];

const MOCK_FRIENDS: Friend[] = [
  {
    id: 'maya',
    name: 'Maya',
    initial: 'M',
    color: '#5C849E',
    currentBookTitle: 'Tomorrow, and Tomorrow…',
    streakDays: 21,
    streakAtRisk: false,
    todayMinutes: 45,
    todayPages: 22,
    weekPages: 96,
    weeklyMinutes: 45,
    booksReadingIds: ['pachinko'],
  },
  {
    id: 'jordan',
    name: 'Jordan',
    initial: 'J',
    color: '#4A7A52',
    currentBookTitle: 'The Overstory',
    streakDays: 9,
    streakAtRisk: false,
    todayMinutes: 28,
    todayPages: 12,
    weekPages: 72,
    weeklyMinutes: 28,
    booksReadingIds: ['pachinko', 'overstory'],
  },
  {
    id: 'priya',
    name: 'Priya',
    initial: 'P',
    color: '#8B5E9E',
    currentBookTitle: 'Pachinko',
    streakDays: 34,
    streakAtRisk: false,
    todayMinutes: 52,
    todayPages: 26,
    weekPages: 142,
    weeklyMinutes: 52,
    booksReadingIds: ['pachinko'],
  },
  {
    id: 'leo',
    name: 'Leo',
    initial: 'L',
    color: '#B08A3C',
    currentBookTitle: 'Educated',
    streakDays: 6,
    streakAtRisk: true,
    todayMinutes: 15,
    todayPages: 6,
    weekPages: 45,
    weeklyMinutes: 15,
    booksReadingIds: ['overstory'],
  },
];

const buildCheckedDays = (): string[] => {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  });
};

const INITIAL_STREAK: StreakData = {
  currentStreak: 12,
  lastReadDate: todayStr(),
  checkedDays: buildCheckedDays(),
  dailyGoalMinutes: 30,
  todayMinutes: 20,
  freezesLeft: 2,
};

const INITIAL_PROFILE: UserProfile = {
  name: 'You',
  initial: 'Y',
  color: '#1C3A5A',
  booksFinished: 8,
  totalMinutes: 15240,
  totalPages: 3820,
  longestStreak: 28,
  weeklyMinutes: [42, 35, 0, 61, 28, 20, 0],
  weeklyPages: 186,
  globalPercentile: 92,
  genres: [
    { name: 'Literary Fiction', count: 4 },
    { name: 'Historical Fiction', count: 2 },
    { name: 'Non-Fiction', count: 1 },
    { name: 'Science Fiction', count: 1 },
  ],
};

const RECOMMENDED: RecommendedBook[] = [
  { id: 'rec1', title: 'Demon Copperhead', author: 'Barbara Kingsolver', coverColor: '#B85C38', coverImageUri: 'https://covers.openlibrary.org/b/isbn/9780063251922-M.jpg', reason: 'Because you read Pachinko', friendsCount: 3 },
  { id: 'rec2', title: 'Normal People', author: 'Sally Rooney', coverColor: '#4A7A9E', coverImageUri: 'https://covers.openlibrary.org/b/isbn/9780571334650-M.jpg', reason: 'Popular in your circle', friendsCount: 2 },
  { id: 'rec3', title: 'Educated', author: 'Tara Westover', coverColor: '#C09B3A', coverImageUri: 'https://covers.openlibrary.org/b/isbn/9780399590504-M.jpg', reason: 'Loved by Maya', friendsCount: 1 },
  { id: 'rec4', title: 'Lincoln in the Bardo', author: 'George Saunders', coverColor: '#5E4A7A', coverImageUri: 'https://covers.openlibrary.org/b/isbn/9780812985405-M.jpg', reason: 'Matches your taste', friendsCount: 0 },
];

const SUGGESTED: SuggestedFriend[] = [
  { id: 'sf1', name: 'Dani', initial: 'D', color: '#7A5E9E', mutualCount: 2, genre: 'literary fiction' },
  { id: 'sf2', name: 'Sam', initial: 'S', color: '#3A8A7A', mutualCount: 1, genre: 'non-fiction' },
];

const STORAGE_KEY = 'nexpage_v1';
const CLOUD_INIT_KEY = 'nexpage_cloud_initialized';

const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  hour: 21,
  minute: 0,
};

function getApiBase(): string {
  const domain = (process.env.EXPO_PUBLIC_DOMAIN ?? '').trim();
  if (domain) return `https://${domain}/api`;
  return '/api';
}

async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };
  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers, credentials: 'include' });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

function rowToBook(row: any): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    totalPages: row.totalPages ?? row.total_pages ?? 0,
    currentPage: row.currentPage ?? row.current_page ?? 0,
    coverColor: row.coverColor ?? row.cover_color ?? '#5C849E',
    coverImageUri: row.coverImageUri ?? row.cover_image_uri ?? undefined,
    genre: row.genre ?? '',
    addedAt: row.addedAt ?? row.added_at ?? Date.now(),
    finishedAt: row.finishedAt ?? row.finished_at ?? undefined,
    favoriteQuote: row.favoriteQuote ?? row.favorite_quote ?? undefined,
    friendsReading: row.friendsReading ?? [],
  };
}

function rowToSession(row: any): ReadingSession {
  return {
    id: row.id,
    bookId: row.bookId ?? row.book_id,
    durationMinutes: row.durationMinutes ?? row.duration_minutes ?? 0,
    startPage: row.startPage ?? row.start_page ?? 0,
    endPage: row.endPage ?? row.end_page ?? 0,
    date: row.date,
    createdAt: row.createdAt ?? row.created_at ?? Date.now(),
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [books, setBooks] = useState<Book[]>(MOCK_BOOKS);
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [friends] = useState<Friend[]>(MOCK_FRIENDS);
  const [streak, setStreak] = useState<StreakData>(INITIAL_STREAK);
  const [profile, setProfile] = useState<UserProfile>(INITIAL_PROFILE);
  const [reminder, setReminderState] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [isLoaded, setIsLoaded] = useState(false);
  const [pendingFreezeEarned, setPendingFreezeEarned] = useState(false);
  const cloudSyncedRef = useRef(false);

  function clearPendingFreezeEarned() {
    setPendingFreezeEarned(false);
  }

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.books) setBooks(s.books);
          if (s.sessions) setSessions(s.sessions);
          if (s.streak) setStreak(s.streak);
          if (s.profile) setProfile(s.profile);
          if (s.reminder) setReminderState(s.reminder);
        }
      } catch {
        // use defaults
      }
      setIsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (authLoading || !isLoaded) return;
    if (!isAuthenticated) {
      cloudSyncedRef.current = false;
      return;
    }
    if (cloudSyncedRef.current) return;
    cloudSyncedRef.current = true;
    hydrateFromCloud();
  }, [isAuthenticated, authLoading, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const today = todayStr();
    const hasReadToday = sessions.some(s => s.date === today);
    (async () => {
      const rescueDate = await getStreakRescueScheduledDate();
      if (rescueDate && rescueDate > today) {
        return;
      }
      if (hasReadToday) {
        cancelStreakRescueNotification();
      } else {
        scheduleStreakRescueNotification();
      }
    })();
  }, [isLoaded, sessions]);

  async function hydrateFromCloud() {
    try {
      const data = await apiFetch<{ books: any[]; sessions: any[]; streak: any | null }>('/bookshelf');

      const cloudHasData = data.books.length > 0 || data.sessions.length > 0 || data.streak !== null;

      if (cloudHasData) {
        const cloudBooks = data.books.map(rowToBook);
        const cloudSessions = data.sessions.map(rowToSession);
        const cloudStreak = data.streak ?? undefined;

        if (cloudBooks.length > 0) setBooks(cloudBooks);
        if (cloudSessions.length > 0) setSessions(cloudSessions);
        if (cloudStreak) setStreak(cloudStreak);

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
          books: cloudBooks.length > 0 ? cloudBooks : books,
          sessions: cloudSessions.length > 0 ? cloudSessions : sessions,
          streak: cloudStreak ?? streak,
          profile,
          reminder,
        }));
      } else {
        const alreadyInitialized = await AsyncStorage.getItem(CLOUD_INIT_KEY);
        if (!alreadyInitialized) {
          await AsyncStorage.setItem(CLOUD_INIT_KEY, '1');
          syncBooksToCloud(books);
          await Promise.all(sessions.map(s => syncSessionToCloud(s)));
          syncStreakToCloud(streak);
        }
      }
    } catch {
      // offline or unauthenticated — keep local data
    }
  }

  async function persist(b: Book[], se: ReadingSession[], st: StreakData, p: UserProfile, r: ReminderSettings) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ books: b, sessions: se, streak: st, profile: p, reminder: r }));
    } catch { /* ignore */ }
  }

  async function syncBooksToCloud(booksToSync: Book[]) {
    if (!isAuthenticated) return;
    try {
      await Promise.all(
        booksToSync.map(book =>
          apiFetch('/bookshelf/books', {
            method: 'POST',
            body: JSON.stringify(book),
          }).catch(() => { /* non-blocking */ }),
        ),
      );
    } catch { /* non-blocking */ }
  }

  async function syncSessionToCloud(session: ReadingSession) {
    if (!isAuthenticated) return;
    try {
      await apiFetch('/bookshelf/sessions', {
        method: 'POST',
        body: JSON.stringify(session),
      });
    } catch { /* non-blocking */ }
  }

  async function syncStreakToCloud(st: StreakData) {
    if (!isAuthenticated) return;
    try {
      await apiFetch('/bookshelf/streak', {
        method: 'PUT',
        body: JSON.stringify(st),
      });
    } catch { /* non-blocking */ }
  }

  async function setReminder(settings: ReminderSettings) {
    setReminderState(settings);
    await persist(books, sessions, streak, profile, settings);
  }

  async function setDailyGoal(minutes: number) {
    const newStreak = { ...streak, dailyGoalMinutes: minutes };
    setStreak(newStreak);
    await persist(books, sessions, newStreak, profile, reminder);
    syncStreakToCloud(newStreak);
  }

  async function updateProfile(name: string, color: string) {
    const trimmed = name.trim() || 'You';
    const newProfile = { ...profile, name: trimmed, color, initial: trimmed.charAt(0).toUpperCase() };
    setProfile(newProfile);
    await persist(books, sessions, streak, newProfile, reminder);
  }

  async function logSession(bookId: string, durationMinutes: number, startPage: number, endPage: number) {
    const session: ReadingSession = {
      id: generateId(),
      bookId,
      durationMinutes,
      startPage,
      endPage,
      date: todayStr(),
      createdAt: Date.now(),
    };
    const newSessions = [...sessions, session];
    const newBooks = books.map(b =>
      b.id === bookId ? { ...b, currentPage: Math.min(endPage, b.totalPages) } : b
    );
    const newStreak = { ...streak, todayMinutes: streak.todayMinutes + durationMinutes };
    let earnedFreeze = false;
    if (!newStreak.checkedDays.includes(todayStr())) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      const previousStreak = newStreak.currentStreak;
      if (newStreak.lastReadDate === yStr || newStreak.lastReadDate === todayStr()) {
        if (newStreak.lastReadDate !== todayStr()) newStreak.currentStreak += 1;
      } else {
        newStreak.currentStreak = 1;
      }
      newStreak.checkedDays = [...newStreak.checkedDays, todayStr()];
      newStreak.lastReadDate = todayStr();
      if (
        newStreak.currentStreak > previousStreak &&
        newStreak.currentStreak % 7 === 0 &&
        newStreak.freezesLeft < MAX_FREEZES
      ) {
        newStreak.freezesLeft = Math.min(newStreak.freezesLeft + 1, MAX_FREEZES);
        earnedFreeze = true;
      }
    }
    const dayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    const newWeekly = [...profile.weeklyMinutes];
    newWeekly[dayIdx] = (newWeekly[dayIdx] ?? 0) + durationMinutes;
    const newProfile: UserProfile = {
      ...profile,
      totalMinutes: profile.totalMinutes + durationMinutes,
      totalPages: profile.totalPages + Math.max(0, endPage - startPage),
      weeklyPages: profile.weeklyPages + Math.max(0, endPage - startPage),
      weeklyMinutes: newWeekly,
      longestStreak: Math.max(profile.longestStreak, newStreak.currentStreak),
    };
    setSessions(newSessions);
    setBooks(newBooks);
    setStreak(newStreak);
    setProfile(newProfile);
    if (earnedFreeze) setPendingFreezeEarned(true);
    await persist(newBooks, newSessions, newStreak, newProfile, reminder);
    const updatedBook = newBooks.find(b => b.id === bookId);
    if (updatedBook) syncBooksToCloud([updatedBook]);
    syncSessionToCloud(session);
    syncStreakToCloud(newStreak);
    await cancelStreakRescueNotification();
    rescheduleStreakRescueForTomorrow();
  }

  function finishBook(bookId: string, favoriteQuote?: string) {
    const newBooks = books.map(b =>
      b.id === bookId ? { ...b, finishedAt: Date.now(), favoriteQuote: favoriteQuote ?? b.favoriteQuote } : b
    );
    const newProfile = { ...profile, booksFinished: profile.booksFinished + 1 };
    const newStreak: StreakData =
      streak.freezesLeft < MAX_FREEZES
        ? { ...streak, freezesLeft: Math.min(streak.freezesLeft + 1, MAX_FREEZES) }
        : streak;
    const earnedFreeze = newStreak.freezesLeft > streak.freezesLeft;
    setBooks(newBooks);
    setProfile(newProfile);
    setStreak(newStreak);
    if (earnedFreeze) setPendingFreezeEarned(true);
    persist(newBooks, sessions, newStreak, newProfile, reminder);
    const finishedBook = newBooks.find(b => b.id === bookId);
    if (finishedBook) syncBooksToCloud([finishedBook]);
    if (earnedFreeze) syncStreakToCloud(newStreak);
  }

  function useStreakFreeze() {
    if (streak.freezesLeft <= 0) return;
    const newStreak: StreakData = {
      ...streak,
      freezesLeft: streak.freezesLeft - 1,
      lastReadDate: todayStr(),
      checkedDays: streak.checkedDays.includes(todayStr())
        ? streak.checkedDays
        : [...streak.checkedDays, todayStr()],
    };
    setStreak(newStreak);
    persist(books, sessions, newStreak, profile, reminder);
    syncStreakToCloud(newStreak);
  }

  function addBook(title: string, author: string, totalPages: number, genre: string, coverImageUri?: string) {
    const colors = ['#5C849E', '#B54935', '#3A6645', '#8B5E9E', '#B08A3C', '#4A7A52'];
    const newBook: Book = {
      id: generateId(),
      title,
      author,
      totalPages,
      currentPage: 0,
      coverColor: colors[Math.floor(Math.random() * colors.length)],
      coverImageUri,
      genre,
      addedAt: Date.now(),
      friendsReading: [],
    };
    const newBooks = [...books, newBook];
    setBooks(newBooks);
    persist(newBooks, sessions, streak, profile, reminder);
    syncBooksToCloud([newBook]);
  }

  function updateBook(id: string, updates: Partial<Pick<Book, 'title' | 'author' | 'totalPages' | 'genre' | 'coverImageUri'>>) {
    const newBooks = books.map(b => b.id === id ? { ...b, ...updates } : b);
    setBooks(newBooks);
    persist(newBooks, sessions, streak, profile, reminder);
    const updatedBook = newBooks.find(b => b.id === id);
    if (updatedBook) syncBooksToCloud([updatedBook]);
  }

  function getBook(id: string) {
    return books.find(b => b.id === id);
  }

  return (
    <StoreContext.Provider value={{
      books, sessions, friends, streak, profile, reminder,
      recommendedBooks: RECOMMENDED,
      suggestedFriends: SUGGESTED,
      isLoaded,
      pendingFreezeEarned,
      clearPendingFreezeEarned,
      logSession, finishBook, useStreakFreeze, addBook, updateBook, getBook, setReminder, setDailyGoal, updateProfile,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be inside StoreProvider');
  return ctx;
}
