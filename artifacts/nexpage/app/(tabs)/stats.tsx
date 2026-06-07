import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';

function StreakDot({ checked, day }: { checked: boolean; day: string }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={{
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: checked ? colors.primary : colors.muted,
        alignItems: 'center', justifyContent: 'center',
      }}>
        {checked && <Ionicons name="checkmark" size={20} color={colors.primaryForeground} />}
      </View>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>{day}</Text>
    </View>
  );
}

function WeeklyBarItem({ value, maxValue, day, isToday }: { value: number; maxValue: number; day: string; isToday: boolean }) {
  const colors = useColors();
  const MAX_H = 80;
  const barH = maxValue > 0 ? Math.max((value / maxValue) * MAX_H, value > 0 ? 5 : 0) : 0;
  return (
    <View style={{ alignItems: 'center', gap: 5, flex: 1 }}>
      <View style={{ height: MAX_H, justifyContent: 'flex-end' }}>
        <View style={{
          width: '100%',
          height: barH,
          backgroundColor: isToday ? colors.accent : value > 0 ? colors.primary : colors.border,
          borderRadius: 4,
        }} />
      </View>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>{day}</Text>
    </View>
  );
}

export default function StatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { streak, profile, friends, recommendedBooks, suggestedFriends } = useStore();
  const [view, setView] = useState<'streaks' | 'discover'>('streaks');
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - dow + i);
    return d.toISOString().split('T')[0];
  });

  const goalProgress = Math.min(streak.todayMinutes / streak.dailyGoalMinutes, 1);
  const remaining = Math.max(0, streak.dailyGoalMinutes - streak.todayMinutes);
  const totalWeekMin = profile.weeklyMinutes.reduce((a, b) => a + b, 0);
  const weekH = Math.floor(totalWeekMin / 60);
  const weekM = totalWeekMin % 60;
  const maxMin = Math.max(...profile.weeklyMinutes, 1);
  const nudgeFriend = friends.find(f => f.todayMinutes > (profile.weeklyMinutes[todayIdx] ?? 0));

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={[styles.toggle, { backgroundColor: colors.muted }]}>
          {(['streaks', 'discover'] as const).map(v => (
            <TouchableOpacity
              key={v}
              style={[
                styles.toggleBtn,
                view === v && { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
              ]}
              onPress={() => setView(v)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, { color: view === v ? colors.foreground : colors.mutedForeground, fontFamily: view === v ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>
                {v === 'streaks' ? 'Streaks' : 'Discover'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'web' ? 100 : 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : 'never'}
      >
        {view === 'streaks' ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardSectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>CURRENT STREAK</Text>
              <Text style={[styles.streakBigNum, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{streak.currentStreak}</Text>
              <Text style={[styles.streakDaysLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>days in a row</Text>
              <View style={styles.dotRow}>
                {DAYS.map((d, i) => (
                  <StreakDot key={i} checked={streak.checkedDays.includes(weekDates[i])} day={d} />
                ))}
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.goalRow}>
                <Text style={[styles.goalLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Daily goal</Text>
                <Text style={[styles.goalValue, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                  {streak.todayMinutes} / {streak.dailyGoalMinutes} min
                </Text>
              </View>
              <View style={[styles.goalTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.goalFill, { width: `${goalProgress * 100}%`, backgroundColor: colors.accent }]} />
              </View>
              {remaining > 0 && (
                <Text style={[styles.goalHint, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {remaining} more minute{remaining !== 1 ? 's' : ''} keeps the streak alive
                </Text>
              )}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', marginTop: 8 }]}>NUDGES</Text>

            {nudgeFriend && (
              <View style={[styles.nudgeCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <View style={[styles.nudgeCircle, { backgroundColor: nudgeFriend.color }]}>
                  <Text style={[styles.nudgeInitial, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{nudgeFriend.initial}</Text>
                </View>
                <Text style={[styles.nudgeText, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold' }}>{nudgeFriend.name}</Text> read {nudgeFriend.todayMinutes} min today. Catch up?
                </Text>
              </View>
            )}
            <View style={[styles.nudgeCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <View style={[styles.nudgeCircle, { backgroundColor: colors.accent }]}>
                <Ionicons name="time-outline" size={18} color="#fff" />
              </View>
              <Text style={[styles.nudgeText, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>
                Your usual reading time is 9 PM. Ready?
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardSectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', marginBottom: 16 }]}>YOUR STATS · THIS WEEK</Text>
              <View style={styles.barChart}>
                {profile.weeklyMinutes.map((min, i) => (
                  <WeeklyBarItem key={i} value={min} maxValue={maxMin} day={DAYS[i]} isToday={i === todayIdx} />
                ))}
              </View>
              <View style={styles.statsRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.statBig, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    {weekH}h {weekM}m
                  </Text>
                  <Text style={[styles.statMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>read this week</Text>
                </View>
                <View style={[styles.statSep, { backgroundColor: colors.border }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.statBig, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{profile.weeklyPages}</Text>
                  <Text style={[styles.statMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>pages turned</Text>
                </View>
              </View>
              <View style={[styles.percentilePill, { backgroundColor: colors.primary }]}>
                <Text style={[styles.percentileText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>
                  Top {100 - profile.globalPercentile}% of all readers globally
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', marginTop: 8 }]}>PICKED FOR YOU</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 2 }}>
              {recommendedBooks.map(book => (
                <View key={book.id} style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.recCover, { backgroundColor: book.coverColor }]}>
                    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: 'rgba(0,0,0,0.2)' }} />
                  </View>
                  <View style={styles.recBody}>
                    <Text style={[styles.recTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>{book.title}</Text>
                    <Text style={[styles.recAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{book.author}</Text>
                    <Text style={[styles.recReason, { color: colors.accent, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{book.reason}</Text>
                    {book.friendsCount > 0 && (
                      <Text style={[styles.recFriends, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        {book.friendsCount} friend{book.friendsCount !== 1 ? 's' : ''} reading
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', marginTop: 8 }]}>SUGGESTED FRIENDS</Text>
            {suggestedFriends.map((sf, i, arr) => (
              <View
                key={sf.id}
                style={[styles.sfRow, { borderBottomColor: colors.border, borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
              >
                <View style={[styles.sfAvatar, { backgroundColor: sf.color }]}>
                  <Text style={[styles.sfInitial, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{sf.initial}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.sfName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{sf.name}</Text>
                  <Text style={[styles.sfMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {sf.mutualCount} mutual · loves {sf.genre}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.addBtn, { borderColor: colors.primary }]}
                  onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.addBtnText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>Add</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, alignItems: 'flex-start' },
  toggle: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  toggleText: { fontSize: 14 },
  card: {
    borderRadius: 16, borderWidth: 1, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  cardSectionLabel: { fontSize: 11, letterSpacing: 1.5, marginBottom: 8 },
  streakBigNum: { fontSize: 56, lineHeight: 60, letterSpacing: -2 },
  streakDaysLabel: { fontSize: 15, marginBottom: 20 },
  dotRow: { flexDirection: 'row', justifyContent: 'space-between' },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  goalLabel: { fontSize: 16 },
  goalValue: { fontSize: 14 },
  goalTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  goalFill: { height: 8, borderRadius: 4 },
  goalHint: { fontSize: 13 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.5 },
  nudgeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  nudgeCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  nudgeInitial: { fontSize: 15 },
  nudgeText: { flex: 1, fontSize: 14, lineHeight: 20 },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  statBig: { fontSize: 22, letterSpacing: -0.5 },
  statMeta: { fontSize: 13 },
  statSep: { width: 1, height: 40 },
  percentilePill: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' },
  percentileText: { fontSize: 13 },
  recCard: { width: 158, borderRadius: 14, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  recCover: { height: 100 },
  recBody: { padding: 12, gap: 3 },
  recTitle: { fontSize: 13, lineHeight: 18 },
  recAuthor: { fontSize: 12 },
  recReason: { fontSize: 11 },
  recFriends: { fontSize: 11 },
  sfRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  sfAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sfInitial: { fontSize: 17 },
  sfName: { fontSize: 15 },
  sfMeta: { fontSize: 13 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  addBtnText: { fontSize: 14 },
});
