import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Platform, TextInput, ActivityIndicator, Modal, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useSocial, ActivityItem, SocialUser, NudgeHistoryItem, LeaderboardEntry } from '@/context/SocialContext';
import { useStore } from '@/context/StoreContext';
import RegisterModal from '@/components/RegisterModal';

function AvatarCircle({ initial, color, size = 44 }: { initial: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontFamily: 'Inter_700Bold' }}>{initial}</Text>
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

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function NudgeButton({ userId }: { userId: string; displayName?: string }) {
  const colors = useColors();
  const { sendNudge, hasNudged } = useSocial();
  const [sending, setSending] = useState(false);
  // Persisted in context (server-backed cooldown), so the "Nudged" state
  // survives navigating away and back within the 24h cooldown window.
  const nudged = hasNudged(userId);

  async function handleNudge() {
    if (nudged || sending) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await sendNudge(userId);
      if (!result.alreadyNudged) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert('Could not send nudge', 'Please try again later.');
    } finally {
      setSending(false);
    }
  }

  if (nudged && !sending) {
    return (
      <View style={[styles.nudgeBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Text style={[styles.nudgeBtnText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>👋 Nudged today</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.nudgeBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
      onPress={handleNudge}
      disabled={sending}
      activeOpacity={0.8}
    >
      {sending
        ? <ActivityIndicator size="small" color="#fff" />
        : <Text style={[styles.nudgeBtnText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>👋 Nudge</Text>
      }
    </TouchableOpacity>
  );
}

function ActivityCard({ item, readToday }: { item: ActivityItem; readToday: boolean }) {
  const colors = useColors();
  const router = useRouter();
  const isRecommendation = item.activityType === 'recommendation';

  function goToProfile() {
    router.push(`/profile/${item.userId}` as any);
  }

  function addRecommendedBook() {
    Haptics.selectionAsync();
    router.push({
      pathname: '/(tabs)/log',
      params: { addBook: 'true', prefillTitle: item.bookTitle, prefillAuthor: item.bookAuthor ?? '' },
    } as any);
  }

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={goToProfile} activeOpacity={0.75}>
        <AvatarCircle initial={item.initial} color={item.color} />
      </TouchableOpacity>
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <TouchableOpacity onPress={goToProfile} activeOpacity={0.75}>
            <Text style={[styles.friendName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              {item.displayName}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.timeAgo, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
        {isRecommendation ? (
          <TouchableOpacity onPress={addRecommendedBook} activeOpacity={0.7} style={styles.recTappable}>
            <View style={[styles.recommendBadge, { backgroundColor: colors.muted }]}>
              <Ionicons name="star" size={11} color={colors.accent} />
              <Text style={[styles.recommendLabel, { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>
                recommends
              </Text>
            </View>
            <Text style={[styles.bookTitle, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]} numberOfLines={2}>
              {item.bookTitle}
              {item.bookAuthor ? ` · ${item.bookAuthor}` : ''}
            </Text>
            <Text style={[styles.recAddHint, { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>
              + Add to your shelf
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.bookTitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
            {item.bookTitle}
            {item.bookAuthor ? ` · ${item.bookAuthor}` : ''}
          </Text>
        )}
        <View style={styles.cardBottom}>
          <View style={styles.statsRow}>
            {!isRecommendation && (item.streakDays ?? 0) > 0 && (
              <Text style={[styles.statText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {item.streakDays} day streak
              </Text>
            )}
            {!isRecommendation && item.durationMinutes > 0 && (
              <Text style={[styles.statText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {(item.streakDays ?? 0) > 0 ? ' · ' : ''}{item.durationMinutes} min
              </Text>
            )}
            {!isRecommendation && item.pagesRead > 0 && (
              <Text style={[styles.statText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {((item.streakDays ?? 0) > 0 || item.durationMinutes > 0) ? ' · ' : ''}{item.pagesRead} pages
              </Text>
            )}
          </View>
          {!readToday && !isRecommendation && (
            <NudgeButton userId={item.userId} displayName={item.displayName} />
          )}
        </View>
      </View>
    </View>
  );
}

function FriendRow({ user, readToday }: { user: SocialUser; readToday: boolean }) {
  const colors = useColors();
  const router = useRouter();

  function goToProfile() {
    router.push(`/profile/${user.id}` as any);
  }

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={goToProfile} activeOpacity={0.75}>
        <AvatarCircle initial={user.initial} color={user.color} />
      </TouchableOpacity>
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <TouchableOpacity onPress={goToProfile} activeOpacity={0.75}>
            <Text style={[styles.friendName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              {user.displayName}
            </Text>
          </TouchableOpacity>
          {readToday && (
            <View style={[styles.readBadge, { backgroundColor: colors.muted }]}>
              <Text style={[styles.readBadgeText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>✓ Read today</Text>
            </View>
          )}
        </View>
        <Text style={[styles.bookTitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          @{user.username}
        </Text>
        {!readToday && (
          <View style={{ marginTop: 6 }}>
            <NudgeButton userId={user.id} displayName={user.displayName} />
          </View>
        )}
      </View>
    </View>
  );
}

function SearchModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const { searchUsers, followUser, unfollowUser, isFollowing } = useSocial();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SocialUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [followingId, setFollowingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); }
  }, [visible]);

  const doSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 1) { setResults([]); return; }
    setSearching(true);
    const res = await searchUsers(q);
    setResults(res);
    setSearching(false);
  }, [searchUsers]);

  async function toggleFollow(user: SocialUser) {
    setFollowingId(user.id);
    try {
      if (isFollowing(user.id)) {
        await unfollowUser(user.id);
      } else {
        await followUser(user.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } finally {
      setFollowingId(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Find Readers</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
            placeholder="Search by username or name…"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={doSearch}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={colors.mutedForeground} />}
        </View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          {results.length === 0 && query.length > 0 && !searching && (
            <Text style={[styles.emptySearch, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              No readers found for "{query}"
            </Text>
          )}
          {results.map(user => (
            <View key={user.id} style={[styles.searchResult, { borderBottomColor: colors.border }]}>
              <AvatarCircle initial={user.initial} color={user.color} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.resultName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  {user.displayName}
                </Text>
                <Text style={[styles.resultUsername, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  @{user.username}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.followBtn,
                  isFollowing(user.id)
                    ? { backgroundColor: colors.muted, borderColor: colors.border }
                    : { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => toggleFollow(user)}
                disabled={followingId === user.id}
                activeOpacity={0.8}
              >
                {followingId === user.id
                  ? <ActivityIndicator size="small" color={isFollowing(user.id) ? colors.mutedForeground : '#fff'} />
                  : <Text style={[styles.followBtnText, { color: isFollowing(user.id) ? colors.mutedForeground : '#fff', fontFamily: 'Inter_600SemiBold' }]}>
                      {isFollowing(user.id) ? 'Following' : 'Follow'}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SuggestedUserRow({ user }: { user: SocialUser }) {
  const colors = useColors();
  const router = useRouter();
  const { followUser, unfollowUser, isFollowing } = useSocial();
  const [loading, setLoading] = useState(false);

  async function toggleFollow() {
    setLoading(true);
    try {
      if (isFollowing(user.id)) {
        await unfollowUser(user.id);
      } else {
        await followUser(user.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={() => router.push(`/profile/${user.id}` as any)} activeOpacity={0.75}>
        <AvatarCircle initial={user.initial} color={user.color} />
      </TouchableOpacity>
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <TouchableOpacity onPress={() => router.push(`/profile/${user.id}` as any)} activeOpacity={0.75}>
            <Text style={[styles.friendName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              {user.displayName}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.bookTitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          @{user.username}
        </Text>
      </View>
      <TouchableOpacity
        style={[
          styles.nudgeBtn,
          isFollowing(user.id)
            ? { backgroundColor: colors.muted, borderColor: colors.border }
            : { backgroundColor: colors.primary, borderColor: colors.primary },
        ]}
        onPress={toggleFollow}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading
          ? <ActivityIndicator size="small" color={isFollowing(user.id) ? colors.mutedForeground : '#fff'} />
          : <Text style={[styles.nudgeBtnText, { color: isFollowing(user.id) ? colors.mutedForeground : '#fff', fontFamily: 'Inter_600SemiBold' }]}>
              {isFollowing(user.id) ? 'Following' : 'Follow'}
            </Text>
        }
      </TouchableOpacity>
    </View>
  );
}

function NudgeHistoryCard({ item }: { item: NudgeHistoryItem }) {
  const colors = useColors();
  const router = useRouter();

  function goToProfile() {
    router.push(`/profile/${item.senderId}` as any);
  }

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={goToProfile} activeOpacity={0.75}>
        <AvatarCircle initial={item.senderInitial} color={item.senderColor} />
      </TouchableOpacity>
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <TouchableOpacity onPress={goToProfile} activeOpacity={0.75}>
            <Text style={[styles.friendName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              {item.senderDisplayName}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.timeAgo, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
        <Text style={[styles.bookTitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          👋 nudged you to keep reading
        </Text>
      </View>
    </View>
  );
}

function CompareBar({ label, value, unit, max, color, trackColor, mutedColor, leader }: {
  label: string; value: number; unit: string; max: number; color: string; trackColor: string; mutedColor: string; leader?: boolean;
}) {
  const pct = max > 0 ? value / max : 0;
  return (
    <View style={styles.cmpBarRow}>
      <Text style={[styles.cmpBarLabel, { color: leader ? color : mutedColor, fontFamily: leader ? 'Inter_600SemiBold' : 'Inter_500Medium' }]} numberOfLines={1}>{label}</Text>
      <View style={[styles.cmpTrack, { backgroundColor: trackColor }]}>
        <View style={[styles.cmpFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: color, opacity: leader ? 1 : 0.72 }]} />
      </View>
      <Text style={[styles.cmpVal, { color, opacity: leader ? 1 : 0.75, fontFamily: 'Inter_700Bold' }]}>{value}{unit}</Text>
    </View>
  );
}

function CompareCard({ row, myMinutes, myPages }: {
  row: { user: SocialUser; minutes: number; pages: number };
  myMinutes: number; myPages: number;
}) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const router = useRouter();
  const isDark = resolvedScheme === 'dark';
  const { user, minutes, pages } = row;
  const minMax = Math.max(minutes, myMinutes, 1);
  const pageMax = Math.max(pages, myPages, 1);
  const tie = myMinutes === minutes;
  const ahead = myMinutes > minutes;
  const status = tie ? 'Tied' : ahead ? "You're ahead" : 'Behind';
  const firstName = user.displayName.split(' ')[0];

  // Fixed, high-contrast two-tone palette (legible on both cream + dark cards).
  const friendColor = isDark ? '#E0BC66' : '#9A7B2E'; // gold
  const youColor = isDark ? '#8FC7D6' : '#1C5A60';    // teal
  const track = isDark ? 'rgba(242,233,219,0.12)' : 'rgba(28,58,73,0.09)';
  const aheadColor = isDark ? '#86CCA0' : '#3A6645';
  const behindColor = isDark ? '#E3936F' : '#A8512C';
  const statusColor = tie ? colors.mutedForeground : ahead ? aheadColor : behindColor;
  const cardBg = isDark ? '#46140F' : '#FBF7EF';
  const cardBorder = isDark ? 'rgba(224,188,102,0.18)' : 'rgba(28,90,96,0.12)';

  return (
    <View style={[styles.cmpCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <View style={styles.cmpHeader}>
        <TouchableOpacity onPress={() => router.push(`/profile/${user.id}` as any)} activeOpacity={0.75}>
          <AvatarCircle initial={user.initial} color={user.color} size={38} />
        </TouchableOpacity>
        <Text style={[styles.cmpName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
          {user.displayName}
        </Text>
        <View style={[styles.cmpBadge, { backgroundColor: statusColor + '24', borderColor: statusColor + '55' }]}>
          <Text style={[styles.cmpBadgeText, { color: statusColor, fontFamily: 'Inter_700Bold' }]}>{status}</Text>
        </View>
      </View>

      <Text style={[styles.cmpSection, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>MINUTES</Text>
      <CompareBar label={firstName} value={minutes} unit="m" max={minMax} color={friendColor} trackColor={track} mutedColor={colors.mutedForeground} leader={minutes >= myMinutes && minutes > 0} />
      <CompareBar label="You" value={myMinutes} unit="m" max={minMax} color={youColor} trackColor={track} mutedColor={colors.mutedForeground} leader={myMinutes > minutes} />

      <Text style={[styles.cmpSection, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', marginTop: 12 }]}>PAGES</Text>
      <CompareBar label={firstName} value={pages} unit="p" max={pageMax} color={friendColor} trackColor={track} mutedColor={colors.mutedForeground} leader={pages >= myPages && pages > 0} />
      <CompareBar label="You" value={myPages} unit="p" max={pageMax} color={youColor} trackColor={track} mutedColor={colors.mutedForeground} leader={myPages > pages} />
    </View>
  );
}

export default function FriendsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isRegistered, feed, following, followers, suggestedUsers, nudgeHistory, unreadNudgeCount, markNudgesRead, isLoading, refreshFeed, followUser, unfollowUser, isFollowing, leaderboard } = useSocial();
  const { sessions } = useStore();
  const { openFollowers } = useLocalSearchParams<{ openFollowers?: string }>();
  const [mode, setMode] = useState<'today' | 'week' | 'compare'>('today');
  const showWeek = mode === 'week';
  const [showSearch, setShowSearch] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showNudges, setShowNudges] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [followingId, setFollowingId] = useState<string | null>(null);

  useEffect(() => {
    if (openFollowers === '1') {
      setShowFollowers(true);
      setShowNudges(false);
    }
  }, [openFollowers]);
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * oneDayMs;

  const filteredFeed = feed.filter(item => {
    const age = now - new Date(item.createdAt).getTime();
    return showWeek ? age <= sevenDaysMs : age <= oneDayMs;
  });

  const usersReadToday = new Set(
    feed
      .filter(item => isToday(item.createdAt))
      .map(item => item.userId)
  );

  const friendsAtRisk = following.filter(u => !usersReadToday.has(u.id));

  // Compare tab — my week totals vs each friend's (head-to-head)
  const weekCutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]; })();
  const myWeekSessions = sessions.filter(s => s.date >= weekCutoff);
  const myWeekMinutes = myWeekSessions.reduce((a, s) => a + s.durationMinutes, 0);
  const myWeekPages = myWeekSessions.reduce((a, s) => a + Math.max(0, s.endPage - s.startPage), 0);
  const lbById = new Map(leaderboard.map(e => [e.userId, e] as const));
  const compareRows = following
    .map(u => {
      const e = lbById.get(u.id);
      return { user: u, minutes: e?.weekMinutes ?? 0, pages: e?.weekPages ?? 0 };
    })
    .sort((a, b) => (b.minutes - a.minutes) || (b.pages - a.pages));

  if (!isRegistered) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12 }]}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Friends</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Join the community</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Create your reader profile to follow friends and see their reading activity.
          </Text>
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowRegister(true)}
            activeOpacity={0.85}
          >
            <Text style={[styles.ctaBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>
              Create Profile
            </Text>
          </TouchableOpacity>
        </View>
        <RegisterModal visible={showRegister} onClose={() => setShowRegister(false)} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Friends</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.searchIconBtn, { backgroundColor: colors.muted }]}
              onPress={() => {
                setShowFollowers(v => !v);
                setShowNudges(false);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="people-outline" size={20} color={colors.foreground} />
              {followers.length > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.badgeText, { fontFamily: 'Inter_700Bold' }]}>
                    {followers.length > 9 ? '9+' : followers.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.searchIconBtn, { backgroundColor: colors.muted }]}
              onPress={() => {
                setShowNudges(v => {
                  if (!v) markNudgesRead();
                  return !v;
                });
                setShowFollowers(false);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.foreground} />
              {unreadNudgeCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.badgeText, { fontFamily: 'Inter_700Bold' }]}>
                    {unreadNudgeCount > 9 ? '9+' : unreadNudgeCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.searchIconBtn, { backgroundColor: colors.muted }]}
              onPress={() => setShowSearch(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add-outline" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.toggle, { backgroundColor: colors.muted }]}>
          {([{ label: 'Today', m: 'today' }, { label: 'This week', m: 'week' }, { label: 'Compare', m: 'compare' }] as const).map(opt => (
            <TouchableOpacity
              key={opt.label}
              style={[
                styles.toggleBtn,
                (mode === opt.m) && {
                  backgroundColor: colors.card,
                  shadowColor: '#000', shadowOpacity: 0.08,
                  shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2,
                },
              ]}
              onPress={() => setMode(opt.m)}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.toggleText,
                { color: mode === opt.m ? colors.foreground : colors.mutedForeground,
                  fontFamily: mode === opt.m ? 'Inter_600SemiBold' : 'Inter_400Regular' },
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {showFollowers && (
        <View style={[styles.nudgePanelContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.nudgePanelHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.nudgePanelTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              Friends · {followers.length}
            </Text>
            <TouchableOpacity onPress={() => setShowFollowers(false)} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {followers.length === 0 ? (
            <View style={styles.nudgePanelEmpty}>
              <Text style={[styles.nudgePanelEmptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                No friends yet — share your profile to get started.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {followers.map(user => {
                const alreadyFollowing = isFollowing(user.id);
                return (
                  <View key={user.id} style={[styles.followerRow, { borderBottomColor: colors.border }]}>
                    <AvatarCircle initial={user.initial} color={user.color} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.followerName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                        {user.displayName}
                      </Text>
                      <Text style={[styles.followerUsername, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        @{user.username}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.followBackBtn,
                        alreadyFollowing
                          ? { backgroundColor: colors.muted, borderColor: colors.border }
                          : { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      disabled={followingId === user.id}
                      onPress={async () => {
                        setFollowingId(user.id);
                        try {
                          if (alreadyFollowing) {
                            await unfollowUser(user.id);
                          } else {
                            await followUser(user.id);
                          }
                        } finally {
                          setFollowingId(null);
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      {followingId === user.id
                        ? <ActivityIndicator size="small" color={alreadyFollowing ? colors.mutedForeground : '#fff'} />
                        : <Text style={[styles.followBackBtnText, { color: alreadyFollowing ? colors.mutedForeground : '#fff', fontFamily: 'Inter_600SemiBold' }]}>
                            {alreadyFollowing ? 'Following' : 'Follow back'}
                          </Text>
                      }
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {showNudges && (
        <View style={[styles.nudgePanelContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.nudgePanelHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.nudgePanelTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              Nudges received
            </Text>
            <TouchableOpacity onPress={() => setShowNudges(false)} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {nudgeHistory.length === 0 ? (
            <View style={styles.nudgePanelEmpty}>
              <Text style={[styles.nudgePanelEmptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                No nudges yet — friends can tap 👋 on your activity to cheer you on.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
              {nudgeHistory.map(item => (
                <NudgeHistoryCard key={item.id} item={item} />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {mode === 'compare' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {following.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="podium-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Nobody to compare with</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Follow some readers to see who's reading more this week.
              </Text>
              <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: colors.primary }]} onPress={() => setShowSearch(true)} activeOpacity={0.85}>
                <Text style={[styles.ctaBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>Find Readers</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.cmpSummary}>
                <Text style={[styles.cmpSummaryLabel, { color: 'rgba(242,233,219,0.65)', fontFamily: 'Inter_600SemiBold' }]}>YOUR WEEK</Text>
                <Text style={[styles.cmpSummaryValue, { color: '#F4ECDD', fontFamily: 'Inter_700Bold' }]}>
                  {myWeekMinutes} min · {myWeekPages} pages
                </Text>
                <Text style={[styles.cmpSummarySub, { color: 'rgba(242,233,219,0.6)', fontFamily: 'Inter_400Regular' }]}>
                  How you stack up against friends this week
                </Text>
              </View>
              {compareRows.map(row => (
                <CompareCard key={row.user.id} row={row} myMinutes={myWeekMinutes} myPages={myWeekPages} />
              ))}
            </>
          )}
        </ScrollView>
      ) : isLoading && feed.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : following.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
              SUGGESTED READERS
            </Text>
            <TouchableOpacity onPress={() => setShowSearch(true)} activeOpacity={0.7}>
              <Text style={[{ color: colors.accent, fontSize: 13, fontFamily: 'Inter_600SemiBold' }]}>Search</Text>
            </TouchableOpacity>
          </View>
          {suggestedUsers.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>No friends yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Find readers with shared taste — tap the add button above.
              </Text>
              <TouchableOpacity
                style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
                onPress={() => setShowSearch(true)}
                activeOpacity={0.85}
              >
                <Text style={[styles.ctaBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>
                  Find Readers
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            suggestedUsers.map(user => (
              <SuggestedUserRow key={user.id} user={user} />
            ))
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredFeed}
          keyExtractor={f => f.id}
          renderItem={({ item }) => (
            <ActivityCard item={item} readToday={usersReadToday.has(item.userId)} />
          )}
          onRefresh={refreshFeed}
          refreshing={isLoading}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            !showWeek && friendsAtRisk.length > 0 ? (
              <View>
                <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                    STREAK AT RISK
                  </Text>
                </View>
                {friendsAtRisk.map(user => (
                  <FriendRow key={user.id} user={user} readToday={false} />
                ))}
                {filteredFeed.length > 0 && (
                  <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                      ACTIVITY TODAY
                    </Text>
                  </View>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {showWeek ? 'No activity this week' : 'No activity today'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Your friends haven't logged any reading {showWeek ? 'this week' : 'today'} yet.
              </Text>
            </View>
          }
        />
      )}

      <SearchModal visible={showSearch} onClose={() => setShowSearch(false)} />
      <RegisterModal visible={showRegister} onClose={() => setShowRegister(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 8, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 26, letterSpacing: -0.5 },
  searchIconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9 },
  nudgePanelContainer: { borderBottomWidth: 1, borderTopWidth: StyleSheet.hairlineWidth },
  nudgePanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  nudgePanelTitle: { fontSize: 15, letterSpacing: -0.2 },
  nudgePanelEmpty: { paddingHorizontal: 20, paddingVertical: 20 },
  nudgePanelEmptyText: { fontSize: 14, lineHeight: 20 },
  toggle: { flexDirection: 'row', borderRadius: 10, padding: 3, alignSelf: 'flex-start' },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  toggleText: { fontSize: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionLabel: { fontSize: 11, letterSpacing: 1.5 },
  card: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 15, gap: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  cardInfo: { flex: 1, gap: 3 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  friendName: { fontSize: 15, letterSpacing: -0.2 },
  timeAgo: { fontSize: 12 },
  bookTitle: { fontSize: 13 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statText: { fontSize: 12 },
  readBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  readBadgeText: { fontSize: 11 },
  nudgeBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1.5, minWidth: 80, alignItems: 'center' },
  nudgeBtnText: { fontSize: 12 },
  recommendBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  recommendLabel: { fontSize: 11 },
  recTappable: { gap: 4, paddingVertical: 2 },
  recAddHint: { fontSize: 12, marginTop: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12, paddingVertical: 60 },
  emptyTitle: { fontSize: 18 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  ctaBtn: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  ctaBtnText: { fontSize: 15 },
  modalRoot: { flex: 1, paddingTop: Platform.OS === 'ios' ? 0 : 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 20, letterSpacing: -0.3 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },
  emptySearch: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  searchResult: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  resultName: { fontSize: 15, letterSpacing: -0.2 },
  resultUsername: { fontSize: 13 },
  followBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, minWidth: 88, alignItems: 'center' },
  followBtnText: { fontSize: 13 },
  followerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  followerName: { fontSize: 14, letterSpacing: -0.2 },
  followerUsername: { fontSize: 12, marginTop: 1 },
  followBackBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, borderWidth: 1.5, minWidth: 98, alignItems: 'center' },
  followBackBtnText: { fontSize: 13 },
  cmpSummary: {
    marginHorizontal: 16, marginTop: 14, marginBottom: 2,
    paddingHorizontal: 18, paddingVertical: 16, gap: 3,
    borderRadius: 18, backgroundColor: '#14424A',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 5,
  },
  cmpSummaryLabel: { fontSize: 11, letterSpacing: 1.8 },
  cmpSummaryValue: { fontSize: 24, letterSpacing: -0.6 },
  cmpSummarySub: { fontSize: 13 },
  cmpCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16, gap: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 10, elevation: 3,
  },
  cmpHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 12 },
  cmpName: { flex: 1, fontSize: 16, letterSpacing: -0.3 },
  cmpBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 11, borderWidth: 1 },
  cmpBadgeText: { fontSize: 11, letterSpacing: 0.2 },
  cmpSection: { fontSize: 10, letterSpacing: 1.6, marginBottom: 6 },
  cmpBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  cmpBarLabel: { width: 52, fontSize: 12.5 },
  cmpTrack: { flex: 1, height: 12, borderRadius: 6, overflow: 'hidden' },
  cmpFill: { height: 12, borderRadius: 6, minWidth: 6 },
  cmpVal: { width: 44, fontSize: 12.5, textAlign: 'right' },
});
