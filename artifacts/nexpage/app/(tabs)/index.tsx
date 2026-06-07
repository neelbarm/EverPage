import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
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
  const { books, streak, recommendedBooks } = useStore();
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const activeBooks = useMemo(() => books.filter(b => !b.finishedAt), [books]);
  const heroBook = activeBooks[0];
  const alsoReading = activeBooks.slice(1);
  const heroProgress = heroBook ? heroBook.currentPage / heroBook.totalPages : 0;

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
                    <View key={book.id} style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <BookCover bookId={book.id} coverColor={book.coverColor} coverImageUri={book.coverImageUri} width={140} height={90} borderRadius={0} />
                      <View style={styles.recBody}>
                        <Text style={[styles.recTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>{book.title}</Text>
                        <Text style={[styles.recAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{book.author}</Text>
                        <Text style={[styles.recReason, { color: colors.accent, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{book.reason}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>
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
});
