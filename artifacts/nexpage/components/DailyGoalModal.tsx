import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export function DailyGoalModal({
  visible,
  initialMinutes,
  onSave,
  onClose,
}: {
  visible: boolean;
  initialMinutes: number;
  onSave: (minutes: number) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState(String(initialMinutes));

  useEffect(() => {
    if (visible) {
      setInputText(String(initialMinutes));
    }
  }, [visible, initialMinutes]);

  const options = [10, 15, 20, 30, 45, 60, 90, 120];

  const parsed = parseInt(inputText, 10);
  const isValid = !isNaN(parsed) && parsed >= 1 && parsed <= 480;
  const showError = inputText.trim().length > 0 && !isValid;
  const isCustomActive = isValid && !options.includes(parsed);

  function handleChipPress(m: number) {
    setInputText(String(m));
  }

  function handleTextChange(text: string) {
    const clean = text.replace(/[^0-9]/g, '');
    setInputText(clean);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            Daily Reading Goal
          </Text>

          <Text style={[styles.pickerLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            MINUTES PER DAY
          </Text>
          <View style={styles.minuteRow}>
            {options.map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => handleChipPress(m)}
                style={[
                  styles.minuteChip,
                  {
                    backgroundColor: m === parsed && isValid && !isCustomActive ? colors.primary : colors.muted,
                    borderColor: m === parsed && isValid && !isCustomActive ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.minuteChipText,
                    {
                      color: m === parsed && isValid && !isCustomActive ? '#fff' : colors.foreground,
                      fontFamily: 'Inter_500Medium',
                    },
                  ]}
                >
                  {m} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.goalCustomRow}>
            <Text style={[styles.goalOrLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>or enter custom</Text>
            <View style={[
              styles.goalInputWrap,
              { borderColor: showError ? '#c0392b' : isCustomActive ? colors.primary : colors.border, backgroundColor: colors.background },
            ]}>
              <TextInput
                style={[styles.goalInput, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}
                value={inputText}
                onChangeText={handleTextChange}
                keyboardType="number-pad"
                placeholder="e.g. 25"
                placeholderTextColor={colors.mutedForeground}
                maxLength={3}
                selectTextOnFocus
              />
              <Text style={[styles.goalInputUnit, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>min</Text>
            </View>
          </View>
          {showError && (
            <Text style={[styles.goalError, { color: '#c0392b', fontFamily: 'Inter_400Regular' }]}>
              Enter a value between 1 and 480
            </Text>
          )}

          <View style={[styles.previewRow, { backgroundColor: colors.muted, borderRadius: 12 }]}>
            <Feather name="target" size={16} color={colors.primary} />
            <Text style={[styles.previewText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {`Read ${isValid ? parsed : '?'} minutes a day to keep your streak alive.`}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: showError ? colors.muted : colors.primary }]}
            onPress={() => { if (isValid) onSave(parsed); }}
            activeOpacity={0.8}
            disabled={showError}
          >
            <Text style={[styles.saveBtnText, { fontFamily: 'Inter_600SemiBold', color: showError ? colors.mutedForeground : '#fff' }]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 19,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  pickerLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: -4,
  },
  minuteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  minuteChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  minuteChipText: {
    fontSize: 14,
  },
  goalCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  goalOrLabel: {
    fontSize: 14,
  },
  goalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  goalInput: {
    fontSize: 16,
    minWidth: 44,
    textAlign: 'center',
  },
  goalInputUnit: {
    fontSize: 14,
  },
  goalError: {
    fontSize: 13,
    marginTop: -8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  previewText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
  },
});
