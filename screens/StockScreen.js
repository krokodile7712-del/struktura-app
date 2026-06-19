import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

const MOCK_STOCK = [
  { name: 'Молоко', остаток: 8, unit: 'л', порог: 5, category: '☕ Основы' },
  { name: 'Кофе зёрна', остаток: 2, unit: 'кг', порог: 3, category: '☕ Основы' },
  { name: 'Сироп ваниль', остаток: 1.5, unit: 'л', порог: 0.5, category: '🍯 Сиропы & Пюре' },
  { name: 'Стаканы M', остаток: 120, unit: 'шт', порог: 50, category: '🥤 Стаканы и крышки' },
];

export default function StockScreen({ navigation }) {
  const categories = [...new Set(MOCK_STOCK.map(i => i.category))];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.cardTitle}>📦 Склад</Text>
          {categories.map((cat) => {
            const items = MOCK_STOCK.filter(i => i.category === cat);
            const hasLow = items.some(i => i.остаток <= i.порог);
            return (
              <View key={cat} style={{ marginBottom: 12 }}>
                <Text style={[styles.catHeader, hasLow && styles.catHeaderLow]}>
                  {hasLow ? '⚠️ ' : ''}{cat}
                </Text>
                {items.map((item) => {
                  const isLow = item.остаток <= item.порог;
                  return (
                    <View key={item.name} style={styles.row}>
                      <View>
                        <Text style={[styles.itemName, isLow && styles.itemNameLow]}>
                          {isLow ? '⚠️ ' : ''}{item.name}
                        </Text>
                        <Text style={styles.itemSub}>{item.остаток} {item.unit} (порог: {item.порог})</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
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
  catHeader: {
    fontFamily: fonts.familySemibold,
    fontSize: 13,
    color: colors.textDim,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  catHeaderLow: { color: '#c47a5a' },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName: { fontFamily: fonts.family, fontSize: 15, color: colors.text },
  itemNameLow: { color: colors.redLight, fontWeight: '700' },
  itemSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
});
