import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, TextInput, KeyboardAvoidingView,
  Modal, ScrollView, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface RoomMember {
  userId: string;
  rank: number;
  displayName: string;
  initial: string;
  color: string;
  currentPage: number;
  isMe: boolean;
}

interface RoomDetail {
  code: string;
  bookTitle: string;
  bookAuthor: string;
  weeklyTargetPages: number;
  isMember: boolean;
  myPage: number;
  members: RoomMember[];
}

interface RoomMessage {
  id: string;
  userId: string;
  displayName: string;
  initial: string;
  color: string;
  body: string;
  spoilerUpToPage: number;
  createdAt: string;
  isMe: boolean;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Avatar({ initial, color, size = 36 }: { initial: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.4, fontFamily: 'Inter_700Bold' }}>{initial}</Text>
    </View>
  );
}

export default function RoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isAuthenticated } = useAuth();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'leaderboard' | 'discussion'>('leaderboard');
  const [composing, setComposing] = useState('');
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const code = (roomId ?? '').toUpperCase();
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const loadRoom = useCallback(async () => {
    try {
      const data = await apiFetch<RoomDetail>(`/rooms/${code}`);
      setRoom(data);
    } catch (e: any) {
      setError(e?.message?.includes('404') ? 'Room not found.' : 'Could not load room.');
    } finally {
      setLoading(false);
    }
  }, [code]);

  const loadMessages = useCallback(async () => {
    try {
      const data = await apiFetch<RoomMessage[]>(`/rooms/${code}/messages`);
      setMessages(data);
    } catch {}
  }, [code]);

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    if (tab === 'discussion' && room?.isMember) {
      loadMessages();
    }
  }, [tab, room?.isMember, loadMessages]);

  async function handleJoin() {
    setJoining(true);
    try {
      await apiFetch(`/rooms/${code}/join`, { method: 'POST' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadRoom();
    } catch {
      setError('Could not join room.');
    } finally {
      setJoining(false);
    }
  }

  function handleReportMessage(messageId: string) {
    Alert.alert(
      'Report Message',
      'Is this message inappropriate, spam, or violating community guidelines?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            apiFetch('/report', {
              method: 'POST',
              body: JSON.stringify({ contentType: 'room_message', contentId: messageId, reason: 'user_report' }),
            }).catch(() => {});
            Alert.alert('Report submitted', 'Thank you. We\'ll review this message.');
          },
        },
      ]
    );
  }

  async function handleSend() {
    const body = composing.trim();
    if (!body || !room) return;
    setSending(true);
    try {
      await apiFetch(`/rooms/${code}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, spoilerUpToPage: room.myPage }),
      });
      setComposing('');
      await loadMessages();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 200);
    } catch {} finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <TouchableOpacity style={[styles.backBtn, { top: topPad + 12 }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (error || !room) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={[styles.backBtn, { top: topPad + 12 }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {error || 'Room not found.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn2}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.roomCode, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            ROOM {room.code}
          </Text>
          <Text style={[styles.bookTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
            {room.bookTitle}
          </Text>
          {room.bookAuthor ? (
            <Text style={[styles.bookAuthor, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {room.bookAuthor}
            </Text>
          ) : null}
          {room.weeklyTargetPages > 0 ? (
            <Text style={[styles.weeklyTarget, { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>
              {room.weeklyTargetPages} pages / week
            </Text>
          ) : null}
        </View>
        <View style={[styles.memberCount, { backgroundColor: colors.muted }]}>
          <Text style={[styles.memberCountText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            {room.members.length}
          </Text>
          <Ionicons name="people" size={13} color={colors.mutedForeground} />
        </View>
      </View>

      {!room.isMember && (
        <View style={[styles.joinBanner, { backgroundColor: colors.card, borderColor: colors.primary }]}>
          <Text style={[styles.joinText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>
            You're not in this room yet.
          </Text>
          <TouchableOpacity
            style={[styles.joinBtn, { backgroundColor: colors.primary }]}
            onPress={handleJoin}
            disabled={joining}
            activeOpacity={0.85}
          >
            {joining
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[styles.joinBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Join</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['leaderboard', 'discussion'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.tabText,
              { color: tab === t ? colors.primary : colors.mutedForeground },
              { fontFamily: tab === t ? 'Inter_600SemiBold' : 'Inter_400Regular' },
            ]}>
              {t === 'leaderboard' ? 'Leaderboard' : 'Discussion'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'leaderboard' && (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {room.members.map((m, i) => (
            <View
              key={m.userId}
              style={[
                styles.memberRow,
                { borderBottomColor: colors.border },
                m.isMe && { backgroundColor: colors.muted },
              ]}
            >
              <Text style={[styles.rank, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                {i + 1}
              </Text>
              <Avatar initial={m.initial} color={m.color} />
              <View style={styles.memberInfo}>
                <Text style={[styles.memberName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  {m.displayName}{m.isMe ? ' (you)' : ''}
                </Text>
                <Text style={[styles.memberPage, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  p. {m.currentPage}
                </Text>
              </View>
              {i === 0 && (
                <View style={[styles.leadBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.leadBadgeText, { fontFamily: 'Inter_600SemiBold' }]}>Leading</Text>
                </View>
              )}
            </View>
          ))}
          {room.members.length === 1 && (
            <View style={styles.center}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Share the room code{' '}
                <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>{room.code}</Text>
                {' '}to invite friends.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {tab === 'discussion' && (
        <>
          {!room.isMember ? (
            <View style={styles.center}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Join the room to see the discussion.
              </Text>
            </View>
          ) : (
            <>
              <FlatList
                ref={flatRef}
                data={messages}
                keyExtractor={m => m.id}
                renderItem={({ item: m }) => (
                  <View style={[styles.messageRow, m.isMe && styles.messageRowMe]}>
                    {!m.isMe && <Avatar initial={m.initial} color={m.color} size={32} />}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onLongPress={() => !m.isMe && handleReportMessage(m.id)}
                      delayLongPress={500}
                    >
                      <View style={[
                        styles.messageBubble,
                        { backgroundColor: m.isMe ? colors.primary : colors.card, borderColor: colors.border },
                      ]}>
                        {!m.isMe && (
                          <Text style={[styles.messageSender, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                            {m.displayName}
                          </Text>
                        )}
                        <Text style={[styles.messageBody, { color: m.isMe ? '#fff' : colors.foreground, fontFamily: 'Inter_400Regular' }]}>
                          {m.body}
                        </Text>
                        <Text style={[styles.messageTime, { color: m.isMe ? 'rgba(255,255,255,0.6)' : colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                          {timeAgo(m.createdAt)} · up to p. {m.spoilerUpToPage}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
                contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 8 }}
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      No messages yet. Start the conversation.
                    </Text>
                  </View>
                }
                onContentSizeChange={() => messages.length > 0 && flatRef.current?.scrollToEnd({ animated: false })}
              />
              <View style={[styles.compose, { borderTopColor: colors.border, paddingBottom: insets.bottom + (Platform.OS === 'web' ? 20 : 8) }]}>
                <TextInput
                  style={[styles.composeInput, { backgroundColor: colors.muted, color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                  placeholder={`Share a thought up to p. ${room.myPage}…`}
                  placeholderTextColor={colors.mutedForeground}
                  value={composing}
                  onChangeText={setComposing}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, { backgroundColor: composing.trim() ? colors.primary : colors.muted }]}
                  onPress={handleSend}
                  disabled={sending || !composing.trim()}
                  activeOpacity={0.8}
                >
                  {sending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Ionicons name="arrow-up" size={18} color={composing.trim() ? '#fff' : colors.mutedForeground} />
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backBtn: { position: 'absolute', left: 16, zIndex: 10, padding: 8 },
  backBtn2: { padding: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: { fontSize: 15, textAlign: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerInfo: { flex: 1, gap: 2 },
  roomCode: { fontSize: 11, letterSpacing: 1.5 },
  bookTitle: { fontSize: 17, letterSpacing: -0.3 },
  bookAuthor: { fontSize: 13 },
  weeklyTarget: { fontSize: 12, letterSpacing: 0.2, marginTop: 2 },
  memberCount: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  memberCountText: { fontSize: 13 },
  joinBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    margin: 16, padding: 14, borderRadius: 14, borderWidth: 1.5,
  },
  joinText: { fontSize: 14 },
  joinBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  joinBtnText: { color: '#fff', fontSize: 14 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabText: { fontSize: 14 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14,
    gap: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { fontSize: 16, width: 24, textAlign: 'center' },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 15 },
  memberPage: { fontSize: 13 },
  leadBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  leadBadgeText: { color: '#fff', fontSize: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  messageRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  messageRowMe: { flexDirection: 'row-reverse' },
  messageBubble: {
    flex: 1, maxWidth: '80%', borderRadius: 14, borderWidth: 1,
    padding: 12, gap: 4,
  },
  messageSender: { fontSize: 12 },
  messageBody: { fontSize: 14, lineHeight: 20 },
  messageTime: { fontSize: 11, marginTop: 2 },
  compose: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  composeInput: {
    flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, maxHeight: 100,
  },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
