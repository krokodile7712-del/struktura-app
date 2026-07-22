import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Modal, TextInput, Alert,
} from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import EmptyState from '../components/EmptyState';
import DatePicker from '../components/DatePicker';
import { useFocusEffect } from '@react-navigation/native';
import {
  getRecentOrders, getOrderItems, deleteOrder, updateOrder,
  returnOrder, getTerms, pluralizeRu, getPayMethods,
} from '../db/queries';
import { useToast } from '../components/Toast';
import { getSession, getHomeRoute } from '../db/session';
import { colors, fonts } from '../constants/theme';

// ─── Утилиты ────────────────────────────────────────────────────────────────
const todayStr    = () => new Date().toISOString().slice(0, 10);
const weekAgoStr  = () => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().slice(0,10); };
const monthAgoStr = () => { const d = new Date(); d.setDate(d.getDate()-29); return d.toISOString().slice(0,10); };
const dateKey     = iso => iso?.slice(0, 10) || '';
const fmt         = n => (n||0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDate = iso => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0,10).split('-');
  return `${d}.${m}.${y}`;
};
const fmtDateShort = iso => {
  if (!iso) return '';
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const d = new Date(iso);
  return `${d.getDate()} ${months[d.getMonth()]}`;
};
const fmtTime = iso => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

function groupByDate(orders) {
  const groups = {};
  for (const o of orders) {
    const k = dateKey(o.created_at);
    if (!groups[k]) groups[k] = [];
    groups[k].push(o);
  }
  return Object.entries(groups).sort(([a],[b]) => b.localeCompare(a));
}

const PERIODS = [
  { key: 'today', label: 'Сегодня', from: todayStr,    to: todayStr },
  { key: 'week',  label: 'Неделя',  from: weekAgoStr,  to: todayStr },
  { key: 'month', label: 'Месяц',   from: monthAgoStr, to: todayStr },
  { key: 'custom',label: 'Свой',    from: monthAgoStr, to: todayStr },
];

const PAY_FILTERS = [
  { key: 'all',     label: 'Все' },
  { key: 'cash',    label: 'Наличные' },
  { key: 'card',    label: 'Карта' },
  { key: 'returns', label: 'Возвраты' },
];

// ─── Экран ────────────────────────────────────────────────────────────────────
export default function SalesScreen({ navigation }) {
  const isAdmin  = getSession()?.role === 'admin';
  const terms    = getTerms();
  const toast    = useToast();

  const [period, setPeriod]       = useState('today');
  const [dateFrom, setDateFrom]   = useState(todayStr());
  const [dateTo, setDateTo]       = useState(todayStr());
  const [payFilter, setPayFilter] = useState('all');
  const [search, setSearch]       = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [allItemsMap, setAllItemsMap] = useState({});
  const [picker, setPicker]       = useState(null);
  const [showStats, setShowStats] = useState(false);

  const [orders, setOrders]       = useState([]);
  const [payMethods, setPayMethods] = useState([]);
  const [expanded, setExpanded]   = useState(null);
  const [itemsMap, setItemsMap]   = useState({});

  const [editOrder, setEditOrder]     = useState(null);
  const [editTotal, setEditTotal]     = useState('');
  const [editMethod, setEditMethod]   = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);

  const getRange = () => {
    if (period === 'custom') return { from: dateFrom, to: dateTo };
    const p = PERIODS.find(p => p.key === period);
    return { from: p.from(), to: p.to() };
  };

  const load = useCallback(() => {
    try {
      const { from, to } = getRange();
      const all = getRecentOrders(500);
      const filtered = all.filter(o => {
        const d = dateKey(o.created_at);
        return d >= from && d <= to;
      });
      setOrders(filtered);
      setPayMethods(getPayMethods());
      // Грузим позиции всех заказов для поиска
      const map = {};
      filtered.forEach(o => {
        try { map[o.id] = getOrderItems(o.id); } catch (_) {}
      });
      setAllItemsMap(map);
    } catch (e) { console.error(e); }
  }, [period, dateFrom, dateTo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Фильтрация
  const filtered = orders.filter(o => {
    if (payFilter === 'returns') return o.status === 'returned';
    if (payFilter === 'cash')   return (o.method_type || '').includes('cash') || o.method === 'Наличные';
    if (payFilter === 'card')   return (o.method_type || '').includes('card') || (o.method !== 'Наличные' && o.method !== 'Смешанная');
    if (payFilter === 'all' && o.status === 'returned') return false; // скрываем возвраты по умолчанию
    return true;
  }).filter(o => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (String(o.total).includes(q)) return true;
    if (o.method?.toLowerCase().includes(q)) return true;
    // Поиск по позициям заказа
    const items = allItemsMap[o.id] || [];
    return items.some(i => i.name?.toLowerCase().includes(q));
  });

  // Метрики
  const total    = filtered.reduce((s,o) => s + o.total, 0);
  const cash     = filtered.filter(o => (o.method_type||'').includes('cash') || o.method==='Наличные').reduce((s,o)=>s+o.total,0);
  const card     = filtered.filter(o => (o.method_type||'').includes('card') || (o.method!=='Наличные'&&o.method!=='Смешанная'&&!((o.method_type||'').includes('cash')))).reduce((s,o)=>s+o.total,0);
  const avgCheck = filtered.length > 0 ? Math.round(total / filtered.length) : 0;

  // Статистика
  const peakHour = (() => {
    const hours = {};
    filtered.forEach(o => { const h = new Date(o.created_at).getHours(); hours[h] = (hours[h]||0)+1; });
    const peak = Object.entries(hours).sort(([,a],[,b])=>b-a)[0];
    return peak ? `${peak[0]}:00` : '—';
  })();

  const grouped = groupByDate(filtered);

  const toggleOrder = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!itemsMap[id]) {
      try { setItemsMap(m => ({ ...m, [id]: getOrderItems(id) })); } catch (_) {}
    }
  };

  const openEdit = (o) => { setEditOrder(o); setEditTotal(String(o.total)); setEditMethod(o.method); };
  const confirmEdit = () => {
    if (!editOrder) return;
    try {
      updateOrder(editOrder.id, { total: parseFloat(editTotal)||0, method: editMethod });
      toast.show('Сохранено ✓', 'info');
      load();
    } catch (e) { console.error(e); }
    setEditOrder(null);
  };
  const confirmReturn = () => {
    if (!returnTarget) return;
    try { returnOrder(returnTarget.id); toast.show('Возврат оформлен ✓', 'info'); load(); }
    catch (e) { console.error(e); }
    setReturnTarget(null);
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    try { deleteOrder(deleteTarget.id); toast.show('Удалён', 'warn'); load(); }
    catch (e) { console.error(e); }
    setDeleteTarget(null);
  };

  const allMethods = payMethods.length
    ? payMethods
    : [{ id:'cash', name:'Наличные' },{ id:'card', name:'Карта' }];

  const methodIcon = (method) => {
    if (!method) return '';
    const m = method.toLowerCase();
    if (m.includes('нал')) return '💵';
    if (m.includes('смеш')) return '🔀';
    return '💳';
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={pluralizeRu(terms.order)} onBack={() => navigation.navigate(getHomeRoute())} />

      {/* Периоды */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.chipBar} contentContainerStyle={styles.chipInner}>
        {PERIODS.map(p => (
          <Pressable
            key={p.key}
            style={[styles.chip, period === p.key && styles.chipActive]}
            onPress={() => {
              if (p.key === 'custom') { setPeriod('custom'); setPicker('from'); }
              else {
                setPeriod(p.key);
                setDateFrom(p.from());
                setDateTo(p.to());
              }
            }}
          >
            <Text style={[styles.chipText, period === p.key && styles.chipTextActive]}>
              {p.key === 'custom' && period === 'custom'
                ? `${fmtDate(dateFrom).slice(0,5)}—${fmtDate(dateTo).slice(0,5)}`
                : p.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Фильтры + поиск */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {PAY_FILTERS.map(f => (
            <Pressable key={f.key}
              style={[styles.filterChip, payFilter === f.key && styles.filterChipActive]}
              onPress={() => setPayFilter(f.key)}>
              <Text style={[styles.filterText, payFilter === f.key && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {searchOpen ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <TextInput
              color={colors.text}
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Поиск по товару, сумме или способу оплаты..."
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <Pressable onPress={() => { setSearchOpen(false); setSearch(''); }} hitSlop={10} style={styles.badgeBtn}>
              <Text style={styles.badgeTxt}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setSearchOpen(true)} hitSlop={10} style={styles.badgeBtn}>
            <Text style={styles.badgeTxt}>🔍</Text>
          </Pressable>
        )}
      </View>

      {/* Итоги */}
      {filtered.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>{fmt(total)} ₽</Text>
            <Text style={styles.summaryLbl}>Итого</Text>
          </View>
          <View style={styles.summarySep} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>{filtered.length}</Text>
            <Text style={styles.summaryLbl}>Заказов</Text>
          </View>
          <View style={styles.summarySep} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>{fmt(avgCheck)} ₽</Text>
            <Text style={styles.summaryLbl}>Ср. чек</Text>
          </View>
          {cash > 0 && (
            <>
              <View style={styles.summarySep} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>💵 {fmt(cash)}</Text>
                <Text style={styles.summaryLbl}>Нал</Text>
              </View>
            </>
          )}
          {card > 0 && (
            <>
              <View style={styles.summarySep} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>💳 {fmt(card)}</Text>
                <Text style={styles.summaryLbl}>Карта</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* Статистика */}
      {filtered.length > 0 && (
        <Pressable style={styles.statsToggle} onPress={() => setShowStats(v => !v)}>
          <Text style={styles.statsToggleTxt}>{showStats ? '▲' : '▼'} Статистика</Text>
        </Pressable>
      )}
      {showStats && (
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{fmt(avgCheck)} ₽</Text>
            <Text style={styles.statLbl}>Средний чек</Text>
          </View>
          <View style={styles.summarySep} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{peakHour}</Text>
            <Text style={styles.statLbl}>Пиковый час</Text>
          </View>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <EmptyState icon="📊" title="Заказов нет"
            text="За выбранный период заказов не найдено." />
        ) : (
          grouped.map(([date, dayOrders]) => {
            const dayTotal = dayOrders.reduce((s,o) => s+o.total, 0);
            return (
              <View key={date} style={styles.dayGroup}>
                {/* Заголовок дня */}
                <View style={styles.dayHead}>
                  <Text style={styles.dayDate}>{fmtDateShort(date)}</Text>
                  <View style={styles.dayLine} />
                  <Text style={styles.daySum}>{fmt(dayTotal)} ₽ · {dayOrders.length} зак.</Text>
                </View>

                {/* Карточка заказов */}
                <View style={styles.card}>
                  {dayOrders.map((order, idx) => {
                    const isExp    = expanded === order.id;
                    const items    = itemsMap[order.id] || [];
                    const isReturn = order.status === 'returned';
                    return (
                      <View key={order.id}>
                        {/* Строка заказа */}
                        <Pressable
                          style={({ pressed }) => [
                            styles.orderRow,
                            idx < dayOrders.length - 1 && !isExp && styles.rowDiv,
                            pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                            isReturn && { opacity: 0.5 },
                          ]}
                          onPress={() => toggleOrder(order.id)}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={styles.orderTime}>{fmtTime(order.created_at)}</Text>
                              {isReturn && (
                                <View style={styles.returnBadge}>
                                  <Text style={styles.returnBadgeTxt}>↩ возврат</Text>
                                </View>
                              )}
                            </View>
                            {order.note ? (
                              <Text style={styles.orderNote} numberOfLines={1}>📝 {order.note}</Text>
                            ) : null}
                          </View>
                          <Text style={styles.orderMethod}>{methodIcon(order.method)}</Text>
                          <Text style={[styles.orderTotal, isReturn && { color: colors.redLight }]}>
                            {isReturn ? '−' : ''}{fmt(order.total)} ₽
                          </Text>
                          <Text style={styles.orderArrow}>{isExp ? '▲' : '›'}</Text>
                        </Pressable>

                        {/* Раскрытые детали */}
                        {isExp && (
                          <View style={[styles.detail, idx < dayOrders.length - 1 && styles.rowDiv]}>
                            {/* Состав */}
                            {items.map((item, i) => (
                              <View key={i} style={styles.detailRow}>
                                <Text style={styles.detailName} numberOfLines={2}>
                                  {item.name}
                                  {item.size ? ` ${item.size}` : ''}
                                  {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                                </Text>
                                <Text style={styles.detailPrice}>{fmt(item.price)} ₽</Text>
                              </View>
                            ))}

                            {/* Мета-информация */}
                            <View style={styles.metaRow}>
                              {order.method ? <Text style={styles.metaTxt}>{methodIcon(order.method)} {order.method}</Text> : null}
                              {order.cashier_name ? <Text style={styles.metaTxt}>👤 {order.cashier_name}</Text> : null}
                              {order.client_name  ? <Text style={styles.metaTxt}>⭐ {order.client_name}</Text>  : null}
                            </View>

                            {/* Действия */}
                            {isAdmin && !isReturn && (
                              <View style={styles.actionRow}>
                                <Pressable style={styles.actionBtn}
                                  onPress={() => setReturnTarget(order)}>
                                  <Text style={styles.actionBtnTxt}>↩ Возврат</Text>
                                </Pressable>
                                <Pressable style={styles.actionBtn}
                                  onPress={() => openEdit(order)}>
                                  <Text style={styles.actionBtnTxt}>✎ Изменить</Text>
                                </Pressable>
                                <Pressable style={[styles.actionBtn, styles.actionBtnDanger]}
                                  onPress={() => setDeleteTarget(order)}>
                                  <Text style={[styles.actionBtnTxt, { color: colors.redLight }]}>✕ Удалить</Text>
                                </Pressable>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Редактирование */}
      <Modal visible={!!editOrder} transparent animationType="fade" onRequestClose={() => setEditOrder(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEditOrder(null)} />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Редактировать заказ #{editOrder?.id}</Text>
              <Pressable onPress={() => setEditOrder(null)} hitSlop={14} style={styles.modalClose}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Сумма, ₽</Text>
              <TextInput color={colors.text} style={styles.input} value={editTotal} onChangeText={setEditTotal} keyboardType="numeric" placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Способ оплаты</Text>
              <View style={styles.card}>
                {allMethods.map((m, idx) => (
                  <Pressable key={m.id || m.name}
                    style={[styles.orderRow, idx < allMethods.length-1 && styles.rowDiv]}
                    onPress={() => setEditMethod(m.name)}>
                    <Text style={[styles.detailName, { flex: 1 }]}>{m.name}</Text>
                    <View style={[styles.checkbox, editMethod === m.name && styles.checkboxOn]}>
                      {editMethod === m.name && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                    </View>
                  </Pressable>
                ))}
              </View>
              <Pressable style={({ pressed }) => [styles.confirmBtn, { marginTop: 16 }, pressed && { opacity: 0.88 }]}
                onPress={confirmEdit}>
                <Text style={styles.confirmBtnTxt}>Сохранить</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Возврат */}
      <Modal visible={!!returnTarget} transparent animationType="fade" onRequestClose={() => setReturnTarget(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setReturnTarget(null)} />
          <View style={[styles.modalBox, { maxHeight: 280 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>↩ Оформить возврат</Text>
              <Pressable onPress={() => setReturnTarget(null)} hitSlop={14} style={styles.modalClose}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={styles.detailName}>
                Заказ #{returnTarget?.id} на сумму {fmt(returnTarget?.total)} ₽ будет помечен как возвращённый. Остатки на складе восстановятся.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <Pressable style={[styles.confirmBtn, { flex: 1, backgroundColor: 'rgba(74,77,84,0.3)' }]}
                  onPress={() => setReturnTarget(null)}>
                  <Text style={styles.confirmBtnTxt}>Отмена</Text>
                </Pressable>
                <Pressable style={[styles.confirmBtn, { flex: 1, backgroundColor: 'rgba(160,16,32,0.8)' }]}
                  onPress={confirmReturn}>
                  <Text style={styles.confirmBtnTxt}>↩ Подтвердить</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Удаление */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDeleteTarget(null)} />
          <View style={[styles.modalBox, { maxHeight: 240 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Удалить заказ #{deleteTarget?.id}?</Text>
              <Pressable onPress={() => setDeleteTarget(null)} hitSlop={14} style={styles.modalClose}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={styles.detailName}>Это действие нельзя отменить.</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <Pressable style={[styles.confirmBtn, { flex: 1, backgroundColor: 'rgba(74,77,84,0.3)' }]}
                  onPress={() => setDeleteTarget(null)}>
                  <Text style={styles.confirmBtnTxt}>Отмена</Text>
                </Pressable>
                <Pressable style={[styles.confirmBtn, { flex: 1, backgroundColor: 'rgba(160,16,32,0.8)' }]}
                  onPress={confirmDelete}>
                  <Text style={styles.confirmBtnTxt}>Удалить</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <DatePicker visible={picker === 'from'} value={dateFrom}
        onChange={v => { setDateFrom(v); setPicker('to'); }}
        onClose={() => setPicker(null)} title="Начало периода" />
      <DatePicker visible={picker === 'to'} value={dateTo}
        onChange={v => { setDateTo(v); setPicker(null); load(); }}
        onClose={() => setPicker(null)} title="Конец периода" />
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 16, paddingBottom: 24 },

  // Периоды
  chipBar:   { maxHeight: 46, borderBottomWidth: 1, borderBottomColor: colors.border },
  chipInner: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  chip:      { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', backgroundColor: '#07080a' },
  chipActive:{ borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.12)' },
  chipText:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  chipTextActive: { color: colors.greenLight },

  // Фильтры
  filterRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  filterChip:  { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(74,77,84,0.35)', backgroundColor: '#07080a' },
  filterChipActive: { borderColor: 'rgba(61,95,168,0.6)', backgroundColor: 'rgba(61,95,168,0.1)' },
  filterText:  { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  filterTextActive: { color: '#8da9e6' },
  searchInput: { flex: 1, padding: 8, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontSize: 13, fontFamily: fonts.family },
  badgeBtn:    { width: 32, height: 32, borderRadius: 10, backgroundColor: '#0e0f11', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', alignItems: 'center', justifyContent: 'center' },
  badgeTxt:    { fontSize: 14, color: colors.muted },

  // Итоги
  summaryBar:  { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#07080a' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal:  { fontFamily: fonts.family, fontSize: 13, fontWeight: '800', color: colors.text },
  summaryLbl:  { fontFamily: fonts.familyRegular, fontSize: 9, color: colors.muted, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  summarySep:  { width: 1, backgroundColor: 'rgba(74,77,84,0.3)', marginVertical: 4 },

  // Статистика
  statsToggle:  { paddingVertical: 6, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#07080a' },
  statsToggleTxt:{ fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textAlign: 'center' },
  statsBar:     { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#07080a' },
  statItem:     { flex: 1, alignItems: 'center' },
  statVal:      { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  statLbl:      { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, marginTop: 2 },

  // Группы
  dayGroup: { marginBottom: 12 },
  dayHead:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dayDate:  { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.text },
  dayLine:  { flex: 1, height: 1, backgroundColor: 'rgba(74,77,84,0.25)' },
  daySum:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  // Карточка
  card:      { backgroundColor: '#0b0c0f', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', overflow: 'hidden' },
  rowDiv:    { borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },

  // Строка заказа
  orderRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, gap: 8 },
  orderTime:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  orderNote:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  orderMethod: { fontSize: 16 },
  orderTotal:  { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: colors.text },
  orderArrow:  { fontSize: 16, color: 'rgba(74,77,84,0.5)', width: 16, textAlign: 'center' },
  returnBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, backgroundColor: 'rgba(160,16,32,0.12)', borderWidth: 1, borderColor: 'rgba(160,16,32,0.3)' },
  returnBadgeTxt: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.redLight },

  // Детали
  detail:      { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.015)' },
  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailName:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, flex: 1 },
  detailPrice: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  metaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.2)' },
  metaTxt:     { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  // Действия
  actionRow:    { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn:    { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(74,77,84,0.35)', backgroundColor: '#07080a', alignItems: 'center' },
  actionBtnDanger: { borderColor: 'rgba(160,16,32,0.3)', backgroundColor: 'rgba(160,16,32,0.05)' },
  actionBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },

  // Чекбокс
  checkbox:    { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(74,77,84,0.5)', alignItems: 'center', justifyContent: 'center' },
  checkboxOn:  { backgroundColor: colors.greenLight, borderColor: colors.greenLight },

  // Модалки
  modalRoot:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox:      { width: '48%', maxHeight: '85%', backgroundColor: '#0e0f11', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)', overflow: 'hidden' },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.3)' },
  modalTitle:    { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text, flex: 1, marginRight: 12 },
  modalClose:    { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(74,77,84,0.25)', alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { fontSize: 13, color: colors.text, fontFamily: fonts.familySemibold },
  fieldLabel:    { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 14 },
  input:         { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 12, color: colors.text, fontSize: 15, fontFamily: fonts.family },
  confirmBtn:    { paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center' },
  confirmBtnTxt: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: '#fff' },
});
