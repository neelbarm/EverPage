import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import RegisterModal from '@/components/RegisterModal';

const { width } = Dimensions.get('window');

const PALETTE = {
  bg: '#f2e9db',
  fg: '#201b15',
  muted: '#8a7865',
  primary: '#8a2333',
  primaryLight: '#a82a3f',
  card: '#faf5ed',
  border: '#ddd0be',
  accent: '#e8ddd0',
};

const FEATURES = [
  {
    icon: 'library-outline' as const,
    color: '#5C849E',
    title: 'Your Reading Shelf',
    description:
      'Add books, track your progress page by page, and keep every title you\'re reading — or have ever read — in one beautiful place.',
  },
  {
    icon: 'flame-outline' as const,
    color: '#B54935',
    title: 'Daily Streaks & Goals',
    description:
      'Set a daily reading goal in minutes. Hit it every day to build your streak. Streak freezes keep your progress safe on busy days.',
  },
  {
    icon: 'people-outline' as const,
    color: '#3A6645',
    title: 'Read With Friends',
    description:
      'See what your friends are reading right now, cheer each other on the leaderboard, and share quotes from the books you love.',
  },
  {
    icon: 'bar-chart-outline' as const,
    color: '#8B5E9E',
    title: 'Beautiful Reading Stats',
    description:
      'Charts of your reading minutes, pages per week, and a yearly Wrapped — a personal story of your reading year.',
  },
];

function FeatureCard({
  icon,
  color,
  title,
  description,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureCard}>
      <View style={[styles.featureIconWrap, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{description}</Text>
      </View>
    </View>
  );
}

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [defaultMode, setDefaultMode] = useState<'register' | 'login'>('register');

  if (isLoading) return null;
  if (isAuthenticated) return <Redirect href="/(tabs)" />;

  function openRegister() {
    setDefaultMode('register');
    setModalVisible(true);
  }

  function openLogin() {
    setDefaultMode('login');
    setModalVisible(true);
  }

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <View style={styles.logoBadge}>
              <Ionicons name="book" size={36} color="#fff" />
            </View>
          </View>
          <Text style={styles.appName}>NexPage</Text>
          <Text style={styles.tagline}>
            The social reading app for people who love books.
          </Text>
        </View>

        {/* Mock shelf preview */}
        <View style={styles.shelfPreview}>
          {[
            { color: '#5C849E', pct: 0.61 },
            { color: '#B54935', pct: 0.33 },
            { color: '#3A6645', pct: 0.12 },
            { color: '#8B5E9E', pct: 0.78 },
            { color: '#B08A3C', pct: 0.45 },
          ].map((b, i) => (
            <View key={i} style={[styles.bookSpine, { backgroundColor: b.color }]}>
              <View style={[styles.bookProgress, { height: `${b.pct * 100}%` }]} />
            </View>
          ))}
          <View style={styles.shelfFloor} />
        </View>
        <Text style={styles.shelfCaption}>Track every book you read</Text>

        {/* Features */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </View>

        {/* Quote */}
        <View style={styles.quoteBlock}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={PALETTE.muted} />
          <Text style={styles.quoteText}>
            "A reader lives a thousand lives before he dies. The man who never reads lives only one."
          </Text>
          <Text style={styles.quoteAuthor}>— George R.R. Martin</Text>
        </View>

        {/* CTA */}
        <View style={styles.cta}>
          <TouchableOpacity style={styles.getStartedBtn} onPress={openRegister} activeOpacity={0.85}>
            <Text style={styles.getStartedText}>Get Started — It's Free</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={openLogin} activeOpacity={0.7} style={styles.signinRow}>
            <Text style={styles.signinText}>Already have an account? </Text>
            <Text style={[styles.signinText, styles.signinLink]}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <RegisterModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        defaultMode={defaultMode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { alignItems: 'center', paddingHorizontal: 24 },

  hero: { alignItems: 'center', marginBottom: 32 },
  logoWrap: { marginBottom: 16 },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 38,
    color: PALETTE.fg,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 17,
    color: PALETTE.muted,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 280,
  },

  shelfPreview: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 120,
    backgroundColor: PALETTE.card,
    borderRadius: 16,
    padding: 20,
    paddingBottom: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: PALETTE.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  bookSpine: {
    flex: 1,
    height: 90,
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bookProgress: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.25)',
    position: 'absolute',
    bottom: 0,
  },
  shelfFloor: {
    position: 'absolute',
    bottom: 10,
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: PALETTE.border,
    borderRadius: 1,
  },
  shelfCaption: {
    fontSize: 13,
    color: PALETTE.muted,
    fontFamily: 'Inter_400Regular',
    marginBottom: 32,
  },

  features: { width: '100%', gap: 12, marginBottom: 32 },
  featureCard: {
    backgroundColor: PALETTE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.border,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  featureIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: { flex: 1 },
  featureTitle: {
    fontSize: 15,
    color: PALETTE.fg,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    color: PALETTE.muted,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },

  quoteBlock: {
    backgroundColor: PALETTE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.border,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    gap: 10,
    marginBottom: 36,
  },
  quoteText: {
    fontSize: 14,
    color: PALETTE.fg,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  quoteAuthor: {
    fontSize: 13,
    color: PALETTE.muted,
    fontFamily: 'Inter_500Medium',
  },

  cta: { width: '100%', alignItems: 'center', gap: 16 },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PALETTE.primary,
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  getStartedText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
  },
  signinRow: { flexDirection: 'row' },
  signinText: {
    fontSize: 14,
    color: PALETTE.muted,
    fontFamily: 'Inter_400Regular',
  },
  signinLink: {
    color: PALETTE.primary,
    fontFamily: 'Inter_600SemiBold',
  },
});
