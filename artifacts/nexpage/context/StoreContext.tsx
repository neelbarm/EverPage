import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getItem as getStoredItem } from '@/lib/storage';
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
  genre?: string;
}

export interface SuggestedFriend {
  id: string;
  name: string;
  initial: string;
  color: string;
  mutualCount: number;
  genre: string;
}

export const MAX_FREEZES = 3;

interface StoreContextType {
  books: Book[];
  sessions: ReadingSession[];
  friends: Friend[];
  streak: StreakData;
  profile: UserProfile;
  reminder: ReminderSettings;
  recommendedBooks: RecommendedBook[];
  refreshRecommendations: () => Promise<void>;
  suggestedFriends: SuggestedFriend[];
  isLoaded: boolean;
  pendingFreezeEarned: boolean;
  clearPendingFreezeEarned: () => void;
  pendingGoalMet: boolean;
  clearPendingGoalMet: () => void;
  logSession: (bookId: string, durationMinutes: number, startPage: number, endPage: number) => Promise<void>;
  finishBook: (bookId: string, favoriteQuote?: string) => void;
  useStreakFreeze: () => void;
  addBook: (title: string, author: string, totalPages: number, genre: string, coverImageUri?: string, startingPage?: number) => void;
  updateBook: (id: string, updates: Partial<Pick<Book, 'title' | 'author' | 'totalPages' | 'genre' | 'coverImageUri'>>) => void;
  getBook: (id: string) => Book | undefined;
  setReminder: (settings: ReminderSettings) => Promise<void>;
  setDailyGoal: (minutes: number) => Promise<void>;
  updateProfile: (name: string, color: string) => Promise<void>;
}

const StoreContext = createContext<StoreContextType | null>(null);

const AUTH_TOKEN_KEY = 'auth_session_token';

function todayStr(): string {
  // Reading days are based on the reader's local calendar, not UTC. Using an
  // ISO timestamp here made a late-evening session count toward tomorrow for
  // some readers (and left yesterday's total on the new day's goal).
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function minutesForDate(readingSessions: ReadingSession[], date: string): number {
  return readingSessions.reduce((total, session) => {
    if (session.date !== date) return total;
    const minutes = Number(session.durationMinutes);
    return total + (Number.isFinite(minutes) && minutes > 0 ? minutes : 0);
  }, 0);
}

function withDerivedTodayMinutes(streakData: StreakData, readingSessions: ReadingSession[]): StreakData {
  const todayMinutes = minutesForDate(readingSessions, todayStr());
  return streakData.todayMinutes === todayMinutes ? streakData : { ...streakData, todayMinutes };
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

const INITIAL_STREAK: StreakData = {
  currentStreak: 0,
  lastReadDate: '',
  checkedDays: [],
  dailyGoalMinutes: 30,
  todayMinutes: 0,
  freezesLeft: 0,
};

const INITIAL_PROFILE: UserProfile = {
  name: 'Reader',
  initial: 'R',
  color: '#1C3A5A',
  booksFinished: 0,
  totalMinutes: 0,
  totalPages: 0,
  longestStreak: 0,
  weeklyMinutes: [0, 0, 0, 0, 0, 0, 0],
  weeklyPages: 0,
  globalPercentile: 0,
  genres: [],
};

const RECOMMENDED: RecommendedBook[] = [
  { id: 'rec1', title: 'Demon Copperhead', author: 'Barbara Kingsolver', coverColor: '#B85C38', coverImageUri: 'https://covers.openlibrary.org/b/isbn/9780063251922-M.jpg', reason: 'Highly rated literary fiction', friendsCount: 0, genre: 'Literary Fiction' },
  { id: 'rec2', title: 'Normal People', author: 'Sally Rooney', coverColor: '#4A7A9E', coverImageUri: 'https://covers.openlibrary.org/b/isbn/9780571334650-M.jpg', reason: 'Popular with readers like you', friendsCount: 0, genre: 'Contemporary Fiction' },
  { id: 'rec3', title: 'Educated', author: 'Tara Westover', coverColor: '#C09B3A', coverImageUri: 'https://covers.openlibrary.org/b/isbn/9780399590504-M.jpg', reason: 'Award-winning memoir', friendsCount: 0, genre: 'Memoir' },
  { id: 'rec4', title: 'Lincoln in the Bardo', author: 'George Saunders', coverColor: '#5E4A7A', coverImageUri: 'https://covers.openlibrary.org/b/isbn/9780812985405-M.jpg', reason: 'Matches your taste', friendsCount: 0, genre: 'Literary Fiction' },
];

const SUGGESTED: SuggestedFriend[] = [
  { id: 'sf1', name: 'Dani', initial: 'D', color: '#7A5E9E', mutualCount: 2, genre: 'literary fiction' },
  { id: 'sf2', name: 'Sam', initial: 'S', color: '#3A8A7A', mutualCount: 1, genre: 'non-fiction' },
];

const STORAGE_KEY = 'everpage_v1';
const CLOUD_INIT_KEY = 'everpage_cloud_initialized';

const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  hour: 21,
  minute: 0,
};

function getApiBase(): string {
  // A production native build must always reach the deployed API. Any build-time
  // EXPO_PUBLIC_DOMAIN is the Replit dev tunnel (serves HTML, not the API), so it
  // must be ignored on device — otherwise requests return HTML and JSON parsing fails.
  if (!__DEV__ && Platform.OS !== 'web') return 'https://nex-page.replit.app/api';
  const override = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
  if (override) return `${override.replace(/\/$/, '')}/api`;
  const domain = (process.env.EXPO_PUBLIC_DOMAIN ?? '').trim();
  if (domain) return `https://${domain}/api`;
  return '/api';
}

async function getAuthToken(): Promise<string | null> {
  try {
    return await getStoredItem(AUTH_TOKEN_KEY);
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
  const [books, setBooks] = useState<Book[]>([]);
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [friends] = useState<Friend[]>([]);
  const [streak, setStreak] = useState<StreakData>(INITIAL_STREAK);
  const [profile, setProfile] = useState<UserProfile>(INITIAL_PROFILE);
  const [reminder, setReminderState] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [isLoaded, setIsLoaded] = useState(false);
  const [recommendedBooks, setRecommendedBooks] = useState<RecommendedBook[]>(RECOMMENDED);
  const [pendingFreezeEarned, setPendingFreezeEarned] = useState(false);
  const [pendingGoalMet, setPendingGoalMet] = useState(false);
  const cloudSyncedRef = useRef(false);

  function clearPendingFreezeEarned() {
    setPendingFreezeEarned(false);
  }

  function clearPendingGoalMet() {
    setPendingGoalMet(false);
  }

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          const storedSessions = Array.isArray(s.sessions) ? s.sessions : [];
          if (s.books) setBooks(s.books);
          setSessions(storedSessions);
          if (s.streak) setStreak(withDerivedTodayMinutes(s.streak, storedSessions));
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
    fetchRecommendations();
  }, [isAuthenticated, authLoading, isLoaded]);

  async function fetchRecommendations() {
    try {
      const recs = await apiFetch<RecommendedBook[]>('/social/recommendations');
      if (Array.isArray(recs) && recs.length > 0) setRecommendedBooks(recs);
    } catch {
      // keep curated defaults on failure
    }
  }

  // Reconcile whenever the app becomes active and on the local day boundary.
  // This keeps a reader who leaves the app open overnight from seeing
  // yesterday's total on today's goal.
  useEffect(() => {
    if (!isLoaded) return;
    const reconcileToday = () => {
      setStreak(current => {
        const reconciled = withDerivedTodayMinutes(current, sessions);
        if (reconciled === current) return current;
        void persist(books, sessions, reconciled, profile, reminder);
        return reconciled;
      });
    };
    reconcileToday();
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') reconcileToday();
    });
    const interval = setInterval(reconcileToday, 60_000);
    return () => {
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, [books, isLoaded, profile, reminder, sessions]);

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
      const data = await apiFetch<{ books: any[]; sessions: any[]; streak: any | null }>(`/bookshelf?today=${encodeURIComponent(todayStr())}`);

      const cloudHasData = data.books.length > 0 || data.sessions.length > 0 || data.streak !== null;

      if (cloudHasData) {
        const cloudBooks = data.books.map(rowToBook);
        const cloudSessions = data.sessions.map(rowToSession);
        const cloudStreak = data.streak ? withDerivedTodayMinutes(data.streak, cloudSessions) : undefined;

        // The cloud copy is canonical for a signed-in reader. In particular,
        // do not leave old on-device sessions in place when their account has
        // no matching cloud sessions.
        setBooks(cloudBooks);
        setSessions(cloudSessions);
        if (cloudStreak) setStreak(cloudStreak);

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
          books: cloudBooks,
          sessions: cloudSessions,
          streak: cloudStreak ?? withDerivedTodayMinutes(streak, cloudSessions),
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
        body: JSON.stringify({ ...st, todayDate: todayStr() }),
      });
    } catch { /* non-blocking */ }
  }

  async function setReminder(settings: ReminderSettings) {
    setReminderState(settings);
    await persist(books, sessions, streak, profile, settings);
  }

  async function setDailyGoal(minutes: number) {
    const newStreak = { ...withDerivedTodayMinutes(streak, sessions), dailyGoalMinutes: minutes };
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
    const currentTodayMinutes = minutesForDate(sessions, todayStr());
    const wasUnderGoal = streak.dailyGoalMinutes > 0 && currentTodayMinutes < streak.dailyGoalMinutes;
    // Sessions, rather than a separately accumulated counter, are the source
    // of truth for the daily goal. This avoids duplicate/missing minutes after
    // a restart or cloud hydration.
    const newStreak = { ...streak, todayMinutes: minutesForDate(newSessions, todayStr()) };
    const goalJustMet = wasUnderGoal && newStreak.todayMinutes >= streak.dailyGoalMinutes;
    let earnedFreeze = false;
    if (!newStreak.checkedDays.includes(todayStr())) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yYear = yesterday.getFullYear();
      const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
      const yDay = String(yesterday.getDate()).padStart(2, '0');
      const yStr = `${yYear}-${yMonth}-${yDay}`;
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
        newStreak.currentStreak % 3 === 0 &&
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
    if (goalJustMet) setPendingGoalMet(true);
    await persist(newBooks, newSessions, newStreak, newProfile, reminder);
    const updatedBook = newBooks.find(b => b.id === bookId);
    if (updatedBook) await syncBooksToCloud([updatedBook]);
    await syncSessionToCloud(session);
    await syncStreakToCloud(newStreak);
    void fetchRecommendations();
    await cancelStreakRescueNotification();
    rescheduleStreakRescueForTomorrow();
  }

  function finishBook(bookId: string, favoriteQuote?: string) {
    const book = books.find(b => b.id === bookId);
    if (!book || book.finishedAt) return;
    const newBooks = books.map(b =>
      b.id === bookId ? { ...b, currentPage: b.totalPages, finishedAt: Date.now(), favoriteQuote: favoriteQuote ?? b.favoriteQuote } : b
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
    if (finishedBook) {
      void syncBooksToCloud([finishedBook]).then(() => fetchRecommendations());
    }
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

  function addBook(title: string, author: string, totalPages: number, genre: string, coverImageUri?: string, startingPage = 0) {
    const colors = ['#5C849E', '#B54935', '#3A6645', '#8B5E9E', '#B08A3C', '#4A7A52'];
    const currentPage = Math.min(Math.max(0, Math.floor(startingPage)), totalPages);
    const newBook: Book = {
      id: generateId(),
      title,
      author,
      totalPages,
      // This is a reader's existing position, not a session. Reading analytics
      // only change when logSession records the pages read after this point.
      currentPage,
      coverColor: colors[Math.floor(Math.random() * colors.length)],
      coverImageUri,
      genre,
      addedAt: Date.now(),
      friendsReading: [],
    };
    const newBooks = [...books, newBook];
    setBooks(newBooks);
    persist(newBooks, sessions, streak, profile, reminder);
    void syncBooksToCloud([newBook]).then(() => fetchRecommendations());
  }

  function updateBook(id: string, updates: Partial<Pick<Book, 'title' | 'author' | 'totalPages' | 'genre' | 'coverImageUri'>>) {
    const newBooks = books.map(b => b.id === id ? { ...b, ...updates } : b);
    setBooks(newBooks);
    persist(newBooks, sessions, streak, profile, reminder);
    const updatedBook = newBooks.find(b => b.id === id);
    if (updatedBook) {
      void syncBooksToCloud([updatedBook]).then(() => fetchRecommendations());
    }
  }

  function getBook(id: string) {
    return books.find(b => b.id === id);
  }

  return (
    <StoreContext.Provider value={{
      books, sessions, friends, streak, profile, reminder,
      recommendedBooks,
      refreshRecommendations: fetchRecommendations,
      suggestedFriends: SUGGESTED,
      isLoaded,
      pendingFreezeEarned,
      clearPendingFreezeEarned,
      pendingGoalMet,
      clearPendingGoalMet,
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
