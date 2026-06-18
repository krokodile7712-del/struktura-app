import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, shadows } from '../constants/theme';

export default function MetalCard({ children, style }) {
  return (
    <View style={[styles.shadowWrap, shadows.card, style]}>
      <View style={styles.inner}>
        <LinearGradient
          colors={gradients.cardSurface}
          locations={gradients.cardSurfaceLocations}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: radius.lg,
    marginBottom: 14,
  },
  inner: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHi,
    borderBottomColor: colors.borderLo,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  content: {
    padding: 20,
  },
});
