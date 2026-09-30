import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, withOpacity } from '../constants/theme';

/**
 * Точечное свечение за иконкой — не заливка всей строки цветом, а мягкий
 * ореол именно вокруг конкретной иконки. Используется в списках (последние
 * заказы, история), чтобы выделить смысл строки (оплата, бонус, статус)
 * цветом только там, где это действительно нужно.
 *
 * Использование:
 * <GlowIcon color={colors.orange}><Text>☕</Text></GlowIcon>
 *
 * Props:
 * - color: цвет свечения, любой из палитры (по умолчанию colors.orange — золото)
 * - size: размер квадрата в пикселях (по умолчанию 38)
 * - children: сама иконка/эмодзи/текст внутри
 */
export default function GlowIcon({ color = colors.orange, size = 38, children, style }) {
  const radius = Math.round(size * 0.29);
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: withOpacity(color, 0.14),
          shadowColor: color,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 6, // на Android shadowRadius не работает без elevation — свечение хуже, но не исчезает совсем
  },
});
