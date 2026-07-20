import React, { useRef } from 'react';
import { Pressable, Text, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, shadows, fonts } from '../constants/theme';

// variant: 'default' | 'action' | 'success' | 'pay' | 'danger' | 'selected' | 'back'
const VARIANT_STYLES = {
  default: {
    border: colors.borderHi,
    glowColor: 'transparent',
    overlay: gradients.oliveGlow,
    textColor: colors.text,
  },
  action: {
    border: 'rgba(138,78,170,0.55)',
    glowColor: colors.purpleGlow,
    overlay: gradients.purpleGlow,
    textColor: colors.text,
  },
  success: {
    border: 'rgba(61,158,146,0.55)',
    glowColor: colors.greenGlow,
    overlay: gradients.greenGlow,
    textColor: colors.greenLight,
  },
  pay: {
    border: 'rgba(61,95,168,0.55)',
    glowColor: colors.blueGlow,
    overlay: gradients.blueGlow,
    textColor: colors.text,
  },
  danger: {
    border: 'rgba(160,16,32,0.65)',
    glowColor: colors.redGlow,
    overlay: gradients.redGlow,
    textColor: colors.redLight,
  },
  selected: {
    border: 'rgba(61,158,146,0.85)',
    glowColor: colors.greenGlow,
    overlay: gradients.greenGlow,
    textColor: colors.greenLight,
  },
  back: {
    border: 'rgba(255,255,255,0.08)',
    glowColor: 'transparent',
    overlay: null,
    textColor: colors.muted,
  },
};

export default function MetalButton({ title, onPress, variant = 'default', style, textStyle, disabled }) {
  const v = VARIANT_STYLES[variant] || VARIANT_STYLES.default;
  const pressAnim = useRef(new Animated.Value(0)).current; // 0 = up, 1 = pressed

  const handlePressIn = () => {
    Animated.timing(pressAnim, { toValue: 1, duration: 80, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.timing(pressAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start();
  };

  const translateY = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 3] });
  const brightness = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });

  const containerShadow = v.glowColor !== 'transparent' ? shadows.glow(v.glowColor) : shadows.button;

  return (
    <Animated.View
      style={[
        styles.shadowWrap,
        containerShadow,
        { transform: [{ translateY }] },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[styles.pressable, { borderColor: v.border, opacity: disabled ? 0.4 : 1 }]}
      >
        {/* Базовый металлический слой */}
        <LinearGradient
          colors={gradients.metalBase}
          locations={gradients.metalBaseLocations}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Цветная подсветка изнутри */}
        {v.overlay && (
          <LinearGradient
            colors={v.overlay}
            locations={gradients.glowLocations}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Затемнение при нажатии (имитация brightness(0.88)) */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: brightness }]}
        />
        {/* Верхний блик */}
        <LinearGradient
          colors={['rgba(255,255,255,0.08)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.45 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]}
        />
        <Text style={[styles.text, { color: disabled ? 'rgba(221,216,208,0.35)' : v.textColor }, textStyle]}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: radius.md,
    marginVertical: 5,
  },
  pressable: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  text: {
    fontFamily: fonts.family,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
});
