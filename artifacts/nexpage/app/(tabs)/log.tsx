import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  TextInput, StyleSheet, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useStore, Book } from '@/context/StoreContext';
import { BookCover } from '@/components/BookCover';

const GENRES = ['Literary Fiction', 'Historical Fiction', 'Non-Fiction', 'Science Fiction', 'Mystery', 'Biography', 'Other'];

function BookRow({ book, onPress }: { book: Book; onPress: () => void }) {
  const colors = useColors();
  const pct = Math.round((book.currentPage / book.totalPages) * 100);
  return (
    <TouchableOpacity
      style={[styles.bookRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <BookCover bookId={book.id} coverColor={book.coverColor} width={48} height={68} borderRadius={5} />
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

export default function LogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { books, addBook } = useStore();
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [pages, setPages] = useState('');
  const [genre, setGenre] = useState('Literary Fiction');

  const activeBooks = books.filter(b => !b.finishedAt);

  function startSession(book: Book) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/session/${book.id}`);
  }

  function handleAddBook() {
    const pageCount = parseInt(pages, 10);
    if (!title.trim() || !author.trim() || !pageCount) return;
    addBook(title.trim(), author.trim(), pageCount, genre);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTitle(''); setAuthor(''); setPages(''); setGenre('Literary Fiction');
    setShowModal(false);
  }

  const canSubmit = !!title.trim() && !!author.trim() && !!pages.trim();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Start reading</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={18} color="#fff" />
          <Text style={[styles.addBtnText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>Add book</Text>
        </TouchableOpacity>
      </View>

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

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
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
              <TouchableOpacity onPress={() => setShowModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.fields}>
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
  title: { fontSize: 26, letterSpacing: -0.5 },
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
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  genreChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  genreText: { fontSize: 13 },
  submitBtn: { marginHorizontal: 20, marginTop: 32, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  submitText: { fontSize: 16 },
});
