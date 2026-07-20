import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, fonts } from '../constants/theme';

function fmt(n) {
  if (n == null || n === 0) return '—';
  return n.toLocaleString('ru-RU') + ' ₽';
}

export default function DashboardWidget({ stats, modules, onLowStockPress }) {
  if (!stats) return null;

  const {
    shift, shiftDuration,
    todayOrders, todayTotal, todayCash, todayCard, todayMixed,
    lowStockItems, lowStockCount,
  } = stats;

  return (
    <View style={styles.widget}>
      {/* Выручка за сегодня */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{todayOrders}</Text>
          <Text style={styles.statLabel}>заказов</Text>
        </View>
        <View style={[styles.statBox, styles.statBoxMain]}>
          <Text style={[styles.statVal, styles.statValMain]}>{fmt(todayTotal)}</Text>
          <Text style={styles.statLabel}>сегодня</Text>
        </View>
        {todayCash > 0 && (
          <View style={styles.statBox}>
            <Text style={styles.statVal}>💵 {fmt(todayCash)}</Text>
            <Text style={styles.statLabel}>нал</Text>
          </View>
        )}
        {(todayCard + todayMixed) > 0 && (
          <View style={styles.statBox}>
            <Text style={styles.statVal}>💳 {fmt(todayCard + todayMixed)}</Text>
            <Text style={styles.statLabel}>безнал</Text>
          </View>
        )}
      </View>

      {/* Склад — предупреждения */}
      {modules?.stock !== false && lowStockCount > 0 && (
        <Pressable style={styles.stockAlert} onPress={onLowStockPress}>
          <Text style={styles.stockAlertIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.stockAlertTitle}>
              Мало на складе: {lowStockCount} {lowStockCount === 1 ? 'позиция' : lowStockCount < 5 ? 'позиции' : 'позиций'}
            </Text>
            <Text style={styles.stockAlertItems} numberOfLines={1}>
              {lowStockItems.map(i => `${i.name} (${i['остаток']} ${i.unit})`).join(', ')}
            </Text>
          </View>
          <Text style={styles.stockAlertArrow}>›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  widget: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    backgroundColor: '#0b0c0f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(74,77,84,0.35)',
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOpen:   { backgroundColor: '#3d9e92' },
  dotClosed: { backgroundColor: '#4a4d54' },
  shiftText: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statBox: {
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: '#07080a', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)',
    alignItems: 'center', minWidth: 80,
  },
  statBoxMain: { borderColor: 'rgba(61,158,146,0.35)', flex: 1 },
  statVal: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: colors.text },
  statValMain: { color: '#3d9e92', fontSize: 17 },
  statLabel: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, marginTop: 2 },
  stockAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: 'rgba(160,16,32,0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(160,16,32,0.25)',
  },
  stockAlertIcon: { fontSize: 16 },
  stockAlertTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: '#e05555' },
  stockAlertItems: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 1 },
  stockAlertArrow: { fontSize: 18, color: colors.muted },
});
