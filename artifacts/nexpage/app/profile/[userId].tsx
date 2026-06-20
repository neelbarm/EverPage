import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useSocial } from '@/context/SocialContext';
import { getItem as getStoredItem } from '@/lib/storage';

const AUTH_TOKEN_KEY = 'auth_session_token';

function getApiBase(): string {
  const override = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
  if (override) return `${override.replace(/\/$/, '')}/api`;
  const domain = (process.env.EXPO_PUBLIC_DOMAIN ?? '').trim();
  if (domain) return `https://${domain}/api`;
  return '/api';
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token: string | null = null;
  try { token = await getStoredItem(AUTH_TOKEN_KEY); } catch {}
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };
  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers, credentials: 'include' });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

interface ProfileData {
  id: string;
  username: string;
  displayName: string;
  color: string;
  initial: string;
  streakDays: number;
  weekPages: number;
  currentBooks: { title: string; author: string }[];
  recentActivity: {
    id: string;
    bookTitle: string;
    bookAuthor: string;
    durationMinutes: number;
    pagesRead: number;
    createdAt: string;
  }[];
}

function AvatarCircle({ initial, color, size = 72 }: { initial: string; color: string; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontFamily: 'Inter_700Bold' }}>{initial}</Text>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  const colors = useColors();
  return (
    <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{label}</Text>
    </View>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PublicProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { followUser, unfollowUser, isFollowing, socialProfile } = useSocial();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followLoading, setFollowLoading] = useState(false);

  const isSelf = socialProfile?.id === userId;
  const following = isFollowing(userId ?? '');

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ProfileData>(`/social/users/${userId}/profile`);
      setProfile(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function toggleFollow() {
    if (!userId || isSelf || followLoading) return;
    setFollowLoading(true);
    try {
      if (following) {
        await unfollowUser(userId);
      } else {
        await followUser(userId);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setFollowLoading(false);
    }
  }

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 4, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          {profile ? profile.displayName : 'Profile'}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {error}
          </Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={loadProfile}>
            <Text style={[styles.retryBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      ) : profile ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 20 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.profileSection, { borderBottomColor: colors.border }]}>
            <AvatarCircle initial={profile.initial} color={profile.color} size={80} />
            <View style={styles.nameBlock}>
              <Text style={[styles.displayName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {profile.displayName}
              </Text>
              <Text style={[styles.username, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                @{profile.username}
              </Text>
            </View>
            {!isSelf && (
              <TouchableOpacity
                style={[
                  styles.followBtn,
                  following
                    ? { backgroundColor: colors.muted, borderColor: colors.border }
                    : { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={toggleFollow}
                disabled={followLoading}
                activeOpacity={0.8}
              >
                {followLoading
                  ? <ActivityIndicator size="small" color={following ? colors.mutedForeground : '#fff'} />
                  : <Text style={[
                      styles.followBtnText,
                      { color: following ? colors.mutedForeground : '#fff', fontFamily: 'Inter_600SemiBold' },
                    ]}>
                      {following ? 'Following' : 'Follow'}
                    </Text>
                }
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.statsRow}>
            <StatBox
              label={profile.streakDays === 1 ? 'day streak' : 'day streak'}
              value={`🔥 ${profile.streakDays}`}
            />
            <StatBox label="pages this week" value={profile.weekPages} />
          </View>

          {profile.currentBooks.length > 0 && (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                RECENTLY READ
              </Text>
              {profile.currentBooks.map((book, i) => (
                <View key={i} style={[styles.bookRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.bookDot, { backgroundColor: profile.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bookTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                      {book.title}
                    </Text>
                    {book.author ? (
                      <Text style={[styles.bookAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
                        {book.author}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}

          {profile.recentActivity.length > 0 && (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                RECENT ACTIVITY
              </Text>
              {profile.recentActivity.map(item => (
                <View key={item.id} style={[styles.activityRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.activityBook, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>
                      {item.bookTitle}
                      {item.bookAuthor ? ` · ${item.bookAuthor}` : ''}
                    </Text>
                    <View style={styles.activityMeta}>
                      {item.durationMinutes > 0 && (
                        <Text style={[styles.activityStat, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                          {item.durationMinutes} min
                        </Text>
                      )}
                      {item.pagesRead > 0 && (
                        <Text style={[styles.activityStat, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                          {item.durationMinutes > 0 ? ' · ' : ''}{item.pagesRead} pages
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.activityTime, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {timeAgo(item.createdAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {profile.currentBooks.length === 0 && profile.recentActivity.length === 0 && (
            <View style={styles.emptyActivity}>
              <Ionicons name="book-outline" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                No reading activity yet
              </Text>
            </View>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, letterSpacing: -0.2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 },
  errorText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryBtnText: { fontSize: 14 },
  profileSection: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, paddingVertical: 24, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nameBlock: { flex: 1, gap: 2 },
  displayName: { fontSize: 20, letterSpacing: -0.3 },
  username: { fontSize: 14 },
  followBtn: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, minWidth: 92, alignItems: 'center',
  },
  followBtnText: { fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  statBox: {
    flex: 1, alignItems: 'center', paddingVertical: 16,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 4,
  },
  statValue: { fontSize: 22, letterSpacing: -0.5 },
  statLabel: { fontSize: 12 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  sectionTitle: {
    fontSize: 11, letterSpacing: 1.5,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  bookRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookDot: { width: 8, height: 8, borderRadius: 4 },
  bookTitle: { fontSize: 15, letterSpacing: -0.2 },
  bookAuthor: { fontSize: 13, marginTop: 1 },
  activityRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activityBook: { fontSize: 14, letterSpacing: -0.1 },
  activityMeta: { flexDirection: 'row', marginTop: 2 },
  activityStat: { fontSize: 12 },
  activityTime: { fontSize: 12, marginTop: 2 },
  emptyActivity: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyText: { fontSize: 14 },
});
