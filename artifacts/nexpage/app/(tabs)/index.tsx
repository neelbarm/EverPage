import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View, Text, ScrollView, TouchableOpacity, Pressable, PanResponder, StyleSheet, Platform, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { BookCover } from '@/components/BookCover';
import { DailyGoalModal } from '@/components/DailyGoalModal';

function formatDate(): string {
  const d = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function ProgressBar({
  progress,
  height = 4,
  trackColor,
  fillColor,
}: {
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
}) {
  const colors = useColors();
  const clamped = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={{ height, backgroundColor: trackColor ?? colors.border, borderRadius: height / 2, overflow: 'hidden' }}>
      <View style={{ height, width: `${clamped * 100}%`, backgroundColor: fillColor ?? colors.primary, borderRadius: height / 2 }} />
    </View>
  );
}

export default function ShelfScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { books, streak, recommendedBooks, addBook, setDailyGoal, pendingFreezeEarned, clearPendingFreezeEarned, pendingGoalMet, clearPendingGoalMet } = useStore();
  const [showGoalModal, setShowGoalModal] = useState(false);
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const activeBooks = useMemo(() => books.filter(b => !b.finishedAt), [books]);
  const heroBook = activeBooks[0];
  const alsoReading = activeBooks.slice(1);
  const heroProgress = heroBook ? heroBook.currentPage / heroBook.totalPages : 0;

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [showToast, setShowToast] = useState(false);

  const goalToastOpacity = useRef(new Animated.Value(0)).current;
  const goalToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goalToastAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [showGoalToast, setShowGoalToast] = useState(false);

  const goalUpdatedToastOpacity = useRef(new Animated.Value(0)).current;
  const goalUpdatedToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goalUpdatedToastAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [showGoalUpdatedToast, setShowGoalUpdatedToast] = useState(false);
  const [goalUpdatedMinutes, setGoalUpdatedMinutes] = useState(0);

  const [selectedRec, setSelectedRec] = useState<typeof recommendedBooks[0] | null>(null);
  const [recPagesStr, setRecPagesStr] = useState('');
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && g.dy > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { if (g.dy > 0) sheetTranslateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(sheetTranslateY, { toValue: 700, duration: 220, useNativeDriver: true }).start(() => {
            setSelectedRec(null);
            sheetTranslateY.setValue(0);
          });
        } else {
          Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!pendingFreezeEarned) return;
    clearPendingFreezeEarned();
    setShowToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const anim = Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);
    toastAnim.current = anim;
    anim.start();
    toastTimer.current = setTimeout(() => setShowToast(false), 2720);
    return () => {
      anim.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pendingFreezeEarned]);

  useEffect(() => {
    if (!pendingGoalMet) return;
    clearPendingGoalMet();
    setShowGoalToast(true);
    if (goalToastTimer.current) clearTimeout(goalToastTimer.current);
    const anim = Animated.sequence([
      Animated.timing(goalToastOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(goalToastOpacity, { toValue: 0, duration: 340, useNativeDriver: true }),
    ]);
    goalToastAnim.current = anim;
    anim.start();
    goalToastTimer.current = setTimeout(() => setShowGoalToast(false), 3200);
    return () => {
      anim.stop();
      if (goalToastTimer.current) clearTimeout(goalToastTimer.current);
    };
  }, [pendingGoalMet]);

  function dismissGoalToast() {
    if (goalToastAnim.current) goalToastAnim.current.stop();
    if (goalToastTimer.current) clearTimeout(goalToastTimer.current);
    Animated.timing(goalToastOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setShowGoalToast(false);
    });
    router.navigate('/(tabs)/stats');
  }

  function triggerGoalUpdatedToast(minutes: number) {
    setGoalUpdatedMinutes(minutes);
    setShowGoalUpdatedToast(true);
    if (goalUpdatedToastTimer.current) clearTimeout(goalUpdatedToastTimer.current);
    if (goalUpdatedToastAnim.current) goalUpdatedToastAnim.current.stop();
    goalUpdatedToastOpacity.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(goalUpdatedToastOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(goalUpdatedToastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);
    goalUpdatedToastAnim.current = anim;
    anim.start();
    goalUpdatedToastTimer.current = setTimeout(() => setShowGoalUpdatedToast(false), 2320);
  }

  function dismissFreezeToast() {
    if (toastAnim.current) toastAnim.current.stop();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.timing(toastOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setShowToast(false);
    });
    router.navigate('/(tabs)/you');
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={[styles.dateText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{formatDate()}</Text>
          <Text style={[styles.shelfLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Your shelf</Text>
        </View>
        <TouchableOpacity
          style={[styles.streakBadge, { backgroundColor: colors.tabBar }]}
          onPress={() => router.push('/(tabs)/stats')}
          activeOpacity={0.8}
        >
          <Text style={[styles.streakNum, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {streak.currentStreak}
          </Text>
          <Text style={[styles.streakLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {'day\nstreak'}
          </Text>
        </TouchableOpacity>
      </View>

      {streak.dailyGoalMinutes > 0 && (() => {
        const pct = Math.min(streak.todayMinutes / streak.dailyGoalMinutes, 1);
        const met = streak.todayMinutes >= streak.dailyGoalMinutes;
        return (
          <TouchableOpacity
            style={[styles.goalStrip, { backgroundColor: colors.card, borderColor: met ? '#3A6645' : colors.border }]}
            onPress={() => setShowGoalModal(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.goalStripIcon, { backgroundColor: met ? '#e8f4ed' : colors.muted }]}>
              <Feather name={met ? 'check' : 'target'} size={13} color={met ? '#3A6645' : colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <View style={styles.goalStripRow}>
                <Text style={[styles.goalStripText, { color: met ? '#3A6645' : colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  {met ? 'Daily goal complete!' : `${streak.todayMinutes} of ${streak.dailyGoalMinutes} min`}
                </Text>
                <Text style={[styles.goalStripPct, { color: met ? '#3A6645' : colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                  {Math.round(pct * 100)}%
                </Text>
              </View>
              <View style={[styles.goalStripTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.goalStripFill, { width: `${pct * 100}%` as any, backgroundColor: met ? '#3A6645' : colors.primary }]} />
              </View>
            </View>
            <Feather name="edit-2" size={12} color={met ? '#3A6645' : colors.mutedForeground} style={{ opacity: 0.6 }} />
          </TouchableOpacity>
        );
      })()}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : 24 }}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : 'never'}
        showsVerticalScrollIndicator={false}
      >
        {activeBooks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>No books yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Tap the + tab to add your first book
            </Text>
          </View>
        ) : (
          <>
            {heroBook && (
              <TouchableOpacity
                style={[styles.heroCard, { backgroundColor: colors.teal, borderColor: 'transparent' }]}
                onPress={() => router.push(`/book/${heroBook.id}`)}
                activeOpacity={0.92}
              >
                <Text style={[styles.continueLabel, { color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter_700Bold' }]}>CONTINUE</Text>
                <View style={styles.heroContent}>
                  <BookCover bookId={heroBook.id} coverColor={heroBook.coverColor} coverImageUri={heroBook.coverImageUri} width={82} height={120} borderRadius={8} />
                  <View style={styles.heroInfo}>
                    <Text style={[styles.heroTitle, { color: '#ffffff', fontFamily: 'Inter_700Bold' }]} numberOfLines={2}>
                      {heroBook.title}
                    </Text>
                    <Text style={[styles.heroAuthor, { color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter_400Regular' }]}>
                      {heroBook.author}
                    </Text>
                    <View style={styles.heroProgressRow}>
                      <Text style={[styles.heroPages, { color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter_500Medium' }]}>
                        p. {heroBook.currentPage} / {heroBook.totalPages}
                      </Text>
                      <Text style={[styles.heroPct, { color: '#ffffff', fontFamily: 'Inter_700Bold' }]}>
                        {Math.round(heroProgress * 100)}%
                      </Text>
                    </View>
                    <ProgressBar
                      progress={heroProgress}
                      height={5}
                      trackColor="rgba(255,255,255,0.25)"
                      fillColor="rgba(255,255,255,0.9)"
                    />
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {alsoReading.length > 0 && (
              <View style={styles.alsoSection}>
                <View style={styles.alsoHeader}>
                  <Text style={[styles.alsoLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>ALSO READING</Text>
                  <Text style={[styles.alsoCount, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {alsoReading.length} book{alsoReading.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                {alsoReading.map((book, i) => {
                  const pct = Math.round((book.currentPage / book.totalPages) * 100);
                  return (
                    <TouchableOpacity
                      key={book.id}
                      style={[styles.alsoRow, { borderBottomColor: colors.border, borderBottomWidth: i < alsoReading.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                      onPress={() => router.push(`/book/${book.id}`)}
                      activeOpacity={0.8}
                    >
                      <BookCover bookId={book.id} coverColor={book.coverColor} coverImageUri={book.coverImageUri} width={40} height={56} borderRadius={4} />
                      <View style={styles.alsoInfo}>
                        <Text style={[styles.alsoTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                          {book.title}
                        </Text>
                        <Text style={[styles.alsoMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                          {book.author} · {pct}%
                        </Text>
                        <ProgressBar progress={book.currentPage / book.totalPages} height={3} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {recommendedBooks.length > 0 && (
              <View style={[styles.recSection, { backgroundColor: colors.primary, borderRadius: 18 }]}>
                <Text style={[styles.recLabel, { color: 'rgba(255,255,255,0.72)', fontFamily: 'Inter_600SemiBold' }]}>PICKED FOR YOU</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 2 }}>
                  {recommendedBooks.map(book => (
                    <TouchableOpacity
                      key={book.id}
                      style={[styles.recCard, { backgroundColor: '#ffffff', borderColor: 'transparent' }]}
                      onPress={() => { setSelectedRec(book); setRecPagesStr(''); }}
                      activeOpacity={0.85}
                    >
                      <BookCover bookId={book.id} coverColor={book.coverColor} coverImageUri={book.coverImageUri} width={140} height={90} borderRadius={0} />
                      <View style={styles.recBody}>
                        <Text style={[styles.recTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>{book.title}</Text>
                        <Text style={[styles.recAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{book.author}</Text>
                        <Text style={[styles.recReason, { color: colors.teal, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{book.reason}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {showGoalToast && (
        <Animated.View
          style={[styles.goalToast, { backgroundColor: '#e8f4ed', borderColor: '#3A6645', opacity: goalToastOpacity }]}
        >
          <Text style={[styles.goalToastText, { color: '#2a5235', fontFamily: 'Inter_700Bold' }]}>
            🎉 Daily goal reached!
          </Text>
          <Text style={[styles.goalToastSub, { color: '#3A6645', fontFamily: 'Inter_400Regular' }]}>
            {streak.todayMinutes} min read today · keep it up!
          </Text>
          <Pressable onPress={dismissGoalToast} style={StyleSheet.absoluteFillObject} />
        </Animated.View>
      )}

      {showGoalUpdatedToast && (
        <Animated.View
          style={[styles.freezeToast, { backgroundColor: colors.card, borderColor: colors.primary, opacity: goalUpdatedToastOpacity }]}
        >
          <Text style={[styles.freezeToastText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            Goal updated to {goalUpdatedMinutes} min ✓
          </Text>
        </Animated.View>
      )}

      {showToast && (
        <Animated.View
          style={[styles.freezeToast, { backgroundColor: colors.card, borderColor: colors.primary, opacity: toastOpacity }]}
        >
          <Text style={[styles.freezeToastText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            ❄️ You earned a streak freeze! ({streak.freezesLeft} left)
          </Text>
          <Pressable onPress={dismissFreezeToast} style={StyleSheet.absoluteFillObject} />
        </Animated.View>
      )}

      <DailyGoalModal
        visible={showGoalModal}
        initialMinutes={streak.dailyGoalMinutes}
        onSave={(minutes) => { setDailyGoal(minutes); setShowGoalModal(false); triggerGoalUpdatedToast(minutes); }}
        onClose={() => setShowGoalModal(false)}
      />

      <Modal
        visible={!!selectedRec}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedRec(null)}
      >
        <View style={styles.recModalOverlay}>
          {/* Tap dim area to dismiss — sibling to sheet so sheet buttons aren't blocked */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSelectedRec(null)} />
          <Animated.View
            style={[styles.recModalSheet, { backgroundColor: colors.card, transform: [{ translateY: sheetTranslateY }] }]}
            {...panResponder.panHandlers}
          >
            {/* Handle bar — tap or swipe down to dismiss */}
            <Pressable onPress={() => setSelectedRec(null)} style={styles.recModalHandleHitArea}>
              <View style={[styles.recModalHandle, { backgroundColor: colors.border }]} />
            </Pressable>
            {selectedRec && (
              <>
                <View style={styles.recModalHeader}>
                  <TouchableOpacity
                    style={styles.recModalClose}
                    onPress={() => setSelectedRec(null)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Feather name="x" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                  <BookCover
                    bookId={selectedRec.id}
                    coverColor={selectedRec.coverColor}
                    coverImageUri={selectedRec.coverImageUri}
                    width={72}
                    height={104}
                    borderRadius={8}
                  />
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={[styles.recModalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={3}>
                      {selectedRec.title}
                    </Text>
                    <Text style={[styles.recModalAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      {selectedRec.author}
                    </Text>
                    <Text style={[styles.recModalReason, { color: colors.accent, fontFamily: 'Inter_400Regular' }]}>
                      {selectedRec.reason}
                    </Text>
                    {selectedRec.friendsCount > 0 && (
                      <Text style={[styles.recModalFriends, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        {selectedRec.friendsCount} friend{selectedRec.friendsCount !== 1 ? 's' : ''} reading this
                      </Text>
                    )}
                  </View>
                </View>
                <View style={[styles.recModalPageRow, { borderColor: colors.border }]}>
                  <Text style={[styles.recModalPageLabel, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>
                    Total pages
                  </Text>
                  <TextInput
                    style={[styles.recModalPageInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
                    value={recPagesStr}
                    onChangeText={setRecPagesStr}
                    keyboardType="number-pad"
                    placeholder="e.g. 320"
                    placeholderTextColor={colors.mutedForeground}
                    maxLength={5}
                  />
                </View>
                <View style={styles.recModalActions}>
                  <TouchableOpacity
                    style={[styles.recModalAddBtn, { backgroundColor: colors.primary, opacity: recPagesStr.trim() && parseInt(recPagesStr, 10) > 0 ? 1 : 0.45 }]}
                    disabled={!recPagesStr.trim() || parseInt(recPagesStr, 10) <= 0}
                    onPress={() => {
                      const pages = parseInt(recPagesStr, 10);
                      if (!pages || pages <= 0) return;
                      addBook(selectedRec.title, selectedRec.author, pages, 'Literary Fiction', selectedRec.coverImageUri);
                      setSelectedRec(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.recModalAddText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>Add to my shelf</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.recModalDismissBtn, { borderColor: colors.border }]}
                    onPress={() => setSelectedRec(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.recModalDismissText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Not for me</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 16,
  },
  dateText: { fontSize: 13, marginBottom: 2 },
  shelfLabel: { fontSize: 26, letterSpacing: -0.5 },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, gap: 7,
  },
  streakNum: { fontSize: 22, lineHeight: 26 },
  streakLabel: { fontSize: 11, lineHeight: 14 },
  goalStrip: {
    marginHorizontal: 16, marginBottom: 10, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  goalStripIcon: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  goalStripRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalStripText: { fontSize: 13 },
  goalStripPct: { fontSize: 13 },
  goalStripTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  goalStripFill: { height: 4, borderRadius: 2 },
  heroCard: {
    marginHorizontal: 16, marginBottom: 8, borderRadius: 18, borderWidth: 1,
    padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  continueLabel: { fontSize: 11, letterSpacing: 1.5, marginBottom: 12 },
  heroContent: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  heroInfo: { flex: 1, gap: 7 },
  heroTitle: { fontSize: 18, lineHeight: 24, letterSpacing: -0.3 },
  heroAuthor: { fontSize: 14 },
  heroProgressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroPages: { fontSize: 13 },
  heroPct: { fontSize: 15 },
  alsoSection: { marginTop: 8, marginHorizontal: 16 },
  alsoHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  alsoLabel: { fontSize: 11, letterSpacing: 1.5 },
  alsoCount: { fontSize: 13 },
  alsoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  alsoInfo: { flex: 1, gap: 4 },
  alsoTitle: { fontSize: 15, letterSpacing: -0.2 },
  alsoMeta: { fontSize: 13 },
  emptyState: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, paddingTop: 80, gap: 12,
  },
  emptyTitle: { fontSize: 18 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  recSection: { marginTop: 16, marginHorizontal: 16, gap: 10, padding: 14 },
  recLabel: { fontSize: 11, letterSpacing: 1.5 },
  recCard: { width: 140, borderRadius: 12, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  recBody: { padding: 10, gap: 2 },
  recTitle: { fontSize: 13, lineHeight: 17, letterSpacing: -0.2 },
  recAuthor: { fontSize: 12 },
  recReason: { fontSize: 11, marginTop: 2 },
  goalToast: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 3,
    shadowColor: '#3A6645',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  goalToastText: { fontSize: 16, letterSpacing: -0.2 },
  goalToastSub: { fontSize: 13 },
  freezeToast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  freezeToastText: { fontSize: 15, letterSpacing: -0.1 },
  recModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  recModalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
  },
  recModalHandleHitArea: {
    alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 32, marginBottom: 4,
  },
  recModalHandle: {
    width: 36, height: 4, borderRadius: 2,
  },
  recModalHeader: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  recModalClose: { position: 'absolute', top: 0, right: 0, zIndex: 1, padding: 2 },
  recModalTitle: { fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  recModalAuthor: { fontSize: 14 },
  recModalReason: { fontSize: 13, fontStyle: 'italic' },
  recModalFriends: { fontSize: 12 },
  recModalPageRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, paddingTop: 16,
  },
  recModalPageLabel: { fontSize: 15 },
  recModalPageInput: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 15, minWidth: 100, textAlign: 'center',
  },
  recModalActions: { gap: 10 },
  recModalAddBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  recModalAddText: { fontSize: 16 },
  recModalDismissBtn: {
    borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1,
  },
  recModalDismissText: { fontSize: 15 },
});
