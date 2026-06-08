import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, TextInput, Switch, Alert, ActivityIndicator,
  Modal, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { useSocial } from '@/context/SocialContext';
import { useAuth } from '@/lib/auth';
import { scheduleDailyReminder, cancelDailyReminder } from '@/lib/notifications';

const APP_VERSION = '1.0.0';

const AVATAR_COLORS = [
  '#8a2333', '#b87355', '#B54935', '#B08A3C',
  '#3A6645', '#4A7A52', '#3A8A7A', '#5C849E',
  '#1C3A5A', '#8B5E9E', '#7A5E9E', '#8B3A3A',
];

function formatReminderTime(hour: number, minute: number): string {
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const m = minute.toString().padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h}:${m} ${ampm}`;
}

function SectionLabel({ label }: { label: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
      {label}
    </Text>
  );
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

function SettingsRow({
  icon, iconBg, label, value, onPress, rightElement, isLast = false, destructive = false,
}: {
  icon?: string; iconBg?: string; label: string; value?: string;
  onPress?: () => void; rightElement?: React.ReactNode;
  isLast?: boolean; destructive?: boolean;
}) {
  const colors = useColors();
  const content = (
    <View style={[
      styles.row,
      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    ]}>
      {icon ? (
        <View style={[styles.iconBox, { backgroundColor: iconBg ?? colors.muted }]}>
          <Feather name={icon as any} size={15} color={destructive ? '#fff' : colors.mutedForeground} />
        </View>
      ) : null}
      <Text style={[
        styles.rowLabel,
        { color: destructive ? colors.primary : colors.foreground, fontFamily: 'Inter_400Regular' },
        !icon && { marginLeft: 4 },
      ]}>
        {label}
      </Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          {value}
        </Text>
      ) : null}
      {rightElement ?? null}
      {onPress && !rightElement ? (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {content}
    </TouchableOpacity>
  );
}

function GoalModal({
  visible, initial, onSave, onClose,
}: { visible: boolean; initial: number; onSave: (m: number) => void; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(initial);
  const OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Daily Reading Goal</Text>
          <Text style={[styles.sheetSub, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>MINUTES PER DAY</Text>
          <View style={styles.chipGrid}>
            {OPTIONS.map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setSelected(m)}
                style={[styles.chip, {
                  backgroundColor: m === selected ? colors.primary : colors.muted,
                  borderColor: m === selected ? colors.primary : colors.border,
                }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: m === selected ? '#fff' : colors.foreground, fontFamily: 'Inter_500Medium' }]}>
                  {m} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.previewBox, { backgroundColor: colors.muted }]}>
            <Feather name="target" size={15} color={colors.primary} />
            <Text style={[styles.previewText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Read {selected} minutes a day to keep your streak alive.
            </Text>
          </View>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={() => onSave(selected)} activeOpacity={0.85}>
            <Text style={[styles.saveBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ReminderModal({
  visible, initialHour, initialMinute, initialEnabled, streakDays, onSave, onClose,
}: {
  visible: boolean; initialHour: number; initialMinute: number;
  initialEnabled: boolean; streakDays: number;
  onSave: (enabled: boolean, hour: number, minute: number) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  function formatHour(h: number) {
    const d = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${d} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Reading Reminder</Text>
          <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconBox, { backgroundColor: colors.muted }]}>
              <Feather name="bell" size={15} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.rowLabel, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>Daily reminder</Text>
            <Switch value={enabled} onValueChange={setEnabled}
              trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
          </View>
          {enabled && (
            <>
              <Text style={[styles.sheetSub, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>HOUR</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {HOURS.map(h => (
                  <TouchableOpacity key={h} onPress={() => setHour(h)}
                    style={[styles.chip, { backgroundColor: h === hour ? colors.primary : colors.muted, borderColor: h === hour ? colors.primary : colors.border }]} activeOpacity={0.7}>
                    <Text style={[styles.chipText, { color: h === hour ? '#fff' : colors.foreground, fontFamily: 'Inter_500Medium' }]}>{formatHour(h)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={[styles.sheetSub, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>MINUTE</Text>
              <View style={styles.chipGrid}>
                {MINUTES.map(m => (
                  <TouchableOpacity key={m} onPress={() => setMinute(m)}
                    style={[styles.chip, { backgroundColor: m === minute ? colors.primary : colors.muted, borderColor: m === minute ? colors.primary : colors.border }]} activeOpacity={0.7}>
                    <Text style={[styles.chipText, { color: m === minute ? '#fff' : colors.foreground, fontFamily: 'Inter_500Medium' }]}>:{m.toString().padStart(2, '0')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.previewBox, { backgroundColor: colors.muted }]}>
                <Ionicons name="flame" size={15} color={colors.primary} />
                <Text style={[styles.previewText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {`"${formatReminderTime(hour, minute)} — time to read. Your ${streakDays}-day streak is waiting."`}
                </Text>
              </View>
            </>
          )}
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={() => onSave(enabled, hour, minute)} activeOpacity={0.85}>
            <Text style={[styles.saveBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, streak, reminder, setReminder, setDailyGoal, updateProfile } = useStore();
  const { socialProfile, isRegistered, setNudgesEnabled } = useSocial();
  const { user, isAuthenticated, login, logout } = useAuth();

  const [name, setName] = useState(profile.name);
  const [selectedColor, setSelectedColor] = useState(profile.color);
  const [saving, setSaving] = useState(false);
  const [nudgesEnabled, setNudgesLocal] = useState(socialProfile?.nudgesEnabled ?? true);
  const [togglingNudges, setTogglingNudges] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const hasProfileChanges = name !== profile.name || selectedColor !== profile.color;

  async function handleSaveProfile() {
    if (!hasProfileChanges || saving) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateProfile(name, selectedColor);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveGoal(minutes: number) {
    await setDailyGoal(minutes);
    setShowGoalModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleSaveReminder(enabled: boolean, hour: number, minute: number) {
    await setReminder({ enabled, hour, minute });
    if (enabled && Platform.OS !== 'web') {
      await scheduleDailyReminder(hour, minute, streak.currentStreak);
    } else if (!enabled) {
      await cancelDailyReminder();
    }
    setShowReminderModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleToggleNudges(value: boolean) {
    if (togglingNudges) return;
    setNudgesLocal(value);
    setTogglingNudges(true);
    try {
      await setNudgesEnabled(value);
    } catch {
      setNudgesLocal(!value);
    } finally {
      setTogglingNudges(false);
    }
  }

  function handleSignOut() {
    Alert.alert(
      'Sign out',
      'Your reading data is saved locally and will still be here when you return.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out', style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try { await logout(); } finally { setSigningOut(false); }
          },
        },
      ],
    );
  }

  function handleSignIn() {
    login();
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Settings</Text>
        {hasProfileChanges ? (
          <TouchableOpacity onPress={handleSaveProfile} activeOpacity={0.8} style={styles.saveTextBtn} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[styles.saveText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>Save</Text>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ width: 52 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + (Platform.OS === 'web' ? 80 : 32), gap: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar + Color picker */}
        <View style={{ height: 12 }} />
        <View style={[styles.profileSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: selectedColor }]}>
            <Text style={[styles.avatarInitial, { fontFamily: 'Inter_700Bold' }]}>
              {(name.trim().charAt(0) || 'Y').toUpperCase()}
            </Text>
          </View>

          <View style={styles.colorGrid}>
            {AVATAR_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => { setSelectedColor(c); Haptics.selectionAsync(); }}
                activeOpacity={0.8}
                style={[styles.colorSwatch, { backgroundColor: c }, selectedColor === c && styles.colorSwatchSelected]}
              >
                {selectedColor === c && <Ionicons name="checkmark" size={14} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.nameInputWrap, { borderColor: hasProfileChanges ? colors.primary : colors.border, backgroundColor: colors.background }]}>
            <TextInput
              style={[styles.nameInput, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={40}
              onSubmitEditing={handleSaveProfile}
            />
          </View>
          {socialProfile?.username ? (
            <Text style={[styles.usernameHint, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              @{socialProfile.username}
            </Text>
          ) : null}
        </View>

        {/* Reading */}
        <View style={{ height: 4 }} />
        <SectionLabel label="READING" />
        <SettingsGroup>
          <SettingsRow
            icon="target"
            label="Daily reading goal"
            value={`${streak.dailyGoalMinutes} min`}
            onPress={() => setShowGoalModal(true)}
          />
          <SettingsRow
            icon="bell"
            label="Reading reminder"
            value={reminder.enabled ? formatReminderTime(reminder.hour, reminder.minute) : 'Off'}
            onPress={() => setShowReminderModal(true)}
          />
          <SettingsRow
            icon="shield"
            label="Streak freezes"
            value={`${streak.freezesLeft} left this month`}
            isLast
          />
        </SettingsGroup>

        {/* Social */}
        {isRegistered && (
          <>
            <View style={{ height: 4 }} />
            <SectionLabel label="SOCIAL" />
            <SettingsGroup>
              <SettingsRow
                icon="users"
                label="Allow nudges"
                isLast
                rightElement={
                  <Switch
                    value={nudgesEnabled}
                    onValueChange={handleToggleNudges}
                    disabled={togglingNudges}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                }
              />
            </SettingsGroup>
          </>
        )}

        {/* Account */}
        <View style={{ height: 4 }} />
        <SectionLabel label="ACCOUNT" />
        <SettingsGroup>
          {isAuthenticated && user ? (
            <>
              <SettingsRow
                icon="user"
                label="Replit account"
                value={user.email ?? user.firstName ?? 'Connected'}
              />
              <SettingsRow
                icon="log-out"
                iconBg={colors.primary}
                label="Sign out"
                destructive
                onPress={handleSignOut}
                isLast
                rightElement={signingOut ? <ActivityIndicator size="small" color={colors.primary} /> : undefined}
              />
            </>
          ) : (
            <SettingsRow
              icon="log-in"
              label="Sign in with Replit"
              value="Sync & social features"
              onPress={handleSignIn}
              isLast
            />
          )}
        </SettingsGroup>

        {/* App */}
        <View style={{ height: 4 }} />
        <SectionLabel label="APP" />
        <SettingsGroup>
          <SettingsRow
            icon="sun"
            label="Appearance"
            value="Follows system"
          />
          <SettingsRow
            icon="info"
            label="Version"
            value={APP_VERSION}
            isLast
          />
        </SettingsGroup>

        <View style={{ height: 8 }} />
        <Text style={[styles.footerText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          NexPage · Your reading, your streak, your circle.
        </Text>
      </ScrollView>

      <GoalModal
        visible={showGoalModal}
        initial={streak.dailyGoalMinutes}
        onSave={handleSaveGoal}
        onClose={() => setShowGoalModal(false)}
      />
      <ReminderModal
        visible={showReminderModal}
        initialHour={reminder.hour}
        initialMinute={reminder.minute}
        initialEnabled={reminder.enabled}
        streakDays={streak.currentStreak}
        onSave={handleSaveReminder}
        onClose={() => setShowReminderModal(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4, width: 52 },
  headerTitle: { fontSize: 17, letterSpacing: -0.3 },
  saveTextBtn: { width: 52, alignItems: 'flex-end', padding: 4 },
  saveText: { fontSize: 16 },
  profileSection: {
    borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center', gap: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 36, color: '#fff' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  colorSwatch: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2,
  },
  colorSwatchSelected: {
    borderWidth: 3, borderColor: '#fff',
    shadowOpacity: 0.3, shadowRadius: 6,
  },
  nameInputWrap: {
    width: '100%', borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10,
  },
  nameInput: { fontSize: 16, textAlign: 'center' },
  usernameHint: { fontSize: 13, marginTop: -8 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.5, marginLeft: 4 },
  group: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 12 },
  iconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 14 },
  rowValue: { fontSize: 14 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 20, letterSpacing: -0.5 },
  sheetSub: { fontSize: 11, letterSpacing: 1.5 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipRow: { gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13 },
  previewBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 14, borderRadius: 12 },
  previewText: { flex: 1, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  saveBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { fontSize: 15, color: '#fff' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  footerText: { fontSize: 12, textAlign: 'center' },
});
