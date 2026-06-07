import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  logSession: (bookId: string, durationMinutes: number, startPage: number, endPage: number) => Promise<void>;
  finishBook: (bookId: string, favoriteQuote?: string) => void;
  useStreakFreeze: () => void;
  addBook: (title: string, author: string, totalPages: number, genre: string, coverImageUri?: string) => void;
  updateBook: (id: string, updates: Partial<Pick<Book, 'title' | 'author' | 'totalPages' | 'genre' | 'coverImageUri'>>) => void;
  getBook: (id: string) => Book | undefined;
  setReminder: (settings: ReminderSettings) => Promise<void>;
}

const StoreContext = createContext<StoreContextType | null>(null);

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

const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  hour: 21,
  minute: 0,
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<Book[]>(MOCK_BOOKS);
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [friends] = useState<Friend[]>(MOCK_FRIENDS);
  const [streak, setStreak] = useState<StreakData>(INITIAL_STREAK);
  const [profile, setProfile] = useState<UserProfile>(INITIAL_PROFILE);
  const [reminder, setReminderState] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [isLoaded, setIsLoaded] = useState(false);

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

  async function persist(b: Book[], se: ReadingSession[], st: StreakData, p: UserProfile, r: ReminderSettings) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ books: b, sessions: se, streak: st, profile: p, reminder: r }));
    } catch { /* ignore */ }
  }

  async function setReminder(settings: ReminderSettings) {
    setReminderState(settings);
    await persist(books, sessions, streak, profile, settings);
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
    if (!newStreak.checkedDays.includes(todayStr())) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      if (newStreak.lastReadDate === yStr || newStreak.lastReadDate === todayStr()) {
        if (newStreak.lastReadDate !== todayStr()) newStreak.currentStreak += 1;
      } else {
        newStreak.currentStreak = 1;
      }
      newStreak.checkedDays = [...newStreak.checkedDays, todayStr()];
      newStreak.lastReadDate = todayStr();
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
    await persist(newBooks, newSessions, newStreak, newProfile, reminder);
  }

  function finishBook(bookId: string, favoriteQuote?: string) {
    const newBooks = books.map(b =>
      b.id === bookId ? { ...b, finishedAt: Date.now(), favoriteQuote: favoriteQuote ?? b.favoriteQuote } : b
    );
    const newProfile = { ...profile, booksFinished: profile.booksFinished + 1 };
    setBooks(newBooks);
    setProfile(newProfile);
    persist(newBooks, sessions, streak, newProfile, reminder);
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
  }

  function updateBook(id: string, updates: Partial<Pick<Book, 'title' | 'author' | 'totalPages' | 'genre' | 'coverImageUri'>>) {
    const newBooks = books.map(b => b.id === id ? { ...b, ...updates } : b);
    setBooks(newBooks);
    persist(newBooks, sessions, streak, profile, reminder);
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
      logSession, finishBook, useStreakFreeze, addBook, updateBook, getBook, setReminder,
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
