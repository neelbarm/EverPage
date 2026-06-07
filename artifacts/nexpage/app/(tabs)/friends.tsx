import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useStore, Friend } from '@/context/StoreContext';

function AvatarCircle({ initial, color, size = 44 }: { initial: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontFamily: 'Inter_700Bold' }}>{initial}</Text>
    </View>
  );
}

function FriendCard({ friend, showWeek }: { friend: Friend; showWeek: boolean }) {
  const colors = useColors();
  const minutes = showWeek ? friend.weeklyMinutes : friend.todayMinutes;
  const pages = showWeek ? friend.weekPages : friend.todayPages;

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      <AvatarCircle initial={friend.initial} color={friend.color} />
      <View style={styles.cardInfo}>
        <Text style={[styles.friendName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          {friend.name}
        </Text>
        <Text style={[styles.bookTitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
          {friend.currentBookTitle}
        </Text>
        <View style={styles.streakRow}>
          {friend.streakAtRisk ? (
            <Text style={[styles.atRiskText, { color: '#C96A00', fontFamily: 'Inter_500Medium' }]}>streak at risk</Text>
          ) : (
            <Text style={[styles.streakText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {friend.streakDays} day streak
            </Text>
          )}
          <Text style={[styles.pagesText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {' · '}{pages} pages
          </Text>
        </View>
      </View>
      <View style={styles.minutesCol}>
        <Text style={[styles.minutesNum, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{minutes}</Text>
        <Text style={[styles.minutesLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>min</Text>
      </View>
    </View>
  );
}

export default function FriendsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { friends } = useStore();
  const [showWeek, setShowWeek] = useState(false);
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Friends</Text>
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

      {friends.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>No friends yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Find readers with shared taste in the Discover tab
          </Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={f => f.id}
          renderItem={({ item }) => <FriendCard friend={item} showWeek={showWeek} />}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : 20 }}
          scrollEnabled={friends.length > 0}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 8, gap: 14 },
  title: { fontSize: 26, letterSpacing: -0.5 },
  toggle: { flexDirection: 'row', borderRadius: 10, padding: 3, alignSelf: 'flex-start' },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  toggleText: { fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, gap: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  cardInfo: { flex: 1, gap: 2 },
  friendName: { fontSize: 15, letterSpacing: -0.2 },
  bookTitle: { fontSize: 13 },
  streakRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  streakText: { fontSize: 12 },
  atRiskText: { fontSize: 12 },
  pagesText: { fontSize: 12 },
  minutesCol: { alignItems: 'flex-end', minWidth: 48 },
  minutesNum: { fontSize: 20, lineHeight: 24 },
  minutesLabel: { fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 18 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
