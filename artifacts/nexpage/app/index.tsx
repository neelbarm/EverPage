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
  Image,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import RegisterModal from '@/components/RegisterModal';

const SCR_W = Dimensions.get('window').width;
const H_PAD = 20;
const CARD_GAP = 12;
const CONTENT_W = SCR_W - H_PAD * 2;
const TILE_W = Math.floor((CONTENT_W - CARD_GAP) / 2);

// Aspect ratios of the design assets (width / height)
const TITLE_AR = 1400 / 492;   // ~2.85
const BANNER_AR = 1400 / 470;  // ~2.98
const CTA_AR_LIGHT = 1264 / 729;  // ~1.73
const CTA_AR_DARK = 1928 / 1086;  // ~1.78

const ASSETS = {
  title_light: require('@/assets/landing/title_light.png'),
  title_dark: require('@/assets/landing/title_dark.png'),
  banner_light: require('@/assets/landing/banner_light.png'),
  banner_dark: require('@/assets/landing/banner_dark.png'),
  tile_shelf: require('@/assets/landing/tile_shelf.png'),
  tile_streaks: require('@/assets/landing/tile_streaks.png'),
  tile_friends: require('@/assets/landing/tile_friends.png'),
  tile_stats: require('@/assets/landing/tile_stats.png'),
  cta_light: require('@/assets/landing/cta_light.png'),
  cta_dark: require('@/assets/landing/cta_dark.png'),
};

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

const TILES = [
  ASSETS.tile_shelf,
  ASSETS.tile_streaks,
  ASSETS.tile_friends,
  ASSETS.tile_stats,
];

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const [phase, setPhase] = useState<'splash' | 'landing'>('splash');
  const [modalVisible, setModalVisible] = useState(false);
  const [defaultMode, setDefaultMode] = useState<'register' | 'login'>('register');

  const splashOpacity = useRef(new Animated.Value(1)).current;
  const landingOpacity = useRef(new Animated.Value(0)).current;

  const heroAnim = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const feat0 = useRef(new Animated.Value(0)).current;
  const feat1 = useRef(new Animated.Value(0)).current;
  const feat2 = useRef(new Animated.Value(0)).current;
  const feat3 = useRef(new Animated.Value(0)).current;
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
        Animated.spring(bannerAnim, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat0, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat1, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat2, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat3, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
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

  const splashBg = isDark ? '#380A0A' : '#EDE8DF';
  const headingColor = isDark ? '#f2e9db' : '#1C5A60';
  const mutedColor = isDark ? 'rgba(242,233,219,0.65)' : 'rgba(28,90,96,0.65)';

  // CTA image geometry — used to place transparent tap targets over the
  // "Get Started" button and "Sign in" text baked into the artwork.
  const ctaImg = isDark ? ASSETS.cta_dark : ASSETS.cta_light;
  const ctaAR = isDark ? CTA_AR_DARK : CTA_AR_LIGHT;
  const ctaH = CONTENT_W / ctaAR;

  // Explicit pixel heights (native iOS doesn't reliably constrain Image via aspectRatio)
  const titleH = CONTENT_W / TITLE_AR;
  const bannerH = CONTENT_W / BANNER_AR;

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
            { paddingTop: Math.max(insets.top, 44) + 12, paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Title + tagline */}
          <Animated.View
            style={{
              width: CONTENT_W,
              opacity: heroAnim,
              transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
              marginBottom: 18,
            }}
          >
            <Image
              source={isDark ? ASSETS.title_dark : ASSETS.title_light}
              style={{ width: CONTENT_W, height: titleH }}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Icon banner */}
          <Animated.View
            style={{
              width: CONTENT_W,
              opacity: bannerAnim,
              transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
              marginBottom: 20,
            }}
          >
            <Image
              source={isDark ? ASSETS.banner_dark : ASSETS.banner_light}
              style={{ width: CONTENT_W, height: bannerH }}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Feature tiles 2×2 */}
          <View style={styles.grid}>
            {TILES.map((tile, i) => (
              <Animated.View
                key={i}
                style={{
                  width: TILE_W,
                  opacity: featAnims[i],
                  transform: [{ translateY: featAnims[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
                }}
              >
                <Image
                  source={tile}
                  style={{ width: TILE_W, height: TILE_W }}
                  resizeMode="contain"
                />
              </Animated.View>
            ))}
          </View>

          {/* Quote + CTA (artwork with tap overlays) */}
          <Animated.View
            style={{
              width: CONTENT_W,
              marginTop: 22,
              opacity: ctaAnim,
              transform: [
                { translateY: ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                { scale: ctaPulse },
              ],
            }}
          >
            <Image
              source={ctaImg}
              style={{ width: CONTENT_W, height: ctaH }}
              resizeMode="contain"
            />
            {/* "Get Started" button tap target (~58%–84% of height) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={openRegister}
              style={{ position: 'absolute', left: 0, right: 0, top: ctaH * 0.56, height: ctaH * 0.28 }}
            />
            {/* "Sign in" tap target (bottom band) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={openLogin}
              style={{ position: 'absolute', left: 0, right: 0, top: ctaH * 0.86, height: ctaH * 0.14 }}
            />
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

  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: CARD_GAP, width: CONTENT_W, justifyContent: 'space-between',
  },
});
