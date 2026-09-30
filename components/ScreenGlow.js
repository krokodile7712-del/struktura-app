import React from 'react';
import { View, StyleSheet } from 'react-native';
import { gradients } from '../constants/theme';

/**
 * Атмосферное свечение — тёплое золото сверху слева, холодная слива сверху
 * справа. Рендерится ПЕРВЫМ элементом внутри самого экрана (позади
 * прокручиваемого содержимого), не глобальной обёрткой поверх навигации —
 * у нативного стека экранов (native-stack) своя непрозрачная подложка под
 * каждым экраном, сквозь неё ничего извне не просвечивает, никакой
 * background-color/contentStyle это не пробивает. Поэтому у каждого
 * экрана, где нужно свечение, — свой собственный слой, не общий.
 *
 * Использование: первым ребёнком в корневом View экрана, у которого
 * position: 'relative' и overflow: 'hidden'.
 * <View style={styles.root}>
 *   <ScreenGlow />
 *   ...остальное содержимое экрана...
 * </View>
 */
export default function ScreenGlow() {
  return (
    <View style={styles.atmosphere} pointerEvents="none">
      <View style={[styles.blob, styles.blobGold]} />
      <View style={[styles.blob, styles.blobPlum]} />
    </View>
  );
}

const BLOB = 480;

const styles = StyleSheet.create({
  atmosphere: { ...StyleSheet.absoluteFillObject },
  blob: {
    position: 'absolute',
    width: BLOB, height: BLOB, borderRadius: BLOB / 2,
  },
  blobGold: {
    top: -BLOB * 0.55, left: -BLOB * 0.35,
    backgroundColor: gradients.atmosphereGold,
  },
  blobPlum: {
    top: -BLOB * 0.6, right: -BLOB * 0.4,
    backgroundColor: gradients.atmospherePlum,
  },
});
