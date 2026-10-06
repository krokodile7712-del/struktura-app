import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import GlassSurface from './GlassSurface';
import { colors, fonts } from '../constants/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';

/**
 * Сегментированный переключатель в стиле iOS: тёмная «капсула» и стеклянный бегунок, который плавно
 * скользит к выбранному пункту (пружина без перелёта). items: [{ key, label }], value — key выбранного.
 */
export default function GlassSegmented({ items, value, onChange, height = 46 }) {
  const reduce = useReduceMotion();
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const n = Math.max(items.length, 1);
  const idx = Math.max(items.findIndex(i => i.key === value), 0);
  const segW = w > 0 ? (w - 8) / n : 0;

  useEffect(() => {
    if (segW <= 0) return;
    if (reduce) x.setValue(idx * segW);
    else Animated.spring(x, { toValue: idx * segW, speed: 22, bounciness: 0, useNativeDriver: true }).start();
  }, [idx, segW, reduce]);

  return (
    <View style={styles.wrap} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {segW > 0 && (
        <Animated.View pointerEvents="none" style={[styles.thumb, { width: segW, transform: [{ translateX: x }] }]}>
          <GlassSurface radius={11} floating shadowScale={0.3} tint="150,172,204" alpha={0.30} style={{ flex: 1 }}
            sheen={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.03)']}
            rimColors={{ top: 'rgba(255,255,255,0.40)', left: 'rgba(255,255,255,0.20)', right: 'rgba(255,255,255,0.14)', bottom: 'rgba(255,255,255,0.08)' }} />
        </Animated.View>
      )}
      {items.map(it => (
        <Pressable key={String(it.key)} style={[styles.item, { height }]} onPress={() => onChange && onChange(it.key)}>
          <Text style={[styles.txt, it.key === value && styles.txtOn]} numberOfLines={1}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', position: 'relative' },
  thumb: { position: 'absolute', top: 4, bottom: 4, left: 4 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  txt: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.textDim, paddingHorizontal: 6 },
  txtOn: { color: colors.text },
});
