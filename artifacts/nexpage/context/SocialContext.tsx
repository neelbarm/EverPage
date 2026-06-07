import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/lib/auth';

const AUTH_TOKEN_KEY = 'auth_session_token';

export interface SocialUser {
  id: string;
  username: string;
  displayName: string;
  color: string;
  initial: string;
}

export interface ActivityItem {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  color: string;
  initial: string;
  bookTitle: string;
  bookAuthor: string;
  durationMinutes: number;
  pagesRead: number;
  createdAt: string;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  color: string;
  initial: string;
  todayMinutes: number;
  todayPages: number;
  weekMinutes: number;
  weekPages: number;
  streakDays: number;
}

interface SocialContextType {
  socialProfile: SocialUser | null;
  isRegistered: boolean;
  following: SocialUser[];
  feed: ActivityItem[];
  leaderboard: LeaderboardEntry[];
  suggestedUsers: SocialUser[];
  isLoading: boolean;
  registerUser: (username: string, displayName: string, color: string) => Promise<void>;
  followUser: (userId: string) => Promise<void>;
  unfollowUser: (userId: string) => Promise<void>;
  searchUsers: (query: string) => Promise<SocialUser[]>;
  postActivity: (bookTitle: string, bookAuthor: string, durationMinutes: number, pagesRead: number) => Promise<void>;
  refreshFeed: () => Promise<void>;
  isFollowing: (userId: string) => boolean;
}

const SocialContext = createContext<SocialContextType | null>(null);

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

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };
  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers, credentials: 'include' });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [socialProfile, setSocialProfile] = useState<SocialUser | null>(null);
  const [following, setFollowing] = useState<SocialUser[]>([]);
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SocialUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setSocialProfile(null);
      setFollowing([]);
      setFeed([]);
      setLeaderboard([]);
      setSuggestedUsers([]);
      initialized.current = false;
      return;
    }
    if (!initialized.current) {
      initialized.current = true;
      loadProfile();
    }
  }, [isAuthenticated, authLoading]);

  async function loadProfile() {
    try {
      const profile = await apiFetch<SocialUser | null>('/social/me');
      setSocialProfile(profile);
      if (profile) {
        loadSocialData();
      }
    } catch { /* offline */ }
  }

  async function loadSocialData() {
    setIsLoading(true);
    try {
      const [followingData, feedData, boardData, suggestData] = await Promise.allSettled([
        apiFetch<SocialUser[]>('/social/following'),
        apiFetch<ActivityItem[]>('/social/feed'),
        apiFetch<LeaderboardEntry[]>('/social/leaderboard'),
        apiFetch<SocialUser[]>('/social/suggested'),
      ]);
      if (followingData.status === 'fulfilled') setFollowing(followingData.value);
      if (feedData.status === 'fulfilled') setFeed(feedData.value);
      if (boardData.status === 'fulfilled') setLeaderboard(boardData.value);
      if (suggestData.status === 'fulfilled') setSuggestedUsers(suggestData.value);
    } catch { /* ignore */ } finally {
      setIsLoading(false);
    }
  }

  const registerUser = useCallback(async (
    username: string,
    displayName: string,
    color: string,
  ) => {
    const initial = (displayName.trim()[0] ?? 'U').toUpperCase();
    const profile = await apiFetch<SocialUser>('/social/users', {
      method: 'POST',
      body: JSON.stringify({ username: username.trim().toLowerCase(), displayName: displayName.trim(), color, initial }),
    });
    setSocialProfile(profile);
    await loadSocialData();
  }, []);

  const followUser = useCallback(async (userId: string) => {
    await apiFetch(`/social/users/${userId}/follow`, { method: 'POST' });
    await loadSocialData();
  }, []);

  const unfollowUser = useCallback(async (userId: string) => {
    await apiFetch(`/social/users/${userId}/follow`, { method: 'DELETE' });
    setFollowing(prev => prev.filter(u => u.id !== userId));
    setFeed(prev => prev.filter(a => a.userId !== userId));
    setLeaderboard(prev => prev.filter(e => e.userId !== userId));
    setSuggestedUsers(prev => {
      const wasFollowing = following.find(u => u.id === userId);
      if (wasFollowing && !prev.some(u => u.id === userId)) {
        return [wasFollowing, ...prev];
      }
      return prev;
    });
  }, [following]);

  const searchUsers = useCallback(async (query: string): Promise<SocialUser[]> => {
    if (query.trim().length < 1) return [];
    try {
      return await apiFetch<SocialUser[]>(`/social/users/search?q=${encodeURIComponent(query.trim())}`);
    } catch { return []; }
  }, []);

  const postActivity = useCallback(async (
    bookTitle: string,
    bookAuthor: string,
    durationMinutes: number,
    pagesRead: number,
  ) => {
    if (!socialProfile) return;
    try {
      await apiFetch('/social/activity', {
        method: 'POST',
        body: JSON.stringify({ bookTitle, bookAuthor, durationMinutes, pagesRead }),
      });
    } catch { /* non-blocking */ }
  }, [socialProfile]);

  const refreshFeed = useCallback(async () => {
    await loadSocialData();
  }, []);

  const isFollowing = useCallback((userId: string) => {
    return following.some(u => u.id === userId);
  }, [following]);

  const isRegistered = socialProfile !== null;

  return (
    <SocialContext.Provider value={{
      socialProfile,
      isRegistered,
      following,
      feed,
      leaderboard,
      suggestedUsers,
      isLoading,
      registerUser,
      followUser,
      unfollowUser,
      searchUsers,
      postActivity,
      refreshFeed,
      isFollowing,
    }}>
      {children}
    </SocialContext.Provider>
  );
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error('useSocial must be inside SocialProvider');
  return ctx;
}
