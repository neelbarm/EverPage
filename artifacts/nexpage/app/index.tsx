import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import RegisterModal from '@/components/RegisterModal';

const PALETTE = {
  bg: '#f2e9db',
  fg: '#1a1732',
  muted: '#8a7865',
  primary: '#8a2333',
  card: '#ffffff',
  border: '#e8ddd0',
  tan: '#C4946A',
  blue: '#6AB5D0',
  teal: '#2B5973',
  wine: '#8a2333',
  ctaBtn: '#6AADCB',
};

const FEATURES: { emoji: string; title: string; description: string; bg: string }[] = [
  {
    emoji: '📚',
    title: 'Your Reading Shelf',
    description: 'Track every book page by page. Keep everything you\'re reading — or have ever read — in one beautiful place.',
    bg: PALETTE.tan,
  },
  {
    emoji: '🔥',
    title: 'Daily Streaks & Goals',
    description: 'Set a daily goal in minutes and build your streak. Streak freezes keep your progress safe on busy days.',
    bg: PALETTE.blue,
  },
  {
    emoji: '👥',
    title: 'Read with Friends',
    description: 'See what friends are reading, climb the leaderboard together, and share quotes from books you love.',
    bg: PALETTE.teal,
  },
  {
    emoji: '✨',
    title: 'Beautiful Reading Stats',
    description: 'Weekly charts, all-time totals, and a yearly Wrapped — a personal story of your reading year.',
    bg: PALETTE.wine,
  },
];

const PAGE_W = 54;
const PAGE_H = 74;

function FlippingBook() {
  const scaleIn = useRef(new Animated.Value(0)).current;
  const flipAnim = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleIn, {
      toValue: 1,
      tension: 55,
      friction: 7,
      delay: 150,
      useNativeDriver: true,
    }).start();

    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(flipAnim, {
            toValue: 1,
            duration: 850,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(320),
          Animated.timing(flipAnim, {
            toValue: 0,
            duration: 850,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(900),
        ])
      ).start();
    }, 700);

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const rightPageScaleX = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 1],
  });
  const rightPageBg = flipAnim.interpolate({
    inputRange: [0, 0.49, 0.5, 1],
    outputRange: ['#fff8f0', '#fff8f0', '#eee4d6', '#eee4d6'],
  });
  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.32] });

  return (
    <Animated.View style={{ transform: [{ scale: scaleIn }], alignItems: 'center' }}>
      <Animated.View style={[bookStyles.glow, { transform: [{ scale: glowScale }], opacity: glowOpacity }]} />
      <View style={bookStyles.book}>
        <View style={[bookStyles.page, { backgroundColor: '#faf5ed' }]}>
          <View style={{ gap: 7, paddingTop: 6 }}>
            {[72, 88, 60, 92, 76, 68, 84].map((w, i) => (
              <View key={i} style={[bookStyles.line, { width: `${w}%` as any }]} />
            ))}
          </View>
        </View>
        <View style={bookStyles.spine} />
        <Animated.View
          style={[
            bookStyles.page,
            { backgroundColor: rightPageBg as any },
            { transform: [{ translateX: -(PAGE_W / 2) }, { scaleX: rightPageScaleX }, { translateX: PAGE_W / 2 }] },
          ]}
        >
          <View style={{ gap: 7, paddingTop: 6 }}>
            {[82, 66, 90, 72, 86, 58, 78].map((w, i) => (
              <View key={i} style={[bookStyles.line, { width: `${w}%` as any }]} />
            ))}
          </View>
        </Animated.View>
      </View>
      <View style={bookStyles.bookShadow} />
    </Animated.View>
  );
}

const bookStyles = StyleSheet.create({
  glow: {
    position: 'absolute',
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: PALETTE.primary,
    top: -20,
  },
  book: {
    flexDirection: 'row',
    width: PAGE_W * 2 + 10,
    height: PAGE_H + 20,
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#201b15',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  page: { width: PAGE_W, height: PAGE_H + 20, padding: 9 },
  spine: { width: 10, height: PAGE_H + 20, backgroundColor: PALETTE.primary },
  line: { height: 4, backgroundColor: '#ddd0be', borderRadius: 2 },
  bookShadow: {
    width: 80, height: 10, borderRadius: 40,
    backgroundColor: '#201b15', opacity: 0.12,
    marginTop: 6, alignSelf: 'center',
  },
});

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const [phase, setPhase] = useState<'splash' | 'landing'>('splash');
  const [modalVisible, setModalVisible] = useState(false);
  const [defaultMode, setDefaultMode] = useState<'register' | 'login'>('register');

  const splashOpacity = useRef(new Animated.Value(1)).current;
  const landingOpacity = useRef(new Animated.Value(0)).current;

  const heroAnim = useRef(new Animated.Value(0)).current;
  const booksAnim = useRef(new Animated.Value(0)).current;
  const feat0 = useRef(new Animated.Value(0)).current;
  const feat1 = useRef(new Animated.Value(0)).current;
  const feat2 = useRef(new Animated.Value(0)).current;
  const feat3 = useRef(new Animated.Value(0)).current;
  const quoteAnim = useRef(new Animated.Value(0)).current;
  const ctaAnim = useRef(new Animated.Value(0)).current;
  const ctaPulse = useRef(new Animated.Value(1)).current;

  const splashNameAnim = useRef(new Animated.Value(0)).current;
  const splashSubAnim = useRef(new Animated.Value(0)).current;

  const authDoneRef = useRef(false);
  const timerDoneRef = useRef(false);

  function doTransition() {
    if (!authDoneRef.current || !timerDoneRef.current) return;
    Animated.parallel([
      Animated.timing(splashOpacity, { toValue: 0, duration: 380, useNativeDriver: true }),
      Animated.timing(landingOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start(() => {
      setPhase('landing');
      Animated.stagger(65, [
        Animated.spring(heroAnim, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(booksAnim, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat0, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat1, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat2, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat3, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(quoteAnim, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(ctaAnim, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(ctaPulse, { toValue: 1.025, duration: 950, useNativeDriver: true }),
            Animated.timing(ctaPulse, { toValue: 1, duration: 950, useNativeDriver: true }),
          ])
        ).start();
      });
    });
  }

  useEffect(() => {
    Animated.sequence([
      Animated.delay(400),
      Animated.timing(splashNameAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(100),
      Animated.timing(splashSubAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    const t = setTimeout(() => {
      timerDoneRef.current = true;
      doTransition();
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      authDoneRef.current = true;
      doTransition();
    }
  }, [isLoading]);

  if (isAuthenticated) return <Redirect href="/(tabs)" />;

  function openRegister() { setDefaultMode('register'); setModalVisible(true); }
  function openLogin() { setDefaultMode('login'); setModalVisible(true); }

  const featAnims = [feat0, feat1, feat2, feat3];

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }]}>

      {/* ── Splash ── */}
      {phase === 'splash' && (
        <Animated.View style={[styles.splash, { opacity: splashOpacity }]} pointerEvents="none">
          <FlippingBook />
          <View style={styles.splashTextGroup}>
            <Animated.Text
              style={[
                styles.splashName,
                {
                  opacity: splashNameAnim,
                  transform: [{ translateY: splashNameAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
                },
              ]}
            >
              EverPage
            </Animated.Text>
            <Animated.Text
              style={[
                styles.splashSub,
                {
                  opacity: splashSubAnim,
                  transform: [{ translateY: splashSubAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                },
              ]}
            >
              Read together. Build your streak.
            </Animated.Text>
          </View>
        </Animated.View>
      )}

      {/* ── Landing ── */}
      {phase === 'landing' && (
        <Animated.View style={[{ flex: 1 }, { opacity: landingOpacity }]}>
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              { paddingTop: Math.max(insets.top, 44) + 24, paddingBottom: insets.bottom + 32 },
            ]}
            showsVerticalScrollIndicator={false}
          >

            {/* Hero */}
            <Animated.View
              style={{
                opacity: heroAnim,
                transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
                alignItems: 'center',
                marginBottom: 28,
              }}
            >
              <Text style={styles.appName}>EverPage</Text>
              <Text style={styles.tagline}>
                Read together. Track everything.{'\n'}Build your streak.
              </Text>
            </Animated.View>

            {/* Book illustrations card */}
            <Animated.View
              style={[
                styles.booksCard,
                {
                  opacity: booksAnim,
                  transform: [{ translateY: booksAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
                },
              ]}
            >
              <Text style={styles.bookEmoji}>📘</Text>
              <Text style={[styles.bookEmoji, styles.bookEmojiCenter]}>📚</Text>
              <Text style={styles.bookEmoji}>📱</Text>
            </Animated.View>

            {/* 2×2 feature grid */}
            <View style={styles.grid}>
              {FEATURES.map((f, i) => (
                <Animated.View
                  key={f.title}
                  style={[
                    styles.featureCard,
                    { backgroundColor: f.bg },
                    {
                      opacity: featAnims[i],
                      transform: [{ translateY: featAnims[i].interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
                    },
                  ]}
                >
                  <Text style={styles.featureEmoji}>{f.emoji}</Text>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.description}</Text>
                </Animated.View>
              ))}
            </View>

            {/* Quote */}
            <Animated.View
              style={[
                styles.quoteBlock,
                {
                  opacity: quoteAnim,
                  transform: [{ translateY: quoteAnim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
                },
              ]}
            >
              <Text style={styles.quoteText}>
                A reader lives a thousand lives before he dies. The man who never reads lives only one.
              </Text>
              <Text style={styles.quoteAuthor}>- George R.R. Martin</Text>
            </Animated.View>

            {/* CTA */}
            <Animated.View
              style={[
                styles.cta,
                {
                  opacity: ctaAnim,
                  transform: [{ translateY: ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
                },
              ]}
            >
              <Animated.View style={{ width: '100%', transform: [{ scale: ctaPulse }] }}>
                <TouchableOpacity style={styles.getStartedBtn} onPress={openRegister} activeOpacity={0.85}>
                  <Text style={styles.getStartedText}>Get Started – It's Free  →</Text>
                </TouchableOpacity>
              </Animated.View>
              <TouchableOpacity onPress={openLogin} activeOpacity={0.7} style={styles.signinRow}>
                <Text style={styles.signinText}>
                  Already have an account?{'  '}
                  <Text style={styles.signinLink}>Sign in</Text>
                </Text>
              </TouchableOpacity>
            </Animated.View>

          </ScrollView>
        </Animated.View>
      )}

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

  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  splashTextGroup: {
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  splashName: {
    fontSize: 42,
    color: PALETTE.fg,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
  },
  splashSub: {
    fontSize: 15,
    color: PALETTE.muted,
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.3,
  },

  scroll: { alignItems: 'center', paddingHorizontal: 22 },

  appName: {
    fontSize: 44,
    color: PALETTE.fg,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1.5,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 16,
    color: PALETTE.muted,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 24,
  },

  booksCard: {
    backgroundColor: PALETTE.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.border,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 24,
    gap: 24,
    marginBottom: 16,
    shadowColor: '#201b15',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  bookEmoji: {
    fontSize: 52,
  },
  bookEmojiCenter: {
    fontSize: 64,
    marginTop: -6,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    marginBottom: 16,
  },
  featureCard: {
    width: '48.4%',
    borderRadius: 18,
    padding: 14,
    minHeight: 164,
    justifyContent: 'flex-start',
  },
  featureEmoji: {
    fontSize: 26,
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 14,
    color: '#ffffff',
    fontFamily: 'Inter_700Bold',
    lineHeight: 20,
    marginBottom: 6,
  },
  featureDesc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.88)',
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },

  quoteBlock: {
    backgroundColor: PALETTE.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.border,
    paddingVertical: 22,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  quoteText: {
    fontSize: 15,
    color: PALETTE.fg,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 24,
  },
  quoteAuthor: {
    fontSize: 13,
    color: PALETTE.muted,
    fontFamily: 'Inter_500Medium',
  },

  cta: { width: '100%', alignItems: 'center', gap: 14 },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.ctaBtn,
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 28,
    width: '100%',
    shadowColor: PALETTE.ctaBtn,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 5,
  },
  getStartedText: {
    fontSize: 16,
    color: '#ffffff',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  signinRow: { alignItems: 'center' },
  signinText: {
    fontSize: 13,
    color: PALETTE.muted,
    fontFamily: 'Inter_400Regular',
  },
  signinLink: {
    color: PALETTE.fg,
    fontFamily: 'Inter_700Bold',
  },
});
