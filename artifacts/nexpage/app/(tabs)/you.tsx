import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Switch,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { useSocial } from '@/context/SocialContext';
import { BookCover } from '@/components/BookCover';
import { scheduleDailyReminder, cancelDailyReminder } from '@/lib/notifications';

function formatReminderTime(hour: number, minute: number): string {
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const m = minute.toString().padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h}:${m} ${ampm}`;
}

function ReminderModal({
  visible,
  initialHour,
  initialMinute,
  initialEnabled,
  streakDays,
  onSave,
  onClose,
}: {
  visible: boolean;
  initialHour: number;
  initialMinute: number;
  initialEnabled: boolean;
  streakDays: number;
  onSave: (enabled: boolean, hour: number, minute: number) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  function formatHourLabel(h: number): string {
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${display} ${ampm}`;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            Reading Reminder
          </Text>

          <View style={[styles.toggleRow, { borderColor: colors.border }]}>
            <View style={[styles.settingsIconSm, { backgroundColor: colors.muted }]}>
              <Feather name="bell" size={15} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.toggleLabel, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>
              Daily reminder
            </Text>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {enabled && (
            <>
              <Text style={[styles.pickerLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                HOUR
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pickerRow}
              >
                {hours.map(h => (
                  <TouchableOpacity
                    key={h}
                    onPress={() => setHour(h)}
                    style={[
                      styles.pickerChip,
                      {
                        backgroundColor: h === hour ? colors.primary : colors.muted,
                        borderColor: h === hour ? colors.primary : colors.border,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.pickerChipText,
                        {
                          color: h === hour ? '#fff' : colors.foreground,
                          fontFamily: 'Inter_500Medium',
                        },
                      ]}
                    >
                      {formatHourLabel(h)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.pickerLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                MINUTE
              </Text>
              <View style={styles.minuteRow}>
                {minutes.map(m => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMinute(m)}
                    style={[
                      styles.minuteChip,
                      {
                        backgroundColor: m === minute ? colors.primary : colors.muted,
                        borderColor: m === minute ? colors.primary : colors.border,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.minuteChipText,
                        {
                          color: m === minute ? '#fff' : colors.foreground,
                          fontFamily: 'Inter_500Medium',
                        },
                      ]}
                    >
                      :{m.toString().padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.previewRow, { backgroundColor: colors.muted, borderRadius: 12 }]}>
                <Ionicons name="flame" size={16} color={colors.primary} />
                <Text style={[styles.previewText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {`"${formatReminderTime(hour, minute)} — time to read. Your ${streakDays}-day streak is waiting."`}
                </Text>
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={() => onSave(enabled, hour, minute)}
            activeOpacity={0.8}
          >
            <Text style={[styles.saveBtnText, { fontFamily: 'Inter_600SemiBold' }]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function DailyGoalModal({
  visible,
  initialMinutes,
  onSave,
  onClose,
}: {
  visible: boolean;
  initialMinutes: number;
  onSave: (minutes: number) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(initialMinutes);
  const [inputText, setInputText] = useState(String(initialMinutes));

  const options = [10, 15, 20, 30, 45, 60, 90, 120];

  const parsed = parseInt(inputText, 10);
  const isValid = !isNaN(parsed) && parsed >= 1 && parsed <= 480;
  const showError = inputText.trim().length > 0 && !isValid;

  function handleChipPress(m: number) {
    setSelected(m);
    setInputText(String(m));
  }

  function handleTextChange(text: string) {
    const clean = text.replace(/[^0-9]/g, '');
    setInputText(clean);
    const n = parseInt(clean, 10);
    if (!isNaN(n) && n >= 1 && n <= 480) setSelected(n);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            Daily Reading Goal
          </Text>

          <Text style={[styles.pickerLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            MINUTES PER DAY
          </Text>
          <View style={styles.minuteRow}>
            {options.map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => handleChipPress(m)}
                style={[
                  styles.minuteChip,
                  {
                    backgroundColor: m === selected && !showError ? colors.primary : colors.muted,
                    borderColor: m === selected && !showError ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.minuteChipText,
                    {
                      color: m === selected && !showError ? '#fff' : colors.foreground,
                      fontFamily: 'Inter_500Medium',
                    },
                  ]}
                >
                  {m} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.goalCustomRow}>
            <Text style={[styles.goalOrLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>or enter custom</Text>
            <View style={[
              styles.goalInputWrap,
              { borderColor: showError ? '#c0392b' : isValid && !options.includes(selected) ? colors.primary : colors.border, backgroundColor: colors.background },
            ]}>
              <TextInput
                style={[styles.goalInput, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}
                value={inputText}
                onChangeText={handleTextChange}
                keyboardType="number-pad"
                placeholder="e.g. 25"
                placeholderTextColor={colors.mutedForeground}
                maxLength={3}
                selectTextOnFocus
              />
              <Text style={[styles.goalInputUnit, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>min</Text>
            </View>
          </View>
          {showError && (
            <Text style={[styles.goalError, { color: '#c0392b', fontFamily: 'Inter_400Regular' }]}>
              Enter a value between 1 and 480
            </Text>
          )}

          <View style={[styles.previewRow, { backgroundColor: colors.muted, borderRadius: 12 }]}>
            <Feather name="target" size={16} color={colors.primary} />
            <Text style={[styles.previewText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {`Read ${isValid ? selected : '?'} minutes a day to keep your streak alive.`}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: showError ? colors.muted : colors.primary }]}
            onPress={() => { if (isValid) onSave(selected); }}
            activeOpacity={0.8}
            disabled={showError}
          >
            <Text style={[styles.saveBtnText, { fontFamily: 'Inter_600SemiBold', color: showError ? colors.mutedForeground : '#fff' }]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function YouScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, streak, reminder, setReminder, setDailyGoal, books, pendingGoalMet, clearPendingGoalMet } = useStore();
  const { socialProfile, setNudgesEnabled, isRegistered, followers } = useSocial();
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [togglingNudges, setTogglingNudges] = useState(false);
  const [showGenreModal, setShowGenreModal] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState('');

  const goalToastOpacity = useRef(new Animated.Value(0)).current;
  const goalToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showGoalToast, setShowGoalToast] = useState(false);

  useEffect(() => {
    if (!pendingGoalMet) return;
    clearPendingGoalMet();
    setShowGoalToast(true);
    if (goalToastTimer.current) clearTimeout(goalToastTimer.current);
    const anim = Animated.sequence([
      Animated.timing(goalToastOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(goalToastOpacity, { toValue: 0, duration: 340, useNativeDriver: true }),
    ]);
    anim.start();
    goalToastTimer.current = setTimeout(() => setShowGoalToast(false), 3200);
    return () => {
      anim.stop();
      if (goalToastTimer.current) clearTimeout(goalToastTimer.current);
    };
  }, [pendingGoalMet]);

  const totalHours = Math.floor(profile.totalMinutes / 60);

  const stats = [
    { label: 'books', value: String(profile.booksFinished) },
    { label: 'hours', value: String(totalHours) },
    { label: 'pages', value: profile.totalPages.toLocaleString() },
    { label: 'best streak', value: String(profile.longestStreak) },
  ];

  const reminderDisplayValue = reminder.enabled
    ? formatReminderTime(reminder.hour, reminder.minute)
    : 'Off';

  async function handleSaveReminder(enabled: boolean, hour: number, minute: number) {
    const newSettings = { enabled, hour, minute };
    await setReminder(newSettings);
    if (enabled && Platform.OS !== 'web') {
      await scheduleDailyReminder(hour, minute, streak.currentStreak);
    } else if (!enabled) {
      await cancelDailyReminder();
    }
    setShowReminderModal(false);
  }

  async function handleToggleNudges(value: boolean) {
    if (togglingNudges) return;
    setTogglingNudges(true);
    try {
      await setNudgesEnabled(value);
    } catch { /* ignore */ } finally {
      setTogglingNudges(false);
    }
  }

  const settingsRows = [
    {
      icon: 'target' as const,
      label: 'Daily reading goal',
      value: `${streak.dailyGoalMinutes} min`,
      onPress: () => setShowGoalModal(true),
    },
    {
      icon: 'bell' as const,
      label: 'Reading reminders',
      value: reminderDisplayValue,
      onPress: () => setShowReminderModal(true),
    },
    {
      icon: 'shield' as const,
      label: 'Streak freezes',
      value: `${streak.freezesLeft} left`,
      onPress: undefined as (() => void) | undefined,
    },
  ];

  const maxGenreCount = profile.genres[0]?.count ?? 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{profile.name}</Text>
        <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
          {isRegistered && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/(tabs)/friends', params: { openFollowers: '1' } })}
              activeOpacity={0.7}
              style={styles.followersBadge}
            >
              <Ionicons name="people-outline" size={14} color={colors.mutedForeground} />
              <Text style={[styles.followersBadgeText, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                {followers.length} {followers.length === 1 ? 'follower' : 'followers'}
              </Text>
            </TouchableOpacity>
          )}
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

        {/* Wrapped */}
        <TouchableOpacity
          style={[styles.wrappedCard, { backgroundColor: colors.primary }]}
          onPress={() => router.push({ pathname: '/wrapped/[year]', params: { year: String(new Date().getFullYear()) } })}
          activeOpacity={0.88}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.wrappedTitle, { fontFamily: 'Inter_700Bold' }]}>
              {new Date().getFullYear()} Reading Wrapped
            </Text>
            <Text style={[styles.wrappedSub, { fontFamily: 'Inter_400Regular' }]}>
              Books, hours, streak — your year in review
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Reading taste */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>READING TASTE</Text>
        <View style={[styles.genreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {profile.genres.length === 0 ? (
            <View style={[styles.genreRow]}>
              <Text style={[styles.genreName, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Genres appear once you add books.
              </Text>
            </View>
          ) : (
            profile.genres.map((g, i) => {
              const pct = g.count / maxGenreCount;
              return (
                <TouchableOpacity
                  key={g.name}
                  style={[
                    styles.genreRow,
                    i < profile.genres.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                  onPress={() => { setSelectedGenre(g.name); setShowGenreModal(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.genreName, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>{g.name}</Text>
                  <View style={styles.genreBarWrap}>
                    <View style={[styles.genreTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.genreFill, { width: `${pct * 100}%`, backgroundColor: colors.primary }]} />
                    </View>
                    <Text style={[styles.genreCount, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{g.count}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })
          )}
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
              activeOpacity={row.onPress ? 0.7 : 1}
              onPress={row.onPress}
              disabled={!row.onPress}
            >
              <View style={[styles.settingsIcon, { backgroundColor: colors.muted }]}>
                <Feather name={row.icon} size={15} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>{row.label}</Text>
              <Text style={[styles.settingsValue, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{row.value}</Text>
              {row.onPress && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Social settings */}
        {isRegistered && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>SOCIAL</Text>
            <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.settingsRow]}>
                <View style={[styles.settingsIcon, { backgroundColor: colors.muted }]}>
                  <Ionicons name="hand-left-outline" size={15} color={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingsLabel, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>Allow nudges</Text>
                  <Text style={[{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    Let friends nudge you to keep your streak alive
                  </Text>
                </View>
                <Switch
                  value={socialProfile?.nudgesEnabled ?? true}
                  onValueChange={handleToggleNudges}
                  disabled={togglingNudges}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {showGoalToast && (
        <Animated.View
          style={[styles.goalToast, { opacity: goalToastOpacity }]}
          pointerEvents="none"
        >
          <Text style={[styles.goalToastText, { fontFamily: 'Inter_700Bold' }]}>
            🎉 Daily goal reached!
          </Text>
          <Text style={[styles.goalToastSub, { fontFamily: 'Inter_400Regular' }]}>
            {streak.todayMinutes} min read today · keep it up!
          </Text>
        </Animated.View>
      )}

      <ReminderModal
        visible={showReminderModal}
        initialHour={reminder.hour}
        initialMinute={reminder.minute}
        initialEnabled={reminder.enabled}
        streakDays={streak.currentStreak}
        onSave={handleSaveReminder}
        onClose={() => setShowReminderModal(false)}
      />

      <DailyGoalModal
        visible={showGoalModal}
        initialMinutes={streak.dailyGoalMinutes}
        onSave={async (minutes) => {
          await setDailyGoal(minutes);
          setShowGoalModal(false);
        }}
        onClose={() => setShowGoalModal(false)}
      />

      <Modal
        visible={showGenreModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowGenreModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {selectedGenre}
              </Text>
              <TouchableOpacity onPress={() => setShowGenreModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {(() => {
              const genreBooks = books.filter(b => b.genre === selectedGenre);
              if (genreBooks.length === 0) {
                return (
                  <Text style={[{ fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', paddingVertical: 16 }]}>
                    No books tagged as {selectedGenre} yet.
                  </Text>
                );
              }
              return (
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                  {genreBooks.map((b, i) => {
                    const pct = Math.round((b.currentPage / b.totalPages) * 100);
                    return (
                      <View
                        key={b.id}
                        style={[
                          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
                          i < genreBooks.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                        ]}
                      >
                        <BookCover bookId={b.id} coverColor={b.coverColor} coverImageUri={b.coverImageUri} width={40} height={56} borderRadius={5} />
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={[{ fontSize: 15, letterSpacing: -0.2, color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{b.title}</Text>
                          <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{b.author}</Text>
                          <Text style={[{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                            {b.finishedAt ? 'Finished' : `${pct}% read`}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  goalToast: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#3A6645',
    backgroundColor: '#e8f4ed',
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 3,
    shadowColor: '#3A6645',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  goalToastText: { fontSize: 16, letterSpacing: -0.2, color: '#2a5235' },
  goalToastSub: { fontSize: 13, color: '#3A6645' },
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
  followersBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  followersBadgeText: { fontSize: 13 },
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 20, letterSpacing: -0.5 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsIconSm: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toggleLabel: { flex: 1, fontSize: 15 },
  pickerLabel: { fontSize: 11, letterSpacing: 1.5, marginTop: 4 },
  pickerRow: { gap: 8, paddingVertical: 4 },
  pickerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  pickerChipText: { fontSize: 13 },
  minuteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 4,
  },
  minuteChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  minuteChipText: { fontSize: 13 },
  goalCustomRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4,
  },
  goalOrLabel: { fontSize: 13 },
  goalInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  goalInput: { flex: 1, fontSize: 15, padding: 0 },
  goalInputUnit: { fontSize: 13 },
  goalError: { fontSize: 12, marginTop: -4 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 14,
    marginTop: 4,
  },
  previewText: { flex: 1, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16 },
  wrappedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 18,
  },
  wrappedTitle: { fontSize: 16, color: '#fff' },
  wrappedSub: { fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
});
