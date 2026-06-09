import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

interface WrappedStats {
  year: number;
  booksFinished: number;
  totalHours: number;
  totalPages: number;
  longestStreak: number;
  topGenre: string;
  globalPercentile: number;
}

const BG = '#19120c';
const CARD = '#241a12';
const BORDER = '#3a2c1e';
const CREAM = '#f2e9db';
const WINE = '#8a2333';
const MUTED = 'rgba(242,233,219,0.45)';

export default function WrappedScreen() {
  const { year } = useLocalSearchParams<{ year: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();

  const [stats, setStats] = useState<WrappedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const yearNum = parseInt(year ?? String(new Date().getFullYear()), 10);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    apiFetch<WrappedStats>(`/wrapped/${yearNum}`)
      .then(data => setStats(data))
      .catch(() => setError('Could not load your Wrapped. Try again.'))
      .finally(() => setLoading(false));
  }, [yearNum, isAuthenticated]);

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  async function handleShare() {
    if (!stats) return;
    try {
      await Share.share({
        message: `My ${stats.year} Reading Wrapped — ${stats.booksFinished} books, ${stats.totalHours}h read, ${stats.longestStreak}-day best streak. Top genre: ${stats.topGenre}. I read more than ${stats.globalPercentile}% of readers. #EverPage`,
      });
    } catch {}
  }

  return (
    <View style={[styles.root, { backgroundColor: BG }]}>
      <TouchableOpacity
        style={[styles.closeBtn, { top: topPad + 12 }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={22} color={MUTED} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 56, paddingBottom: insets.bottom + (Platform.OS === 'web' ? 80 : 40) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.yearLabel, { fontFamily: 'Inter_700Bold' }]}>{yearNum}</Text>
        <Text style={[styles.headline, { fontFamily: 'Inter_700Bold' }]}>
          A year worth{'\n'}sharing.
        </Text>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={WINE} size="large" />
          </View>
        )}

        {!loading && error !== '' && (
          <View style={styles.center}>
            <Text style={[styles.errorText, { fontFamily: 'Inter_400Regular' }]}>{error}</Text>
          </View>
        )}

        {!loading && !isAuthenticated && (
          <View style={styles.center}>
            <Ionicons name="lock-closed-outline" size={40} color={MUTED} />
            <Text style={[styles.errorText, { fontFamily: 'Inter_400Regular', marginTop: 12 }]}>
              Sign in to see your reading year in review.
            </Text>
          </View>
        )}

        {!loading && stats && (
          <>
            <View style={styles.statsGrid}>
              <StatCard value={String(stats.booksFinished)} label="books finished" accent={WINE} />
              <StatCard value={`${stats.totalHours}h`} label="time reading" accent={WINE} />
              <StatCard value={stats.totalPages.toLocaleString()} label="pages turned" accent={WINE} />
              <StatCard value={`${stats.longestStreak}d`} label="best streak" accent={WINE} />
            </View>

            <View style={[styles.genreCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.genreLabel, { fontFamily: 'Inter_600SemiBold' }]}>TOP GENRE</Text>
              <Text style={[styles.genreValue, { fontFamily: 'Inter_700Bold' }]}>{stats.topGenre}</Text>
            </View>

            <View style={[styles.percentileCard, { backgroundColor: WINE }]}>
              <Text style={[styles.percentileText, { fontFamily: 'Inter_700Bold' }]}>
                You read more than
              </Text>
              <Text style={[styles.percentileNum, { fontFamily: 'Inter_700Bold' }]}>
                {stats.globalPercentile}%
              </Text>
              <Text style={[styles.percentileText, { fontFamily: 'Inter_700Bold' }]}>
                of readers on EverPage
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: CREAM }]}
              onPress={handleShare}
              activeOpacity={0.85}
            >
              <Ionicons name="share-outline" size={18} color={BG} />
              <Text style={[styles.shareBtnText, { color: BG, fontFamily: 'Inter_700Bold' }]}>
                Share your Wrapped
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <View style={[styles.statCard, { backgroundColor: CARD, borderColor: BORDER }]}>
      <Text style={[styles.statValue, { color: CREAM, fontFamily: 'Inter_700Bold' }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: MUTED, fontFamily: 'Inter_400Regular' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  closeBtn: { position: 'absolute', left: 20, zIndex: 10, padding: 8 },
  scroll: { paddingHorizontal: 24, gap: 20 },
  yearLabel: { fontSize: 13, letterSpacing: 3, color: MUTED },
  headline: { fontSize: 38, color: CREAM, letterSpacing: -1.5, lineHeight: 46, marginBottom: 8 },
  center: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  errorText: { color: MUTED, fontSize: 15, textAlign: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flex: 1, minWidth: '45%', borderRadius: 16, borderWidth: 1,
    padding: 20, gap: 6, alignItems: 'flex-start',
  },
  statValue: { fontSize: 32, letterSpacing: -1 },
  statLabel: { fontSize: 12 },
  genreCard: {
    borderRadius: 16, borderWidth: 1, padding: 20, gap: 8,
  },
  genreLabel: { fontSize: 11, letterSpacing: 2, color: MUTED },
  genreValue: { fontSize: 26, color: CREAM, letterSpacing: -0.5 },
  percentileCard: {
    borderRadius: 20, padding: 28, alignItems: 'center', gap: 4,
  },
  percentileText: { fontSize: 16, color: 'rgba(255,255,255,0.85)' },
  percentileNum: { fontSize: 56, color: '#fff', letterSpacing: -2, lineHeight: 64 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 17, borderRadius: 16,
  },
  shareBtnText: { fontSize: 16 },
});
