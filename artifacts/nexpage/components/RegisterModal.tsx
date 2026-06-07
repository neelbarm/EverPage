import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useSocial } from '@/context/SocialContext';
import { useAuth } from '@/lib/auth';

const AVATAR_COLORS = [
  '#1C3A5A', '#5C849E', '#B54935', '#3A6645',
  '#8B5E9E', '#B08A3C', '#4A7A52', '#5E7A9E',
];

export default function RegisterModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const { registerUser, socialProfile } = useSocial();
  const { isAuthenticated, login } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const initial = (displayName.trim()[0] ?? '?').toUpperCase();

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

  async function handleSave() {
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

  if (!isAuthenticated) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Create Profile</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={styles.loginPrompt}>
            <Ionicons name="person-circle-outline" size={56} color={colors.mutedForeground} />
            <Text style={[styles.loginTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              Sign in to continue
            </Text>
            <Text style={[styles.loginText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              You need to be signed in to create a reader profile and follow friends.
            </Text>
            <TouchableOpacity
              style={[styles.loginBtn, { backgroundColor: colors.primary }]}
              onPress={login}
              activeOpacity={0.85}
            >
              <Text style={[styles.loginBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {socialProfile ? 'Edit Profile' : 'Create Profile'}
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
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={[styles.saveBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>
                  {socialProfile ? 'Save Changes' : 'Create Profile'}
                </Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 0 : 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, letterSpacing: -0.3 },
  loginPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 14 },
  loginTitle: { fontSize: 20, textAlign: 'center' },
  loginText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  loginBtn: { marginTop: 8, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 24 },
  loginBtnText: { fontSize: 15 },
  body: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40, gap: 10 },
  avatarPreview: { alignItems: 'center', marginBottom: 16 },
  avatarCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 28 },
  label: { fontSize: 11, letterSpacing: 1.5, marginTop: 8 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18 },
  colorSwatchSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14 },
  atSign: { fontSize: 16, paddingRight: 2 },
  inputInline: { flex: 1, paddingVertical: 12, fontSize: 15 },
  errorText: { fontSize: 14, marginTop: 4 },
  saveBtn: { marginTop: 20, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 16 },
});
