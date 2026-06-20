import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Animated, View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, TextInput, Switch, ActivityIndicator,
  Modal, KeyboardAvoidingView, PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { useStore } from '@/context/StoreContext';
import { useSocial } from '@/context/SocialContext';
import { useAuth } from '@/lib/auth';
import { scheduleDailyReminder, cancelDailyReminder, requestNotificationPermissions } from '@/lib/notifications';
import RegisterModal from '@/components/RegisterModal';
import { BottomSheet } from '@/components/BottomSheet';

const APP_VERSION = '1.0.0';

function ChangePasswordModal({
  visible, onClose, onSuccess,
}: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;
  function dismiss() {
    Animated.timing(translateY, { toValue: 800, duration: 220, useNativeDriver: true })
      .start(() => { onClose(); translateY.setValue(0); });
  }
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && g.dy > Math.abs(g.dx) * 1.5,
    onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 100 || g.vy > 0.8) dismiss();
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  useEffect(() => {
    if (!visible) {
      setCurrent(''); setNext(''); setConfirm(''); setError(''); setSaving(false);
      translateY.setValue(0);
    }
  }, [visible]);

  async function handleSave() {
    if (!current) { setError('Enter your current password.'); return; }
    if (next.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    setError('');
    setSaving(true);
    try {
      await changePassword(current, next);
      onSuccess();
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={dismiss}>
          <Animated.View style={{ transform: [{ translateY }] }} {...pan.panHandlers}>
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.cpSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 24 }]}
            >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', marginBottom: 4 }]}>
              Change Password
            </Text>

            <Text style={[styles.cpLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>CURRENT PASSWORD</Text>
            <TextInput
              style={[styles.cpInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="next"
              autoCapitalize="none"
            />

            <Text style={[styles.cpLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>NEW PASSWORD</Text>
            <TextInput
              style={[styles.cpInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
              value={next}
              onChangeText={setNext}
              secureTextEntry
              placeholder="At least 6 characters"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="next"
              autoCapitalize="none"
            />

            <Text style={[styles.cpLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>CONFIRM NEW PASSWORD</Text>
            <TextInput
              style={[styles.cpInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
              autoCapitalize="none"
              onSubmitEditing={handleSave}
            />

            {error !== '' && (
              <Text style={[styles.cpError, { color: '#C0392B', fontFamily: 'Inter_400Regular' }]}>{error}</Text>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary, marginTop: 8 }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={[styles.saveBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Update password</Text>
              }
            </TouchableOpacity>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

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
        { color: destructive ? colors.destructive : colors.foreground, fontFamily: 'Inter_400Regular' },
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
  const [inputText, setInputText] = useState(String(initial));
  const OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120];

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
    <BottomSheet visible={visible} onClose={onClose} backgroundColor={colors.card} paddingBottom={insets.bottom + 16}>
          <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Daily Reading Goal</Text>
          <Text style={[styles.sheetSub, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>MINUTES PER DAY</Text>
          <View style={styles.chipGrid}>
            {OPTIONS.map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => handleChipPress(m)}
                style={[styles.chip, {
                  backgroundColor: m === selected && !showError ? colors.primary : colors.muted,
                  borderColor: m === selected && !showError ? colors.primary : colors.border,
                }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: m === selected && !showError ? '#fff' : colors.foreground, fontFamily: 'Inter_500Medium' }]}>
                  {m} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.goalCustomRow}>
            <Text style={[styles.goalOrLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>or enter custom</Text>
            <View style={[
              styles.goalInputWrap,
              { borderColor: showError ? '#c0392b' : isValid && !OPTIONS.includes(selected) ? colors.primary : colors.border, backgroundColor: colors.background },
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
          <View style={[styles.previewBox, { backgroundColor: colors.muted }]}>
            <Feather name="target" size={15} color={colors.primary} />
            <Text style={[styles.previewText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Read {isValid ? selected : '?'} minutes a day to keep your streak alive.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: showError ? colors.muted : colors.primary }]}
            onPress={() => { if (isValid) onSave(selected); }}
            activeOpacity={0.85}
            disabled={showError}
          >
            <Text style={[styles.saveBtnText, { fontFamily: 'Inter_600SemiBold', color: showError ? colors.mutedForeground : '#fff' }]}>Save</Text>
          </TouchableOpacity>
    </BottomSheet>
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
    <BottomSheet visible={visible} onClose={onClose} backgroundColor={colors.card} paddingBottom={insets.bottom + 16}>
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
    </BottomSheet>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, streak, reminder, setReminder, setDailyGoal, updateProfile } = useStore();
  const { socialProfile, isRegistered, setNudgesEnabled } = useSocial();
  const { user, isAuthenticated, logout, changePassword, deleteAccount } = useAuth();

  const { themeMode, setThemeMode } = useTheme();

  const [name, setName] = useState(profile.name);
  const [selectedColor, setSelectedColor] = useState(profile.color);
  const [saving, setSaving] = useState(false);
  const [nudgesEnabled, setNudgesLocal] = useState(socialProfile?.nudgesEnabled ?? true);
  const [togglingNudges, setTogglingNudges] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

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
    setShowSignOutConfirm(true);
  }

  async function confirmSignOut() {
    setShowSignOutConfirm(false);
    setSigningOut(true);
    try {
      await logout();
      router.replace('/');
    } finally {
      setSigningOut(false);
    }
  }

  function handleDeleteAccount() {
    setDeletePassword('');
    setDeleteError('');
    setShowDeleteConfirm(true);
  }

  async function confirmDeleteAccount() {
    if (!deletePassword) { setDeleteError('Enter your password to confirm.'); return; }
    setDeletingAccount(true);
    setDeleteError('');
    try {
      await deleteAccount(deletePassword);
      setShowDeleteConfirm(false);
      router.replace('/');
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setDeletingAccount(false);
    }
  }

  function handleSignIn() {
    setShowAuthModal(true);
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
                label="Account"
                value={user.email ?? user.firstName ?? 'Connected'}
              />
              <SettingsRow
                icon="lock"
                label="Change password"
                onPress={() => { setPasswordChanged(false); setShowChangePassword(true); }}
              />
              <SettingsRow
                icon="log-out"
                iconBg={colors.primary}
                label="Sign out"
                destructive
                onPress={handleSignOut}
                rightElement={signingOut ? <ActivityIndicator size="small" color={colors.primary} /> : undefined}
              />
              <SettingsRow
                icon="trash-2"
                iconBg="#b91c1c"
                label="Delete Account"
                destructive
                onPress={handleDeleteAccount}
                isLast
              />
            </>
          ) : (
            <SettingsRow
              icon="log-in"
              label="Sign in"
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
          <View style={[
            styles.row,
            { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
          ]}>
            <View style={[styles.iconBox, { backgroundColor: colors.muted }]}>
              <Feather
                name={themeMode === 'dark' ? 'moon' : themeMode === 'light' ? 'sun' : 'monitor'}
                size={15}
                color={colors.mutedForeground}
              />
            </View>
            <Text style={[styles.rowLabel, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>
              Appearance
            </Text>
            <View style={[styles.themePicker, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              {(['light', 'system', 'dark'] as ThemeMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => { setThemeMode(mode); Haptics.selectionAsync(); }}
                  activeOpacity={0.8}
                  style={[
                    styles.themeChip,
                    themeMode === mode && { backgroundColor: colors.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 2, elevation: 2 },
                  ]}
                >
                  <Text style={[
                    styles.themeChipText,
                    {
                      fontFamily: themeMode === mode ? 'Inter_600SemiBold' : 'Inter_400Regular',
                      color: themeMode === mode ? colors.foreground : colors.mutedForeground,
                    },
                  ]}>
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <SettingsRow
            icon="shield"
            label="Privacy & Terms"
            onPress={() => router.push('/legal')}
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
          EverPage · Your reading, your streak, your circle.
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
      <RegisterModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
      <ChangePasswordModal
        visible={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        onSuccess={() => { setShowChangePassword(false); setPasswordChanged(true); }}
      />
      <Modal visible={passwordChanged} transparent animationType="fade" onRequestClose={() => setPasswordChanged(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setPasswordChanged(false)}>
          <View style={[styles.confirmSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.confirmIconWrap, { backgroundColor: '#e8f5e9' }]}>
              <Feather name="check" size={22} color="#2e7d32" />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Password updated</Text>
            <Text style={[styles.confirmBody, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Your password has been changed successfully.
            </Text>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={() => setPasswordChanged(false)}
              activeOpacity={0.85}
            >
              <Text style={[styles.confirmBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => { if (!deletingAccount) setShowDeleteConfirm(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { if (!deletingAccount) setShowDeleteConfirm(false); }} />
          <View style={[styles.confirmSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.confirmIconWrap, { backgroundColor: '#fde8ea' }]}>
              <Feather name="trash-2" size={22} color="#b91c1c" />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Delete Account?</Text>
            <Text style={[styles.confirmBody, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              This permanently deletes your reading history, streak, notes, and profile. This cannot be undone.
            </Text>
            <TextInput
              style={[styles.deleteInput, { backgroundColor: colors.muted, borderColor: deleteError ? '#b91c1c' : colors.border, color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
              placeholder="Enter your password to confirm"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              value={deletePassword}
              onChangeText={(t) => { setDeletePassword(t); setDeleteError(''); }}
              editable={!deletingAccount}
              autoCapitalize="none"
            />
            {!!deleteError && (
              <Text style={[styles.deleteErrorText, { fontFamily: 'Inter_400Regular' }]}>{deleteError}</Text>
            )}
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: '#b91c1c', opacity: deletingAccount ? 0.6 : 1 }]}
              onPress={confirmDeleteAccount}
              activeOpacity={0.85}
              disabled={deletingAccount}
            >
              {deletingAccount
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.confirmBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Delete my account</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmCancelBtn, { borderColor: colors.border }]}
              onPress={() => setShowDeleteConfirm(false)}
              activeOpacity={0.7}
              disabled={deletingAccount}
            >
              <Text style={[styles.confirmCancelText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showSignOutConfirm} transparent animationType="fade" onRequestClose={() => setShowSignOutConfirm(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowSignOutConfirm(false)}>
          <View style={[styles.confirmSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.confirmIconWrap, { backgroundColor: '#fde8ea' }]}>
              <Feather name="log-out" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Sign out?</Text>
            <Text style={[styles.confirmBody, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Your reading data is saved locally and will still be here when you return.
            </Text>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={confirmSignOut}
              activeOpacity={0.85}
            >
              {signingOut
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.confirmBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Sign out</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmCancelBtn, { borderColor: colors.border }]}
              onPress={() => setShowSignOutConfirm(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.confirmCancelText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  themePicker: {
    flexDirection: 'row', borderRadius: 10, borderWidth: 1,
    padding: 3, gap: 2,
  },
  themeChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7,
  },
  themeChipText: { fontSize: 12 },
  footerText: { fontSize: 12, textAlign: 'center' },
  deleteInput: {
    width: '100%', borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    fontSize: 15, marginTop: 4,
  },
  deleteErrorText: { fontSize: 13, color: '#b91c1c', marginTop: 4, textAlign: 'center' },
  confirmSheet: {
    margin: 24, borderRadius: 20, borderWidth: 1,
    padding: 24, alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 12,
  },
  confirmIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  confirmTitle: { fontSize: 20, letterSpacing: -0.4 },
  confirmBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },
  confirmBtn: {
    width: '100%', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 4,
  },
  confirmBtnText: { fontSize: 15, color: '#fff' },
  cpSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1,
    paddingHorizontal: 24, paddingTop: 12, gap: 10,
  },
  cpLabel: { fontSize: 11, letterSpacing: 1.5, marginTop: 8 },
  cpInput: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 15,
  },
  cpError: { fontSize: 13, marginTop: -4 },
  confirmCancelBtn: {
    width: '100%', borderRadius: 14, paddingVertical: 13,
    alignItems: 'center', borderWidth: 1,
  },
  confirmCancelText: { fontSize: 15 },
});
