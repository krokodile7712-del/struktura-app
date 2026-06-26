import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getRecentOrders, getOrderItems } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

const PERIODS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'week',  label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
];

function filterByPeriod(orders, period) {
  const now = new Date();
  return orders.filter(o => {
    const d = new Date(o.created_at);
    if (period === 'today') return d.toDateString() === now.toDateString();
    if (period === 'week') return (now - d) <= 7 * 86400000;
    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  });
}

export default function SalesScreen({ navigation }) {
  const [period, setPeriod] = useState('today');
  const [orders, setOrders] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [itemsMap, setItemsMap] = useState({});

  useEffect(() => {
    try { setOrders(getRecentOrders(200)); } catch (e) { console.error(e); }
  }, []);

  const filtered = filterByPeriod(orders, period);
  const cash  = filtered.filter(o => o.method === 'Наличные').reduce((s, o) => s + o.total, 0);
  const card  = filtered.filter(o => o.method !== 'Наличные').reduce((s, o) => s + o.total, 0);
  const total = cash + card;

  const toggleOrder = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!itemsMap[id]) {
      try { setItemsMap(prev => ({ ...prev, [id]: getOrderItems(id) })); } catch (e) {}
    }
  };

  const fmt = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Продажи" onBack={() => navigation.navigate('Dashboard')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <View style={styles.periodRow}>
            {PERIODS.map(p => (
              <Pressable key={p.key} style={[styles.periodBtn, period === p.key && styles.periodBtnActive]} onPress={() => setPeriod(p.key)}>
                <Text style={[styles.periodLabel, period === p.key && styles.periodLabelActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.totalsRow}>
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>💵 Наличные</Text>
              <Text style={styles.totalValue}>{cash.toLocaleString('ru-RU')} ₽</Text>
            </View>
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>💳 Карта</Text>
              <Text style={styles.totalValue}>{card.toLocaleString('ru-RU')} ₽</Text>
            </View>
            <View style={[styles.totalBox, styles.totalBoxMain]}>
              <Text style={styles.totalLabel}>ИТОГО</Text>
              <Text style={[styles.totalValue, styles.totalValueMain]}>{total.toLocaleString('ru-RU')} ₽</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Заказы ({filtered.length})</Text>
          {filtered.length === 0 && (
            <Text style={styles.empty}>Заказов нет. Оформите первый в Кассе.</Text>
          )}
          {filtered.map(order => (
            <Pressable key={order.id} onPress={() => toggleOrder(order.id)}>
              <View style={styles.row}>
                <View>
                  <Text style={styles.rowName}>Заказ #{order.id} · {fmt(order.created_at)}</Text>
                  <Text style={styles.rowSub}>{order.method}</Text>
                </View>
                <Text style={styles.rowPrice}>{order.total} ₽</Text>
              </View>
              {expanded === order.id && itemsMap[order.id] && (
                <View style={styles.detail}>
                  {itemsMap[order.id].map((item, i) => (
                    <View key={i} style={styles.detailRow}>
                      <Text style={styles.detailName}>
                        {item.name}{item.size ? ` ${item.size}` : ''}
                        {item.milk ? ` · ${item.milk}` : ''}
                        {item.syrup ? ` · ${item.syrup}` : ''}
                      </Text>
                      <Text style={styles.detailPrice}>{item.price} ₽</Text>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
          ))}
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Login" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e', alignItems: 'center' },
  periodBtnActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  periodLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  periodLabelActive: { color: colors.greenLight },
  totalsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  totalBox: { flex: 1, backgroundColor: '#07090f', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, alignItems: 'center' },
  totalBoxMain: { borderColor: 'rgba(61,158,146,0.4)' },
  totalLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  totalValue: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  totalValueMain: { color: colors.greenLight, fontSize: 18 },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  rowPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  detail: { paddingLeft: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  detailName: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
  detailPrice: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
});
