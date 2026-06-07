import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { BookCover } from '@/components/BookCover';

export default function FinishScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { getBook, finishBook, useStreakFreeze, streak, sessions, books, pendingFreezeEarned, clearPendingFreezeEarned } = useStore();
  const book = getBook(bookId ?? '');

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showToast, setShowToast] = useState(false);

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

  const bookSessions = sessions.filter(s => s.bookId === bookId);
  const totalMin = bookSessions.reduce((a, s) => a + s.durationMinutes, 0);
  const totalHours = Math.floor(totalMin / 60);
  const totalMinsRem = totalMin % 60;
  const sessionCount = bookSessions.length;
  const uniqueDays = new Set(bookSessions.map(s => s.date)).size;
  const daysDisplay = uniqueDays > 0 ? String(uniqueDays) : sessionCount > 0 ? '1' : '0';

  const [quote, setQuote] = useState(book?.favoriteQuote ?? '');
  const isAlreadyFinished = !!book?.finishedAt;

  const today = new Date().toISOString().split('T')[0];
  const needsFreeze = streak.freezesLeft > 0 && !streak.checkedDays.includes(today);

  const nextBook = books.find(b => !b.finishedAt && b.id !== bookId);

  function handleConfirmFinish() {
    if (!book || isAlreadyFinished) return;
    finishBook(book.id, quote.trim() || undefined);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function handleFreeze() {
    useStreakFreeze();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  if (!book) return <View style={[styles.root, { backgroundColor: colors.background }]} />;

  const closeBtnTop = insets.top + (Platform.OS === 'web' ? 67 : 12);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
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
      <TouchableOpacity
        style={[styles.closeBtn, { top: closeBtnTop }]}
        onPress={() => router.replace('/(tabs)')}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={24} color={colors.mutedForeground} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={{
          paddingTop: closeBtnTop + 40,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 50 : 32),
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.finishedLabel, { color: colors.accent, fontFamily: 'Inter_700Bold' }]}>FINISHED</Text>

        {/* Book summary */}
        <View style={[styles.bookCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <BookCover bookId={book.id} coverColor={book.coverColor} coverImageUri={book.coverImageUri} width={72} height={104} borderRadius={8} />
          <View style={styles.bookInfo}>
            <Text style={[styles.bookTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={2}>
              {book.title}
            </Text>
            <Text style={[styles.bookAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {book.author}
            </Text>
            <View style={styles.statsRow}>
              {[
                { val: daysDisplay, label: 'days' },
                { val: totalHours > 0 ? `${totalHours}h ${totalMinsRem}m` : totalMin > 0 ? `${totalMinsRem}m` : '5h', label: 'read' },
                { val: String(book.totalPages), label: 'pages' },
              ].map(s => (
                <View key={s.label} style={styles.statCell}>
                  <Text style={[styles.statVal, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{s.val}</Text>
                  <Text style={[styles.statLbl, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{s.label}</Text>
                </View>
              ))}
            </View>
            {book.favoriteQuote && (
              <Text style={[styles.quote, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', borderLeftColor: colors.accent }]} numberOfLines={3}>
                "{book.favoriteQuote}"
              </Text>
            )}
          </View>
        </View>

        {/* Streak card */}
        <View style={[styles.streakCard, { backgroundColor: colors.primary }]}>
          <View style={{ gap: 4 }}>
            <Text style={[styles.streakCaption, { color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_600SemiBold' }]}>DAY STREAK</Text>
            <Text style={[styles.streakNum, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{streak.currentStreak}</Text>
          </View>
          <Ionicons name="flame" size={44} color="rgba(255,255,255,0.25)" />
        </View>

        {/* Streak freeze */}
        {needsFreeze && (
          <View style={[styles.freezeCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.freezeTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              Missed yesterday?
            </Text>
            <Text style={[styles.freezeText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Use a streak freeze to protect your {streak.currentStreak}-day run. No streak lost.
            </Text>
            <TouchableOpacity
              style={[styles.freezeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleFreeze}
              activeOpacity={0.8}
            >
              <Text style={[styles.freezeBtnText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Use a freeze</Text>
            </TouchableOpacity>
            <Text style={[styles.freezeLeft, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {streak.freezesLeft} freeze{streak.freezesLeft !== 1 ? 's' : ''} left this month
            </Text>
          </View>
        )}

        {/* Next book */}
        {nextBook && (
          <View style={[styles.nextCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.nextCaption, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>UP NEXT</Text>
            {nextBook.friendsReading.length > 0 && (
              <Text style={[styles.nextFriends, { color: colors.accent, fontFamily: 'Inter_400Regular' }]}>
                {nextBook.friendsReading.length} friend{nextBook.friendsReading.length !== 1 ? 's' : ''} reading this
              </Text>
            )}
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.replace({ pathname: '/session/[bookId]', params: { bookId: nextBook.id } })}
              activeOpacity={0.88}
            >
              <Text style={[styles.nextBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>
                Start {nextBook.title}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Favorite quote input */}
        {!isAlreadyFinished && (
          <View style={[styles.quoteInputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.quoteInputLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
              FAVORITE LINE
            </Text>
            <TextInput
              style={[styles.quoteInput, { color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
              placeholder="Add a line that stayed with you…"
              placeholderTextColor={colors.mutedForeground}
              value={quote}
              onChangeText={setQuote}
              multiline
              maxLength={200}
            />
          </View>
        )}

        {/* Confirm finish */}
        {!isAlreadyFinished && (
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: colors.accent }]}
            onPress={handleConfirmFinish}
            activeOpacity={0.88}
          >
            <Text style={[styles.confirmBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>Confirm finished</Text>
          </TouchableOpacity>
        )}

        {isAlreadyFinished && (
          <View style={[styles.alreadyFinished, { backgroundColor: colors.muted }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text style={[styles.alreadyText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>
              Marked as finished
            </Text>
          </View>
        )}

        <TouchableOpacity onPress={() => router.replace('/(tabs)')} activeOpacity={0.7} style={{ paddingVertical: 8 }}>
          <Text style={[styles.backText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Back to shelf
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  closeBtn: { position: 'absolute', right: 20, zIndex: 10, padding: 8 },
  finishedLabel: { fontSize: 13, letterSpacing: 2 },
  bookCard: {
    flexDirection: 'row', gap: 16, borderRadius: 16, borderWidth: 1, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  bookInfo: { flex: 1, gap: 6 },
  bookTitle: { fontSize: 18, letterSpacing: -0.3, lineHeight: 24 },
  bookAuthor: { fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 14, marginTop: 4 },
  statCell: { gap: 2 },
  statVal: { fontSize: 16, letterSpacing: -0.3 },
  statLbl: { fontSize: 11 },
  quote: { fontSize: 13, lineHeight: 19, fontStyle: 'italic', borderLeftWidth: 2, paddingLeft: 10, marginTop: 4 },
  quoteInputCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  quoteInputLabel: { fontSize: 11, letterSpacing: 1.5 },
  quoteInput: { fontSize: 14, lineHeight: 21, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 72 },
  streakCard: {
    borderRadius: 16, padding: 22,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  streakCaption: { fontSize: 11, letterSpacing: 1.5, marginBottom: 4 },
  streakNum: { fontSize: 44, lineHeight: 48, letterSpacing: -1 },
  freezeCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 10 },
  freezeTitle: { fontSize: 16 },
  freezeText: { fontSize: 14, lineHeight: 20 },
  freezeBtn: { borderRadius: 10, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  freezeBtnText: { fontSize: 15 },
  freezeLeft: { fontSize: 12, textAlign: 'center' },
  nextCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  nextCaption: { fontSize: 11, letterSpacing: 1.5 },
  nextFriends: { fontSize: 13 },
  nextBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  nextBtnText: { fontSize: 15 },
  confirmBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  confirmBtnText: { fontSize: 16 },
  alreadyFinished: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12, justifyContent: 'center' },
  alreadyText: { fontSize: 15 },
  backText: { fontSize: 14, textAlign: 'center' },
  freezeToast: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    zIndex: 20,
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
});
