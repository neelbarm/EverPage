import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  TextInput, StyleSheet, Platform, KeyboardAvoidingView, ScrollView,
  ActivityIndicator, Image, Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useStore, Book } from '@/context/StoreContext';
import { BookCover } from '@/components/BookCover';

const GENRES = ['Literary Fiction', 'Historical Fiction', 'Non-Fiction', 'Science Fiction', 'Mystery', 'Biography', 'Other'];

interface OpenLibResult {
  title: string;
  author: string;
  pages: number;
  coverId?: number;
  coverUri?: string;
  subjects?: string[];
}

function mapSubjectToGenre(subjects: string[]): string {
  const joined = subjects.join(' ').toLowerCase();
  if (/science fiction|sci-fi|sci fi/.test(joined)) return 'Science Fiction';
  if (/fantasy/.test(joined)) return 'Science Fiction';
  if (/mystery|thriller|crime|detective|noir/.test(joined)) return 'Mystery';
  if (/romance|love stor/.test(joined)) return 'Literary Fiction';
  if (/biography|autobiography|memoir/.test(joined)) return 'Biography';
  if (/history|historical fiction/.test(joined)) return 'Historical Fiction';
  if (/self.help|psychology|business|personal development/.test(joined)) return 'Non-Fiction';
  if (/non.fiction|nonfiction|essay|journalism|politics|science|economics/.test(joined)) return 'Non-Fiction';
  return 'Literary Fiction';
}

function BookRow({ book, onPress }: { book: Book; onPress: () => void }) {
  const colors = useColors();
  const pct = Math.round((book.currentPage / book.totalPages) * 100);
  return (
    <TouchableOpacity
      style={[styles.bookRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <BookCover bookId={book.id} coverColor={book.coverColor} coverImageUri={book.coverImageUri} width={48} height={68} borderRadius={5} />
      <View style={styles.bookInfo}>
        <Text style={[styles.bookTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
          {book.title}
        </Text>
        <Text style={[styles.bookMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          {book.author}
        </Text>
        <Text style={[styles.bookProgress, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          p. {book.currentPage} / {book.totalPages} · {pct}%
        </Text>
      </View>
      <View style={[styles.startBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name="play" size={16} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

function SearchResultRow({
  result,
  onSelect,
}: {
  result: OpenLibResult;
  onSelect: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.searchResult, { borderBottomColor: colors.border }]}
      onPress={onSelect}
      activeOpacity={0.75}
    >
      {result.coverUri ? (
        <Image
          source={{ uri: result.coverUri }}
          style={styles.searchCover}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.searchCoverFallback, { backgroundColor: colors.muted }]}>
          <Ionicons name="book-outline" size={18} color={colors.mutedForeground} />
        </View>
      )}
      <View style={styles.searchInfo}>
        <Text style={[styles.searchTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>
          {result.title}
        </Text>
        <Text style={[styles.searchAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
          {result.author}
          {result.pages ? ` · ${result.pages} pages` : ''}
        </Text>
      </View>
      <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
    </TouchableOpacity>
  );
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function FreezeBanner({ onUse, onDismiss }: { onUse: () => void; onDismiss: () => void }) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(1)).current;

  function handleUse() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(onUse);
  }

  function handleDismiss() {
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(onDismiss);
  }

  return (
    <Animated.View style={[styles.freezeBanner, { backgroundColor: colors.card, borderColor: colors.primary, opacity }]}>
      <View style={styles.freezeIcon}>
        <Text style={styles.freezeEmoji}>🧊</Text>
      </View>
      <View style={styles.freezeBody}>
        <Text style={[styles.freezeText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>
          No reading yet today — use a streak freeze?
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.freezeBtn, { backgroundColor: colors.primary }]}
        onPress={handleUse}
        activeOpacity={0.8}
      >
        <Text style={[styles.freezeBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Use</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 4 }}>
        <Ionicons name="close" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function LogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { books, sessions, streak, useStreakFreeze, addBook } = useStore();
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const hasReadToday = sessions.some(s => s.date === todayStr());
  const showFreezeBanner = !hasReadToday && streak.freezesLeft > 0;
  const showNoFreezeNotice = !hasReadToday && streak.freezesLeft === 0;
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [noFreezeNoticeDismissed, setNoFreezeNoticeDismissed] = useState(false);

  const [freezeToastText, setFreezeToastText] = useState('');
  const freezeToastOpacity = useRef(new Animated.Value(0)).current;
  const freezeToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFreezeToast(remainingFreezes: number) {
    const label = remainingFreezes === 1 ? 'freeze' : 'freezes';
    setFreezeToastText(`Streak saved! ❄️ ${remainingFreezes} ${label} remaining`);
    if (freezeToastTimer.current) clearTimeout(freezeToastTimer.current);
    Animated.sequence([
      Animated.timing(freezeToastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(freezeToastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    freezeToastTimer.current = setTimeout(() => setFreezeToastText(''), 2400);
  }

  const [showModal, setShowModal] = useState(false);

  const params = useLocalSearchParams<{ addBook?: string }>();
  useEffect(() => {
    if (params.addBook === 'true') {
      setShowModal(true);
    }
  }, [params.addBook]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OpenLibResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedResult, setSelectedResult] = useState<OpenLibResult | null>(null);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [pages, setPages] = useState('');
  const [genre, setGenre] = useState('Literary Fiction');
  const [coverImageUri, setCoverImageUri] = useState<string | undefined>(undefined);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeBooks = books.filter(b => !b.finishedAt);

  function startSession(book: Book) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/session/${book.id}`);
  }

  function handleAddBook() {
    const pageCount = parseInt(pages, 10);
    if (!title.trim() || !author.trim() || !pageCount) return;
    addBook(title.trim(), author.trim(), pageCount, genre, coverImageUri);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    resetModal();
    setShowModal(false);
  }

  function resetModal() {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setSelectedResult(null);
    setTitle('');
    setAuthor('');
    setPages('');
    setGenre('Literary Fiction');
    setCoverImageUri(undefined);
  }

  function handleSelectResult(result: OpenLibResult) {
    setSelectedResult(result);
    setTitle(result.title);
    setAuthor(result.author);
    setPages(result.pages ? String(result.pages) : '');
    setCoverImageUri(result.coverUri);
    setGenre(mapSubjectToGenre(result.subjects ?? []));
    setSearchResults([]);
    setSearchQuery('');
    Haptics.selectionAsync();
  }

  function handleClearSelection() {
    setSelectedResult(null);
    setTitle('');
    setAuthor('');
    setPages('');
    setCoverImageUri(undefined);
  }

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchError('');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=8&fields=title,author_name,number_of_pages_median,cover_i,subject_facet`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network error');
        const data = await res.json();
        const results: OpenLibResult[] = (data.docs ?? [])
          .filter((d: Record<string, unknown>) => d.title)
          .map((d: Record<string, unknown>) => {
            const coverId = typeof d.cover_i === 'number' ? d.cover_i : undefined;
            return {
              title: d.title as string,
              author: Array.isArray(d.author_name) ? (d.author_name as string[])[0] ?? 'Unknown' : 'Unknown',
              pages: typeof d.number_of_pages_median === 'number' ? d.number_of_pages_median : 0,
              coverId,
              coverUri: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined,
              subjects: Array.isArray(d.subject_facet) ? (d.subject_facet as string[]).slice(0, 15) : [],
            };
          });
        setSearchResults(results);
        if (results.length === 0) setSearchError('No books found. Try a different title.');
      } catch {
        setSearchError('Search unavailable. Fill in details manually below.');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const canSubmit = !!title.trim() && !!author.trim() && !!pages.trim();
  const showResults = searchResults.length > 0 && !selectedResult;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.screenTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Start reading</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={18} color="#fff" />
          <Text style={[styles.addBtnText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>Add book</Text>
        </TouchableOpacity>
      </View>

      {showFreezeBanner && !bannerDismissed && (
        <FreezeBanner
          onUse={() => {
            const remaining = streak.freezesLeft - 1;
            useStreakFreeze();
            setBannerDismissed(true);
            showFreezeToast(remaining);
          }}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      {showNoFreezeNotice && !noFreezeNoticeDismissed && (
        <View style={[styles.noFreezeNotice, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="snow-outline" size={16} color={colors.mutedForeground} />
          <Text style={[styles.noFreezeText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            No freezes left — log any reading to protect your streak.
          </Text>
          <TouchableOpacity
            onPress={() => setNoFreezeNoticeDismissed(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}

      {activeBooks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="book-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            No books on your shelf
          </Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Add a book to start tracking your sessions
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeBooks}
          keyExtractor={b => b.id}
          renderItem={({ item }) => <BookRow book={item} onPress={() => startSession(item)} />}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : 20 }}
          scrollEnabled={activeBooks.length > 0}
          showsVerticalScrollIndicator={false}
        />
      )}

      {freezeToastText.length > 0 && (
        <Animated.View
          style={[styles.freezeToast, { backgroundColor: colors.card, borderColor: colors.primary, opacity: freezeToastOpacity }]}
          pointerEvents="none"
        >
          <Text style={[styles.freezeToastText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            {freezeToastText}
          </Text>
        </Animated.View>
      )}

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { resetModal(); setShowModal(false); }}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={[styles.modal, { backgroundColor: colors.background }]}
            contentContainerStyle={{ paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Add a book</Text>
              <TouchableOpacity onPress={() => { resetModal(); setShowModal(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.fields}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>Search by title</Text>
                <View style={[styles.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Ionicons name="search-outline" size={18} color={colors.mutedForeground} style={{ marginLeft: 12 }} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="e.g. The Midnight Library"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                  {(searching) && (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 12 }} />
                  )}
                  {searchQuery.length > 0 && !searching && (
                    <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); setSearchError(''); }} style={{ marginRight: 12 }}>
                      <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  )}
                </View>

                {showResults && (
                  <View style={[styles.resultsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {searchResults.map((result, idx) => (
                      <SearchResultRow
                        key={`${result.title}-${idx}`}
                        result={result}
                        onSelect={() => handleSelectResult(result)}
                      />
                    ))}
                  </View>
                )}

                {searchError.length > 0 && searchQuery.length > 0 && (
                  <Text style={[styles.searchError, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {searchError}
                  </Text>
                )}
              </View>

              {selectedResult && (
                <View style={[styles.selectedCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                  {selectedResult.coverUri ? (
                    <Image source={{ uri: selectedResult.coverUri }} style={styles.selectedCover} resizeMode="cover" />
                  ) : (
                    <View style={[styles.selectedCoverFallback, { backgroundColor: colors.muted }]}>
                      <Ionicons name="book" size={24} color={colors.mutedForeground} />
                    </View>
                  )}
                  <View style={styles.selectedInfo}>
                    <Text style={[styles.selectedTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>
                      {selectedResult.title}
                    </Text>
                    <Text style={[styles.selectedAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
                      {selectedResult.author}
                    </Text>
                    {selectedResult.pages > 0 && (
                      <Text style={[styles.selectedPages, { color: colors.accent, fontFamily: 'Inter_500Medium' }]}>
                        {selectedResult.pages} pages
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={handleClearSelection} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              )}

              {[
                { label: 'Title', value: title, setter: setTitle, placeholder: 'Book title', kb: 'default' as const },
                { label: 'Author', value: author, setter: setAuthor, placeholder: 'Author name', kb: 'default' as const },
                { label: 'Total pages', value: pages, setter: setPages, placeholder: '300', kb: 'number-pad' as const },
              ].map(({ label, value, setter, placeholder, kb }) => (
                <View key={label} style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>{label}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular' }]}
                    value={value}
                    onChangeText={setter}
                    placeholder={placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={kb}
                  />
                </View>
              ))}

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>Genre</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {GENRES.map(g => (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles.genreChip,
                        { backgroundColor: genre === g ? colors.primary : colors.muted, borderColor: genre === g ? colors.primary : colors.border },
                      ]}
                      onPress={() => setGenre(g)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.genreText, { color: genre === g ? '#fff' : colors.foreground, fontFamily: genre === g ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>
                        {g}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.45 }]}
              onPress={handleAddBook}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              <Text style={[styles.submitText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>Add to shelf</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  freezeBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  freezeIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  freezeEmoji: { fontSize: 20 },
  freezeBody: { flex: 1 },
  freezeText: { fontSize: 13.5, lineHeight: 18 },
  freezeBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  freezeBtnText: { fontSize: 13, color: '#fff' },
  screenTitle: { fontSize: 26, letterSpacing: -0.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  addBtnText: { fontSize: 14 },
  bookRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  bookInfo: { flex: 1, gap: 3 },
  bookTitle: { fontSize: 15, letterSpacing: -0.2 },
  bookMeta: { fontSize: 13 },
  bookProgress: { fontSize: 12 },
  startBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 18 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  modal: { flex: 1 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  modalTitle: { fontSize: 22, letterSpacing: -0.5 },
  fields: { paddingHorizontal: 20, gap: 20 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 13 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 13, paddingRight: 8, fontSize: 15 },
  searchError: { fontSize: 13, marginTop: 4 },
  resultsContainer: { borderRadius: 12, borderWidth: 1, marginTop: 4, overflow: 'hidden' },
  searchResult: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  searchCover: { width: 38, height: 54, borderRadius: 4 },
  searchCoverFallback: { width: 38, height: 54, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  searchInfo: { flex: 1, gap: 3 },
  searchTitle: { fontSize: 14, letterSpacing: -0.1 },
  searchAuthor: { fontSize: 12 },
  selectedCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1.5, gap: 12 },
  selectedCover: { width: 44, height: 64, borderRadius: 5 },
  selectedCoverFallback: { width: 44, height: 64, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  selectedInfo: { flex: 1, gap: 3 },
  selectedTitle: { fontSize: 14, letterSpacing: -0.1 },
  selectedAuthor: { fontSize: 12 },
  selectedPages: { fontSize: 12 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  genreChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  genreText: { fontSize: 13 },
  submitBtn: { marginHorizontal: 20, marginTop: 32, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  submitText: { fontSize: 16 },
  freezeToast: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  freezeToastText: { fontSize: 14, letterSpacing: -0.1 },
  noFreezeNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10, borderRadius: 12,
    borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14,
  },
  noFreezeText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
