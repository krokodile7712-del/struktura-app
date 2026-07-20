import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { fonts, colors } from '../constants/theme';

/**
 * ShiftBadge — компактный индикатор смены в TopBar.
 *
 * Использование в AdminScreen / DashboardScreen:
 * <TopBar
 *   title="..."
 *   navigation={navigation}
 *   rightElement={<ShiftBadge stats={stats} onPress={() => navigation.navigate('ShiftClose')} />}
 * />
 */
export default function ShiftBadge({ stats, onPress }) {
  if (!stats) return null;

  const { shift, shiftDuration, todayOrders, todayTotal } = stats;

  if (!shift) {
    // Смена закрыта — маленький серый значок
    return (
      <View style={styles.badgeClosed}>
        <View style={[styles.dot, styles.dotClosed]} />
        <Text style={styles.textClosed}>нет смены</Text>
      </View>
    );
  }

  // Смена открыта — зелёный бейдж с временем и выручкой
  return (
    <Pressable
      style={styles.badgeOpen}
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel="Статус смены"
    >
      <View style={[styles.dot, styles.dotOpen]} />
      <View style={styles.info}>
        <Text style={styles.duration}>{shiftDuration || '—'}</Text>
        {todayOrders > 0 && (
          <Text style={styles.revenue}>
            {todayOrders} зак. · {Math.round(todayTotal).toLocaleString('ru-RU')} ₽
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotOpen:   { backgroundColor: '#3d9e92' },
  dotClosed: { backgroundColor: '#4a4d54' },
  info: { alignItems: 'flex-start' },
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
});
