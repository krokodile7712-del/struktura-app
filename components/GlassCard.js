import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { radius as radii } from '../constants/theme';

/**
 * Полупрозрачная стеклянная панель — для второстепенных панелей на экране,
 * где под низом уже что-то есть (например, атмосферное свечение фона) и
 * его хочется видеть сквозь материал, а не перекрывать плоским цветом.
 * Настоящий blur через expo-blur, не просто полупрозрачный фон.
 *
 * Использование:
 * <GlassCard><Text>312 400 ₽</Text></GlassCard>
 *
 * Props:
 * - children: содержимое панели
 * - style: дополнительные стили внешнего контейнера
 * - intensity: сила размытия, 0–100 (по умолчанию 40)
 * - radius: скругление углов (по умолчанию radius.xl из темы)
 */
export default function GlassCard({ children, style, intensity = 40, radius: r = radii.xl }) {
  return (
    <View style={[styles.wrap, { borderRadius: r }, style]}>
      <BlurView
        intensity={intensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
        // На этой версии expo-blur настоящий блюр на Android требует
        // отдельной привязки (blurTarget — ссылка на то, что именно
        // размывать, отдельным слоем) — для karточек такого размера
        // визуально давало бы немного (под ними просто ровный фон, размывать
        // особо нечего), а сложность добавляет ощутимую. 'none' — честно,
        // без предупреждений в консоли; стеклянность несут градиент и
        // светлая кромка ниже, не буквальное размытие
        blurMethod={Platform.OS === 'android' ? 'none' : undefined}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.02)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.topHighlight} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 26,
    elevation: 10,
  },
  topHighlight: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  content: {
    padding: 20,
  },
});
