import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform,
  Modal, KeyboardAvoidingView, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { BookCover } from '@/components/BookCover';
import { useSocial } from '@/context/SocialContext';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

const GENRES = ['Literary Fiction', 'Historical Fiction', 'Non-Fiction', 'Science Fiction', 'Mystery', 'Biography', 'Other'];

function ProgressBar({ progress, height = 6 }: { progress: number; height?: number }) {
  const colors = useColors();
  return (
    <View style={{ height, backgroundColor: colors.border, borderRadius: height / 2, overflow: 'hidden' }}>
      <View style={{ height, width: `${Math.min(progress * 100, 100)}%`, backgroundColor: colors.primary, borderRadius: height / 2 }} />
    </View>
  );
}

export default function BookDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { getBook, updateBook, friends } = useStore();
  const { isRegistered, postRecommendation } = useSocial();
  const book = getBook(bookId ?? '');

  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editPages, setEditPages] = useState('');
  const [editGenre, setEditGenre] = useState('Literary Fiction');
  const [editCoverUri, setEditCoverUri] = useState<string | undefined>(undefined);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const { isAuthenticated } = useAuth();
  const [notes, setNotes] = useState<Array<{ id: string; userId: string; page: number; noteText: string; displayName: string; initial: string; color: string; isOwnNote: boolean }>>([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);

  async function handleShare() {
    if (!book || sharing || shared) return;
    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await postRecommendation(book.title, book.author);
      setShared(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Could not share', 'Please try again later.');
    } finally {
      setSharing(false);
    }
  }

  function openEdit() {
    if (!book) return;
    setEditTitle(book.title);
    setEditAuthor(book.author);
    setEditPages(String(book.totalPages));
    setEditGenre(book.genre);
    setEditCoverUri(book.coverImageUri);
    setShowEdit(true);
  }

  function handleSave() {
    if (!book) return;
    const pageCount = parseInt(editPages, 10);
    if (!editTitle.trim() || !editAuthor.trim() || !pageCount) return;
    updateBook(book.id, {
      title: editTitle.trim(),
      author: editAuthor.trim(),
      totalPages: pageCount,
      genre: editGenre,
      coverImageUri: editCoverUri,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowEdit(false);
  }

  useEffect(() => {
    if (!book || !isAuthenticated) return;
    apiFetch<Array<{ id: string; userId: string; page: number; noteText: string; displayName: string; initial: string; color: string; isOwnNote: boolean }>>(
      `/notes?bookTitle=${encodeURIComponent(book.title)}&upToPage=${book.currentPage}`,
    ).then(data => setNotes(data)).catch(() => {});
  }, [book?.title, book?.currentPage, isAuthenticated]);

  async function handleCreateRoom() {
    if (!book || creatingRoom) return;
    setCreatingRoom(true);
    try {
      const { code } = await apiFetch<{ code: string }>('/rooms', {
        method: 'POST',
        body: JSON.stringify({ bookTitle: book.title, bookAuthor: book.author }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: '/room/[roomId]', params: { roomId: code } });
    } catch {
      Alert.alert('Could not create room', 'Please try again.');
    } finally {
      setCreatingRoom(false);
    }
  }

  async function handleJoinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (!code || joiningRoom) return;
    setJoiningRoom(true);
    try {
      await apiFetch(`/rooms/${code}/join`, { method: 'POST' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowJoinModal(false);
      router.push({ pathname: '/room/[roomId]', params: { roomId: code } });
    } catch {
      Alert.alert('Room not found', 'Check the code and try again.');
    } finally {
      setJoiningRoom(false);
    }
  }

  if (!book) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 60 : 0) }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.foreground, textAlign: 'center', marginTop: 60, fontFamily: 'Inter_400Regular' }}>Book not found</Text>
      </View>
    );
  }

  const progress = book.currentPage / book.totalPages;
  const pct = Math.round(progress * 100);
  const isFinished = !!book.finishedAt;

  const friendsReading = friends.filter(f => book.friendsReading.includes(f.id));
  const youWeekPages = 128;
  const allReaders = [
    ...friendsReading.map(f => ({ id: f.id, name: f.name, initial: f.initial, color: f.color, weekPages: f.weekPages })),
    { id: 'you', name: 'You', initial: 'Y', color: '#1C3A5A', weekPages: youWeekPages },
  ].sort((a, b) => b.weekPages - a.weekPages);

  const youRank = allReaders.findIndex(r => r.id === 'you');
  const leadAbove = youRank > 0 ? allReaders[youRank - 1] : null;
  const youEntry = allReaders[youRank];
  const pagesGap = leadAbove && youEntry ? leadAbove.weekPages - youEntry.weekPages : 0;

  const canSave = !!editTitle.trim() && !!editAuthor.trim() && !!editPages.trim() && !!parseInt(editPages, 10);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 60 : 0) }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={openEdit}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil-outline" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: 8,
          paddingHorizontal: 20,
          paddingBottom: Platform.OS === 'web' ? 100 : 32,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Book hero */}
        <View style={styles.bookHero}>
          <BookCover bookId={book.id} coverColor={book.coverColor} coverImageUri={book.coverImageUri} width={100} height={146} borderRadius={10} />
          <View style={styles.bookMeta}>
            <Text style={[styles.bookTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{book.title}</Text>
            <Text style={[styles.bookAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{book.author}</Text>
            <Text style={[styles.genre, { color: colors.accent, fontFamily: 'Inter_500Medium' }]}>{book.genre}</Text>
            {!isFinished && (
              <Text style={[styles.pages, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                p. {book.currentPage} / {book.totalPages}
              </Text>
            )}
          </View>
        </View>

        {/* Progress */}
        {!isFinished && (
          <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>Progress</Text>
              <Text style={[styles.progressPct, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{pct}%</Text>
            </View>
            <ProgressBar progress={progress} height={8} />
          </View>
        )}

        {/* Leaderboard */}
        {friendsReading.length > 0 && !isFinished && (
          <View style={[styles.leaderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.leaderHeader}>
              <Text style={[styles.leaderBookTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                {book.title}
              </Text>
              <Text style={[styles.leaderCount, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {friendsReading.length + 1} reading
              </Text>
            </View>
            <Text style={[styles.weekLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>THIS WEEK</Text>
            {allReaders.map((reader, i) => (
              <View
                key={reader.id}
                style={[
                  styles.leaderRow,
                  reader.id === 'you' && { backgroundColor: colors.muted, borderRadius: 10, marginHorizontal: -10, paddingHorizontal: 10 },
                  i < allReaders.length - 1 && reader.id !== 'you' && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.rank, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{i + 1}</Text>
                <View style={[styles.leaderAvatar, { backgroundColor: reader.color }]}>
                  <Text style={[styles.leaderInitial, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{reader.initial}</Text>
                </View>
                <Text style={[styles.leaderName, { color: colors.foreground, fontFamily: reader.id === 'you' ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
                  {reader.name}
                </Text>
                <Text style={[styles.leaderPages, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  {reader.weekPages}
                </Text>
              </View>
            ))}
            {leadAbove && pagesGap > 0 && (
              <View style={[styles.nudgePill, { backgroundColor: colors.primary }]}>
                <Text style={[styles.nudgeText, { color: colors.primaryForeground, fontFamily: 'Inter_500Medium' }]}>
                  You are {pagesGap} pages behind {leadAbove.name} — read {pagesGap + 10} today to take the lead
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        {!isFinished ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push(`/session/${book.id}`); }}
              activeOpacity={0.88}
            >
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>Start reading</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => router.push(`/finish/${book.id}`)}
              activeOpacity={0.8}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>Mark as finished</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.finishedBadge, { backgroundColor: colors.muted }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            <Text style={[styles.finishedText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Finished</Text>
          </View>
        )}

        {/* Share recommendation */}
        {isRegistered && (
          <TouchableOpacity
            style={[
              styles.shareBtn,
              shared
                ? { backgroundColor: colors.muted, borderColor: colors.border }
                : { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={handleShare}
            disabled={sharing || shared}
            activeOpacity={0.8}
          >
            {sharing ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : shared ? (
              <>
                <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                <Text style={[styles.shareBtnText, { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>Shared with followers</Text>
              </>
            ) : (
              <>
                <Ionicons name="star-outline" size={16} color={colors.foreground} />
                <Text style={[styles.shareBtnText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>Share with followers</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Reading Room */}
        {isAuthenticated && (
          <View style={[styles.roomCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.roomHeader}>
              <Ionicons name="people-outline" size={18} color={colors.foreground} />
              <Text style={[styles.roomTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Reading Room</Text>
            </View>
            <Text style={[styles.roomDesc, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Read together. Share progress. Spoiler-safe discussion.
            </Text>
            <View style={styles.roomBtns}>
              <TouchableOpacity
                style={[styles.roomBtn, { backgroundColor: colors.primary }]}
                onPress={handleCreateRoom}
                disabled={creatingRoom}
                activeOpacity={0.85}
              >
                {creatingRoom
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[styles.roomBtnText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>Create room</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roomBtnOutline, { borderColor: colors.border }]}
                onPress={() => setShowJoinModal(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.roomBtnText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>Join with code</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Margin Notes */}
        {isAuthenticated && notes.length > 0 && (
          <>
            <Text style={[styles.bookSectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
              NOTES FROM FRIENDS
            </Text>
            <View style={[styles.notesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {notes.map((note, i) => (
                <View
                  key={note.id}
                  style={[
                    styles.noteRow,
                    i < notes.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.noteAvatar, { backgroundColor: note.isOwnNote ? colors.primary : note.color }]}>
                    <Text style={[styles.noteInitial, { fontFamily: 'Inter_700Bold' }]}>{note.isOwnNote ? 'Y' : note.initial}</Text>
                  </View>
                  <View style={styles.noteContent}>
                    <View style={styles.noteHeaderRow}>
                      <Text style={[styles.noteName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                        {note.isOwnNote ? 'You' : note.displayName}
                      </Text>
                      <Text style={[styles.notePage, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>p. {note.page}</Text>
                    </View>
                    <Text style={[styles.noteText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{note.noteText}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={showEdit}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEdit(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={[styles.modal, { backgroundColor: colors.background }]}
            contentContainerStyle={{ paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Edit book</Text>
              <TouchableOpacity onPress={() => setShowEdit(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.fields}>
              {[
                { label: 'Title', value: editTitle, setter: setEditTitle, placeholder: 'Book title', kb: 'default' as const },
                { label: 'Author', value: editAuthor, setter: setEditAuthor, placeholder: 'Author name', kb: 'default' as const },
                { label: 'Total pages', value: editPages, setter: setEditPages, placeholder: '300', kb: 'number-pad' as const },
                { label: 'Cover image URL', value: editCoverUri ?? '', setter: (v: string) => setEditCoverUri(v || undefined), placeholder: 'https://...', kb: 'url' as const },
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
                    autoCorrect={false}
                    autoCapitalize={kb === 'url' ? 'none' : 'sentences'}
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
                        { backgroundColor: editGenre === g ? colors.primary : colors.muted, borderColor: editGenre === g ? colors.primary : colors.border },
                      ]}
                      onPress={() => setEditGenre(g)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.genreText, { color: editGenre === g ? '#fff' : colors.foreground, fontFamily: editGenre === g ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>
                        {g}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: canSave ? 1 : 0.45 }]}
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.85}
            >
              <Text style={[styles.submitText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>Save changes</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join Room Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowJoinModal(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background, flex: 1 }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Join a Room</Text>
            <TouchableOpacity onPress={() => setShowJoinModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, gap: 16 }}>
            <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 }]}>
              Enter the 6-character code shared by a friend.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_700Bold', fontSize: 22, textAlign: 'center', letterSpacing: 4 }]}
              value={joinCode}
              onChangeText={t => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABCDEF"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: joinCode.trim().length === 6 ? 1 : 0.45 }]}
              onPress={handleJoinRoom}
              disabled={joiningRoom || joinCode.trim().length < 6}
              activeOpacity={0.85}
            >
              {joiningRoom
                ? <ActivityIndicator color="#fff" />
                : <Text style={[styles.submitText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>Join room</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  headerBtn: { padding: 8 },
  bookHero: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  bookMeta: { flex: 1, gap: 7, paddingTop: 4 },
  bookTitle: { fontSize: 22, letterSpacing: -0.5, lineHeight: 28 },
  bookAuthor: { fontSize: 15 },
  genre: { fontSize: 13 },
  pages: { fontSize: 13 },
  progressCard: {
    borderRadius: 14, borderWidth: 1, padding: 16, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 14 },
  progressPct: { fontSize: 16 },
  leaderCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  leaderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leaderBookTitle: { fontSize: 16, flex: 1, letterSpacing: -0.3 },
  leaderCount: { fontSize: 13 },
  weekLabel: { fontSize: 11, letterSpacing: 1.5 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  rank: { width: 20, fontSize: 14, textAlign: 'center' },
  leaderAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  leaderInitial: { fontSize: 14 },
  leaderName: { flex: 1, fontSize: 15 },
  leaderPages: { fontSize: 15 },
  nudgePill: { borderRadius: 10, padding: 12, marginTop: 4 },
  nudgeText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  actions: { gap: 10 },
  primaryBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { fontSize: 16 },
  secondaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  secondaryBtnText: { fontSize: 15 },
  finishedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 14, justifyContent: 'center' },
  finishedText: { fontSize: 15 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingVertical: 13 },
  shareBtnText: { fontSize: 14 },
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
  roomCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  roomHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomTitle: { fontSize: 16 },
  roomDesc: { fontSize: 13, lineHeight: 18 },
  roomBtns: { flexDirection: 'row', gap: 10 },
  roomBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  roomBtnOutline: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  roomBtnText: { fontSize: 14 },
  bookSectionLabel: { fontSize: 11, letterSpacing: 1.5 },
  notesCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  noteRow: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'flex-start' },
  noteAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  noteInitial: { color: '#fff', fontSize: 14 },
  noteContent: { flex: 1, gap: 4 },
  noteHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteName: { fontSize: 14 },
  notePage: { fontSize: 12 },
  noteText: { fontSize: 13, lineHeight: 18 },
});
