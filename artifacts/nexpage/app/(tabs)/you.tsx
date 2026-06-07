import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';

export default function YouScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, streak } = useStore();
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const totalHours = Math.floor(profile.totalMinutes / 60);

  const stats = [
    { label: 'books', value: String(profile.booksFinished) },
    { label: 'hours', value: String(totalHours) },
    { label: 'pages', value: profile.totalPages.toLocaleString() },
    { label: 'best streak', value: String(profile.longestStreak) },
  ];

  const settingsRows = [
    { icon: 'target' as const, label: 'Daily reading goal', value: `${streak.dailyGoalMinutes} min` },
    { icon: 'bell' as const, label: 'Reading reminders', value: '9:00 PM' },
    { icon: 'shield' as const, label: 'Streak freezes', value: `${streak.freezesLeft} left` },
  ];

  const maxGenreCount = profile.genres[0]?.count ?? 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>You</Text>
        <TouchableOpacity activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="settings" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'web' ? 100 : 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : 'never'}
      >
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: profile.color }]}>
            <Text style={[styles.avatarInitial, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{profile.initial}</Text>
          </View>
          <Text style={[styles.profileName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{profile.name}</Text>
          <View style={[styles.streakBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="flame" size={13} color="rgba(255,255,255,0.85)" />
            <Text style={[styles.streakBadgeText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>
              {streak.currentStreak} day streak
            </Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={[styles.statsGrid, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {stats.map((s, i) => (
            <React.Fragment key={s.label}>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{s.label}</Text>
              </View>
              {i < stats.length - 1 && <View style={[styles.statDivider, { backgroundColor: colors.border }]} />}
            </React.Fragment>
          ))}
        </View>

        {/* Reading taste */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>READING TASTE</Text>
        <View style={[styles.genreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {profile.genres.map((g, i) => {
            const pct = g.count / maxGenreCount;
            return (
              <View
                key={g.name}
                style={[
                  styles.genreRow,
                  i < profile.genres.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.genreName, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>{g.name}</Text>
                <View style={styles.genreBarWrap}>
                  <View style={[styles.genreTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.genreFill, { width: `${pct * 100}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={[styles.genreCount, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{g.count}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Settings */}
        <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {settingsRows.map((row, i) => (
            <TouchableOpacity
              key={row.label}
              style={[
                styles.settingsRow,
                i < settingsRows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
              ]}
              activeOpacity={0.7}
            >
              <View style={[styles.settingsIcon, { backgroundColor: colors.muted }]}>
                <Feather name={row.icon} size={15} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>{row.label}</Text>
              <Text style={[styles.settingsValue, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{row.value}</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 26, letterSpacing: -0.5 },
  profileCard: {
    alignItems: 'center', padding: 28, borderRadius: 20, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  avatar: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarInitial: { fontSize: 34 },
  profileName: { fontSize: 22, marginBottom: 10, letterSpacing: -0.5 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 6, borderRadius: 18 },
  streakBadgeText: { fontSize: 13 },
  statsGrid: {
    flexDirection: 'row', borderRadius: 16, borderWidth: 1,
    overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 18, gap: 4 },
  statValue: { fontSize: 18, letterSpacing: -0.5 },
  statLabel: { fontSize: 11 },
  statDivider: { width: StyleSheet.hairlineWidth },
  sectionLabel: { fontSize: 11, letterSpacing: 1.5 },
  genreCard: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  genreRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  genreName: { width: 130, fontSize: 14 },
  genreBarWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  genreTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  genreFill: { height: 6, borderRadius: 3 },
  genreCount: { fontSize: 13, minWidth: 14, textAlign: 'right' },
  settingsCard: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 12 },
  settingsIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { flex: 1, fontSize: 14 },
  settingsValue: { fontSize: 14 },
});
