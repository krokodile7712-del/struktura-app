import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

const PERIODS = [
  { key: 'day', label: 'День' },
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
];

const MOCK_ITEMS = [
  { name: 'Капучино', size: 'S', price: 180, method: 'Наличные' },
  { name: 'Латте', size: 'M', price: 230, method: 'Карта' },
  { name: 'Американо', size: 'S', price: 150, method: 'Наличные' },
];

export default function SalesScreen({ navigation }) {
  const [period, setPeriod] = useState('day');
  const cash = MOCK_ITEMS.filter(i => i.method === 'Наличные').reduce((s, i) => s + i.price, 0);
  const card = MOCK_ITEMS.filter(i => i.method === 'Карта').reduce((s, i) => s + i.price, 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.cardTitle}>📊 Продажи</Text>

          <View style={styles.periodRow}>
            {PERIODS.map((p) => (
              <Pressable
                key={p.key}
                style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
                onPress={() => setPeriod(p.key)}
              >
                <Text style={[styles.periodLabel, period === p.key && styles.periodLabelActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>☕ Позиции</Text>
          {MOCK_ITEMS.map((item, idx) => (
            <View key={idx} style={styles.row}>
              <Text style={styles.rowName}>{item.name} {item.size} <Text style={styles.rowMethod}>{item.method}</Text></Text>
              <Text style={styles.rowPrice}>{item.price} ₽</Text>
            </View>
          ))}

          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>💵 Наличные</Text>
            <Text style={styles.totalValue}>{cash} ₽</Text>
          </View>
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>💳 Безнал</Text>
            <Text style={styles.totalValue}>{card} ₽</Text>
          </View>
          <View style={[styles.row, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>ИТОГО</Text>
            <Text style={styles.grandTotalValue}>{cash + card} ₽</Text>
          </View>
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Login" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingTop: 40, paddingBottom: 100, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  cardTitle: {
    fontFamily: fonts.family,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.textDim,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#0b0c0e',
    alignItems: 'center',
  },
  periodBtnActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  periodLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  periodLabelActive: { color: colors.greenLight },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  rowMethod: { color: colors.muted, fontSize: 12 },
  rowPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  totalRow: { marginTop: 8 },
  totalLabel: { fontFamily: fonts.family, fontSize: 15, color: colors.text },
  totalValue: { fontFamily: fonts.family, fontSize: 15, color: colors.text },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: colors.borderHi, borderBottomWidth: 0, paddingTop: 14 },
  grandTotalLabel: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },
  grandTotalValue: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },
});
