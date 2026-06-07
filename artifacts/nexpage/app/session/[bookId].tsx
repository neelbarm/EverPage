import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { BookCover } from '@/components/BookCover';

export default function SessionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { getBook } = useStore();
  const book = getBook(bookId ?? '');

  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  function handleStop() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const elapsed = Math.max(1, mins);
    router.replace({
      pathname: '/session-log/[bookId]',
      params: { bookId: bookId ?? '', minutes: String(elapsed), startPage: String(book?.currentPage ?? 0) },
    });
  }

  function handleTogglePause() {
    setIsRunning(r => !r);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  if (!book) {
    return (
      <View style={[styles.root, { backgroundColor: '#180e09', justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#f2e9db', fontFamily: 'Inter_400Regular' }}>Book not found</Text>
      </View>
    );
  }

  const closeBtnTop = insets.top + (Platform.OS === 'web' ? 67 : 12);

  return (
    <View style={[styles.root, { backgroundColor: '#180e09' }]}>
      <TouchableOpacity
        style={[styles.closeBtn, { top: closeBtnTop }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={24} color="rgba(242,233,219,0.55)" />
      </TouchableOpacity>

      <View style={[styles.top, { paddingTop: closeBtnTop + 40 }]}>
        <Text style={[styles.nowLabel, { color: 'rgba(242,233,219,0.38)', fontFamily: 'Inter_600SemiBold' }]}>
          NOW READING
        </Text>
        <BookCover bookId={book.id} coverColor={book.coverColor} coverImageUri={book.coverImageUri} width={72} height={106} borderRadius={8} />
        <Text style={[styles.bookTitle, { color: '#f2e9db', fontFamily: 'Inter_700Bold' }]} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={[styles.bookAuthor, { color: 'rgba(242,233,219,0.45)', fontFamily: 'Inter_400Regular' }]}>
          {book.author}
        </Text>
      </View>

      <View style={styles.timerSection}>
        <Text style={[styles.timerDisplay, { color: '#f2e9db', fontFamily: 'Inter_700Bold' }]}>{display}</Text>
        <View style={styles.liveRow}>
          {isRunning && <View style={[styles.liveDot, { backgroundColor: '#8a2333' }]} />}
          <Text style={[styles.liveLabel, { color: 'rgba(242,233,219,0.4)', fontFamily: 'Inter_500Medium' }]}>
            {isRunning ? 'SESSION LIVE' : 'PAUSED'}
          </Text>
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20) }]}>
        <TouchableOpacity style={styles.pauseBtn} onPress={handleTogglePause} activeOpacity={0.75}>
          <Ionicons name={isRunning ? 'pause' : 'play'} size={24} color="rgba(242,233,219,0.6)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.88}>
          <Text style={[styles.stopText, { color: '#180e09', fontFamily: 'Inter_700Bold' }]}>Stop</Text>
        </TouchableOpacity>
        <View style={{ width: 52 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { position: 'absolute', left: 20, zIndex: 10, padding: 8 },
  top: { alignItems: 'center', gap: 16, paddingHorizontal: 40, width: '100%' },
  nowLabel: { fontSize: 11, letterSpacing: 2 },
  bookTitle: { fontSize: 20, letterSpacing: -0.3, textAlign: 'center', lineHeight: 26 },
  bookAuthor: { fontSize: 14 },
  timerSection: { alignItems: 'center', gap: 14 },
  timerDisplay: { fontSize: 56, lineHeight: 64, letterSpacing: -2 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveLabel: { fontSize: 12, letterSpacing: 1.5 },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 20, paddingHorizontal: 40, width: '100%',
  },
  pauseBtn: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  stopBtn: {
    flex: 1, paddingVertical: 18, borderRadius: 16,
    alignItems: 'center', backgroundColor: '#f2e9db',
  },
  stopText: { fontSize: 17 },
});
