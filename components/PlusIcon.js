import React from 'react';
import { View } from 'react-native';
import { colors } from '../constants/theme';

// Нарисованный плюс (два бруска) — без шрифтовых символов, одинаков на всех устройствах.
export default function PlusIcon({ size = 18, color = colors.text }) {
  const t = Math.max(2, Math.round(size * 0.13));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: t, borderRadius: t / 2, backgroundColor: color }} />
      <View style={{ position: 'absolute', width: t, height: size, borderRadius: t / 2, backgroundColor: color }} />
    </View>
  );
}
