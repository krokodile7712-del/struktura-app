import React, { useRef, useEffect } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';

const TRACK_W   = 50;
const TRACK_H   = 28;
const THUMB     = 22;
const TRAVEL    = TRACK_W - THUMB - 6; // 22

/**
 * iOS-стиль Toggle Switch с пружинной анимацией.
 *
 * Использование:
 * <Toggle value={modules.stock} onValueChange={v => toggleModule('stock', v)} />
 *
 * Props:
 * - value: bool
 * - onValueChange: (bool) => void
 * - disabled: bool
 * - size: 'sm' | 'md' (default 'md')
 */
export default function Toggle({ value, onValueChange, disabled = false, size = 'md' }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue:  value ? 1 : 0,
      useNativeDriver: false,
      bounciness: 5,
      speed: 16,
    }).start();
  }, [value]);

  const scale  = size === 'sm' ? 0.75 : 1;
  const trackW = TRACK_W * scale;
  const trackH = TRACK_H * scale;
  const thumb  = THUMB   * scale;
  const travel = TRAVEL  * scale;

  const trackColor = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(74,77,84,0.55)', 'rgba(61,158,146,0.85)'],
  });

  const thumbX = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [3 * scale, travel + 3 * scale],
  });

  const thumbScale = anim.interpolate({
    inputRange:  [0, 0.5, 1],
    outputRange: [1, 0.85, 1],
  });

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={{ opacity: disabled ? 0.38 : 1 }}
    >
      <Animated.View
        style={[
          styles.track,
          {
            width: trackW,
            height: trackH,
            borderRadius: trackH / 2,
            backgroundColor: trackColor,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: thumb,
              height: thumb,
              borderRadius: thumb / 2,
              transform: [{ translateX: thumbX }, { scale: thumbScale }],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    justifyContent: 'center',
    // Тонкая рамка
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  thumb: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
});
