import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, radius, fonts } from '../constants/theme';

// variant: 'default' | 'action' | 'success' | 'pay' | 'danger' | 'selected' | 'back'
// Сохранён тот же набор вариантов и пропсов, что был у металлической версии —
// заменена только сама отрисовка (плоский стиль вместо градиента/свечения),
// чтобы не переписывать десятки мест использования по всему приложению.
const VARIANT_STYLES = {
  default:  { bg: colors.surface2, border: colors.border, text: colors.text },
  action:   { bg: colors.surface2, border: 'rgba(139,127,212,0.4)', text: colors.text },
  success:  { bg: colors.orange, border: colors.orange, text: '#fff' },
  pay:      { bg: colors.orange, border: colors.orange, text: '#fff' },
  danger:   { bg: 'rgba(160,16,32,0.06)', border: 'rgba(160,16,32,0.35)', text: colors.red },
  selected: { bg: 'rgba(240,160,80,0.08)', border: 'rgba(240,160,80,0.5)', text: colors.orange },
  back:     { bg: colors.surface2, border: colors.border, text: colors.muted },
};

export default function MetalButton({ title, onPress, variant = 'default', style, textStyle, disabled }) {
  const v = VARIANT_STYLES[variant] || VARIANT_STYLES.default;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.pressable,
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <Text style={[styles.text, { color: disabled ? colors.muted : v.text }, textStyle]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
  },
  text: {
    fontFamily: fonts.family,
    fontSize: 14,
    fontWeight: '700',
  },
});
