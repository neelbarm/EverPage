import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { Platform } from 'react-native';
import { getItem as getStoredItem, setItem as setStoredItem } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { localDateKey } from '@/lib/reliabilityPolicies';

const AUTH_TOKEN_KEY = 'auth_session_token';
const NUDGE_READ_TIME_KEY = 'nudge_last_read_time';
const GUEST_ACCOUNT_ID = 'guest';

function nudgeReadKey(accountId: string): string {
  return `${NUDGE_READ_TIME_KEY}:${encodeURIComponent(accountId)}`;
}

export interface SocialUser {
  id: string;
  username: string;
  displayName: string;
  color: string;
  initial: string;
  avatarUrl: string | null;
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
  streakDays?: number;
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
  sendNudge: (userId: string) => Promise<{ alreadyNudged: boolean; delivery: 'queued' | 'in_app' | 'failed' }>;
  hasNudged: (userId: string) => boolean;
  blockedUsers: SocialUser[];
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  isBlocked: (userId: string) => boolean;
  reportUser: (userId: string, reason?: string) => Promise<void>;
  registerPushToken: (token: string) => Promise<void>;
  setNudgesEnabled: (enabled: boolean) => Promise<void>;
  markNudgesRead: () => void;
  uploadAvatar: (localUri: string, mimeType: string) => Promise<void>;
}

const SocialContext = createContext<SocialContextType | null>(null);

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

async function getStoredAuthToken(): Promise<string | null> {
  try {
    return await getStoredItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function apiFetchWithToken<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
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
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [socialProfile, setSocialProfile] = useState<(SocialUser & { nudgesEnabled: boolean }) | null>(null);
  const [following, setFollowing] = useState<SocialUser[]>([]);
  const [followers, setFollowers] = useState<SocialUser[]>([]);
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SocialUser[]>([]);
  const [nudgeHistory, setNudgeHistory] = useState<NudgeHistoryItem[]>([]);
  const [nudgedUserIds, setNudgedUserIds] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<SocialUser[]>([]);
  const [lastReadNudgeTime, setLastReadNudgeTime] = useState<number>(() => Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const initialized = useRef(false);
  const identityVersion = useRef(0);
  const accountId = user?.id ?? GUEST_ACCOUNT_ID;
  const mounted = useRef(true);
  const verifiedToken = useRef<string | null>(null);

  async function getAuthToken(): Promise<string> {
    if (!mounted.current || accountId === GUEST_ACCOUNT_ID) throw new Error('Not authenticated');
    if (verifiedToken.current) return verifiedToken.current;
    const token = await getStoredAuthToken();
    if (!token || !mounted.current) throw new Error('Not authenticated');
    const identity = await apiFetchWithToken<{ user?: { id?: string } }>('/local-auth/me', token);
    if (!mounted.current || identity.user?.id !== accountId) throw new Error('Account changed. Please retry.');
    verifiedToken.current = token;
    return token;
  }

  async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await getAuthToken();
    if (!mounted.current) throw new Error('Account changed. Please retry.');
    return apiFetchWithToken<T>(path, token, options);
  }

  useEffect(() => {
    mounted.current = true;
    const version = identityVersion.current + 1;
    identityVersion.current = version;
    initialized.current = false;
    setSocialProfile(null);
    setFollowing([]);
    setFollowers([]);
    setFeed([]);
    setLeaderboard([]);
    setSuggestedUsers([]);
    setNudgeHistory([]);
    setBlockedUsers([]);
    setNudgedUserIds([]);
    setLastReadNudgeTime(Date.now());
    getStoredItem(nudgeReadKey(accountId)).then(val => {
      if (version !== identityVersion.current) return;
      if (val) setLastReadNudgeTime(Number(val));
    }).catch(() => {});
    return () => {
      mounted.current = false;
      verifiedToken.current = null;
      identityVersion.current += 1;
    };
  }, [accountId]);

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
      setBlockedUsers([]);
      setNudgedUserIds([]);
      initialized.current = false;
      return;
    }
    if (!initialized.current) {
      initialized.current = true;
      loadProfile();
    }
  }, [isAuthenticated, authLoading, accountId]);

  async function loadProfile() {
    const version = identityVersion.current;
    try {
      const profile = await apiFetch<(SocialUser & { nudgesEnabled: boolean }) | null>('/social/me');
      if (version !== identityVersion.current) return;
      setSocialProfile(profile);
      if (profile) {
        void loadSocialData(version);
      }
    } catch { /* offline */ }
  }

  async function loadSocialData(expectedVersion = identityVersion.current) {
    setIsLoading(true);
    try {
      const [followingData, followersData, feedData, boardData, suggestData, nudgesData, blockedData, sentNudgesData] = await Promise.allSettled([
        apiFetch<SocialUser[]>('/social/following'),
        apiFetch<SocialUser[]>('/social/followers'),
        apiFetch<ActivityItem[]>('/social/feed'),
        apiFetch<LeaderboardEntry[]>(`/social/leaderboard?today=${localDateKey(new Date())}`),
        apiFetch<SocialUser[]>('/social/suggested'),
        apiFetch<NudgeHistoryItem[]>('/social/nudges'),
        apiFetch<SocialUser[]>('/social/blocked'),
        apiFetch<string[]>('/social/nudges/sent'),
      ]);
      if (expectedVersion !== identityVersion.current) return;
      if (followingData.status === 'fulfilled') setFollowing(followingData.value);
      if (followersData.status === 'fulfilled') setFollowers(followersData.value);
      if (feedData.status === 'fulfilled') setFeed(feedData.value);
      if (boardData.status === 'fulfilled') setLeaderboard(boardData.value);
      if (suggestData.status === 'fulfilled') setSuggestedUsers(suggestData.value);
      if (nudgesData.status === 'fulfilled') setNudgeHistory(nudgesData.value);
      if (blockedData.status === 'fulfilled') setBlockedUsers(blockedData.value);
      if (sentNudgesData.status === 'fulfilled' && Array.isArray(sentNudgesData.value)) setNudgedUserIds(sentNudgesData.value);
    } catch { /* ignore */ } finally {
      if (expectedVersion === identityVersion.current) setIsLoading(false);
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

  const sendNudge = useCallback(async (userId: string): Promise<{ alreadyNudged: boolean; delivery: 'queued' | 'in_app' | 'failed' }> => {
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
      setNudgedUserIds(prev => (prev.includes(userId) ? prev : [...prev, userId]));
      return { alreadyNudged: true, delivery: 'in_app' };
    }
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`API error ${res.status}: ${err}`);
    }
    const data = await res.json() as { delivery?: 'queued' | 'in_app'; pushStatus?: 'queued' | 'failed' };
    if (data.pushStatus !== 'failed') {
      setNudgedUserIds(prev => (prev.includes(userId) ? prev : [...prev, userId]));
    }
    return {
      alreadyNudged: false,
      delivery: data.pushStatus === 'failed' ? 'failed' : data.delivery === 'queued' ? 'queued' : 'in_app',
    };
  }, []);

  const hasNudged = useCallback((userId: string) => {
    return nudgedUserIds.includes(userId);
  }, [nudgedUserIds]);

  const blockUser = useCallback(async (userId: string) => {
    await apiFetch(`/social/users/${userId}/block`, { method: 'POST' });
    // Blocking severs the relationship and hides them everywhere.
    setFollowing(prev => prev.filter(u => u.id !== userId));
    setFollowers(prev => prev.filter(u => u.id !== userId));
    setFeed(prev => prev.filter(a => a.userId !== userId));
    setLeaderboard(prev => prev.filter(e => e.userId !== userId));
    setSuggestedUsers(prev => prev.filter(u => u.id !== userId));
    await loadSocialData();
  }, []);

  const unblockUser = useCallback(async (userId: string) => {
    await apiFetch(`/social/users/${userId}/block`, { method: 'DELETE' });
    setBlockedUsers(prev => prev.filter(u => u.id !== userId));
    await loadSocialData();
  }, []);

  const isBlocked = useCallback((userId: string) => {
    return blockedUsers.some(u => u.id === userId);
  }, [blockedUsers]);

  const reportUser = useCallback(async (userId: string, reason?: string) => {
    await apiFetch('/report', {
      method: 'POST',
      body: JSON.stringify({ contentType: 'user', contentId: userId, reportedUserId: userId, reason: reason ?? 'user_report' }),
    });
  }, []);

  const registerPushToken = useCallback(async (token: string) => {
    await apiFetch('/social/push-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }, []);

  const setNudgesEnabled = useCallback(async (enabled: boolean) => {
    await apiFetch('/social/me/settings', {
      method: 'PATCH',
      body: JSON.stringify({ nudgesEnabled: enabled }),
    });
    setSocialProfile(prev => prev ? { ...prev, nudgesEnabled: enabled } : prev);
  }, []);

  const markNudgesRead = useCallback(() => {
    const now = Date.now();
    setLastReadNudgeTime(now);
    setStoredItem(nudgeReadKey(accountId), String(now)).catch(() => {});
  }, []);

  const uploadAvatar = useCallback(async (localUri: string, mimeType: string) => {
    // Fetch the local asset before requesting a URL. ImagePicker's MIME value
    // is useful, but the blob size is the authoritative byte count that the
    // server will verify after the direct-to-object-storage PUT.
    const imgRes = await fetch(localUri);
    const blob = await imgRes.blob();
    if (!blob.size || !Number.isSafeInteger(blob.size)) {
      throw new Error('Could not determine the image size');
    }
    const requestedMime = mimeType.trim().toLowerCase().split(';')[0];
    const blobMime = (blob.type ?? '').trim().toLowerCase().split(';')[0];
    // Some native fetch implementations report application/octet-stream (or
    // no type) for a file URI. In that case ImagePicker's image MIME is the
    // best available type; never send a different type to the PUT and API.
    const contentType = blobMime && blobMime !== 'application/octet-stream'
      ? blobMime
      : requestedMime;
    if (!contentType.startsWith('image/')) {
      throw new Error('Unsupported avatar image type');
    }

    const upload = await apiFetch<{
      uploadId: string;
      uploadURL: string;
      objectPath: string;
    }>('/storage/uploads/request-url', {
      method: 'POST',
      body: JSON.stringify({
        name: 'avatar',
        size: blob.size,
        contentType,
      }),
    });

    const putRes = await fetch(upload.uploadURL, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    if (!putRes.ok) throw new Error('Failed to upload image');

    const finalized = await apiFetch<{ uploadId: string; objectPath: string; status: 'finalized' }>(
      '/storage/finalize',
      {
        method: 'POST',
        body: JSON.stringify({ uploadId: upload.uploadId }),
      },
    );
    if (finalized.uploadId !== upload.uploadId || finalized.status !== 'finalized') {
      throw new Error('Upload was not finalized');
    }

    const servingUrl = `${getApiBase()}/storage${finalized.objectPath}`;
    const updated = await apiFetch<SocialUser & { nudgesEnabled: boolean }>('/social/me/avatar', {
      method: 'PATCH',
      body: JSON.stringify({ avatarUrl: servingUrl }),
    });
    setSocialProfile(updated);
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
      hasNudged,
      blockedUsers,
      blockUser,
      unblockUser,
      isBlocked,
      reportUser,
      registerPushToken,
      setNudgesEnabled,
      markNudgesRead,
      uploadAvatar,
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
