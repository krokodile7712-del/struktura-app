import React, { useState, useCallback } from 'react';
import { addToFiscalQueue, getFiscalStatus } from '../db/queries';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Modal, TextInput, Alert, Animated, FlatList,
} from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import DatePicker from '../components/DatePicker';
import { useFocusEffect } from '@react-navigation/native';
import {
  getRecentOrders, getOrderItems, deleteOrder, updateOrder,
  returnOrder, getTerms, pluralizeRu, getPayMethods,
} from '../db/queries';
import { useToast } from '../components/Toast';
import { getSession, getHomeRoute } from '../db/session';
import { colors, fonts } from '../constants/theme';

// ─── Утилиты ─────────────────────────────────────────────────────────────────
const todayStr    = () => new Date().toISOString().slice(0, 10);
const weekAgoStr  = () => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().slice(0,10); };
const monthAgoStr = () => { const d = new Date(); d.setDate(d.getDate()-29); return d.toISOString().slice(0,10); };
const dateKey     = iso => iso?.slice(0, 10) || '';
const fmt         = n => (n||0).toLocaleString('ru-RU');
const fmtTime     = iso => { const d = new Date(iso); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const fmtDateFull = iso => {
  if (!iso) return '';
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  if (d >= today) return 'Сегодня';
  if (d >= yesterday) return 'Вчера';
  return `${d.getDate()} ${months[d.getMonth()]}`;
};

const PERIODS = [
  { key: 'today', label: 'Сегодня', from: todayStr,    to: todayStr },
  { key: 'week',  label: 'Неделя',  from: weekAgoStr,  to: todayStr },
  { key: 'month', label: 'Месяц',   from: monthAgoStr, to: todayStr },
  { key: 'custom',label: 'Свой',    from: monthAgoStr, to: todayStr },
];

function groupByDate(orders) {
  const groups = {};
  for (const o of orders) {
    const k = dateKey(o.created_at);
    if (!groups[k]) groups[k] = [];
    groups[k].push(o);
  }
  return Object.entries(groups).sort(([a],[b]) => b.localeCompare(a));
}

// ─── Экран ────────────────────────────────────────────────────────────────────
export default function SalesScreen({ navigation }) {
  const isAdmin  = getSession()?.role === 'admin';
  const terms    = getTerms();
  const toast    = useToast();

  const [period, setPeriod]         = useState('today');
  const [dateFrom, setDateFrom]     = useState(todayStr());
  const [dateTo, setDateTo]         = useState(todayStr());
  const [search, setSearch]         = useState('');
  const [payFilter, setPayFilter]   = useState('all');
  const [picker, setPicker]         = useState(null);

  const [orders, setOrders]         = useState([]);
  const [allItemsMap, setAllItemsMap] = useState({});
  const [itemsMap, setItemsMap]     = useState({});
  const [expanded, setExpanded]     = useState(null);
  const [payMethods, setPayMethods] = useState([]);

  const [editOrder, setEditOrder]       = useState(null);
  const [editTotal, setEditTotal]       = useState('');
  const [editMethod, setEditMethod]     = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);

  // Анимации
  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(12))[0];

  const getRange = () => {
    if (period === 'custom') return { from: dateFrom, to: dateTo };
    const p = PERIODS.find(p => p.key === period);
    return { from: p.from(), to: p.to() };
  };

  const load = useCallback(() => {
    try {
      const { from, to } = getRange();
      const all = getRecentOrders(500);
      const filtered = all.filter(o => { const d = dateKey(o.created_at); return d >= from && d <= to; });
      setOrders(filtered);
      setPayMethods(getPayMethods());
      const map = {};
      filtered.forEach(o => { try { map[o.id] = getOrderItems(o.id); } catch(_) {} });
      setAllItemsMap(map);
      setItemsMap(map);
    } catch(e) { console.error(e); }

    fadeAnim.setValue(0); slideAnim.setValue(12);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [period, dateFrom, dateTo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Фильтрация
  const filtered = orders.filter(o => {
    if (payFilter === 'returns') return o.status === 'returned';
    if (payFilter === 'cash') return (o.method_type||'').includes('cash') || o.method==='Наличные';
    if (payFilter === 'card') return (o.method_type||'').includes('card') || (o.method!=='Наличные'&&o.method!=='Смешанная');
    if (payFilter === 'all' && o.status === 'returned') return false;
    return true;
  }).filter(o => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (String(o.total).includes(q)) return true;
    if (o.method?.toLowerCase().includes(q)) return true;
    return (allItemsMap[o.id]||[]).some(i => i.name?.toLowerCase().includes(q));
  });

  const total    = filtered.reduce((s,o) => s + o.total, 0);
  const cash     = filtered.filter(o => (o.method_type||'').includes('cash') || o.method==='Наличные').reduce((s,o)=>s+o.total,0);
  const card     = filtered.filter(o => (o.method_type||'').includes('card') || o.method==='Карта').reduce((s,o)=>s+o.total,0);
  const qr       = filtered.filter(o => /qr|сбп|sbp/i.test(o.method||'')).reduce((s,o)=>s+o.total,0);
  const mixed    = filtered.filter(o => /смеш/i.test(o.method||'')).reduce((s,o)=>s+o.total,0);
  const avgCheck = filtered.length > 0 ? Math.round(total / filtered.length) : 0;
  const grouped  = groupByDate(filtered);

  const toggleOrder = (id) => setExpanded(e => e === id ? null : id);

  const openEdit = (o) => { setEditOrder(o); setEditTotal(String(o.total)); setEditMethod(o.method); };
  const confirmEdit = () => {
    if (!editOrder) return;
    const found = payMethods.find(m => m.name === editMethod);
    const method_type = found ? found.type
      : editMethod === 'Наличные' ? 'cash'
      : editMethod === 'Карта' ? 'card'
      : undefined;
    try { updateOrder(editOrder.id, { total: parseFloat(editTotal)||0, method: editMethod, method_type }); toast.show('Сохранено'); load(); } catch(e) {}
    setEditOrder(null);
  };
  const confirmReturn = () => {
    if (!returnTarget) return;
    try { returnOrder(returnTarget.id); toast.show('Возврат оформлен'); load(); } catch(e) {}
    setReturnTarget(null);
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    try { deleteOrder(deleteTarget.id); toast.show('Удалено'); load(); } catch(e) {}
    setDeleteTarget(null);
  };

  return (
    <View style={styles.root}>
      <TopBar
        title={pluralizeRu(terms.order)}
        onBack={() => navigation.navigate(getHomeRoute())}
      />

      <View style={styles.layout}>

        {/* ── Левая панель: фильтры + статистика ── */}
        <View style={styles.left}>
          {/* Периоды */}
          <Text style={styles.sectionLabel}>Период</Text>
          <View style={styles.periodList}>
            {PERIODS.map(p => (
              <Pressable
                key={p.key}
                style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
                onPress={() => p.key === 'custom' ? setPicker('from') : setPeriod(p.key)}
              >
                {period === p.key && <View style={styles.periodBar} />}
                <Text style={[styles.periodTxt, period === p.key && styles.periodTxtActive]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.divider} />

          {/* Фильтр по оплате */}
          <Text style={styles.sectionLabel}>Оплата</Text>
          {['all','cash','card','returns'].map(key => {
            const labels = { all: 'Все', cash: 'Наличные', card: 'Карта', returns: 'Возвраты' };
            return (
              <Pressable
                key={key}
                style={[styles.periodBtn, payFilter === key && styles.periodBtnActive]}
                onPress={() => setPayFilter(key)}
              >
                {payFilter === key && <View style={styles.periodBar} />}
                <Text style={[styles.periodTxt, payFilter === key && styles.periodTxtActive]}>
                  {labels[key]}
                </Text>
              </Pressable>
            );
          })}

          <View style={styles.divider} />

          {/* Статистика */}
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.sectionLabel}>Итоги</Text>
            {[
              { label: 'Выручка',  value: `${fmt(total)} ₽`,    color: colors.orange },
              { label: 'Заказов',  value: filtered.length,       color: colors.text },
              { label: 'Ср. чек', value: `${fmt(avgCheck)} ₽`,  color: colors.text },
              cash  > 0 && { label: 'Наличные', value: `${fmt(cash)} ₽`,  color: colors.text },
              card  > 0 && { label: 'Карта',    value: `${fmt(card)} ₽`,  color: colors.text },
              qr    > 0 && { label: 'QR/СБП',   value: `${fmt(qr)} ₽`,    color: colors.text },
              mixed > 0 && { label: 'Смешанная',value: `${fmt(mixed)} ₽`, color: colors.text },
            ].filter(Boolean).map((s, i) => (
              <View key={i} style={styles.statRow}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              </View>
            ))}
          </Animated.View>
        </View>

        {/* ── Правая панель: поиск + список ── */}
        <View style={styles.right}>
          {/* Поиск — прилеплен к верху */}
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.searchInput}
              color={colors.text}
              value={search}
              onChangeText={setSearch}
              placeholder="Поиск по товару, сумме или способу оплаты..."
              placeholderTextColor={colors.muted}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Список заказов */}
          {filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTxt}>
                {search ? 'Ничего не найдено' : 'Нет заказов за период'}
              </Text>
              <Text style={styles.emptyHint}>
                {search ? 'Попробуйте другой запрос' : 'Выберите другой период или добавьте заказы через Кассу'}
              </Text>
            </View>
          ) : (
            <Animated.ScrollView
              style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
              contentContainerStyle={{ paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {grouped.map(([date, dayOrders]) => (
                <View key={date}>
                  {/* Заголовок дня */}
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayLabel}>{fmtDateFull(date)}</Text>
                    <Text style={styles.dayTotal}>
                      {dayOrders.length} зак. · {fmt(dayOrders.reduce((s,o)=>s+o.total,0))} ₽
                    </Text>
                  </View>

                  {/* Карточка дня */}
                  <View style={styles.dayCard}>
                    {dayOrders.map((order, idx) => {
                      const isExp    = expanded === order.id;
                      const items    = itemsMap[order.id] || [];
                      const isReturn = order.status === 'returned';

                      return (
                        <View key={order.id}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.orderRow,
                              idx < dayOrders.length - 1 && !isExp && styles.orderRowDiv,
                              isReturn && { opacity: 0.55 },
                              pressed && { backgroundColor: 'rgba(245,240,232,0.03)' },
                            ]}
                            onPress={() => isAdmin ? toggleOrder(order.id) : null}
                          >
                            <View style={{ flex: 1, gap: 3 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={styles.orderTime}>{fmtTime(order.created_at)}</Text>
                                {isReturn && (
                                  <View style={styles.returnBadge}>
                                    <Text style={styles.returnBadgeTxt}>↩ возврат</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.orderItems} numberOfLines={1}>
                                {items.length > 0
                                  ? items.slice(0,3).map(i => `${i.name}${i.size?` ${i.size}`:''}${i.quantity>1?` ×${i.quantity}`:''}`).join(' · ') + (items.length > 3 ? ` +${items.length-3}` : '')
                                  : '—'}
                              </Text>
                              {(order.cashier_name || order.client_name) && (
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                  {order.cashier_name && <Text style={styles.orderMeta}>👤 {order.cashier_name}</Text>}
                                  {order.client_name  && <Text style={styles.orderMeta}>⭐ {order.client_name}</Text>}
                                </View>
                              )}
                            </View>

                            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                              <Text style={[styles.orderTotal, isReturn && { color: colors.red }]}>
                                {isReturn ? '−' : ''}{fmt(order.total)} ₽
                              </Text>
                              <Text style={styles.orderMethod}>{order.method}</Text>
                            </View>

                            {isAdmin && (
                              <Text style={[styles.chevron, isExp && styles.chevronOpen]}>›</Text>
                            )}
                          </Pressable>

                          {/* Действия */}
                          {isExp && isAdmin && (
                            <View style={[styles.actionsPanel, idx < dayOrders.length-1 && styles.orderRowDiv]}>
                              {!isReturn && (
                                <>
                                  <Pressable style={styles.actionBtn} onPress={() => {
                                    addToFiscalQueue(order.id);
                                    Alert.alert('Чек', 'Добавлен в очередь. Отправится после подключения кассы.');
                                  }}>
                                    <Text style={styles.actionTxt}>📄 Чек</Text>
                                  </Pressable>
                                  <Pressable style={styles.actionBtn} onPress={() => setReturnTarget(order)}>
                                    <Text style={styles.actionTxt}>↩ Возврат</Text>
                                  </Pressable>
                                  <Pressable style={styles.actionBtn} onPress={() => openEdit(order)}>
                                    <Text style={styles.actionTxt}>✎ Изменить</Text>
                                  </Pressable>
                                </>
                              )}
                              <Pressable style={[styles.actionBtn, { borderColor: 'rgba(217,95,95,0.35)' }]} onPress={() => setDeleteTarget(order)}>
                                <Text style={[styles.actionTxt, { color: colors.red }]}>✕ Удалить</Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </Animated.ScrollView>
          )}
        </View>
      </View>

      <BottomBar navigation={navigation} />

      {/* Пикеры дат */}
      <DatePicker visible={picker === 'from'} value={dateFrom}
        onChange={v => { setDateFrom(v); setPeriod('custom'); setPicker('to'); }}
        onClose={() => setPicker(null)} title="Начало периода" />
      <DatePicker visible={picker === 'to'} value={dateTo}
        onChange={v => { setDateTo(v); setPeriod('custom'); setPicker(null); }}
        onClose={() => setPicker(null)} title="Конец периода" />

      {/* Модалка редактирования */}
      <Modal visible={!!editOrder} transparent animationType="fade" onRequestClose={() => setEditOrder(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ ...StyleSheet.absoluteFillObject }} onPress={() => setEditOrder(null)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Изменить заказ</Text>
            <Text style={styles.fieldLabel}>Сумма</Text>
            <TextInput style={styles.modalInput} color={colors.text} value={editTotal}
              onChangeText={setEditTotal} keyboardType="numeric" placeholder="0"
              placeholderTextColor={colors.muted} />
            <Text style={styles.fieldLabel}>Способ оплаты</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
              {payMethods.length > 0
                ? payMethods.map(m => (
                    <Pressable
                      key={m.id}
                      style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: editMethod === m.name ? 'rgba(240,160,80,0.5)' : colors.border, backgroundColor: editMethod === m.name ? 'rgba(240,160,80,0.08)' : colors.surface }}
                      onPress={() => setEditMethod(m.name)}
                    >
                      <Text style={{ fontFamily: fonts.familySemibold, fontSize: 13, color: editMethod === m.name ? colors.orange : colors.muted }}>{m.name}</Text>
                    </Pressable>
                  ))
                : ['Наличные', 'Карта'].map(name => (
                    <Pressable
                      key={name}
                      style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: editMethod === name ? 'rgba(240,160,80,0.5)' : colors.border, backgroundColor: editMethod === name ? 'rgba(240,160,80,0.08)' : colors.surface }}
                      onPress={() => setEditMethod(name)}
                    >
                      <Text style={{ fontFamily: fonts.familySemibold, fontSize: 13, color: editMethod === name ? colors.orange : colors.muted }}>{name}</Text>
                    </Pressable>
                  ))
              }
            </View>
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalCancel} onPress={() => setEditOrder(null)}>
                <Text style={styles.modalCancelTxt}>Отмена</Text>
              </Pressable>
              <Pressable style={styles.modalSave} onPress={confirmEdit}>
                <Text style={styles.modalSaveTxt}>Сохранить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Модалка подтверждения удаления */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ ...StyleSheet.absoluteFillObject }} onPress={() => setDeleteTarget(null)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Удалить заказ?</Text>
            <Text style={styles.modalDesc}>Заказ на {fmt(deleteTarget?.total)} ₽ будет удалён безвозвратно.</Text>
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalCancel} onPress={() => setDeleteTarget(null)}>
                <Text style={styles.modalCancelTxt}>Отмена</Text>
              </Pressable>
              <Pressable style={[styles.modalSave, { backgroundColor: colors.red }]} onPress={confirmDelete}>
                <Text style={styles.modalSaveTxt}>Удалить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Модалка возврата */}
      <Modal visible={!!returnTarget} transparent animationType="fade" onRequestClose={() => setReturnTarget(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ ...StyleSheet.absoluteFillObject }} onPress={() => setReturnTarget(null)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Оформить возврат?</Text>
            <Text style={styles.modalDesc}>Сумма {fmt(returnTarget?.total)} ₽ будет возвращена. Статус заказа изменится на «Возврат».</Text>
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalCancel} onPress={() => setReturnTarget(null)}>
                <Text style={styles.modalCancelTxt}>Отмена</Text>
              </Pressable>
              <Pressable style={[styles.modalSave, { backgroundColor: colors.amber }]} onPress={confirmReturn}>
                <Text style={styles.modalSaveTxt}>Возврат</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg },
  layout: { flex: 1, flexDirection: 'row' },

  // Левая панель
  left:   { width: 200, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, padding: 14 },
  sectionLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  periodList: { gap: 2 },
  periodBtn:  { paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, position: 'relative' },
  periodBtnActive: { backgroundColor: 'rgba(240,160,80,0.08)' },
  periodBar:  { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  periodTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  periodTxtActive: { color: colors.orange },
  statRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  statLabel:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  statVal:    { fontFamily: fonts.familySemibold, fontSize: 13 },

  // Правая панель
  right:       { flex: 1 },
  searchWrap:  { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: { backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTxt:   { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  emptyHint:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8, opacity: 0.7, lineHeight: 20 },

  dayHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  dayLabel:   { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  dayTotal:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  dayCard:    { backgroundColor: colors.surface, marginHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 8 },

  orderRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  orderRowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  orderTime:   { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  orderItems:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  orderMeta:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  orderTotal:  { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.orange },
  orderMethod: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  chevron:     { fontSize: 18, color: colors.muted, transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '-90deg' }] },
  returnBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, backgroundColor: 'rgba(217,95,95,0.12)' },
  returnBadgeTxt: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.red },

  actionsPanel: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: colors.surface2 },
  actionBtn:    { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  actionTxt:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },

  // Модалки
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:     { width: '100%', maxWidth: 400, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  modalTitle:   { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 },
  modalDesc:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginBottom: 20, lineHeight: 20 },
  fieldLabel:   { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 14 },
  modalInput:   { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.text, fontSize: 15, fontFamily: fonts.familyRegular },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancel:  { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelTxt:{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  modalSave:    { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  modalSaveTxt: { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#fff' },
});
