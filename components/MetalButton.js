import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, fonts, gradients, withOpacity } from '../constants/theme';

// variant: 'default' | 'action' | 'success' | 'pay' | 'danger' | 'selected' | 'back'
// success/pay — действительно важные, подтверждающие действия (оплата,
// сохранение) — получают настоящую золотую поверхность с бликом и свечением.
// Остальные варианты — сдержанные, на текущих цветах темы (раньше 'selected'
// и 'danger' были на зашитых rgba-значениях старого оранжевого/красного —
// не подхватывали бы смену палитры молча; теперь оба через withOpacity
// от живых colors.orange/colors.red).
const FLAT_VARIANTS = {
  default:  { bg: colors.surface2, border: colors.border, text: colors.text },
  action:   { bg: colors.surface2, border: withOpacity(colors.indigo, 0.4), text: colors.text },
  danger:   { bg: withOpacity(colors.red, 0.08), border: withOpacity(colors.red, 0.4), text: colors.red },
  selected: { bg: withOpacity(colors.orange, 0.1), border: withOpacity(colors.orange, 0.5), text: colors.orange },
  back:     { bg: colors.surface2, border: colors.border, text: colors.muted },
};
const GOLD_VARIANTS = new Set(['success', 'pay']);

export default function MetalButton({ title, onPress, variant = 'default', style, textStyle, disabled }) {
  const isGold = GOLD_VARIANTS.has(variant);
  const v = FLAT_VARIANTS[variant] || FLAT_VARIANTS.default;

  if (isGold) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !!disabled }}
        style={({ pressed }) => [
          styles.goldWrap,
          disabled && styles.goldWrapDisabled,
          pressed && !disabled && { opacity: 0.9 },
          style,
        ]}
      >
        <LinearGradient
          colors={gradients.metalGold}
          locations={gradients.metalGoldLocations}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: 0.9 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={[styles.text, { color: '#0A121C' }, textStyle]}>{title}</Text>
      </Pressable>
    );
  }

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
  goldWrap: {
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
    overflow: 'hidden',
    shadowColor: colors.orange,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  goldWrapDisabled: {
    opacity: 0.4,
  },
  text: {
    fontFamily: fonts.family,
    fontSize: 14,
  },
});
