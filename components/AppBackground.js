import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../constants/theme';

// Временно упрощено до простого тёмного фона без эффектов,
// чтобы не отвлекать от разработки основного функционала.
export default function AppBackground({ children }) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
});
