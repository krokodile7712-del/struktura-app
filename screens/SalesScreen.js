import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getRecentOrders, getOrderItems, deleteOrder, updateOrder } from '../db/queries';
import { getSession, getHomeRoute } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

const PERIODS = [
  { key: 'day',    label: 'День' },
  { key: 'week',   label: 'Неделя' },
  { key: 'month',  label: 'Месяц' },
  { key: 'custom', label: 'Свой' },
];

const PAY_METHODS = ['Наличные', 'Карта', 'QR', 'Смешанная'];

function todayStr()    { return new Date().toISOString().slice(0,10); }
function weekAgoStr()  { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); }
function monthAgoStr() { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10); }

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function dateKey(iso) { return iso?.slice(0,10) || ''; }

// Группируем заказы по дате
function groupByDate(orders) {
  const groups = {};
  for (const o of orders) {
    const key = dateKey(o.created_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  }
  return Object.entries(groups).sort(([a],[b]) => b.localeCompare(a));
}

export default function SalesScreen({ navigation }) {
  const isAdmin = getSession()?.role === 'admin';

  const [period, setPeriod]     = useState('day');
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo]     = useState(todayStr());
  const [orders, setOrders]     = useState([]);
  const [shown, setShown]       = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [itemsMap, setItemsMap] = useState({});

  // Модалка редактирования
  const [editOrder, setEditOrder]   = useState(null);
  const [editTotal, setEditTotal]   = useState('');
  const [editMethod, setEditMethod] = useState('Наличные');

  // Модалка подтверждения удаления
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handlePeriodChange = (key) => {
    setPeriod(key); setShown(false);
    if (key === 'day')   { setDateFrom(todayStr());   setDateTo(todayStr()); }
    if (key === 'week')  { setDateFrom(weekAgoStr());  setDateTo(todayStr()); }
    if (key === 'month') { setDateFrom(monthAgoStr()); setDateTo(todayStr()); }
  };

  const handleShow = () => {
    try {
      const all = getRecentOrders(500);
      const filtered = all.filter(o => {
        const d = dateKey(o.created_at);
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
      try { setItemsMap(prev => ({ ...prev, [id]: getOrderItems(id) })); } catch (_) {}
    }
  };

  const openEdit = (order) => {
    setEditOrder(order);
    setEditTotal(String(order.total));
    setEditMethod(order.method);
  };

  const confirmEdit = () => {
    if (!editOrder) return;
    try {
      updateOrder(editOrder.id, { total: parseFloat(editTotal) || 0, method: editMethod });
      handleShow();
    } catch (e) { console.error(e); }
    setEditOrder(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    try {
      deleteOrder(deleteTarget.id);
      handleShow();
    } catch (e) { console.error(e); }
    setDeleteTarget(null);
  };

  const cash  = orders.filter(o => o.method === 'Наличные').reduce((s,o) => s + o.total, 0);
  const card  = orders.filter(o => o.method === 'Карта').reduce((s,o) => s + o.total, 0);
  const qr    = orders.filter(o => o.method === 'QR').reduce((s,o) => s + o.total, 0);
  const mixed = orders.filter(o => o.method === 'Смешанная').reduce((s,o) => s + o.total, 0);
  const total = cash + card + qr + mixed;
  const grouped = groupByDate(orders);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Продажи" onBack={() => navigation.navigate(getHomeRoute())} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          {/* Выбор периода */}
          <View style={styles.periodRow}>
            {PERIODS.map(p => (
              <Pressable key={p.key} style={[styles.periodBtn, period === p.key && styles.periodBtnActive]} onPress={() => handlePeriodChange(p.key)}>
                <Text style={[styles.periodLabel, period === p.key && styles.periodLabelActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {period === 'custom' ? (
            <View style={styles.datesRow}>
              <TextInput style={[styles.dateInput, { flex: 1 }]} placeholder="С (ГГГГ-ММ-ДД)" placeholderTextColor={colors.muted} value={dateFrom} onChangeText={v => { setDateFrom(v); setShown(false); }} />
              <Text style={styles.dateSep}>—</Text>
              <TextInput style={[styles.dateInput, { flex: 1 }]} placeholder="По (ГГГГ-ММ-ДД)" placeholderTextColor={colors.muted} value={dateTo} onChangeText={v => { setDateTo(v); setShown(false); }} />
            </View>
          ) : (
            <Text style={styles.dateRange}>
              {period === 'day' ? fmtDate(todayStr()) : `${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`}
            </Text>
          )}

          <MetalButton title="● Показать" variant="action" onPress={handleShow} />

          {shown && (
            <>
              {/* Итоги */}
              <View style={styles.totalsRow}>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>💵</Text>
                  <Text style={styles.totalValue}>{cash.toLocaleString('ru-RU')} ₽</Text>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>💳</Text>
                  <Text style={styles.totalValue}>{card.toLocaleString('ru-RU')} ₽</Text>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>📱 QR</Text>
                  <Text style={styles.totalValue}>{qr.toLocaleString('ru-RU')} ₽</Text>
                </View>
                <View style={[styles.totalBox, { borderColor: 'rgba(61,158,146,0.4)' }]}>
                  <Text style={styles.totalLabel}>ИТОГО</Text>
                  <Text style={[styles.totalValue, { color: colors.greenLight }]}>{total.toLocaleString('ru-RU')} ₽</Text>
                </View>
              </View>

              {orders.length === 0 && <Text style={styles.empty}>Нет заказов за выбранный период</Text>}

              {/* Список сгруппированный по датам */}
              {grouped.map(([date, dayOrders]) => {
                const dayTotal = dayOrders.reduce((s,o) => s + o.total, 0);
                return (
                  <View key={date}>
                    <View style={styles.dateSeparator}>
                      <Text style={styles.dateSeparatorText}>{fmtDate(date)}</Text>
                      <Text style={styles.dateSeparatorSum}>{dayTotal.toLocaleString('ru-RU')} ₽ · {dayOrders.length} зак.</Text>
                    </View>

                    {dayOrders.map(order => (
                      <View key={order.id}>
                        <Pressable style={styles.orderRow} onPress={() => toggleOrder(order.id)}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.orderName}>#{order.id} · {fmtTime(order.created_at)}</Text>
                            <Text style={styles.orderSub}>{order.method}</Text>
                          </View>
                          <Text style={styles.orderPrice}>{order.total} ₽</Text>
                          {isAdmin && (
                            <View style={styles.adminBtns}>
                              <Pressable style={styles.adminBtn} onPress={() => openEdit(order)}>
                                <Text style={styles.adminBtnText}>✎</Text>
                              </Pressable>
                              <Pressable style={[styles.adminBtn, { borderColor: 'rgba(160,16,32,0.4)' }]} onPress={() => setDeleteTarget(order)}>
                                <Text style={[styles.adminBtnText, { color: colors.redLight }]}>✕</Text>
                              </Pressable>
                            </View>
                          )}
                        </Pressable>

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
                      </View>
                    ))}
                  </View>
                );
              })}
            </>
          )}
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка редактирования заказа */}
      <Modal visible={!!editOrder} transparent animationType="fade" onRequestClose={() => setEditOrder(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEditOrder(null)} />
          <View style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Редактировать заказ #{editOrder?.id}</Text>
              <Pressable onPress={() => setEditOrder(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
            </View>
            <Text style={styles.fieldLabel}>Сумма</Text>
            <TextInput style={styles.input} value={editTotal} onChangeText={setEditTotal} keyboardType="numeric" placeholderTextColor={colors.muted} />
            <Text style={styles.fieldLabel}>Способ оплаты</Text>
            <View style={styles.chipsRow}>
              {PAY_METHODS.map(m => (
                <Pressable key={m} style={[styles.chip, editMethod === m && styles.chipActive]} onPress={() => setEditMethod(m)}>
                  <Text style={[styles.chipLabel, editMethod === m && styles.chipLabelActive]}>{m}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <MetalButton title="Сохранить" variant="success" onPress={confirmEdit} style={{ flex: 1 }} />
              <MetalButton title="Отмена" variant="back" onPress={() => setEditOrder(null)} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Модалка подтверждения удаления */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDeleteTarget(null)} />
          <View style={styles.modalInner}>
            <Text style={styles.modalTitle}>Удалить заказ #{deleteTarget?.id}?</Text>
            <Text style={styles.deleteHint}>Это действие нельзя отменить.</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <MetalButton title="Удалить" variant="danger" onPress={confirmDelete} style={{ flex: 1 }} />
              <MetalButton title="Отмена" variant="back" onPress={() => setDeleteTarget(null)} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
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
  dateSep: { color: colors.muted, fontFamily: fonts.familyRegular },
  dateRange: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 12 },
  totalsRow: { flexDirection: 'row', gap: 8, marginVertical: 16 },
  totalBox: { flex: 1, backgroundColor: '#07090f', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, alignItems: 'center' },
  totalLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  totalValue: { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: colors.text },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 20 },
  dateSeparator: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, marginTop: 10, borderBottomWidth: 1, borderBottomColor: colors.borderHi },
  dateSeparatorText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  dateSeparatorSum: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  orderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  orderName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  orderSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  orderPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  adminBtns: { flexDirection: 'row', gap: 6 },
  adminBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  adminBtnText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  detail: { paddingLeft: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  detailName: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
  detailPrice: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '55%', maxWidth: 500, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 },
  modalClose: { fontSize: 18, color: colors.muted },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 16, fontFamily: fonts.family },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  chipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  chipLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  chipLabelActive: { color: colors.greenLight },
  deleteHint: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8 },
});
