import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { fonts, colors } from '../constants/theme';

/**
 * StatsBar — горизонтальная полоска под TopBar с ключевыми метриками.
 * Не сдвигает контент сильно — занимает ~56px по высоте.
 */
export default function StatsBar({ stats, modules, onShiftPress, onStockPress }) {
  if (!stats) return null;

  const { shift, shiftDuration, todayOrders, todayTotal, todayCash, todayCard, todayMixed, lowStockCount, lowStockItems } = stats;

  return (
    <View style={styles.bar}>
      {/* Смена */}
      <Pressable style={styles.item} onPress={onShiftPress} hitSlop={6}>
        <View style={[styles.dot, shift ? styles.dotOpen : styles.dotClosed]} />
        <View>
          <Text style={[styles.val, !shift && styles.valMuted]}>
            {shift ? (shiftDuration || '—') : 'нет смены'}
          </Text>
          <Text style={styles.label}>смена</Text>
        </View>
      </Pressable>

      <View style={styles.divider} />

      {/* Заказы */}
      <View style={styles.item}>
        <Text style={[styles.val, todayOrders === 0 && styles.valMuted]}>{todayOrders}</Text>
        <Text style={styles.label}>заказов</Text>
      </View>

      <View style={styles.divider} />

      {/* Выручка */}
      <View style={[styles.item, { flex: 1 }]}>
        <Text style={[styles.val, styles.valAccent, todayTotal === 0 && styles.valMuted]}>
          {todayTotal > 0 ? `${Math.round(todayTotal).toLocaleString('ru-RU')} ₽` : '—'}
        </Text>
        <Text style={styles.label}>
          {todayCash > 0 && todayCard + todayMixed > 0
            ? `💵 ${Math.round(todayCash).toLocaleString('ru-RU')} · 💳 ${Math.round(todayCard + todayMixed).toLocaleString('ru-RU')}`
            : 'выручка сегодня'}
        </Text>
      </View>

      {/* Склад — только если есть проблемы */}
      {modules?.stock !== false && lowStockCount > 0 && (
        <>
          <View style={styles.divider} />
          <Pressable style={styles.stockItem} onPress={onStockPress} hitSlop={6}>
            <Text style={styles.stockIcon}>⚠️</Text>
            <View>
              <Text style={styles.stockVal}>{lowStockCount} поз.</Text>
              <Text style={styles.stockLabel}>мало на складе</Text>
            </View>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#0b0c0f',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74,77,84,0.3)',
    gap: 4,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(74,77,84,0.3)',
    marginHorizontal: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  dotOpen:   { backgroundColor: '#3d9e92' },
  dotClosed: { backgroundColor: '#4a4d54' },
  val: {
    fontFamily: fonts.familySemibold,
    fontSize: 16,
    color: colors.text,
    lineHeight: 20,
  },
  valAccent: { color: '#3d9e92' },
  valMuted:  { color: colors.muted },
  label: {
    fontFamily: fonts.familyRegular,
    fontSize: 10,
    color: colors.muted,
    lineHeight: 13,
  },
  stockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(160,16,32,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(160,16,32,0.3)',
  },
  stockIcon: { fontSize: 14 },
  stockVal: {
    fontFamily: fonts.familySemibold,
    fontSize: 13,
    color: '#e05555',
    lineHeight: 17,
  },
  stockLabel: {
    fontFamily: fonts.familyRegular,
    fontSize: 10,
    color: '#e05555',
    lineHeight: 13,
    opacity: 0.8,
  },
});
