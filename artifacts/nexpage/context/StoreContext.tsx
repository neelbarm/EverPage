import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getItem as getStoredItem } from '@/lib/storage';
import {
  bindVerifiedCredential,
  canSendAccountOperation,
  type AccountBoundCredential,
} from '@/lib/offlineQueue';
import { useAuth } from '@/lib/auth';
import {
  cancelStreakRescueNotification,
  getStreakRescueScheduledDate,
  rescheduleStreakRescueForTomorrow,
  scheduleStreakRescueNotification,
} from '@/lib/notifications';
import {
  acknowledgeQueueEntity,
  localCalendarDayDistance,
  localDateKey,
  localWeekDates,
  queueEntityId,
  upsertQueueEntity,
  upsertSessionByStableId,
} from '@/lib/reliabilityPolicies';

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
  logSession: (bookId: string, durationMinutes: number, startPage: number, endPage: number, stableSessionId?: string) => Promise<void>;
  finishBook: (bookId: string, favoriteQuote?: string) => void;
  useStreakFreeze: () => void;
  addBook: (title: string, author: string, totalPages: number, genre: string, coverImageUri?: string, startingPage?: number) => void;
  updateBook: (id: string, updates: Partial<Pick<Book, 'title' | 'author' | 'totalPages' | 'genre' | 'coverImageUri'>>) => void;
  getBook: (id: string) => Book | undefined;
  setReminder: (settings: ReminderSettings) => Promise<void>;
  setDailyGoal: (minutes: number) => Promise<void>;
  updateProfile: (name: string, color: string) => Promise<void>;
  syncError: string | null;
  isSyncing: boolean;
  retrySync: () => Promise<void>;
  /** Deliberately opt in to copying the local guest shelf into this account. */
  migrateGuestDataToAccount: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType | null>(null);

const AUTH_TOKEN_KEY = 'auth_session_token';

function todayStr(): string {
  // Reading days are based on the reader's local calendar, not UTC. Using an
  // ISO timestamp here made a late-evening session count toward tomorrow for
  // some readers (and left yesterday's total on the new day's goal).
  return localDateKey(new Date());
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
const QUEUE_KEY = 'everpage_offline_queue_v1';
const GUEST_ACCOUNT_ID = 'guest';

type SyncOperation = {
  id: string;
  accountId: string;
  kind: 'book' | 'session' | 'streak';
  payload: Book | ReadingSession | StreakData;
  createdAt: number;
};

function accountStorageKey(base: string, accountId: string): string {
  // User ids are server controlled, but encode them so a malformed id cannot
  // collide with another account's local namespace.
  return `${base}:${encodeURIComponent(accountId)}`;
}

function dateFromString(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime())
    || date.getFullYear() !== Number(match[1])
    || date.getMonth() !== Number(match[2]) - 1
    || date.getDate() !== Number(match[3])
    ? null
    : date;
}

function calendarDayNumber(value: string): number | null {
  return localCalendarDayDistance(value, '1970-01-01');
}

function deriveProfile(
  profile: UserProfile,
  booksToDerive: Book[],
  readingSessions: ReadingSession[],
): UserProfile {
  const weekDates = localWeekDates();
  const weekSet = new Set(weekDates);
  const weeklyMinutes = [0, 0, 0, 0, 0, 0, 0];
  let totalMinutes = 0;
  let totalPages = 0;
  const dates = new Set<string>();

  for (const session of readingSessions) {
    const minutes = Number(session.durationMinutes);
    const pageDelta = Number(session.endPage) - Number(session.startPage);
    const pages = Number.isFinite(pageDelta) ? Math.max(0, pageDelta) : 0;
    if (Number.isFinite(minutes) && minutes > 0) totalMinutes += minutes;
    if (Number.isFinite(pages)) totalPages += pages;
    if (typeof session.date === 'string' && dateFromString(session.date)) {
      dates.add(session.date);
      const weekIndex = weekDates.indexOf(session.date);
      if (weekIndex >= 0) weeklyMinutes[weekIndex] += Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
    }
  }

  // Streak length is derived from dates, not from a counter that can be
  // replayed after a hydration or retry race.
  let longestStreak = 0;
  let run = 0;
  const sortedDates = [...dates].sort();
  for (let i = 0; i < sortedDates.length; i += 1) {
    const current = dateFromString(sortedDates[i]);
    const previous = i > 0 ? dateFromString(sortedDates[i - 1]) : null;
    const currentDay = calendarDayNumber(sortedDates[i]);
    const previousDay = i > 0 ? calendarDayNumber(sortedDates[i - 1]) : null;
    if (current && previous && currentDay !== null && previousDay !== null && currentDay - previousDay === 1) run += 1;
    else run = 1;
    longestStreak = Math.max(longestStreak, run);
  }

  return {
    ...profile,
    booksFinished: booksToDerive.filter(book => !!book.finishedAt).length,
    totalMinutes,
    totalPages,
    weeklyMinutes,
    weeklyPages: readingSessions.reduce((total, session) => (
      weekSet.has(session.date) ? total + Math.max(0, Number(session.endPage) - Number(session.startPage)) : total
    ), 0),
    longestStreak,
  };
}

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
  return apiFetchWithToken(path, token, options);
}

async function apiFetchWithToken<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
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
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const accountId = user?.id ?? GUEST_ACCOUNT_ID;
  const accountIdRef = useRef(accountId);
  const queueRef = useRef<SyncOperation[]>([]);
  const queueWriteRef = useRef<Promise<void>>(Promise.resolve());
  const stateWriteRef = useRef<Promise<void>>(Promise.resolve());
  const syncInFlightRef = useRef(false);
  const savingSessionIdsRef = useRef(new Set<string>());
  const identityVersionRef = useRef(0);
  const initializedAccountRef = useRef<string | null>(null);
  const accountCredentialRef = useRef<AccountBoundCredential | null>(null);
  const mutationRevisionRef = useRef(0);
  const snapshotRef = useRef({ books, sessions, streak, profile, reminder });
  snapshotRef.current = { books, sessions, streak, profile, reminder };

  async function verifiedCredential(version: number, owner: string): Promise<AccountBoundCredential | null> {
    if (owner === GUEST_ACCOUNT_ID) return null;
    if (version !== identityVersionRef.current || owner !== accountIdRef.current) return null;
    if (accountCredentialRef.current?.accountId === owner) return accountCredentialRef.current;
    const token = await getAuthToken();
    if (!token || version !== identityVersionRef.current || owner !== accountIdRef.current) return null;
    const identity = await apiFetchWithToken<{ user?: { id?: string } }>('/local-auth/me', token);
    if (version !== identityVersionRef.current || owner !== accountIdRef.current) return null;
    accountCredentialRef.current = bindVerifiedCredential(owner, token, identity.user?.id);
    return accountCredentialRef.current;
  }

  function resetInMemoryState() {
    setBooks([]);
    setSessions([]);
    setStreak(INITIAL_STREAK);
    setProfile(INITIAL_PROFILE);
    setReminderState(DEFAULT_REMINDER);
    setRecommendedBooks(RECOMMENDED);
    setPendingFreezeEarned(false);
    setPendingGoalMet(false);
    setSyncError(null);
  }

  function persistQueue(nextQueue: SyncOperation[]): Promise<void> {
    queueRef.current = nextQueue;
    const key = accountStorageKey(QUEUE_KEY, accountIdRef.current);
    queueWriteRef.current = queueWriteRef.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(key, JSON.stringify(nextQueue)));
    return queueWriteRef.current;
  }

  function queueOperation(kind: SyncOperation['kind'], payload: SyncOperation['payload']): Promise<void> {
    mutationRevisionRef.current += 1;
    if (accountIdRef.current === GUEST_ACCOUNT_ID) {
      // Guest edits are durable and intentionally remain isolated. They can
      // only reach an account through migrateGuestDataToAccount().
    }
    const entityId = kind === 'streak' ? 'streak' : (payload as Book | ReadingSession).id;
    const operation: SyncOperation = {
      id: queueEntityId(kind, entityId),
      accountId: accountIdRef.current,
      kind,
      payload,
      createdAt: Date.now(),
    };
    const next = upsertQueueEntity(queueRef.current, operation);
    return persistQueue(next);
  }

  function queueOperations(
    operations: Array<Pick<SyncOperation, 'kind' | 'payload'>>,
  ): Promise<void> {
    mutationRevisionRef.current += 1;
    const ownerAccountId = accountIdRef.current;
    let next = [...queueRef.current];
    for (const item of operations) {
      const entityId = item.kind === 'streak'
        ? 'streak'
        : (item.payload as Book | ReadingSession).id;
      const operation: SyncOperation = {
        id: queueEntityId(item.kind, entityId),
        accountId: ownerAccountId,
        kind: item.kind,
        payload: item.payload,
        createdAt: Date.now(),
      };
      next = upsertQueueEntity(next, operation);
    }
    return persistQueue(next);
  }

  function clearPendingFreezeEarned() {
    setPendingFreezeEarned(false);
  }

  function clearPendingGoalMet() {
    setPendingGoalMet(false);
  }

  useEffect(() => {
    if (authLoading) return;
    const version = identityVersionRef.current + 1;
    identityVersionRef.current = version;
    accountIdRef.current = accountId;
    accountCredentialRef.current = null;
    initializedAccountRef.current = null;
    resetInMemoryState();
    setIsLoaded(false);

    (async () => {
      let loadedStreak: StreakData = INITIAL_STREAK;
      let loadedProfile: UserProfile = INITIAL_PROFILE;
      let loadedReminder: ReminderSettings = DEFAULT_REMINDER;
      try {
        if (accountId !== GUEST_ACCOUNT_ID) {
          const token = await getAuthToken();
          if (version !== identityVersionRef.current || accountIdRef.current !== accountId) return;
          if (token) {
            try {
              const identity = await apiFetchWithToken<{ user?: { id?: string } }>(
                '/local-auth/me',
                token,
              );
              if (version !== identityVersionRef.current || accountIdRef.current !== accountId) return;
              accountCredentialRef.current = bindVerifiedCredential(
                accountId,
                token,
                identity.user?.id,
              );
            } catch {
              // Offline credentials remain stored, but no queued write can be
              // sent until this token is verified as belonging to this account.
              accountCredentialRef.current = null;
            }
          }
        }
        const key = accountStorageKey(STORAGE_KEY, accountId);
        let raw = await AsyncStorage.getItem(key);
        // Released builds used an unpartitioned guest key. It is migrated only
        // into the guest namespace; authenticated accounts never inherit it.
        if (!raw && accountId === GUEST_ACCOUNT_ID) {
          const legacy = await AsyncStorage.getItem(STORAGE_KEY);
          if (legacy) {
            raw = legacy;
            await AsyncStorage.setItem(key, legacy);
          }
        }
        const queueRaw = await AsyncStorage.getItem(accountStorageKey(QUEUE_KEY, accountId));
        const storedQueue = queueRaw ? JSON.parse(queueRaw) : [];
        if (version !== identityVersionRef.current || accountIdRef.current !== accountId) return;
        queueRef.current = Array.isArray(storedQueue)
          ? storedQueue.filter((item: SyncOperation) => item?.accountId === accountId)
          : [];
        {
          const stored = raw ? JSON.parse(raw) : {};
          const bookMap = new Map<string, Book>((Array.isArray(stored.books) ? stored.books.map(rowToBook) : []).map((book: Book) => [book.id, book]));
          const sessionMap = new Map<string, ReadingSession>((Array.isArray(stored.sessions) ? stored.sessions.map(rowToSession) : []).map((session: ReadingSession) => [session.id, session]));
          // Recover a crash between the durable outbox write and cache write,
          // including guest/offline launches where no cloud hydration runs.
          for (const operation of queueRef.current) {
            if (operation.kind === 'book') bookMap.set((operation.payload as Book).id, operation.payload as Book);
            else if (operation.kind === 'session') sessionMap.set((operation.payload as ReadingSession).id, operation.payload as ReadingSession);
            else stored.streak = operation.payload;
          }
          const storedBooks = [...bookMap.values()];
          const storedSessions = [...sessionMap.values()];
          const storedProfile = stored.profile ? { ...INITIAL_PROFILE, ...stored.profile } : INITIAL_PROFILE;
          loadedStreak = stored.streak ? withDerivedTodayMinutes(stored.streak, storedSessions) : INITIAL_STREAK;
          loadedProfile = deriveProfile(storedProfile, storedBooks, storedSessions);
          loadedReminder = stored.reminder ? { ...DEFAULT_REMINDER, ...stored.reminder } : DEFAULT_REMINDER;
          setBooks(storedBooks);
          setSessions(storedSessions);
          setStreak(loadedStreak);
          setProfile(loadedProfile);
          setReminderState(loadedReminder);
        }
      } catch {
        queueRef.current = [];
      }
      if (version !== identityVersionRef.current || accountIdRef.current !== accountId) return;
      setIsLoaded(true);
      if (isAuthenticated) {
        void hydrateFromCloud(version, accountId, loadedStreak, loadedProfile, loadedReminder);
        void fetchRecommendations(version, accountId);
      }
    })();
    return () => { identityVersionRef.current += 1; };
  }, [accountId, authLoading, isAuthenticated]);

  async function fetchRecommendations(version = identityVersionRef.current, expectedAccountId = accountIdRef.current) {
    try {
      const credential = await verifiedCredential(version, expectedAccountId);
      if (!credential) return;
      const recs = await apiFetchWithToken<RecommendedBook[]>('/social/recommendations', credential.token);
      if (version === identityVersionRef.current && expectedAccountId === accountIdRef.current && Array.isArray(recs) && recs.length > 0) {
        setRecommendedBooks(recs);
      }
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
      const reconciledStreak = withDerivedTodayMinutes(streak, sessions);
      const reconciledProfile = deriveProfile(profile, books, sessions);
      const streakChanged = reconciledStreak.todayMinutes !== streak.todayMinutes;
      const profileChanged = JSON.stringify(reconciledProfile) !== JSON.stringify(profile);
      if (streakChanged) setStreak(reconciledStreak);
      if (profileChanged) setProfile(reconciledProfile);
      if (streakChanged || profileChanged) {
        void persist(books, sessions, reconciledStreak, reconciledProfile, reminder);
      }
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
  }, [books, isLoaded, profile, reminder, sessions, streak]);

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

  async function persist(b: Book[], se: ReadingSession[], st: StreakData, p: UserProfile, r: ReminderSettings) {
    mutationRevisionRef.current += 1;
    try {
      const key = accountStorageKey(STORAGE_KEY, accountIdRef.current);
      const serialized = JSON.stringify({
        books: b,
        sessions: se,
        streak: st,
        profile: p,
        reminder: r,
      });
      stateWriteRef.current = stateWriteRef.current
        .catch(() => {})
        .then(() => AsyncStorage.setItem(key, serialized));
      await stateWriteRef.current;
    } catch {
      // A later mutation or retry will attempt persistence again.
    }
  }

  async function sendOperation(operation: SyncOperation, token: string): Promise<void> {
    if (operation.kind === 'book') {
      await apiFetchWithToken('/bookshelf/books', token, { method: 'POST', body: JSON.stringify(operation.payload) });
    } else if (operation.kind === 'session') {
      await apiFetchWithToken('/bookshelf/sessions', token, { method: 'POST', body: JSON.stringify(operation.payload) });
    } else {
      await apiFetchWithToken('/bookshelf/streak', token, {
        method: 'PUT',
        body: JSON.stringify({ ...operation.payload, todayDate: todayStr() }),
      });
    }
  }

  async function flushQueue(expectedVersion = identityVersionRef.current, expectedAccountId = accountIdRef.current): Promise<void> {
    if (!isAuthenticated || expectedAccountId === GUEST_ACCOUNT_ID || syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const credential = await verifiedCredential(expectedVersion, expectedAccountId);
      if (!credential) return;
      while (
        queueRef.current.length > 0
        && expectedVersion === identityVersionRef.current
        && expectedAccountId === accountIdRef.current
      ) {
        // Do not send a mutation before its outbox write is durable.
        let durableWrite: Promise<void>;
        do {
          durableWrite = queueWriteRef.current;
          await durableWrite.catch(() => persistQueue(queueRef.current));
        } while (durableWrite !== queueWriteRef.current);
        if (expectedVersion !== identityVersionRef.current || expectedAccountId !== accountIdRef.current) return;
        const operation = queueRef.current[0];
        if (!operation) break;
        if (!canSendAccountOperation(operation.accountId, expectedAccountId, credential)) {
          throw new Error("Queued write belongs to a different account");
        }
        await sendOperation(operation, credential.token);
        if (expectedVersion !== identityVersionRef.current || expectedAccountId !== accountIdRef.current) return;
        await persistQueue(acknowledgeQueueEntity(queueRef.current, operation));
      }
    } catch (error) {
      if (expectedVersion === identityVersionRef.current && expectedAccountId === accountIdRef.current) {
        setSyncError(error instanceof Error ? error.message : 'Sync failed. Please retry.');
      }
    } finally {
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
  }

  async function hydrateFromCloud(
    expectedVersion: number,
    expectedAccountId: string,
    loadedStreak: StreakData,
    loadedProfile: UserProfile,
    loadedReminder: ReminderSettings,
  ) {
    if (!isAuthenticated || expectedAccountId === GUEST_ACCOUNT_ID) return;
    try {
      const credential = await verifiedCredential(expectedVersion, expectedAccountId);
      if (!credential) return;
      const revision = mutationRevisionRef.current;
      const pendingAtRequest = [...queueRef.current];
      const data = await apiFetchWithToken<{ books: any[]; sessions: any[]; streak: any | null }>(
        `/bookshelf?today=${encodeURIComponent(todayStr())}`,
        credential.token,
      );
      if (expectedVersion !== identityVersionRef.current || expectedAccountId !== accountIdRef.current) return;
      // A GET started before a local edit cannot replace the edited state,
      // even if that edit has already been sent and left the queue.
      if (revision !== mutationRevisionRef.current) { await flushQueue(expectedVersion, expectedAccountId); return; }

      const booksById = new Map(data.books.map(row => {
        const book = rowToBook(row);
        return [book.id, book] as const;
      }));
      const sessionsById = new Map(data.sessions.map(row => {
        const session = rowToSession(row);
        return [session.id, session] as const;
      }));
      let hydratedStreak: StreakData | null = data.streak
        ? { ...INITIAL_STREAK, ...data.streak }
        : null;
      // Apply only edits that were durably queued while offline. This avoids
      // cloud hydration erasing a session that has not reached the server yet.
      for (const operation of [...pendingAtRequest, ...queueRef.current]) {
        if (operation.kind === 'book') {
          const book = operation.payload as Book;
          booksById.set(book.id, book);
        } else if (operation.kind === 'session') {
          const session = operation.payload as ReadingSession;
          sessionsById.set(session.id, session);
        } else {
          hydratedStreak = operation.payload as StreakData;
        }
      }
      const hydratedBooks = [...booksById.values()];
      const hydratedSessions = [...sessionsById.values()];
      const nextStreak = hydratedStreak
        ? withDerivedTodayMinutes(hydratedStreak, hydratedSessions)
        : withDerivedTodayMinutes(loadedStreak, hydratedSessions);
      const nextProfile = deriveProfile(loadedProfile, hydratedBooks, hydratedSessions);
      setBooks(hydratedBooks);
      setSessions(hydratedSessions);
      setStreak(nextStreak);
      setProfile(nextProfile);
      await persist(hydratedBooks, hydratedSessions, nextStreak, nextProfile, loadedReminder);
      await flushQueue(expectedVersion, expectedAccountId);
      if (queueRef.current.length === 0) {
        await AsyncStorage.setItem(accountStorageKey(CLOUD_INIT_KEY, expectedAccountId), '1');
        initializedAccountRef.current = expectedAccountId;
      }
    } catch (error) {
      if (expectedVersion === identityVersionRef.current && expectedAccountId === accountIdRef.current) {
        setSyncError(error instanceof Error ? error.message : 'Unable to sync. Please retry.');
      }
    }
  }

  useEffect(() => {
    if (!isLoaded || !isAuthenticated) return;
    const retry = () => {
      void flushQueue().then(() => {
        if (initializedAccountRef.current !== accountId) {
          const snapshot = snapshotRef.current;
          void hydrateFromCloud(identityVersionRef.current, accountId, snapshot.streak, snapshot.profile, snapshot.reminder);
          void fetchRecommendations();
        }
      });
    };
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') retry();
    });
    const interval = setInterval(retry, 30_000);
    retry();
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [isLoaded, isAuthenticated, accountId]);

  async function setReminder(settings: ReminderSettings) {
    setReminderState(settings);
    await persist(books, sessions, streak, profile, settings);
  }

  async function setDailyGoal(minutes: number) {
    const newStreak = { ...withDerivedTodayMinutes(streak, sessions), dailyGoalMinutes: minutes };
    setStreak(newStreak);
    await persist(books, sessions, newStreak, profile, reminder);
    await queueOperation('streak', newStreak);
    void flushQueue();
  }

  async function updateProfile(name: string, color: string) {
    const trimmed = name.trim() || 'You';
    const newProfile = { ...profile, name: trimmed, color, initial: trimmed.charAt(0).toUpperCase() };
    setProfile(newProfile);
    await persist(books, sessions, streak, newProfile, reminder);
  }

  async function logSession(
    bookId: string,
    durationMinutes: number,
    startPage: number,
    endPage: number,
    stableSessionId?: string,
  ) {
    const sessionId = stableSessionId ?? generateId();
    const existingSession = sessions.find(existing => existing.id === sessionId);
    if (savingSessionIdsRef.current.has(sessionId)) return;
    if (existingSession) {
      // A previous attempt may have persisted local state but failed before
      // persisting its queue. Re-enqueueing the stable ID is idempotent.
      await queueOperation('session', existingSession);
      void flushQueue();
      return;
    }
    savingSessionIdsRef.current.add(sessionId);
    try {
    const safeDuration = Number.isFinite(durationMinutes) ? Math.max(0, durationMinutes) : 0;
    const session: ReadingSession = {
      id: sessionId,
      bookId,
      durationMinutes: safeDuration,
      startPage: Math.max(0, Math.floor(startPage)),
      endPage: Math.max(Math.floor(startPage), Math.floor(endPage)),
      date: todayStr(),
      createdAt: Date.now(),
    };
    const newSessions = upsertSessionByStableId(sessions, session);
    const newBooks = books.map(b =>
      b.id === bookId ? { ...b, currentPage: Math.min(session.endPage, b.totalPages) } : b
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
    const newProfile = deriveProfile(profile, newBooks, newSessions);
    const updatedBook = newBooks.find(b => b.id === bookId);
    await queueOperations([
      ...(updatedBook ? [{ kind: 'book' as const, payload: updatedBook }] : []),
      { kind: 'session', payload: session },
      { kind: 'streak', payload: newStreak },
    ]);
    await persist(newBooks, newSessions, newStreak, newProfile, reminder);
    setSessions(newSessions);
    setBooks(newBooks);
    setStreak(newStreak);
    setProfile(newProfile);
    if (earnedFreeze) setPendingFreezeEarned(true);
    if (goalJustMet) setPendingGoalMet(true);
    void flushQueue();
    void fetchRecommendations();
    await cancelStreakRescueNotification();
    rescheduleStreakRescueForTomorrow();
    } finally {
    savingSessionIdsRef.current.delete(sessionId);
    }
  }

  function finishBook(bookId: string, favoriteQuote?: string) {
    const book = books.find(b => b.id === bookId);
    if (!book || book.finishedAt) return;
    const newBooks = books.map(b =>
      b.id === bookId ? { ...b, currentPage: b.totalPages, finishedAt: Date.now(), favoriteQuote: favoriteQuote ?? b.favoriteQuote } : b
    );
    const newProfile = deriveProfile(profile, newBooks, sessions);
    const newStreak: StreakData =
      streak.freezesLeft < MAX_FREEZES
        ? { ...streak, freezesLeft: Math.min(streak.freezesLeft + 1, MAX_FREEZES) }
        : streak;
    const earnedFreeze = newStreak.freezesLeft > streak.freezesLeft;
    setBooks(newBooks);
    setProfile(newProfile);
    setStreak(newStreak);
    if (earnedFreeze) setPendingFreezeEarned(true);
    void persist(newBooks, sessions, newStreak, newProfile, reminder);
    const finishedBook = newBooks.find(b => b.id === bookId);
    if (finishedBook) {
      void queueOperation('book', finishedBook).then(() => {
        void flushQueue();
        return fetchRecommendations();
      });
    }
    if (earnedFreeze) {
      void queueOperation('streak', newStreak).then(() => flushQueue());
    }
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
    void persist(books, sessions, newStreak, profile, reminder);
    void queueOperation('streak', newStreak).then(() => flushQueue());
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
    void persist(newBooks, sessions, streak, profile, reminder);
    void queueOperation('book', newBook).then(() => {
      void flushQueue();
      return fetchRecommendations();
    });
  }

  function updateBook(id: string, updates: Partial<Pick<Book, 'title' | 'author' | 'totalPages' | 'genre' | 'coverImageUri'>>) {
    const newBooks = books.map(b => b.id === id ? { ...b, ...updates } : b);
    setBooks(newBooks);
    void persist(newBooks, sessions, streak, profile, reminder);
    const updatedBook = newBooks.find(b => b.id === id);
    if (updatedBook) {
      void queueOperation('book', updatedBook).then(() => {
        void flushQueue();
        return fetchRecommendations();
      });
    }
  }

  function getBook(id: string) {
    return books.find(b => b.id === id);
  }

  async function migrateGuestDataToAccount() {
    if (!isAuthenticated || accountIdRef.current === GUEST_ACCOUNT_ID) {
      throw new Error('Sign in before migrating guest data.');
    }
    const guestRaw = await AsyncStorage.getItem(accountStorageKey(STORAGE_KEY, GUEST_ACCOUNT_ID))
      ?? await AsyncStorage.getItem(STORAGE_KEY);
    if (!guestRaw) return;
    const guestState = JSON.parse(guestRaw);
    const guestBooks = Array.isArray(guestState.books) ? guestState.books.map(rowToBook) : [];
    const guestSessions = Array.isArray(guestState.sessions) ? guestState.sessions.map(rowToSession) : [];
    const mergedBooks = [...books, ...guestBooks.filter((book: Book) => !books.some(existing => existing.id === book.id))];
    const mergedSessions = [...sessions, ...guestSessions.filter((session: ReadingSession) => !sessions.some(existing => existing.id === session.id))];
    const mergedStreak = guestState.streak ? { ...streak, ...guestState.streak } : streak;
    const mergedProfile = deriveProfile({ ...profile, ...(guestState.profile ?? {}) }, mergedBooks, mergedSessions);
    const mergedReminder = guestState.reminder ? { ...DEFAULT_REMINDER, ...guestState.reminder } : reminder;
    setBooks(mergedBooks);
    setSessions(mergedSessions);
    setStreak(mergedStreak);
    setProfile(mergedProfile);
    setReminderState(mergedReminder);
    await persist(mergedBooks, mergedSessions, mergedStreak, mergedProfile, mergedReminder);
    await Promise.all([
      ...mergedBooks.map(book => queueOperation('book', book)),
      ...mergedSessions.map(session => queueOperation('session', session)),
      queueOperation('streak', mergedStreak),
    ]);
    await flushQueue();
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
      syncError,
      isSyncing,
      retrySync: () => flushQueue(),
      migrateGuestDataToAccount,
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
