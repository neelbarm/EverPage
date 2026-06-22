import React from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';

const COVER_IMAGES: Record<string, ReturnType<typeof require>> = {
  klara: require('../assets/images/cover_klara.png'),
  pachinko: require('../assets/images/cover_pachinko.png'),
  overstory: require('../assets/images/cover_overstory.png'),
};

interface BookCoverProps {
  bookId: string;
  coverColor: string;
  coverImageUri?: string;
  width: number;
  height: number;
  borderRadius?: number;
  title?: string;
}

// Pull up to two initials from a title for the placeholder cover.
function initialsFromTitle(title?: string): string {
  if (!title) return '';
  const words = title.trim().split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w));
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function BookCover({ bookId, coverColor, coverImageUri, width, height, borderRadius = 6, title }: BookCoverProps) {
  const localSource = COVER_IMAGES[bookId];
  if (localSource) {
    return (
      <Image
        source={localSource}
        style={[styles.image, { width, height, borderRadius }]}
        resizeMode="cover"
      />
    );
  }
  if (coverImageUri) {
    return (
      <Image
        source={{ uri: coverImageUri }}
        style={[styles.image, { width, height, borderRadius }]}
        resizeMode="cover"
      />
    );
  }
  const initials = initialsFromTitle(title);
  return (
    <View style={[styles.fallback, { width, height, borderRadius, backgroundColor: coverColor }]}>
      <View style={[styles.spine, { height }]} />
      <View style={styles.highlight} />
      {initials ? (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.initials, { fontSize: Math.max(11, Math.round(width * 0.32)) }]}
        >
          {initials}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fallback: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  initials: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '20%',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
