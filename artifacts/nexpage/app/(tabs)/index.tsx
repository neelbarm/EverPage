import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { BookCover } from '@/components/BookCover';

function formatDate(): string {
  const d = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function ProgressBar({ progress, height = 4 }: { progress: number; height?: number }) {
  const colors = useColors();
  const clamped = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={{ height, backgroundColor: colors.border, borderRadius: height / 2, overflow: 'hidden' }}>
      <View style={{ height, width: `${clamped * 100}%`, backgroundColor: colors.primary, borderRadius: height / 2 }} />
    </View>
  );
}

export default function ShelfScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { books, streak, recommendedBooks, addBook, pendingFreezeEarned, clearPendingFreezeEarned } = useStore();
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const activeBooks = useMemo(() => books.filter(b => !b.finishedAt), [books]);
  const heroBook = activeBooks[0];
  const alsoReading = activeBooks.slice(1);
  const heroProgress = heroBook ? heroBook.currentPage / heroBook.totalPages : 0;

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [selectedRec, setSelectedRec] = useState<typeof recommendedBooks[0] | null>(null);
  const [recPagesStr, setRecPagesStr] = useState('');

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
    anim.start();
    toastTimer.current = setTimeout(() => setShowToast(false), 2720);
    return () => {
      anim.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pendingFreezeEarned]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={[styles.dateText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{formatDate()}</Text>
          <Text style={[styles.shelfLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Your shelf</Text>
        </View>
        <TouchableOpacity
          style={[styles.streakBadge, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/(tabs)/stats')}
          activeOpacity={0.8}
        >
          <Text style={[styles.streakNum, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
            {streak.currentStreak}
          </Text>
          <Text style={[styles.streakLabel, { color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular' }]}>
            {'day\nstreak'}
          </Text>
        </TouchableOpacity>
      </View>

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
                style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/book/${heroBook.id}`)}
                activeOpacity={0.92}
              >
                <Text style={[styles.continueLabel, { color: colors.accent, fontFamily: 'Inter_700Bold' }]}>CONTINUE</Text>
                <View style={styles.heroContent}>
                  <BookCover bookId={heroBook.id} coverColor={heroBook.coverColor} coverImageUri={heroBook.coverImageUri} width={82} height={120} borderRadius={8} />
                  <View style={styles.heroInfo}>
                    <Text style={[styles.heroTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={2}>
                      {heroBook.title}
                    </Text>
                    <Text style={[styles.heroAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      {heroBook.author}
                    </Text>
                    <View style={styles.heroProgressRow}>
                      <Text style={[styles.heroPages, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                        p. {heroBook.currentPage} / {heroBook.totalPages}
                      </Text>
                      <Text style={[styles.heroPct, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
                        {Math.round(heroProgress * 100)}%
                      </Text>
                    </View>
                    <ProgressBar progress={heroProgress} height={5} />
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
              <View style={styles.recSection}>
                <Text style={[styles.recLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>PICKED FOR YOU</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 2 }}>
                  {recommendedBooks.map(book => (
                    <TouchableOpacity
                      key={book.id}
                      style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => { setSelectedRec(book); setRecPagesStr(''); }}
                      activeOpacity={0.85}
                    >
                      <BookCover bookId={book.id} coverColor={book.coverColor} coverImageUri={book.coverImageUri} width={140} height={90} borderRadius={0} />
                      <View style={styles.recBody}>
                        <Text style={[styles.recTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>{book.title}</Text>
                        <Text style={[styles.recAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{book.author}</Text>
                        <Text style={[styles.recReason, { color: colors.accent, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{book.reason}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {showToast && (
        <Animated.View
          style={[styles.freezeToast, { backgroundColor: colors.card, borderColor: colors.primary, opacity: toastOpacity }]}
          pointerEvents="none"
        >
          <Text style={[styles.freezeToastText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            ❄️ You earned a streak freeze! ({streak.freezesLeft} left)
          </Text>
        </Animated.View>
      )}

      <Modal
        visible={!!selectedRec}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedRec(null)}
      >
        <View style={styles.recModalOverlay}>
          <View style={[styles.recModalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.recModalHandle, { backgroundColor: colors.border }]} />
            {selectedRec && (
              <>
                <View style={styles.recModalHeader}>
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
          </View>
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
  recSection: { marginTop: 16, marginHorizontal: 16, gap: 10 },
  recLabel: { fontSize: 11, letterSpacing: 1.5 },
  recCard: { width: 140, borderRadius: 12, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  recBody: { padding: 10, gap: 2 },
  recTitle: { fontSize: 13, lineHeight: 17, letterSpacing: -0.2 },
  recAuthor: { fontSize: 12 },
  recReason: { fontSize: 11, marginTop: 2 },
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
  recModalHandle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 4,
  },
  recModalHeader: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
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
