import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';

// Живая схема пути товара — Склад → Товар → Касса → Продажа. Показывается
// вместо пустой заглушки "Выберите товар" в альбомной ориентации.
//
// Три задуманных детали:
//  - "Комета" вместо точки — короткий светящийся след из нескольких точек
//    с убывающей прозрачностью, а не одна голая точка
//  - Тап по любому узлу разворачивает направление движения — можно
//    посмотреть путь и вперёд (товар → продажа), и назад
//  - Цвет следа мягко меняется в зависимости от времени суток — тёплый
//    утром, холоднее вечером
const NODES = [
  { key: 'stock',   icon: '📦', label: 'Склад' },
  { key: 'product', icon: '🛍', label: 'Товар' },
  { key: 'kassa',   icon: '🛒', label: 'Касса' },
  { key: 'sale',     icon: '💰', label: 'Продажа' },
];

const TRAIL_LEN = 5;
const CYCLE_MS = 3200;

// Цвет следа по текущему часу — тёплый утром, холоднее к вечеру/ночи.
function colorForHour(hour) {
  if (hour >= 5 && hour < 11)  return '#f0a050'; // утро — тёплый оранжевый
  if (hour >= 11 && hour < 17) return '#f0c050'; // день — золотистый
  if (hour >= 17 && hour < 22) return '#e0708a'; // вечер — розово-тёплый
  return '#6a7ce0';                              // ночь — приглушённый синий
}

export default function CatalogPulseEmpty() {
  const [direction, setDirection] = useState(1); // 1 = вперёд, -1 = назад
  const progress = useRef(new Animated.Value(0)).current;
  const trailColor = colorForHour(new Date().getHours());

  useEffect(() => {
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: CYCLE_MS, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [direction]);

  const toggleDirection = () => setDirection(d => d === 1 ? -1 : 1);

  // Позиция "головы" кометы вдоль цепочки узлов (0..1), с учётом направления
  const headPct = direction === 1
    ? progress
    : progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={styles.root}>
      <Text style={styles.hint}>Путь товара — нажмите на узел, чтобы развернуть</Text>

      <View style={styles.chain}>
        {/* Линия-стержень позади узлов */}
        <View style={styles.spine} />

        {/* Комета — несколько точек со сдвигом и убывающей прозрачностью */}
        {Array.from({ length: TRAIL_LEN }).map((_, i) => {
          const delay = i * 0.06;
          const dotPct = Animated.add(headPct, new Animated.Value(-delay * direction));
          const top = dotPct.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%'],
            extrapolate: 'clamp',
          });
          const opacity = 1 - i / TRAIL_LEN;
          return (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                styles.trailDot,
                {
                  top,
                  opacity,
                  backgroundColor: trailColor,
                  width: 10 - i,
                  height: 10 - i,
                  borderRadius: 5,
                },
              ]}
            />
          );
        })}

        {NODES.map((n, i) => (
          <Pressable key={n.key} style={styles.node} onPress={toggleDirection}>
            <View style={[styles.nodeCircle, { borderColor: trailColor }]}>
              <Text style={styles.nodeIcon}>{n.icon}</Text>
            </View>
            <Text style={styles.nodeLabel}>{n.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  hint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 28, textAlign: 'center' },
  chain: { width: 120, height: 340, position: 'relative', alignItems: 'center' },
  spine: { position: 'absolute', top: 24, bottom: 24, width: 2, backgroundColor: colors.border },
  trailDot: { position: 'absolute', left: 55 },
  node: { alignItems: 'center', height: 340 / 4, justifyContent: 'center' },
  nodeCircle: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  nodeIcon: { fontSize: 18 },
  nodeLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, marginTop: 6 },
});
