import React, { useState, useEffect, useRef } from 'react';
import { AppState, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useStore } from '@/context/StoreContext';
import { BookCover } from '@/components/BookCover';

const ACTIVE_SESSION_KEY = 'everpage_active_reading_session';

type ActiveReadingSession = {
  bookId: string;
  elapsedSeconds: number;
  // A timestamp, rather than a ticking counter, lets the session catch up
  // after iOS suspends or terminates the app.
  startedAt: number | null;
};

function elapsedSecondsFor(session: ActiveReadingSession, now = Date.now()) {
  if (session.startedAt === null) return session.elapsedSeconds;
  return session.elapsedSeconds + Math.max(0, Math.floor((now - session.startedAt) / 1000));
}

function isActiveReadingSession(value: unknown): value is ActiveReadingSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  return typeof session.bookId === 'string'
    && typeof session.elapsedSeconds === 'number'
    && (typeof session.startedAt === 'number' || session.startedAt === null);
}

export default function SessionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { getBook } = useStore();
  const book = getBook(bookId ?? '');

  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<ActiveReadingSession | null>(null);

  function saveSession(session: ActiveReadingSession) {
    return AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  }

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      let session: ActiveReadingSession = {
        bookId: bookId ?? '',
        elapsedSeconds: 0,
        startedAt: Date.now(),
      };

      try {
        const saved = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (isActiveReadingSession(parsed) && parsed.bookId === session.bookId) {
            session = parsed;
          }
        }
        // Store the timestamp immediately. If the user force-quits before
        // pressing Stop, the next launch can still restore this session.
        await saveSession(session);
      } catch {
        // The timer still works for this open session if local persistence is unavailable.
      }

      if (cancelled) return;
      sessionRef.current = session;
      setSeconds(elapsedSecondsFor(session));
      setIsRunning(session.startedAt !== null);
      setIsReady(true);
    }

    restoreSession();
    return () => { cancelled = true; };
  }, [bookId]);

  useEffect(() => {
    if (!isReady || !isRunning) return;

    const updateElapsedTime = () => {
      if (sessionRef.current) setSeconds(elapsedSecondsFor(sessionRef.current));
    };

    updateElapsedTime();
    intervalRef.current = setInterval(updateElapsedTime, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isReady, isRunning]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      // Timers do not run while the app is backgrounded. On return, render
      // the elapsed wall-clock time immediately instead of waiting for an interval tick.
      const activeSession = sessionRef.current;
      if (nextState === 'active' && activeSession !== null && activeSession.startedAt !== null) {
        setSeconds(elapsedSecondsFor(activeSession));
      }
    });
    return () => subscription.remove();
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  function handleStop() {
    if (!sessionRef.current) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    const totalSeconds = elapsedSecondsFor(sessionRef.current);
    sessionRef.current = { ...sessionRef.current, elapsedSeconds: totalSeconds, startedAt: null };
    setSeconds(totalSeconds);
    setIsRunning(false);
    void AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const elapsed = Math.max(1, Math.floor(totalSeconds / 60));
    router.replace({
      pathname: '/session-log/[bookId]',
      params: { bookId: bookId ?? '', minutes: String(elapsed), startPage: String(book?.currentPage ?? 0) },
    });
  }

  function handleTogglePause() {
    if (!sessionRef.current || !isReady) return;
    const now = Date.now();
    const wasRunning = sessionRef.current.startedAt !== null;
    const updatedSession: ActiveReadingSession = wasRunning
      ? { ...sessionRef.current, elapsedSeconds: elapsedSecondsFor(sessionRef.current, now), startedAt: null }
      : { ...sessionRef.current, startedAt: now };

    sessionRef.current = updatedSession;
    setSeconds(elapsedSecondsFor(updatedSession, now));
    setIsRunning(!wasRunning);
    void saveSession(updatedSession);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleClose() {
    // Closing is an intentional discard. Backgrounding or force-quitting does
    // not call this, so those cases continue when the reader returns.
    sessionRef.current = null;
    void AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    router.back();
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
        onPress={handleClose}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={24} color="rgba(242,233,219,0.55)" />
      </TouchableOpacity>

      <View style={[styles.top, { paddingTop: closeBtnTop + 40 }]}>
        <Text style={[styles.nowLabel, { color: 'rgba(242,233,219,0.38)', fontFamily: 'Inter_600SemiBold' }]}>
          NOW READING
        </Text>
        <BookCover bookId={book.id} coverColor={book.coverColor} coverImageUri={book.coverImageUri} title={book.title} width={72} height={106} borderRadius={8} />
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
        <TouchableOpacity style={styles.pauseBtn} onPress={handleTogglePause} activeOpacity={0.75} disabled={!isReady}>
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
