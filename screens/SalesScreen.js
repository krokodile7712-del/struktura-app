import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getRecentOrders, getOrderItems } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

const PERIODS = [
  { key: 'day',    label: 'День' },
  { key: 'week',   label: 'Неделя' },
  { key: 'month',  label: 'Месяц' },
  { key: 'custom', label: 'Свой' },
];

function toDateStr(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoStr() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function monthAgoStr() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function SalesScreen({ navigation }) {
  const [period, setPeriod] = useState('day');
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [orders, setOrders] = useState([]);
  const [shown, setShown] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [itemsMap, setItemsMap] = useState({});

  const handlePeriodChange = (key) => {
    setPeriod(key);
    setShown(false);
    if (key === 'day')   { setDateFrom(todayStr());   setDateTo(todayStr()); }
    if (key === 'week')  { setDateFrom(weekAgoStr());  setDateTo(todayStr()); }
    if (key === 'month') { setDateFrom(monthAgoStr()); setDateTo(todayStr()); }
  };

  const handleShow = () => {
    try {
      const all = getRecentOrders(500);
      const filtered = all.filter(o => {
        const d = toDateStr(o.created_at);
        return d >= dateFrom && d <= dateTo;
      });
      setOrders(filtered);
      setShown(true);
      setExpanded(null);
      setItemsMap({});
    } catch (e) { console.error(e); }
  };

  const toggleOrder = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!itemsMap[id]) {
      try { setItemsMap(prev => ({ ...prev, [id]: getOrderItems(id) })); } catch (e) {}
    }
  };

  const cash  = orders.filter(o => o.method === 'Наличные').reduce((s, o) => s + o.total, 0);
  const card  = orders.filter(o => o.method !== 'Наличные').reduce((s, o) => s + o.total, 0);
  const total = cash + card;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Продажи" onBack={() => navigation.navigate('Dashboard')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          {/* Выбор периода */}
          <View style={styles.periodRow}>
            {PERIODS.map(p => (
              <Pressable
                key={p.key}
                style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
                onPress={() => handlePeriodChange(p.key)}
              >
                <Text style={[styles.periodLabel, period === p.key && styles.periodLabelActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Даты */}
          {period === 'custom' ? (
            <View style={styles.datesRow}>
              <TextInput
                style={[styles.dateInput, { flex: 1 }]}
                placeholder="С (ГГГГ-ММ-ДД)"
                placeholderTextColor={colors.muted}
                value={dateFrom}
                onChangeText={v => { setDateFrom(v); setShown(false); }}
              />
              <Text style={styles.dateSep}>—</Text>
              <TextInput
                style={[styles.dateInput, { flex: 1 }]}
                placeholder="По (ГГГГ-ММ-ДД)"
                placeholderTextColor={colors.muted}
                value={dateTo}
                onChangeText={v => { setDateTo(v); setShown(false); }}
              />
            </View>
          ) : (
            <Text style={styles.dateRange}>
              {period === 'day' ? fmtDate(todayStr()) : `${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`}
            </Text>
          )}

          <MetalButton title="● Показать" variant="action" onPress={handleShow} />

          {/* Итоги */}
          {shown && (
            <>
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
                  <Text style={[styles.totalValue, { color: colors.greenLight }]}>{total.toLocaleString('ru-RU')} ₽</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Заказы ({orders.length})</Text>
              {orders.length === 0 && (
                <Text style={styles.empty}>Нет заказов за выбранный период</Text>
              )}
              {orders.map(order => (
                <Pressable key={order.id} onPress={() => toggleOrder(order.id)}>
                  <View style={styles.row}>
                    <View>
                      <Text style={styles.rowName}>Заказ #{order.id} · {fmtTime(order.created_at)}</Text>
                      <Text style={styles.rowSub}>{order.method} · {fmtDate(order.created_at)}</Text>
                    </View>
                    <Text style={styles.rowPrice}>{order.total} ₽</Text>
                  </View>
                  {expanded === order.id && itemsMap[order.id] && (
                    <View style={styles.detail}>
                      {itemsMap[order.id].map((item, i) => (
                        <View key={i} style={styles.detailRow}>
                          <Text style={styles.detailName}>
                            {item.name}{item.size ? ` ${item.size}` : ''}
                            {item.milk && item.milk !== '' ? ` · ${item.milk}` : ''}
                            {item.syrup && item.syrup !== '' ? ` · ${item.syrup}` : ''}
                          </Text>
                          <Text style={styles.detailPrice}>{item.price} ₽</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </Pressable>
              ))}
            </>
          )}
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Login" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  periodBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e', alignItems: 'center' },
  periodBtnActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  periodLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  periodLabelActive: { color: colors.greenLight },
  datesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dateInput: { padding: 12, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 13, fontFamily: fonts.familyRegular },
  dateSep: { color: colors.muted, fontFamily: fonts.familyRegular, fontSize: 14 },
  dateRange: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 12 },
  totalsRow: { flexDirection: 'row', gap: 10, marginVertical: 16 },
  totalBox: { flex: 1, backgroundColor: '#07090f', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, alignItems: 'center' },
  totalBoxMain: { borderColor: 'rgba(61,158,146,0.4)' },
  totalLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  totalValue: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
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
