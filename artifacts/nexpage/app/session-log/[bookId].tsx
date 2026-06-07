import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { BookCover } from '@/components/BookCover';

export default function SessionLogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bookId, minutes, startPage } = useLocalSearchParams<{ bookId: string; minutes: string; startPage: string }>();
  const { getBook, logSession } = useStore();
  const book = getBook(bookId ?? '');

  const durationMin = Math.max(1, parseInt(minutes ?? '1', 10));
  const startPg = parseInt(startPage ?? '0', 10);
  const [pagesRead, setPagesRead] = useState(Math.max(1, Math.round(durationMin * 0.6)));

  const endPage = Math.min(startPg + pagesRead, book?.totalPages ?? 9999);
  const pace = pagesRead > 0 ? (durationMin / pagesRead).toFixed(1) : '--';
  const progressBefore = book ? Math.round((startPg / book.totalPages) * 100) : 0;
  const progressAfter = book ? Math.round((endPage / book.totalPages) * 100) : 0;

  function adjustPages(delta: number) {
    setPagesRead(p => Math.max(1, Math.min(p + delta, (book?.totalPages ?? 9999) - startPg)));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleLog() {
    if (!book) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await logSession(book.id, durationMin, startPg, endPage);
    const finished = endPage >= book.totalPages;
    if (finished) {
      router.replace({ pathname: '/finish/[bookId]', params: { bookId: book.id } });
    } else {
      router.replace('/(tabs)');
    }
  }

  if (!book) return <View style={[styles.root, { backgroundColor: colors.background }]} />;

  const topPad = insets.top + (Platform.OS === 'web' ? 80 : 24);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.content, { paddingTop: topPad }]}>
        <View style={styles.headerBlock}>
          <Text style={[styles.niceLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Nice session — you read for
          </Text>
          <Text style={[styles.durationText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {durationMin} minute{durationMin !== 1 ? 's' : ''}
          </Text>
        </View>

        <View style={[styles.bookRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <BookCover bookId={book.id} coverColor={book.coverColor} width={44} height={62} borderRadius={5} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.bookTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
              {book.title}
            </Text>
            <Text style={[styles.bookAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {book.author}
            </Text>
          </View>
        </View>

        <View style={styles.pagesSection}>
          <Text style={[styles.pagesQuestion, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            How many pages?
          </Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.stepBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => adjustPages(-1)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepIcon, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.pageCount, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{pagesRead}</Text>
            <TouchableOpacity
              style={[styles.stepBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => adjustPages(1)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepIcon, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.pageRange, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            p. {startPg} → p. {endPage}
          </Text>
        </View>

        <View style={[styles.statsRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>Pace</Text>
            <Text style={[styles.statVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{pace} min / page</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>Progress</Text>
            <Text style={[styles.statVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              {progressBefore}% → {progressAfter}%
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20) }]}>
        <TouchableOpacity
          style={[styles.logBtn, { backgroundColor: colors.primary }]}
          onPress={handleLog}
          activeOpacity={0.88}
        >
          <Text style={[styles.logBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>Log session</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, gap: 24 },
  headerBlock: { gap: 4 },
  niceLabel: { fontSize: 16 },
  durationText: { fontSize: 32, letterSpacing: -1, lineHeight: 38 },
  bookRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, borderWidth: 1 },
  bookTitle: { fontSize: 15, letterSpacing: -0.2 },
  bookAuthor: { fontSize: 13 },
  pagesSection: { alignItems: 'center', gap: 16 },
  pagesQuestion: { fontSize: 18, alignSelf: 'flex-start' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  stepBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  stepIcon: { fontSize: 26, lineHeight: 30 },
  pageCount: { fontSize: 44, letterSpacing: -1, minWidth: 64, textAlign: 'center' },
  pageRange: { fontSize: 14 },
  statsRow: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', padding: 16, gap: 16 },
  statLabel: { fontSize: 12 },
  statVal: { fontSize: 15 },
  statDivider: { width: 1 },
  footer: { paddingHorizontal: 24, paddingTop: 12 },
  logBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  logBtnText: { fontSize: 17 },
});
