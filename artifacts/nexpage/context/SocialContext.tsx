import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { getItem as getStoredItem } from '@/lib/storage';
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
  activityType: 'session' | 'recommendation';
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

export interface NudgeHistoryItem {
  id: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  senderColor: string;
  senderInitial: string;
  createdAt: string;
}

interface SocialContextType {
  socialProfile: (SocialUser & { nudgesEnabled: boolean }) | null;
  isRegistered: boolean;
  following: SocialUser[];
  followers: SocialUser[];
  feed: ActivityItem[];
  leaderboard: LeaderboardEntry[];
  suggestedUsers: SocialUser[];
  nudgeHistory: NudgeHistoryItem[];
  unreadNudgeCount: number;
  isLoading: boolean;
  registerUser: (username: string, displayName: string, color: string) => Promise<void>;
  followUser: (userId: string) => Promise<void>;
  unfollowUser: (userId: string) => Promise<void>;
  searchUsers: (query: string) => Promise<SocialUser[]>;
  postActivity: (bookTitle: string, bookAuthor: string, durationMinutes: number, pagesRead: number, activityType?: 'session' | 'recommendation') => Promise<void>;
  postRecommendation: (bookTitle: string, bookAuthor: string) => Promise<void>;
  refreshFeed: () => Promise<void>;
  isFollowing: (userId: string) => boolean;
  sendNudge: (userId: string) => Promise<{ alreadyNudged: boolean }>;
  registerPushToken: (token: string) => Promise<void>;
  setNudgesEnabled: (enabled: boolean) => Promise<void>;
  markNudgesRead: () => void;
}

const SocialContext = createContext<SocialContextType | null>(null);

function getApiBase(): string {
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
  const [socialProfile, setSocialProfile] = useState<(SocialUser & { nudgesEnabled: boolean }) | null>(null);
  const [following, setFollowing] = useState<SocialUser[]>([]);
  const [followers, setFollowers] = useState<SocialUser[]>([]);
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SocialUser[]>([]);
  const [nudgeHistory, setNudgeHistory] = useState<NudgeHistoryItem[]>([]);
  const [lastReadNudgeTime, setLastReadNudgeTime] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setSocialProfile(null);
      setFollowing([]);
      setFollowers([]);
      setFeed([]);
      setLeaderboard([]);
      setSuggestedUsers([]);
      setNudgeHistory([]);
      setLastReadNudgeTime(0);
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
      const profile = await apiFetch<(SocialUser & { nudgesEnabled: boolean }) | null>('/social/me');
      setSocialProfile(profile);
      if (profile) {
        loadSocialData();
      }
    } catch { /* offline */ }
  }

  async function loadSocialData() {
    setIsLoading(true);
    try {
      const [followingData, followersData, feedData, boardData, suggestData, nudgesData] = await Promise.allSettled([
        apiFetch<SocialUser[]>('/social/following'),
        apiFetch<SocialUser[]>('/social/followers'),
        apiFetch<ActivityItem[]>('/social/feed'),
        apiFetch<LeaderboardEntry[]>('/social/leaderboard'),
        apiFetch<SocialUser[]>('/social/suggested'),
        apiFetch<NudgeHistoryItem[]>('/social/nudges'),
      ]);
      if (followingData.status === 'fulfilled') setFollowing(followingData.value);
      if (followersData.status === 'fulfilled') setFollowers(followersData.value);
      if (feedData.status === 'fulfilled') setFeed(feedData.value);
      if (boardData.status === 'fulfilled') setLeaderboard(boardData.value);
      if (suggestData.status === 'fulfilled') setSuggestedUsers(suggestData.value);
      if (nudgesData.status === 'fulfilled') setNudgeHistory(nudgesData.value);
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
    const profile = await apiFetch<SocialUser & { nudgesEnabled: boolean }>('/social/users', {
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
    await loadSocialData();
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
    activityType: 'session' | 'recommendation' = 'session',
  ) => {
    if (!socialProfile) return;
    try {
      await apiFetch('/social/activity', {
        method: 'POST',
        body: JSON.stringify({ bookTitle, bookAuthor, durationMinutes, pagesRead, activityType }),
      });
    } catch { /* non-blocking */ }
  }, [socialProfile]);

  const postRecommendation = useCallback(async (
    bookTitle: string,
    bookAuthor: string,
  ) => {
    if (!socialProfile) return;
    await apiFetch('/social/activity', {
      method: 'POST',
      body: JSON.stringify({ bookTitle, bookAuthor, durationMinutes: 0, pagesRead: 0, activityType: 'recommendation' }),
    });
  }, [socialProfile]);

  const refreshFeed = useCallback(async () => {
    await loadSocialData();
  }, []);

  const isFollowing = useCallback((userId: string) => {
    return following.some(u => u.id === userId);
  }, [following]);

  const sendNudge = useCallback(async (userId: string): Promise<{ alreadyNudged: boolean }> => {
    const token = await getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
    const res = await fetch(`${getApiBase()}/social/nudge/${userId}`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });
    if (res.status === 429) {
      return { alreadyNudged: true };
    }
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`API error ${res.status}: ${err}`);
    }
    return { alreadyNudged: false };
  }, []);

  const registerPushToken = useCallback(async (token: string) => {
    try {
      await apiFetch('/social/push-token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    } catch { /* non-blocking */ }
  }, []);

  const setNudgesEnabled = useCallback(async (enabled: boolean) => {
    await apiFetch('/social/me/settings', {
      method: 'PATCH',
      body: JSON.stringify({ nudgesEnabled: enabled }),
    });
    setSocialProfile(prev => prev ? { ...prev, nudgesEnabled: enabled } : prev);
  }, []);

  const markNudgesRead = useCallback(() => {
    setLastReadNudgeTime(Date.now());
  }, []);

  const unreadNudgeCount = nudgeHistory.filter(n => {
    return new Date(n.createdAt).getTime() > lastReadNudgeTime;
  }).length;

  const isRegistered = socialProfile !== null;

  return (
    <SocialContext.Provider value={{
      socialProfile,
      isRegistered,
      following,
      followers,
      feed,
      leaderboard,
      suggestedUsers,
      nudgeHistory,
      unreadNudgeCount,
      isLoading,
      registerUser,
      followUser,
      unfollowUser,
      searchUsers,
      postActivity,
      postRecommendation,
      refreshFeed,
      isFollowing,
      sendNudge,
      registerPushToken,
      setNudgesEnabled,
      markNudgesRead,
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
