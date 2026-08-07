import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '../constants/theme';

// Тот же интерфейс пропсов, что был у металлической версии — заменена
// только сама отрисовка (плоский стиль вместо градиента/тиснения).
export default function MetalCard({ children, style }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: 14,
  },
  content: {
    padding: 20,
  },
});
