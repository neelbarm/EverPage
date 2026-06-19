import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import RegisterModal from '@/components/RegisterModal';

const SCR_W = Dimensions.get('window').width;
const H_PAD = 20;
const CARD_GAP = 10;
const CARD_W = Math.floor((SCR_W - H_PAD * 2 - CARD_GAP) / 2);

const PALETTE = {
  bg: '#3C0A0A',
  fg: '#f2e9db',
  muted: 'rgba(242,233,219,0.60)',
  card: 'rgba(255,255,255,0.07)',
  cardBorder: 'rgba(242,233,219,0.12)',
  quoteCard: '#f2e9db',
  ctaBtn: '#7FB5C5',
  teal: '#1B6B72',
};

const FEATURES: { icon: string; title: string; body: string; color: string }[] = [
  { icon: 'book-outline', title: 'Your Shelf', body: 'Track every book, page by page.', color: '#7FB5C5' },
  { icon: 'flame-outline', title: 'Streaks', body: 'Daily goals. Unbroken momentum.', color: '#c87060' },
  { icon: 'people-outline', title: 'Friends', body: 'Read together. Share discoveries.', color: '#4A7A52' },
  { icon: 'bar-chart-outline', title: 'Stats', body: 'See your year in books.', color: '#b87355' },
];

const PAGE_W = 54;
const PAGE_H = 74;

function FlippingBook() {
  const scaleIn = useRef(new Animated.Value(0)).current;
  const flipAnim = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleIn, {
      toValue: 1, tension: 55, friction: 7, delay: 150, useNativeDriver: true,
    }).start();

    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(flipAnim, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.delay(320),
          Animated.timing(flipAnim, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
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

  const rightPageScaleX = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] });
  const rightPageBg = flipAnim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: ['#fff8f0', '#fff8f0', '#eee4d6', '#eee4d6'] });
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
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: PALETTE.bg, top: -20,
  },
  book: {
    flexDirection: 'row', width: PAGE_W * 2 + 10, height: PAGE_H + 20,
    borderRadius: 6, overflow: 'hidden',
    shadowColor: '#201b15', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28, shadowRadius: 18, elevation: 12,
  },
  page: { width: PAGE_W, height: PAGE_H + 20, padding: 9 },
  spine: { width: 10, height: PAGE_H + 20, backgroundColor: '#8a2333' },
  line: { height: 4, backgroundColor: '#ddd0be', borderRadius: 2 },
  bookShadow: {
    width: 80, height: 10, borderRadius: 40,
    backgroundColor: '#201b15', opacity: 0.12,
    marginTop: 6, alignSelf: 'center',
  },
});

function FeatureCard({ icon, title, body, color, anim }: {
  icon: string; title: string; body: string; color: string;
  anim: Animated.Value;
}) {
  return (
    <Animated.View
      style={{
        width: CARD_W,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}
    >
      <View style={[featureStyles.card, { borderColor: PALETTE.cardBorder }]}>
        <View style={[featureStyles.iconCircle, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon as any} size={22} color={color} />
        </View>
        <Text style={[featureStyles.cardTitle, { color: PALETTE.fg, fontFamily: 'Inter_700Bold' }]}>{title}</Text>
        <Text style={[featureStyles.cardBody, { color: PALETTE.muted, fontFamily: 'Inter_400Regular' }]}>{body}</Text>
      </View>
    </Animated.View>
  );
}

const featureStyles = StyleSheet.create({
  card: {
    backgroundColor: PALETTE.card,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    minHeight: 130,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, letterSpacing: -0.2 },
  cardBody: { fontSize: 13, lineHeight: 18 },
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
  const transitionedRef = useRef(false);

  function doTransition() {
    if (!authDoneRef.current || !timerDoneRef.current) return;
    if (transitionedRef.current) return;
    transitionedRef.current = true;

    Animated.timing(splashOpacity, { toValue: 0, duration: 380, useNativeDriver: true }).start(() => {
      setPhase('landing');
      landingOpacity.setValue(1);
      Animated.stagger(80, [
        Animated.spring(heroAnim, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
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
    }, 2800);
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
              style={[styles.splashName, {
                opacity: splashNameAnim,
                transform: [{ translateY: splashNameAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              }]}
            >
              EverPage
            </Animated.Text>
            <Animated.Text
              style={[styles.splashSub, {
                opacity: splashSubAnim,
                transform: [{ translateY: splashSubAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
              }]}
            >
              Read together. Build your streak.
            </Animated.Text>
          </View>
        </Animated.View>
      )}

      {/* ── Landing ── */}
      {phase === 'landing' && (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: Math.max(insets.top, 44) + 16, paddingBottom: insets.bottom + 48 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <Animated.View
            style={{
              opacity: heroAnim,
              transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
              alignItems: 'center',
              marginBottom: 28,
            }}
          >
            <Text style={styles.appName}>EverPage</Text>
            <Text style={styles.tagline}>
              Read together. Track everything.{'\n'}Build your streak.
            </Text>
          </Animated.View>

          {/* Feature grid */}
          <View style={styles.grid}>
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.title} {...f} anim={featAnims[i]} />
            ))}
          </View>

          {/* Divider line */}
          <Animated.View
            style={[styles.divider, { opacity: quoteAnim }]}
          />

          {/* Quote */}
          <Animated.View
            style={[
              styles.quoteBlock,
              {
                opacity: quoteAnim,
                transform: [{ translateY: quoteAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
              },
            ]}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color='rgba(74,16,16,0.5)' />
            <Text style={styles.quoteText}>
              "A reader lives a thousand lives before he dies. The man who never reads lives only one."
            </Text>
            <Text style={styles.quoteAuthor}>— George R.R. Martin</Text>
          </Animated.View>

          {/* CTA */}
          <Animated.View
            style={[
              styles.cta,
              {
                opacity: ctaAnim,
                transform: [{ translateY: ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
              },
            ]}
          >
            <Animated.View style={{ width: '100%', transform: [{ scale: ctaPulse }] }}>
              <TouchableOpacity style={styles.getStartedBtn} onPress={openRegister} activeOpacity={0.85}>
                <Text style={styles.getStartedText}>Get Started – It's Free</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
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
  splashTextGroup: { alignItems: 'center', gap: 8, marginTop: 24 },
  splashName: {
    fontSize: 42, color: PALETTE.fg,
    fontFamily: 'Inter_700Bold', letterSpacing: -1,
  },
  splashSub: {
    fontSize: 15, color: PALETTE.muted,
    fontFamily: 'Inter_400Regular', letterSpacing: 0.3,
  },

  scroll: { alignItems: 'center', paddingHorizontal: H_PAD },

  appName: {
    fontSize: 46, color: PALETTE.fg,
    fontFamily: 'Inter_700Bold', letterSpacing: -1.5,
    marginBottom: 10, textAlign: 'center',
  },
  tagline: {
    fontSize: 16, color: PALETTE.muted,
    fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24,
  },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: CARD_GAP, width: '100%', marginBottom: 20,
  },

  divider: {
    width: 40, height: 2, borderRadius: 1,
    backgroundColor: 'rgba(242,233,219,0.2)',
    marginBottom: 20,
  },

  quoteBlock: {
    backgroundColor: PALETTE.quoteCard,
    borderRadius: 20,
    paddingVertical: 22, paddingHorizontal: 22,
    width: '100%', alignItems: 'center', gap: 10, marginBottom: 28,
  },
  quoteText: {
    fontSize: 15, color: '#4A1010',
    fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24,
  },
  quoteAuthor: {
    fontSize: 13, color: '#7a3030',
    fontFamily: 'Inter_500Medium', textAlign: 'center',
  },

  cta: { width: '100%', alignItems: 'center', gap: 16 },
  getStartedBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    backgroundColor: PALETTE.ctaBtn,
    borderRadius: 50,
    paddingVertical: 17, paddingHorizontal: 28,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  getStartedText: {
    fontSize: 17, color: '#ffffff',
    fontFamily: 'Inter_700Bold', letterSpacing: 0.2,
  },
  signinRow: { alignItems: 'center' },
  signinText: {
    fontSize: 14, color: PALETTE.muted,
    fontFamily: 'Inter_400Regular',
  },
  signinLink: {
    color: PALETTE.fg, fontFamily: 'Inter_700Bold',
  },
});
