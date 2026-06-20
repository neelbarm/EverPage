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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import RegisterModal from '@/components/RegisterModal';

const SCR_W = Dimensions.get('window').width;
const H_PAD = 20;
const CARD_GAP = 10;
const ICON_CARD_W = Math.floor((SCR_W - H_PAD * 2 - CARD_GAP) / 2);

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
    backgroundColor: 'rgba(139,35,51,0.18)', top: -20,
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

const FEATURE_TILES: { title: string; body: string; bg: string }[] = [
  {
    title: 'Your Reading Shelf',
    body: 'Add books, track your progress page by page, and keep every title you\'re reading, or have ever read, in one beautiful place.',
    bg: '#C4AA82',
  },
  {
    title: 'Daily Streaks & Goals',
    body: 'Set a daily reading goal in minutes. Hit it every day to build your streak. Streak freezes keep your progress safe on busy days.',
    bg: '#A8C5D6',
  },
  {
    title: 'Read with Friends',
    body: 'See what your friends are reading right now, cheer each other on the leaderboard, and share quotes from the books you love.',
    bg: '#1B4A52',
  },
  {
    title: 'Beautiful Reading Stats',
    body: 'Charts of your reading minutes, pages per week, and a yearly Wrapped — a personal story of your reading year.',
    bg: '#8A2333',
  },
];

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const colors = useColors();
  const { resolvedScheme } = useTheme();
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

  // Theme-dependent colors
  const splashBg = resolvedScheme === 'dark' ? '#380A0A' : '#EDE8DF';
  const headingColor = resolvedScheme === 'dark' ? '#f2e9db' : '#1C5A60';
  const mutedColor = resolvedScheme === 'dark' ? 'rgba(242,233,219,0.65)' : 'rgba(28,90,96,0.65)';
  const iconCardBg = resolvedScheme === 'dark' ? '#4E1212' : '#E0D9CF';
  const quoteCardBg = resolvedScheme === 'dark' ? '#f2e9db' : '#FFFFFF';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* Splash */}
      {phase === 'splash' && (
        <Animated.View style={[styles.splash, { opacity: splashOpacity, backgroundColor: splashBg }]} pointerEvents="none">
          <FlippingBook />
          <View style={styles.splashTextGroup}>
            <Animated.Text
              style={[styles.splashName, {
                color: headingColor,
                opacity: splashNameAnim,
                transform: [{ translateY: splashNameAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              }]}
            >
              EverPage
            </Animated.Text>
            <Animated.Text
              style={[styles.splashSub, {
                color: mutedColor,
                opacity: splashSubAnim,
                transform: [{ translateY: splashSubAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
              }]}
            >
              Read together. Build your streak.
            </Animated.Text>
          </View>
        </Animated.View>
      )}

      {/* Landing */}
      {phase === 'landing' && (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: Math.max(insets.top, 44) + 16, paddingBottom: insets.bottom + 48 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero heading */}
          <Animated.View
            style={{
              opacity: heroAnim,
              transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
              alignItems: 'center',
              marginBottom: 24,
            }}
          >
            <Text style={[styles.appName, { color: headingColor }]}>EverPage</Text>
            <Text style={[styles.tagline, { color: headingColor }]}>
              Read together. Track everything.{'\n'}Build your streak.
            </Text>
          </Animated.View>

          {/* Two icon cards side by side */}
          <Animated.View
            style={{
              opacity: feat0,
              transform: [{ translateY: feat0.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
              flexDirection: 'row',
              gap: CARD_GAP,
              width: '100%',
              marginBottom: 12,
            }}
          >
            <View style={[styles.iconCard, { backgroundColor: iconCardBg, width: ICON_CARD_W }]}>
              <Ionicons name="book-outline" size={40} color={headingColor} />
            </View>
            <View style={[styles.iconCard, { backgroundColor: iconCardBg, width: ICON_CARD_W }]}>
              <Ionicons name="tablet-landscape-outline" size={40} color={headingColor} />
            </View>
          </Animated.View>

          {/* 2x2 feature tile grid */}
          <View style={styles.tileGrid}>
            {FEATURE_TILES.map((tile, i) => (
              <Animated.View
                key={tile.title}
                style={{
                  width: ICON_CARD_W,
                  opacity: featAnims[i],
                  transform: [{ translateY: featAnims[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
                }}
              >
                <View style={[styles.featureTile, { backgroundColor: tile.bg }]}>
                  <Text style={styles.featureTileTitle}>{tile.title}</Text>
                  <Text style={styles.featureTileBody}>{tile.body}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          {/* Quote card */}
          <Animated.View
            style={[
              styles.quoteBlock,
              {
                backgroundColor: quoteCardBg,
                opacity: quoteAnim,
                transform: [{ translateY: quoteAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
              },
            ]}
          >
            <Text style={styles.quoteText}>
              "A reader lives a thousand lives before he dies. The man who never reads lives only one."
            </Text>
            <Text style={styles.quoteAuthor}>- George R.R. Martin</Text>
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
                <Text style={styles.getStartedText}>Get Started – It's Free →</Text>
              </TouchableOpacity>
            </Animated.View>
            <TouchableOpacity onPress={openLogin} activeOpacity={0.7} style={styles.signinRow}>
              <Text style={[styles.signinText, { color: mutedColor }]}>
                Already have an account?{'  '}
                <Text style={[styles.signinLink, { color: headingColor }]}>Sign in</Text>
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
    fontSize: 42,
    fontFamily: 'Inter_700Bold', letterSpacing: -1,
  },
  splashSub: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular', letterSpacing: 0.3,
  },

  scroll: { alignItems: 'center', paddingHorizontal: H_PAD },

  appName: {
    fontSize: 46,
    fontFamily: 'Inter_700Bold', letterSpacing: -1.5,
    marginBottom: 10, textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24,
  },

  iconCard: {
    height: 130,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    width: '100%',
    marginBottom: 20,
  },

  featureTile: {
    borderRadius: 18,
    padding: 16,
    minHeight: 160,
    gap: 10,
    justifyContent: 'flex-start',
  },
  featureTileTitle: {
    fontSize: 15,
    color: '#ffffff',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  featureTileBody: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },

  quoteBlock: {
    borderRadius: 20,
    paddingVertical: 22, paddingHorizontal: 22,
    width: '100%', alignItems: 'center', gap: 10, marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  quoteText: {
    fontSize: 15, color: '#1C5A60',
    fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24,
    fontStyle: 'italic',
  },
  quoteAuthor: {
    fontSize: 13, color: '#1C5A60',
    fontFamily: 'Inter_500Medium', textAlign: 'center',
    opacity: 0.7,
  },

  cta: { width: '100%', alignItems: 'center', gap: 16 },
  getStartedBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    backgroundColor: '#A8C5D6',
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
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  signinLink: {
    fontFamily: 'Inter_700Bold',
  },
});
