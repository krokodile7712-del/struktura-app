import React, { useRef, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, Pressable,
  Animated, ScrollView, Dimensions,
} from 'react-native';
import { colors, fonts, radius } from '../constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');

/**
 * Bottom Sheet — панель снизу экрана с пружинным открытием.
 * Идеально для: выбор зоны, выбор метода оплаты, опции записи.
 *
 * Использование:
 * <BottomSheet visible={open} onClose={() => setOpen(false)} title="Выберите зону">
 *   <Pressable style={...} onPress={...}><Text>Зал</Text></Pressable>
 *   <Pressable ...>...</Pressable>
 * </BottomSheet>
 *
 * Props:
 * - visible: bool
 * - onClose: fn
 * - title: string (optional)
 * - maxHeight: number (default 60% экрана)
 * - children: ReactNode
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  children,
  maxHeight = SCREEN_H * 0.65,
}) {
  const translateY = useRef(new Animated.Value(maxHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 3,
          speed: 14,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: maxHeight,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Затемнение */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Лист */}
      <View style={styles.container} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight, transform: [{ translateY }] },
          ]}
        >
          {/* Ручка */}
          <View style={styles.handle} />

          {/* Заголовок */}
          {title && (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
                <Text style={styles.closeIcon}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* Контент */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Вспомогательные строки для Bottom Sheet
export function BottomSheetRow({ icon, label, sub, onPress, active, destructive, right }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      {icon ? <Text style={styles.rowIcon}>{icon}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={[
          styles.rowLabel,
          active && { color: colors.greenLight },
          destructive && { color: colors.redLight },
        ]}>
          {label}
        </Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {active && <Text style={styles.activeCheck}>✓</Text>}
      {right && right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0e0f11',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(74,77,84,0.5)',
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    // Тень вверх
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(74,77,84,0.6)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontFamily: fonts.family,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  closeBtn: { padding: 4 },
  closeIcon: { fontSize: 16, color: colors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,77,84,0.2)',
    borderRadius: 10,
    paddingHorizontal: 4,
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowLabel: { fontFamily: fonts.family, fontSize: 15, color: colors.text },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  activeCheck: { fontSize: 16, color: colors.greenLight, fontFamily: fonts.familySemibold },
});
