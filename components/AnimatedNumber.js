import React, { useEffect, useRef, useState } from 'react';
import { Text, Animated, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';

const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');

/**
 * Сумма в рублях: при изменении плавно «пересчитывается» (0,22 с, замедление в конце), знак ₽ —
 * приглушённым акцентным цветом и мельче, как в типографике банковских приложений.
 * style — стиль числа (размер, шрифт), rubStyle — необязательно, поверх стиля знака.
 */
export default function AnimatedNumber({ value, style, rubStyle, duration = 220 }) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(value);
  const anim = useRef(new Animated.Value(value)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current || reduce) { first.current = false; anim.setValue(value); setShown(value); return undefined; }
    const id = anim.addListener(({ value: v }) => setShown(v));
    Animated.timing(anim, { toValue: value, duration, useNativeDriver: false }).start(() => setShown(value));
    return () => anim.removeListener(id);
  }, [value]);

  // Знак ₽ — 60% размера числа (у вложенного Text нет «em», считаем из стиля числа)
  const flat = StyleSheet.flatten(style) || {};
  const rubSize = flat.fontSize ? Math.round(flat.fontSize * 0.6) : undefined;
  return (
    <Text style={style}>
      {fmt(shown)}<Text style={[styles.rub, rubSize ? { fontSize: rubSize } : null, rubStyle]}> ₽</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  rub: { fontFamily: fonts.familyMedium, color: colors.orangeLight },
});
