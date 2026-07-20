import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { fonts, colors } from '../constants/theme';

/**
 * ShiftBadge — все ключевые метрики в TopBar справа.
 * Заменяет виджет — никакого вертикального смещения контента.
 */
export default function ShiftBadge({ stats, onShiftPress, onStockPress }) {
  if (!stats) return null;

  const { shift, shiftDuration, todayOrders, todayTotal, todayCash, todayCard, lowStockCount } = stats;

  const hasRevenue = todayTotal > 0;

  return (
    <View style={styles.wrap}>
      {/* Предупреждение склада */}
      {lowStockCount > 0 && (
        <Pressable style={styles.stockBadge} onPress={onStockPress} hitSlop={8}>
          <Text style={styles.stockIcon}>⚠️</Text>
          <Text style={styles.stockCount}>{lowStockCount}</Text>
        </Pressable>
      )}

      {/* Статистика + смена */}
      <Pressable
        style={[styles.mainBadge, !shift && styles.mainBadgeClosed]}
        onPress={onShiftPress}
        hitSlop={8}
      >
        <View style={styles.dotWrap}>
          <View style={[styles.dot, shift ? styles.dotOpen : styles.dotClosed]} />
        </View>
        <View style={styles.info}>
          {/* Первая строка: время смены */}
          <Text style={shift ? styles.shiftTime : styles.shiftNone}>
            {shift ? (shiftDuration || '—') : 'нет смены'}
          </Text>
          {/* Вторая строка: заказы + выручка */}
          {shift && (
            <Text style={styles.stats}>
              {todayOrders > 0
                ? `${todayOrders} зак · ${Math.round(todayTotal).toLocaleString('ru-RU')} ₽`
                : 'заказов нет'}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(160,16,32,0.12)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(160,16,32,0.35)',
  },
  stockIcon: { fontSize: 11, lineHeight: 14 },
  stockCount: {
    fontFamily: fonts.familySemibold,
    fontSize: 12,
    color: '#e05555',
    lineHeight: 14,
  },
  mainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(61,158,146,0.1)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(61,158,146,0.35)',
  },
  mainBadgeClosed: {
    backgroundColor: 'rgba(74,77,84,0.1)',
    borderColor: 'rgba(74,77,84,0.25)',
  },
  dotWrap: { justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOpen:   { backgroundColor: '#3d9e92' },
  dotClosed: { backgroundColor: '#4a4d54' },
  info: { alignItems: 'flex-start' },
  shiftTime: {
    fontFamily: fonts.familySemibold,
    fontSize: 12,
    color: colors.greenLight,
    lineHeight: 15,
  },
  shiftNone: {
    fontFamily: fonts.familyRegular,
    fontSize: 11,
    color: colors.muted,
    lineHeight: 15,
  },
  stats: {
    fontFamily: fonts.familyRegular,
    fontSize: 10,
    color: colors.muted,
    lineHeight: 13,
  },
});
