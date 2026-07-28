import React, { useState, useCallback, useEffect } from 'react';
import { addToFiscalQueue, updateFiscalStatus, getFiscalStatus } from '../../db/queries';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Modal, TextInput, Alert,
} from 'react-native';
import EmptyState from '../EmptyState';
import DatePicker from '../DatePicker';
import {
  getRecentOrders, getOrderItems, deleteOrder, updateOrder,
  returnOrder, getTerms, pluralizeRu, getPayMethods,
} from '../../db/queries';
import { useToast } from '../Toast';
import { getSession } from '../../db/session';
import { colors, fonts } from '../../constants/theme';

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
export default function SalesPanel() {
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
      setItemsMap(map); // Сразу показываем позиции в строках
    } catch (e) { console.error(e); }
  }, [period, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

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
  const card     = filtered.filter(o => (o.method_type||'').includes('card') || o.method==='Карта').reduce((s,o)=>s+o.total,0);
  const qr       = filtered.filter(o => (o.method||'').toLowerCase().includes('qr') || (o.method||'').toLowerCase().includes('сбп') || (o.method||'').toLowerCase().includes('sbp')).reduce((s,o)=>s+o.total,0);
  const mixed    = filtered.filter(o => (o.method||'').toLowerCase().includes('смеш') || (o.method_type||'').includes('mixed')).reduce((s,o)=>s+o.total,0);
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
          {cash > 0 && (<><View style={styles.summarySep} /><View style={styles.summaryItem}><Text style={styles.summaryVal}>{fmt(cash)} ₽</Text><Text style={styles.summaryLbl}>Наличные</Text></View></>)}
          {card > 0 && (<><View style={styles.summarySep} /><View style={styles.summaryItem}><Text style={styles.summaryVal}>{fmt(card)} ₽</Text><Text style={styles.summaryLbl}>Карта</Text></View></>)}
          {qr > 0 && (<><View style={styles.summarySep} /><View style={styles.summaryItem}><Text style={styles.summaryVal}>{fmt(qr)} ₽</Text><Text style={styles.summaryLbl}>QR / СБП</Text></View></>)}
          {mixed > 0 && (<><View style={styles.summarySep} /><View style={styles.summaryItem}><Text style={styles.summaryVal}>{fmt(mixed)} ₽</Text><Text style={styles.summaryLbl}>Смешанная</Text></View></>)}
        
