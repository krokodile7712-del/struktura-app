import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import DatePicker from './DatePicker';
import { getEmployeeStats, getOrderItems, getRoleNames } from '../db/queries';
import { colors, fonts } from '../constants/theme';

const fmt = (n) => (n || 0).toLocaleString('ru-RU');
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const PERIODS = [
  { key: 'today', label: 'Сегодня', from: todayStr,        to: todayStr },
  { key: 'week',   label: 'Неделя',  from: () => daysAgoStr(6),  to: todayStr },
  { key: 'month',  label: 'Месяц',   from: () => daysAgoStr(29), to: todayStr },
  { key: 'custom', label: 'Свой период' },
];

const KPI_LABELS = {
  revenue: 'выручке', orders: 'числу чеков', avg_check: 'среднему чеку',
  services: 'количеству услуг', returning_clients: 'возврату клиентов',
};

// Личная карточка сотрудника — по тапу на аватар (себя) или на строку
// сотрудника в списке (админ/управляющий — про любого). Один и тот же
// компонент для обоих случаев, разница только в том, чей userId передан.
export default function EmployeeStatsSheet({ visible, onClose, userId }) {
  const [period, setPeriod]     = useState('week');
  const [dateFrom, setDateFrom] = useState(daysAgoStr(6));
  const [dateTo, setDateTo]     = useState(todayStr());
  const [picker, setPicker]     = useState(false);
  const [stats, setStats]       = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [itemsMap, setItemsMap] = useState({});
  const [roleNames, setRoleNames] = useState({ barista: 'Сотрудник', admin: 'Администратор' });

  const getRange = () => {
    if (period === 'custom') return { from: dateFrom, to: dateTo };
    const p = PERIODS.find(p => p.key === period);
    return { from: p.from(), to: p.to() };
  };

  useEffect(() => {
    if (!visible || !userId) return;
    try {
      const { from, to } = getRange();
      setStats(getEmployeeStats(userId, from, to));
      setRoleNames(getRoleNames());
      setExpandedId(null);
      setItemsMap({});
    } catch (e) { console.error(e); }
  }, [visible, userId, period, dateFrom, dateTo]);

  const toggleReceipt = (order) => {
    if (expandedId === order.id) { setExpandedId(null); return; }
    setExpandedId(order.id);
    if (!itemsMap[order.id]) {
      try { setItemsMap(m => ({ ...m, [order.id]: getOrderItems(order.id) })); } catch (_) {}
    }
  };

  if (!stats) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
          <View style={styles.modalInner} />
        </View>
      </Modal>
    );
  }

  const { user, revenue, cash, card, avgCheck, orderCount, shiftCount, hours, byLocation, kpi, orders } = stats;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={[styles.modalInner, { maxHeight: '85%' }]}>
          <View style={styles.modalHead}>
            <View>
              <Text style={styles.modalTitle}>{user.name}</Text>
              <Text style={styles.role}>{roleNames[user.role] || user.role}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={14} style={styles.modalClose}>
              <Text style={styles.modalCloseTxt}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            {/* Период */}
            <View style={styles.periodRow}>
              {PERIODS.map(p => (
                <Pressable
                  key={p.key}
                  style={[styles.periodChip, period === p.key && styles.periodChipActive]}
                  onPress={() => { if (p.key === 'custom') setPicker(true); else setPeriod(p.key); }}
                >
                  <Text style={[styles.periodChipTxt, period === p.key && styles.periodChipTxtActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* KPI */}
        {kpi && (
          <View style={styles.kpiCard}>
            <View style={styles.kpiHead}>
              <Text style={styles.kpiLabel}>План по {KPI_LABELS[kpi.type] || kpi.type}</Text>
              <Text style={styles.kpiPct}>{kpi.pct}%</Text>
            </View>
            <View style={styles.kpiBarTrack}>
              <View style={[styles.kpiBarFill, { width: `${Math.min(100, kpi.pct)}%` }, kpi.pct >= 100 && styles.kpiBarFillDone]} />
            </View>
            <Text style={styles.kpiFact}>{fmt(kpi.fact)} из {fmt(kpi.plan)}</Text>
          </View>
        )}

        {/* Основные цифры */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Выручка',     value: `${fmt(revenue)} ₽` },
            { label: 'Чеков',       value: orderCount },
            { label: 'Средний чек', value: `${fmt(avgCheck)} ₽` },
            { label: 'Смен',        value: shiftCount },
            { label: 'Часов',       value: hours },
            { label: 'Наличные',    value: `${fmt(cash)} ₽` },
            { label: 'Карта/QR',    value: `${fmt(card)} ₽` },
          ].map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Text style={styles.statVal}>{s.value}</Text>
              <Text style={styles.statLbl}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* По точкам */}
        {byLocation.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>По точкам</Text>
            <View style={styles.card}>
              {byLocation.map((l, i) => (
                <View key={i} style={[styles.locRow, i < byLocation.length - 1 && styles.locRowDiv]}>
                  <Text style={styles.locName}>{l.name}</Text>
                  <Text style={styles.locVal}>{fmt(l.revenue)} ₽ · {l.orders} чеков</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Список чеков */}
        <Text style={styles.sectionLabel}>Чеки ({orders.length})</Text>
        {orders.length === 0 ? (
          <Text style={styles.emptyTxt}>За этот период чеков нет</Text>
        ) : (
          <View style={styles.card}>
            {orders.map((o, i) => (
              <View key={o.id}>
                <Pressable
                  style={[styles.receiptRow, i < orders.length - 1 && !expandedId && styles.locRowDiv]}
                  onPress={() => toggleReceipt(o)}
                >
                  <View>
                    <Text style={styles.receiptTime}>
                      {new Date(o.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.receiptMethod}>{o.method}</Text>
                  </View>
                  <Text style={styles.receiptTotal}>{fmt(o.total)} ₽</Text>
                </Pressable>
                {expandedId === o.id && (
                  <View style={styles.receiptItems}>
                    {(itemsMap[o.id] || []).map(item => (
                      <View key={item.id} style={styles.receiptItemRow}>
                        <Text style={styles.receiptItemName}>{item.quantity} × {item.name}</Text>
                        <Text style={styles.receiptItemPrice}>{fmt(item.price * item.quantity)} ₽</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
          </ScrollView>
        </View>
      </View>

      <DatePicker
        visible={picker}
        mode="range"
        rangeFrom={dateFrom}
        rangeTo={dateTo}
        onRangeChange={(from, to) => { setDateFrom(from); setDateTo(to); setPeriod('custom'); setPicker(false); }}
        onClose={() => setPicker(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '85%', maxWidth: 560, backgroundColor: colors.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: colors.muted },

  role: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 0, marginTop: 2 },

  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  periodChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  periodChipActive: { borderColor: colors.orange, backgroundColor: 'rgba(240,160,80,0.1)' },
  periodChipTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  periodChipTxtActive: { color: colors.orange },

  kpiCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  kpiHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  kpiLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  kpiPct: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.orange },
  kpiBarTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden', marginBottom: 8 },
  kpiBarFill: { height: '100%', backgroundColor: colors.orange, borderRadius: 4 },
  kpiBarFillDone: { backgroundColor: '#5cb85c' },
  kpiFact: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, minWidth: '30%', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
  statVal: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 2 },
  statLbl: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },

  sectionLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  emptyTxt: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 16 },

  card: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 20, overflow: 'hidden' },
  locRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  locRowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  locName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  locVal: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },

  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  receiptTime: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  receiptMethod: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  receiptTotal: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: colors.text },
  receiptItems: { backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 8 },
  receiptItemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  receiptItemName: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, flex: 1 },
  receiptItemPrice: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
});
