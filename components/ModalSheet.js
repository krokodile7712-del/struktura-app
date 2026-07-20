import React from 'react';
import {
  Modal, View, Text, StyleSheet, Pressable, ScrollView,
} from 'react-native';
import { colors, fonts, radius } from '../constants/theme';

/**
 * Стандартный модальный лист СТРУКТУРЫ.
 * Заменяет дублирующиеся стили modalRoot/modalInner/modalHeader/modalClose
 * которые были скопированы ~15 раз по всему приложению.
 *
 * Использование:
 * <ModalSheet visible={open} onClose={() => setOpen(false)} title="Редактировать">
 *   <Text>Контент</Text>
 * </ModalSheet>
 *
 * Props:
 * - visible: bool
 * - onClose: fn
 * - title: string
 * - width: string|number (CSS-like, default '55%')
 * - scrollable: bool (default true) — оборачивает children в ScrollView
 * - footer: ReactNode — прикреплён внизу вне ScrollView
 */
export default function ModalSheet({
  visible,
  onClose,
  title,
  children,
  width = '55%',
  maxWidth = 520,
  scrollable = true,
  footer,
  style,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={[styles.sheet, { width, maxWidth, maxHeight: '92%' }, style]}>
          {/* Заголовок */}
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={16} style={styles.closeBtn}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          {/* Контент */}
          {scrollable ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            children
          )}

          {/* Footer */}
          {footer && <View style={styles.footer}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: '#0e0f11',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(74,77,84,0.5)',
    padding: 24,
    // Тень
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontFamily: fonts.family,
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  closeBtn: {
    padding: 4,
  },
  closeIcon: {
    fontSize: 18,
    color: colors.muted,
    lineHeight: 20,
  },
  footer: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
