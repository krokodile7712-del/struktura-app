import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors, radius } from '../constants/theme';

/**
 * Skeleton — анимированная серая заглушка пока данные загружаются.
 *
 * Использование:
 * {loading ? <SkeletonList count={5} /> : <RealList data={data} />}
 *
 * Компоненты:
 * - Skeleton({ width, height, borderRadius, style }) — одна заглушка
 * - SkeletonList({ count }) — список строк
 * - SkeletonCard() — карточка с заглушками
 */

// Базовый shimmer-блок
export function Skeleton({ width = '100%', height = 16, borderRadius = radius.sm, style }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    return () => shimmer.stopAnimation();
  }, []);

  const opacity = shimmer.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.35, 0.65],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

// Строка списка: иконка + две строчки текста
export function SkeletonRow({ style }) {
  return (
    <View style={[styles.row, style]}>
      <Skeleton width={40} height={40} borderRadius={10} />
      <View style={styles.rowContent}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={11} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={50} height={14} />
    </View>
  );
}

// Список строк
export function SkeletonList({ count = 5, style }) {
  return (
    <View style={[styles.list, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} style={i > 0 && { marginTop: 4 }} />
      ))}
    </View>
  );
}

// Карточка с несколькими строчками
export function SkeletonCard({ rows = 3, style }) {
  return (
    <View style={[styles.card, style]}>
      <Skeleton width="40%" height={11} style={{ marginBottom: 14 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.cardRow}>
          <Skeleton width={`${50 + i * 10}%`} height={14} />
          <Skeleton width={60} height={14} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.borderHi,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowContent: {
    flex: 1,
    gap: 0,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
});
