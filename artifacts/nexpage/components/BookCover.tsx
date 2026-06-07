import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

const COVER_IMAGES: Record<string, ReturnType<typeof require>> = {
  klara: require('../assets/images/cover_klara.png'),
  pachinko: require('../assets/images/cover_pachinko.png'),
  overstory: require('../assets/images/cover_overstory.png'),
};

interface BookCoverProps {
  bookId: string;
  coverColor: string;
  width: number;
  height: number;
  borderRadius?: number;
}

export function BookCover({ bookId, coverColor, width, height, borderRadius = 6 }: BookCoverProps) {
  const source = COVER_IMAGES[bookId];
  if (source) {
    return (
      <Image
        source={source}
        style={[styles.image, { width, height, borderRadius }]}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[styles.fallback, { width, height, borderRadius, backgroundColor: coverColor }]}>
      <View style={[styles.spine, { height }]} />
      <View style={styles.highlight} />
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
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
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
