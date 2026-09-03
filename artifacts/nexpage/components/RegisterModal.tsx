import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, Platform, ActivityIndicator, ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useSocial } from '@/context/SocialContext';
import { useAuth } from '@/lib/auth';

const AVATAR_COLORS = [
  '#1C3A5A', '#5C849E', '#B54935', '#3A6645',
  '#8B5E9E', '#B08A3C', '#4A7A52', '#5E7A9E',
];

function formatBirthday(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
  return `${digits.slice(0, 2)} / ${digits.slice(2, 4)} / ${digits.slice(4)}`;
}

function normalizeBirthday(value: string): string | null {
  const match = value.match(/^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;

  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1;
  return age >= 13 ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}

export default function RegisterModal({
  visible,
  onClose,
  defaultMode = 'login',
}: {
  visible: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register';
}) {
  const colors = useColors();
  const { registerUser, socialProfile } = useSocial();
  const { isAuthenticated, login, register, requestPasswordReset } = useAuth();

  // Auth state
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthday, setBirthday] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  // Social profile state
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const initial = (displayName.trim()[0] ?? '?').toUpperCase();

  useEffect(() => {
    if (visible) {
      setMode(defaultMode);
    } else {
      // Reset on close
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setBirthday('');
      setAuthError('');
      setAuthLoading(false);
      setResetMessage('');
      setDisplayName('');
      setUsername('');
      setSelectedColor(AVATAR_COLORS[0]);
      setSaving(false);
      setError('');
    }
  }, [visible]);

  function deriveUsername(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20);
  }

  function handleNameChange(text: string) {
    setDisplayName(text);
    if (!username || username === deriveUsername(displayName)) {
      setUsername(deriveUsername(text));
    }
  }

  async function handleAuth() {
    const e = email.trim().toLowerCase();
    const p = password.trim();
    if (!e) { setAuthError('Enter your email.'); return; }
    if (!p) { setAuthError('Enter your password.'); return; }
    if (mode === 'register' && p !== confirmPassword.trim()) {
      setAuthError('Passwords do not match.'); return;
    }
    if (mode === 'register' && p.length < 6) {
      setAuthError('Password must be at least 6 characters.'); return;
    }
    const birthdayIso = normalizeBirthday(birthday);
    if (mode === 'register' && !birthdayIso) {
      setAuthError('Enter a valid birthday. You must be at least 13 to sign up.'); return;
    }

    setAuthError('');
    setAuthLoading(true);
    try {
      if (mode === 'register') {
        // Derive username from email for the auth account
        const derived = e.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 20);
        const name = e.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 20);
        await register(e, p, derived || 'user', name || 'User', birthdayIso!);
      } else {
        await login(e, p);
      }
    } catch (e: any) {
      setAuthError(e?.message || 'Something went wrong. Try again.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleForgotPassword() {
    const e = email.trim().toLowerCase();
    if (!e) { setAuthError('Enter your email.'); return; }
    setAuthError('');
    setResetMessage('');
    setAuthLoading(true);
    try {
      const message = await requestPasswordReset(e);
      setResetMessage(message);
    } catch (e: any) {
      setAuthError(e?.message || 'Could not send a reset link. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSaveProfile() {
    const u = username.trim();
    const dn = displayName.trim();
    if (!dn) { setError('Enter your name.'); return; }
    if (u.length < 2) { setError('Username must be at least 2 characters.'); return; }
    if (!/^[a-z0-9_]+$/.test(u)) { setError('Username: letters, numbers, and _ only.'); return; }
    setError('');
    setSaving(true);
    try {
      await registerUser(u, dn, selectedColor);
      onClose();
    } catch (e: any) {
      const msg = e?.message ?? '';
      setError(msg.includes('409') || msg.includes('taken')
        ? 'That username is already taken.'
        : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // If authenticated and no social profile, show social profile form
  if (isAuthenticated && !socialProfile) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              Create Profile
            </Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.avatarPreview}>
              <View style={[styles.avatarCircle, { backgroundColor: selectedColor }]}>
                <Text style={[styles.avatarInitial, { fontFamily: 'Inter_700Bold' }]}>{initial}</Text>
              </View>
            </View>

            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>CHOOSE COLOR</Text>
            <View style={styles.colorRow}>
              {AVATAR_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorSwatch, { backgroundColor: c }, selectedColor === c && styles.colorSwatchSelected]}
                  onPress={() => setSelectedColor(c)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>DISPLAY NAME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
              placeholder="Your name"
              placeholderTextColor={colors.mutedForeground}
              value={displayName}
              onChangeText={handleNameChange}
              autoCorrect={false}
              maxLength={40}
            />

            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>USERNAME</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.atSign, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>@</Text>
              <TextInput
                style={[styles.inputInline, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                placeholder="yourname"
                placeholderTextColor={colors.mutedForeground}
                value={username}
                onChangeText={t => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
            </View>

            {error !== '' && (
              <Text style={[styles.errorText, { color: '#C0392B', fontFamily: 'Inter_400Regular' }]}>{error}</Text>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
              onPress={handleSaveProfile}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={[styles.saveBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>
                    Create Profile
                  </Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  // If authenticated and has social profile, just close (modal shouldn't even show)
  if (isAuthenticated && socialProfile) {
    return null;
  }

  // Auth form (login or register)
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Reset password'}
          </Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={styles.authBody}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoWrap}>
            <Ionicons name="book-outline" size={56} color={colors.primary} />
            <Text style={[styles.logoText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              EverPage
            </Text>
            <Text style={[styles.logoSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Your reading, your streak, your circle.
            </Text>
          </View>

          <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>EMAIL</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="next"
          />

          {mode === 'forgot' && (
            <Text style={[styles.resetHint, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>We’ll email a one-hour reset link if this address has an EverPage account.</Text>
          )}

          {mode !== 'forgot' && (
            <>
              <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>PASSWORD</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType={mode === 'register' ? 'next' : 'done'}
                onSubmitEditing={mode === 'login' ? handleAuth : undefined}
              />
            </>
          )}

          {mode === 'register' && (
            <>
              <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>CONFIRM PASSWORD</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleAuth}
              />
              <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>BIRTHDAY</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
                placeholder="MM / DD / YYYY"
                placeholderTextColor={colors.mutedForeground}
                value={birthday}
                onChangeText={text => setBirthday(formatBirthday(text))}
                keyboardType="number-pad"
                autoCorrect={false}
                // The formatter displays `MM / DD / YYYY`, which is 14
                // characters including spaces and slashes. A limit of 10
                // trapped iOS users after the first year digit.
                maxLength={14}
                returnKeyType="done"
                onSubmitEditing={handleAuth}
              />
              <Text style={[styles.birthdayHint, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>You must be 13 or older to create an account.</Text>
            </>
          )}

          {authError !== '' && (
            <Text style={[styles.errorText, { color: '#C0392B', fontFamily: 'Inter_400Regular' }]}>{authError}</Text>
          )}

          {resetMessage !== '' && (
            <Text style={[styles.resetMessage, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{resetMessage}</Text>
          )}

          {mode === 'login' && (
            <TouchableOpacity onPress={() => { setMode('forgot'); setAuthError(''); setResetMessage(''); }} activeOpacity={0.7} style={styles.forgotBtn}>
              <Text style={[styles.switchText, { color: colors.primary, fontFamily: 'Inter_500Medium' }]}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, authLoading && { opacity: 0.6 }]}
            onPress={mode === 'forgot' ? handleForgotPassword : handleAuth}
            disabled={authLoading}
            activeOpacity={0.85}
          >
            {authLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={[styles.saveBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>
                  {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
                </Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setAuthError(''); setResetMessage(''); }} activeOpacity={0.7} style={styles.switchBtn}>
            <Text style={[styles.switchText, { color: colors.primary, fontFamily: 'Inter_500Medium' }]}>
              {mode === 'login' ? "Don't have an account? Create one" : mode === 'register' ? "Already have an account? Sign in" : 'Back to sign in'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 0 : 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, letterSpacing: -0.3 },
  authBody: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40, gap: 10 },
  logoWrap: { alignItems: 'center', gap: 8, marginBottom: 20 },
  logoText: { fontSize: 22, letterSpacing: -0.5 },
  logoSub: { fontSize: 14, textAlign: 'center' },
  label: { fontSize: 11, letterSpacing: 1.5, marginTop: 8 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14 },
  atSign: { fontSize: 16, paddingRight: 2 },
  inputInline: { flex: 1, paddingVertical: 12, fontSize: 15 },
  errorText: { fontSize: 14, marginTop: 4 },
  resetMessage: { fontSize: 14, marginTop: 4, lineHeight: 20, textAlign: 'center' },
  resetHint: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  saveBtn: { marginTop: 20, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 16 },
  forgotBtn: { alignItems: 'flex-end', marginTop: 4 },
  switchBtn: { alignItems: 'center', marginTop: 12 },
  switchText: { fontSize: 14 },
  birthdayHint: { fontSize: 12, lineHeight: 17 },
  body: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40, gap: 10 },
  avatarPreview: { alignItems: 'center', marginBottom: 16 },
  avatarCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 28 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18 },
  colorSwatchSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
});
