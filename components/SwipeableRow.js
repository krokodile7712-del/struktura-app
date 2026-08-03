import React, { useRef } from 'react';
import {
  Animated, PanResponder, View, Text,
  Pressable, StyleSheet,
} from 'react-native';
import { colors, fonts, radius } from '../constants/theme';

const THRESHOLD = 72; // ширина кнопки удаления

/**
 * SwipeableRow — обёртка для строки списка.
 * Свайп влево → появляется кнопка действия (по умолчанию «Удалить»).
 *
 * Использование:
 * <SwipeableRow onAction={() => removeItem(id)} label="Удалить">
 *   <View style={styles.row}>...</View>
 * </SwipeableRow>
 *
 * Props:
 * - onAction: fn — что делать по кнопке
 * - label: string — текст кнопки (default 'Удалить')
 * - color: string — цвет кнопки (default red)
 * - disabled: bool — отключить свайп
 */
/**
 * SwipeableRow — обёртка для строки списка.
 * Свайп влево → появляется правое действие (по умолчанию «Удалить»).
 * Свайп вправо → появляется левое действие, если передан onLeftAction (например «Заметка»).
 *
 * Использование:
 * <SwipeableRow onAction={() => removeItem(id)} label="Удалить"
 *               onLeftAction={() => addNote(id)} leftLabel="Заметка" leftColor={colors.indigo}>
 *   <View style={styles.row}>...</View>
 * </SwipeableRow>
 *
 * Props:
 * - onAction: fn — действие по правой кнопке (свайп влево)
 * - label: string — текст правой кнопки (default 'Удалить')
 * - color: string — цвет правой кнопки (default red)
 * - onLeftAction: fn — действие по левой кнопке (свайп вправо). Если не передан — свайп вправо отключён
 * - leftLabel: string — текст левой кнопки (default 'Заметка')
 * - leftColor: string — цвет левой кнопки (default indigo)
 * - disabled: bool — отключить свайп целиком
 */
export default function SwipeableRow({
  children,
  onAction,
  label = 'Удалить',
  color = colors.redLight,
  onLeftAction,
  leftLabel = 'Заметка',
  leftColor = colors.indigo,
  disabled = false,
  style,     // внешний отступ строки (margin) — кнопки свайпа будут обрезаны точно по этой форме
  radius = 0, // скругление углов строки — применяется и к кнопкам свайпа через overflow:hidden
}) {
  const x = useRef(new Animated.Value(0)).current;
  const openSide = useRef(0); // -1 = открыто вправо (видна правая кнопка), 1 = открыто влево (видна левая кнопка), 0 = закрыто
  const hasLeft = !!onLeftAction;

  const close = () => {
    Animated.spring(x, {
      toValue: 0, useNativeDriver: true,
      bounciness: 3, speed: 18,
    }).start(() => { openSide.current = 0; });
  };

  const openRight = () => {
    Animated.spring(x, {
      toValue: -THRESHOLD, useNativeDriver: true,
      bounciness: 2, speed: 16,
    }).start(() => { openSide.current = -1; });
  };

  const openLeft = () => {
    Animated.spring(x, {
      toValue: THRESHOLD, useNativeDriver: true,
      bounciness: 2, speed: 16,
    }).start(() => { openSide.current = 1; });
  };

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => {
      // Если строка открыта — захватываем тач, закрываем,
      // не передаём событие вложенным Pressable
      if (openSide.current !== 0) { close(); return true; }
      return false;
    },
    onMoveShouldSetPanResponder: (_, g) => {
      if (disabled) return false;
      if (!hasLeft && g.dx > 0) return false; // без левого действия свайп вправо не перехватываем
      return Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
    },
    onPanResponderGrant: () => {
      x.stopAnimation();
    },
    onPanResponderMove: (_, g) => {
      const base = openSide.current === -1 ? -THRESHOLD : openSide.current === 1 ? THRESHOLD : 0;
      let next = base + g.dx;
      const min = -THRESHOLD - 16;
      const max = hasLeft ? THRESHOLD + 16 : 0;
      x.setValue(Math.min(max, Math.max(next, min)));
    },
    onPanResponderRelease: (_, g) => {
      const base = openSide.current === -1 ? -THRESHOLD : openSide.current === 1 ? THRESHOLD : 0;
      const delta = base + g.dx;
      if (delta < -THRESHOLD / 2) {
        openRight();
      } else if (hasLeft && delta > THRESHOLD / 2) {
        openLeft();
      } else {
        close();
      }
    },
    onPanResponderTerminate: () => close(),
  });

  const revealOpacity = x.interpolate({
    inputRange: [-THRESHOLD, -4, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const leftRevealOpacity = x.interpolate({
    inputRange: [0, 4, THRESHOLD],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  const handleAction = () => {
    close();
    onAction?.();
  };

  const handleLeftAction = () => {
    close();
    onLeftAction?.();
  };

  return (
    <View style={[styles.wrap, radius ? { borderRadius: radius } : null, style]}>
      {/* Левая кнопка (свайп вправо) */}
      {hasLeft && (
        <Animated.View style={[styles.revealLeft, { opacity: leftRevealOpacity }]}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: leftColor }]}
            onPress={handleLeftAction}
            accessibilityLabel={leftLabel}
            accessibilityRole="button"
          >
            <Text style={styles.actionLabel}>{leftLabel}</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Правая кнопка (свайп влево) */}
      <Animated.View style={[styles.reveal, { opacity: revealOpacity }]}>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: color }]}
          onPress={handleAction}
          accessibilityLabel={label}
          accessibilityRole="button"
        >
          <Text style={styles.actionLabel}>{label}</Text>
        </Pressable>
      </Animated.View>

      {/* Сама строка — едет в обе стороны, без лишней Pressable-обёртки */}
      <Animated.View
        style={{ transform: [{ translateX: x }] }}
        {...pan.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    position: 'relative',
  },
  reveal: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: THRESHOLD,
    justifyContent: 'center',
    alignItems: 'center',
  },
  revealLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: THRESHOLD,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  actionLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
