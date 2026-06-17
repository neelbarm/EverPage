import React, { useEffect, useRef } from 'react';
import {
  Animated, Modal, PanResponder, Pressable, StyleSheet, View,
} from 'react-native';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backgroundColor: string;
  paddingBottom?: number;
  gap?: number;
}

export function BottomSheet({
  visible, onClose, children, backgroundColor, paddingBottom = 0, gap = 14,
}: BottomSheetProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible]);

  function dismiss() {
    Animated.timing(translateY, { toValue: 800, duration: 220, useNativeDriver: true })
      .start(() => { onCloseRef.current(); translateY.setValue(0); });
  }

  function makeHandlers(eager: boolean) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => eager,
      onMoveShouldSetPanResponder: (_, g) => !eager && g.dy > 8 && g.dy > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 0.8) dismiss();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    });
  }

  const handlePan = useRef(makeHandlers(true)).current;
  const bodyPan = useRef(makeHandlers(false)).current;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={dismiss} />
        <Animated.View
          style={[styles.sheet, { backgroundColor, paddingBottom, gap }, { transform: [{ translateY }] }]}
        >
          <View style={styles.handleZone} {...handlePan.panHandlers}>
            <View style={styles.handlePill} />
          </View>
          <View style={{ gap }} {...bodyPan.panHandlers}>
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    marginHorizontal: -20,
  },
  handlePill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
});
