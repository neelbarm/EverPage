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
import { useSocial, ActivityItem, SocialUser, NudgeHistoryItem } from '@/context/SocialContext';
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

function NudgeButton({ userId, displayName }: { userId: string; displayName: string }) {
  const colors = useColors();
  const { sendNudge } = useSocial();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleNudge() {
    if (sent || sending) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await sendNudge(userId);
      setSent(true);
      if (!result.alreadyNudged) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert('Could not send nudge', 'Please try again later.');
    } finally {
      setSending(false);
    }
  }

  return (
    <TouchableOpacity
      style={[
        styles.nudgeBtn,
        sent
          ? { backgroundColor: colors.muted, borderColor: colors.border }
          : { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
      onPress={handleNudge}
      disabled={sending || sent}
      activeOpacity={0.8}
    >
      {sending
        ? <ActivityIndicator size="small" color="#fff" />
        : sent
          ? <Text style={[styles.nudgeBtnText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Nudged ✓</Text>
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
          <View style={[styles.recommendBadge, { backgroundColor: colors.muted }]}>
            <Ionicons name="star" size={11} color={colors.accent} />
            <Text style={[styles.recommendLabel, { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>
              recommends
            </Text>
          </View>
        ) : null}
        <Text style={[styles.bookTitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
          {item.bookTitle}
          {item.bookAuthor ? ` · ${item.bookAuthor}` : ''}
        </Text>
        <View style={styles.cardBottom}>
          <View style={styles.statsRow}>
            {!isRecommendation && item.streakDays > 0 && (
              <Text style={[styles.statText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {item.streakDays} day streak
              </Text>
            )}
            {!isRecommendation && item.durationMinutes > 0 && (
              <Text style={[styles.statText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {item.streakDays > 0 ? ' · ' : ''}{item.durationMinutes} min
              </Text>
            )}
            {!isRecommendation && item.pagesRead > 0 && (
              <Text style={[styles.statText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {(item.streakDays > 0 || item.durationMinutes > 0) ? ' · ' : ''}{item.pagesRead} pages
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

export default function FriendsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isRegistered, feed, following, followers, nudgeHistory, unreadNudgeCount, markNudgesRead, isLoading, refreshFeed, followUser, unfollowUser, isFollowing } = useSocial();
  const { openFollowers } = useLocalSearchParams<{ openFollowers?: string }>();
  const [showWeek, setShowWeek] = useState(false);
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
          {[{ label: 'Today', week: false }, { label: 'This week', week: true }].map(opt => (
            <TouchableOpacity
              key={opt.label}
              style={[
                styles.toggleBtn,
                (showWeek === opt.week) && {
                  backgroundColor: colors.card,
                  shadowColor: '#000', shadowOpacity: 0.08,
                  shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2,
                },
              ]}
              onPress={() => setShowWeek(opt.week)}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.toggleText,
                { color: showWeek === opt.week ? colors.foreground : colors.mutedForeground,
                  fontFamily: showWeek === opt.week ? 'Inter_600SemiBold' : 'Inter_400Regular' },
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
              Followers · {followers.length}
            </Text>
            <TouchableOpacity onPress={() => setShowFollowers(false)} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {followers.length === 0 ? (
            <View style={styles.nudgePanelEmpty}>
              <Text style={[styles.nudgePanelEmptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Nobody is following you yet — share your profile to get started.
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

      {isLoading && feed.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : following.length === 0 ? (
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
  sectionHeader: { paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
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
});
