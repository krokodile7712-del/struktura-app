import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import MetalCard from '../components/MetalCard';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllStock } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

export default function StockScreen({ navigation }) {
  const [stock, setStock] = useState([]);

  useEffect(() => {
    try { setStock(getAllStock()); } catch (e) { console.error(e); }
  }, []);

  const categories = [...new Set(stock.map(i => i.category))];

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Склад" onBack={() => navigation.navigate('Dashboard')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          {stock.length === 0 && (
            <Text style={styles.empty}>Нет данных. Выполните импорт из Sheets.</Text>
          )}
          {categories.map(cat => {
            const items = stock.filter(i => i.category === cat);
            const hasLow = items.some(i => i['остаток'] <= i['порог']);
            return (
              <View key={cat} style={{ marginBottom: 16 }}>
                <Text style={[styles.catHeader, hasLow && styles.catHeaderLow]}>
                  {hasLow ? '⚠️ ' : ''}{cat}
                </Text>
                {items.map(item => {
                  const isLow = item['остаток'] <= item['порог'];
                  return (
                    <View key={item.id} style={styles.row}>
                      <View>
                        <Text style={[styles.itemName, isLow && styles.itemNameLow]}>
                          {isLow ? '⚠️ ' : ''}{item.name}
                        </Text>
                        <Text style={styles.itemSub}>
                          {item['остаток']} {item.unit} · порог: {item['порог']}
                        </Text>
                      </View>
                      <Text style={[styles.itemStatus, isLow && styles.itemStatusLow]}>
                        {isLow ? 'Мало' : 'ОК'}
                      </Text>
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
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 20 },
  catHeader: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  catHeaderLow: { color: '#c47a5a' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  itemNameLow: { color: colors.redLight },
  itemSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  itemStatus: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  itemStatusLow: { color: colors.redLight },
});
