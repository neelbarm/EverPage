import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
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
            duration: 520,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(180),
          Animated.timing(flipAnim, {
            toValue: 0,
            duration: 520,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(500),
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

  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });
  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.32],
  });

  return (
    <Animated.View style={{ transform: [{ scale: scaleIn }], alignItems: 'center' }}>
      <Animated.View
        style={[
          bookStyles.glow,
          { transform: [{ scale: glowScale }], opacity: glowOpacity },
        ]}
      />

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
            {
              transform: [
                { translateX: -(PAGE_W / 2) },
                { scaleX: rightPageScaleX },
                { translateX: PAGE_W / 2 },
              ],
            },
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
    width: 160,
    height: 160,
    borderRadius: 80,
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
  page: {
    width: PAGE_W,
    height: PAGE_H + 20,
    padding: 9,
  },
  spine: {
    width: 10,
    height: PAGE_H + 20,
    backgroundColor: PALETTE.primary,
  },
  line: {
    height: 4,
    backgroundColor: PALETTE.border,
    borderRadius: 2,
  },
  bookShadow: {
    width: 80,
    height: 10,
    borderRadius: 40,
    backgroundColor: '#201b15',
    opacity: 0.12,
    marginTop: 6,
    alignSelf: 'center',
  },
});

function AnimatedSection({
  anim,
  children,
  delay = 0,
}: {
  anim: Animated.Value;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [28, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

function FeatureCard({
  icon,
  color,
  title,
  description,
  anim,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  title: string;
  description: string;
  anim: Animated.Value;
}) {
  return (
    <Animated.View
      style={[
        styles.featureCard,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[styles.featureIconWrap, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{description}</Text>
      </View>
    </Animated.View>
  );
}

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const [phase, setPhase] = useState<'splash' | 'landing'>('splash');
  const [modalVisible, setModalVisible] = useState(false);
  const [defaultMode, setDefaultMode] = useState<'register' | 'login'>('register');

  const splashOpacity = useRef(new Animated.Value(1)).current;
  const landingOpacity = useRef(new Animated.Value(0)).current;

  const heroAnim = useRef(new Animated.Value(0)).current;
  const shelfAnim = useRef(new Animated.Value(0)).current;
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
      Animated.stagger(70, [
        Animated.spring(heroAnim, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(shelfAnim, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat0, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat1, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat2, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(feat3, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(quoteAnim, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.spring(ctaAnim, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(ctaPulse, { toValue: 1.03, duration: 900, useNativeDriver: true }),
            Animated.timing(ctaPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
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
    }, 2400);

    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      authDoneRef.current = true;
      doTransition();
    }
  }, [isLoading]);

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
      {phase === 'splash' && (
        <Animated.View
          style={[styles.splash, { opacity: splashOpacity }]}
          pointerEvents="none"
        >
          <FlippingBook />
          <Animated.Text
            style={[
              styles.splashName,
              {
                opacity: splashNameAnim,
                transform: [
                  {
                    translateY: splashNameAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
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
                transform: [
                  {
                    translateY: splashSubAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            Read together. Build your streak.
          </Animated.Text>
        </Animated.View>
      )}

      {phase === 'landing' && (
        <Animated.View style={[{ flex: 1 }, { opacity: landingOpacity }]}>
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              { paddingTop: Math.max(insets.top, 44) + 32, paddingBottom: insets.bottom + 24 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <AnimatedSection anim={heroAnim}>
              <View style={styles.hero}>
                <View style={styles.logoWrap}>
                  <View style={styles.logoBadge}>
                    <Ionicons name="book" size={36} color="#fff" />
                  </View>
                </View>
                <Text style={styles.appName}>EverPage</Text>
                <Text style={styles.tagline}>
                  Read together. Track everything.{'\n'}Build your streak.
                </Text>
              </View>
            </AnimatedSection>

            <AnimatedSection anim={shelfAnim}>
              <View style={styles.shelfPreview}>
                <View style={styles.shelfBooks}>
                  {[
                    { color: '#5C849E', h: 108 },
                    { color: '#B54935', h: 90 },
                    { color: '#3A6645', h: 120 },
                    { color: '#8B5E9E', h: 96 },
                    { color: '#B08A3C', h: 114 },
                    { color: '#4A7A52', h: 84 },
                    { color: '#5E7A9E', h: 102 },
                  ].map((b, i) => (
                    <View key={i} style={[styles.bookSpine, { backgroundColor: b.color, height: b.h }]} />
                  ))}
                </View>
                <View style={styles.shelfFloor} />
              </View>
              <Text style={styles.shelfCaption}>Track every book you read</Text>
            </AnimatedSection>

            <View style={styles.features}>
              {[feat0, feat1, feat2, feat3].map((anim, i) => (
                <FeatureCard key={FEATURES[i].title} {...FEATURES[i]} anim={anim} />
              ))}
            </View>

            <AnimatedSection anim={quoteAnim}>
              <View style={styles.quoteBlock}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={PALETTE.muted} />
                <Text style={styles.quoteText}>
                  "A reader lives a thousand lives before he dies. The man who never reads lives only one."
                </Text>
                <Text style={styles.quoteAuthor}>— George R.R. Martin</Text>
              </View>
            </AnimatedSection>

            <Animated.View
              style={[
                styles.cta,
                {
                  opacity: ctaAnim,
                  transform: [
                    {
                      translateY: ctaAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [28, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Animated.View style={{ width: '100%', transform: [{ scale: ctaPulse }] }}>
                <TouchableOpacity style={styles.getStartedBtn} onPress={openRegister} activeOpacity={0.85}>
                  <Text style={styles.getStartedText}>Get Started — It's Free</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
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
    gap: 28,
    zIndex: 10,
  },
  splashName: {
    fontSize: 42,
    color: PALETTE.fg,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
  },
  splashSub: {
    fontSize: 16,
    color: PALETTE.muted,
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.2,
  },

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
    backgroundColor: PALETTE.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
    width: '100%',
    borderWidth: 1,
    borderColor: PALETTE.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  shelfBooks: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    justifyContent: 'center',
  },
  bookSpine: {
    width: 34,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  shelfFloor: {
    marginTop: 4,
    height: 8,
    backgroundColor: PALETTE.border,
    marginHorizontal: -16,
  },
  shelfCaption: {
    fontSize: 13,
    color: PALETTE.muted,
    fontFamily: 'Inter_400Regular',
    marginBottom: 32,
    textAlign: 'center',
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
  signinRow: { alignItems: 'center' },
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
