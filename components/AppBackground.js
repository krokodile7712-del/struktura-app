import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, gradients } from '../constants/theme';

// Глобальная обёртка — фон под всем приложением, на каждом экране.
// Атмосферное свечение (тёплое золото сверху слева, холодная слива сверху
// справа) — два больших мягких пятна, а не настоящий radial-gradient
// (react-native-svg не подключён ради этого одного эффекта) и без blur
// (это рисуется под каждым экраном приложения постоянно — второй такой
// слой размытия поверх уже использующегося в GlassCard был бы лишней
// нагрузкой там, где в этом нет необходимости). Достаточно большой размер
// и низкая непрозрачность сами по себе выглядят мягко на тёмном фоне.
export default function AppBackground({ children }) {
  return (
    <View style={styles.container}>
      <View style={styles.atmosphere} pointerEvents="none">
        <View style={[styles.blob, styles.blobGold]} />
        <View style={[styles.blob, styles.blobPlum]} />
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const BLOB = 480;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  atmosphere: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
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
  content: { flex: 1 },
});
