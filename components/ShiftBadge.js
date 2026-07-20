import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { fonts, colors } from '../constants/theme';

/**
 * ShiftBadge — компактные индикаторы в TopBar (смена + склад).
 * Не влияют на высоту TopBar и не смещают контент ниже.
 */
export default function ShiftBadge({ stats, onShiftPress, onStockPress }) {
  if (!stats) return null;

  const { shift, shiftDuration, todayOrders, todayTotal, lowStockCount, lowStockItems } = stats;

  return (
    <View style={styles.row}>
      {/* Индикатор склада — только если есть проблемы */}
      {lowStockCount > 0 && (
        <Pressable
          style={styles.stockBadge}
          onPress={onStockPress}
          hitSlop={8}
          accessibilityLabel={`Мало на складе: ${lowStockCount} позиций`}
        >
          <Text style={styles.stockIcon}>⚠️</Text>
          <Text style={styles.stockCount}>{lowStockCount}</Text>
        </Pressable>
      )}

      {/* Индикатор смены */}
      <Pressable
        style={shift ? styles.badgeOpen : styles.badgeClosed}
        onPress={onShiftPress}
        hitSlop={8}
        accessibilityLabel="Статус смены"
      >
        <View style={[styles.dot, shift ? styles.dotOpen : styles.dotClosed]} />
        <View>
          <Text style={shift ? styles.duration : styles.textClosed}>
            {shift ? (shiftDuration || '—') : 'нет смены'}
          </Text>
          {shift && todayOrders > 0 && (
            <Text style={styles.revenue}>
              {todayOrders} · {Math.round(todayTotal).toLocaleString('ru-RU')} ₽
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Смена открыта
  badgeOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(61,158,146,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(61,158,146,0.35)',
  },
  // Смена закрыта
  badgeClosed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    backgroundColor: 'rgba(74,77,84,0.12)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(74,77,84,0.25)',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOpen:   { backgroundColor: '#3d9e92' },
  dotClosed: { backgroundColor: '#4a4d54' },
  duration: {
    fontFamily: fonts.familySemibold,
    fontSize: 12,
    color: colors.greenLight,
    lineHeight: 15,
  },
  revenue: {
    fontFamily: fonts.familyRegular,
    fontSize: 10,
    color: colors.muted,
    lineHeight: 13,
  },
  textClosed: {
    fontFamily: fonts.familyRegular,
    fontSize: 11,
    color: colors.muted,
  },
  // Склад
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(160,16,32,0.12)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(160,16,32,0.35)',
  },
  stockIcon: { fontSize: 12, lineHeight: 15 },
  stockCount: {
    fontFamily: fonts.familySemibold,
    fontSize: 12,
    color: '#e05555',
    lineHeight: 15,
  },
});
