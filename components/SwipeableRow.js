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
export default function SwipeableRow({
  children,
  onAction,
  label = 'Удалить',
  color = colors.redLight,
  disabled = false,
}) {
  const x = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const close = () => {
    Animated.spring(x, {
      toValue: 0, useNativeDriver: true,
      bounciness: 3, speed: 18,
    }).start(() => { isOpen.current = false; });
  };

  const open = () => {
    Animated.spring(x, {
      toValue: -THRESHOLD, useNativeDriver: true,
      bounciness: 2, speed: 16,
    }).start(() => { isOpen.current = true; });
  };

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => {
      if (disabled) return false;
      return Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
    },
    onPanResponderGrant: () => {
      x.stopAnimation();
    },
    onPanResponderMove: (_, g) => {
      const base = isOpen.current ? -THRESHOLD : 0;
      const next = base + g.dx;
      x.setValue(Math.min(0, Math.max(next, -THRESHOLD - 16)));
    },
    onPanResponderRelease: (_, g) => {
      const base = isOpen.current ? -THRESHOLD : 0;
      const delta = base + g.dx;
      if (delta < -THRESHOLD / 2) {
        open();
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

  const handleAction = () => {
    close();
    onAction?.();
  };

  return (
    <View style={styles.wrap}>
      {/* Кнопка под строкой */}
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

      {/* Сама строка — едет влево */}
      <Animated.View
        style={{ transform: [{ translateX: x }] }}
        {...pan.panHandlers}
      >
        <Pressable onPress={() => { if (isOpen.current) close(); }}>
          {children}
        </Pressable>
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
