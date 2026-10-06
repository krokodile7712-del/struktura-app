import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Modal, TextInput, Alert, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import TourGuide from '../components/TourGuide';
import { useTourHighlight, useTourActiveKey } from '../components/TourRegistry';
import Sheet from '../components/Sheet';
import GlassSurface from '../components/GlassSurface';
import ScreenGlow from '../components/ScreenGlow';
import SoftGlow from '../components/SoftGlow';
import Icon from '../components/Icon';
import PinConfirmModal from '../components/PinConfirmModal';
import DatePicker from '../components/DatePicker';
import { useResponsive } from '../hooks/useResponsive';
import { useToast } from '../components/Toast';
import {
  getSalesOrders, getOrderItemsBatch, getSalesSummary, deleteOrder, updateOrder,
  returnOrder, addToFiscalQueue, getTerms, pluralizeRu, getPayMethods, getBusinessProfile, markTourSeen,
} from '../db/queries';
import { getSession, goBackSmart, can } from '../db/session';
import { colors, fonts, glass } from '../constants/theme';

// ─── Утилиты ─────────────────────────────────────────────────────────────────
// Все даты — местные (календарные дни по времени устройства). Раньше брали дату UTC:
// с 00:00 до 03:00 по Москве заказы попадали во «вчера».
const pad          = n => String(n).padStart(2, '0');
const localDateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr     = () => localDateStr();
const daysAgoStr   = n => { const d = new Date(); d.setDate(d.getDate() - n); return localDateStr(d); };
const dateKey      = iso => (iso ? localDateStr(new Date(iso)) : '');
const fmt          = n => Math.round(n || 0).toLocaleString('ru-RU');
const fmtTime      = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const fmtDayLabel = key => {
  if (!key) return '';
  if (key === todayStr()) return 'Сегодня';
  if (key === daysAgoStr(1)) return 'Вчера';
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
};

const PAGE = 300; // сколько заказов подгружать за раз

const PERIODS = [
  { key: 'today',  label: 'Сегодня', from: todayStr,           to: todayStr },
  { key: 'week',   label: 'Неделя',  from: () => daysAgoStr(6),  to: todayStr },
  { key: 'month',  label: 'Месяц',   from: () => daysAgoStr(29), to: todayStr },
  { key: 'custom', label: 'Свой период', from: () => daysAgoStr(29), to: todayStr },
];
const PAY_FILTERS = [
  { key: 'all', label: 'Все' }, { key: 'cash', label: 'Наличные' },
  { key: 'card', label: 'Карта' }, { key: 'returns', label: 'Возвраты' },
];

function groupByDate(orders) {
  const groups = {};
  for (const o of orders) {
    const k = dateKey(o.created_at);
    if (!groups[k]) groups[k] = [];
    groups[k].push(o);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

// Тип оплаты заказа (для фильтров списка)
const isCash  = o => (o.method_type || '') === 'cash' || o.method === 'Наличные' || ((o.method_type || '') === 'mixed' && (o.cash_amount || 0) > 0);
const isMixed = o => (o.method_type || '') === 'mixed' || o.method === 'Смешанная';
const isCard  = o => !isMixed(o) ? (!isCash(o)) : (o.card_amount || 0) > 0;

function itemLabel(i) {
  return `${i.name}${i.size ? ` ${i.size}` : ''}${(i.quantity || 1) > 1 ? ` × ${i.quantity}` : ''}`;
}
function itemsSummary(items) {
  if (!items || items.length === 0) return '—';
  const names = items.map(itemLabel);
  return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} и ещё ${names.length - 2}`;
}

// Изменение относительно прошлого периода; нет базы для сравнения — нет и строки
function Delta({ now, prev, label }) {
  if (!prev || prev <= 0) return null;
  const v = Math.round((now - prev) / prev * 100);
  const color = v > 0 ? colors.green : v < 0 ? colors.warning : colors.textDim;
  return <Text style={[styles.delta, { color }]}>{v > 0 ? '↑' : v < 0 ? '↓' : '→'} {Math.abs(v)}% {label}</Text>;
}

// Плитки сводки — стекло (как на «Обзоре»): выручка, заказы, чек, способы оплаты, возвраты
function SummaryTiles({ summary, period }) {
  const total = summary.total || 0;
  const parts = [
    { name: 'Наличные', sum: summary.cash },
    { name: 'Карта', sum: summary.card },
    ...summary.other.map(o => ({ name: o.name, sum: o.sum })),
  ].filter(p => p.sum > 0.5);
  return (
    <>
      <GlassSurface radius={glass.radius.tile} style={{ marginBottom: 12 }}>
        <View style={styles.stripe} />
        <View style={styles.heroInner}>
          <Text style={styles.tileLbl}>Выручка за период</Text>
          <Text style={styles.heroVal}>{fmt(total)} ₽</Text>
          <Delta now={total} prev={summary.prev.total} label={period === 'today' ? 'ко вчера' : 'к прошлому периоду'} />
        </View>
      </GlassSurface>

      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <GlassSurface radius={glass.radius.tile} padding={16} style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.tileLbl}>Заказов</Text>
          <Text style={styles.tileVal}>{summary.count}</Text>
        </GlassSurface>
        <GlassSurface radius={glass.radius.tile} padding={16} style={{ flex: 1 }}>
          <Text style={styles.tileLbl}>Средний чек</Text>
          <Text style={styles.tileVal}>{fmt(summary.avg)} ₽</Text>
        </GlassSurface>
      </View>

      <GlassSurface radius={glass.radius.tile} padding={20}>
        <Text style={styles.tileLbl}>По способам оплаты</Text>
        {parts.length === 0 ? (
          <Text style={styles.payEmpty}>Оплат за период нет</Text>
        ) : parts.map(p => {
          const share = total > 0 ? Math.round(p.sum / total * 100) : 0;
          return (
            <View key={p.name} style={{ marginTop: 14 }}>
              <View style={styles.payRow}>
                <Text style={styles.payName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.paySum}>{fmt(p.sum)} ₽ · {share}%</Text>
              </View>
              <View style={styles.payTrack}><View style={[styles.payFill, { width: `${Math.max(share, 3)}%` }]} /></View>
            </View>
          );
        })}
        {summary.returns.count > 0 && (
          <View style={styles.returnsLine}>
            <Text style={styles.returnsLbl}>Возвраты</Text>
            <Text style={styles.returnsVal}>{summary.returns.count} · {fmt(summary.returns.sum)} ₽</Text>
          </View>
        )}
      </GlassSurface>
    </>
  );
}

// ─── Экран ────────────────────────────────────────────────────────────────────
export default function SalesScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const isAdmin  = getSession()?.role === 'admin';
  const terms    = getTerms();
  const toast    = useToast();

  const [period, setPeriod]         = useState('today');
  const [dateFrom, setDateFrom]     = useState(todayStr());
  const [dateTo, setDateTo]         = useState(todayStr());
  const [search, setSearch]         = useState('');
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [payFilter, setPayFilter]   = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [picker, setPicker]         = useState(null);

  const [orders, setOrders]         = useState([]);
  const [itemsMap, setItemsMap]     = useState({});
  const [hasMore, setHasMore]       = useState(false);
  const [summary, setSummary]       = useState({ total: 0, count: 0, avg: 0, cash: 0, card: 0, other: [], returns: { count: 0, sum: 0 }, prev: { total: 0, count: 0, avg: 0 } });
  const [expanded, setExpanded]     = useState(null);
  const [payMethods, setPayMethods] = useState([]);

  const [editOrder, setEditOrder]       = useState(null);
  const [editTotal, setEditTotal]       = useState('');
  const [editMethod, setEditMethod]     = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);
  const [pinAsk, setPinAsk]             = useState(null); // подтверждение PIN администратора

  const [tourOpen, setTourOpen]       = useState(false);
  const searchHighlight  = useTourHighlight('sales.search');
  const ordersHighlight  = useTourHighlight('sales.orders');
  const summaryHighlight = useTourHighlight('sales.summary');
  const activeTourKey    = useTourActiveKey();

  // Полоска сводки в портрете по умолчанию свёрнута — на её шаге тура раскрываем
  React.useEffect(() => {
    if (activeTourKey === 'sales.summary' && !isLandscape) setSummaryExpanded(true);
  }, [activeTourKey]);

  // Автозапуск тура при первом заходе в раздел
  React.useEffect(() => {
    try {
      const p = getBusinessProfile();
      if (!p?.tours_seen?.Sales) {
        const t = setTimeout(() => setTourOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch (_) {}
  }, []);

  const tourSteps = [
    { key: 'sales.search',  title: 'Поиск и фильтры', text: 'Ищите заказ по товару, сумме или способу оплаты. Кнопка «Фильтры» рядом — период (сегодня/неделя/месяц/свой) и способ оплаты.' },
    { key: 'sales.orders',  title: 'Список заказов', text: isAdmin ? 'Заказы сгруппированы по дням. Нажмите на заказ — увидите его состав, а также действия: чек, возврат, изменить, удалить.' : 'Заказы сгруппированы по дням — видно, что и когда продано.' },
    { key: 'sales.summary', title: 'Сводка', text: 'Выручка за период, средний чек и разбивка по способам оплаты. В портретной ориентации сводка свёрнута сверху — нажмите, чтобы развернуть.', cardPosition: 'top' },
  ];

  // Анимации
  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(12))[0];

  const getRange = () => {
    if (period === 'custom') return { from: dateFrom, to: dateTo };
    const p = PERIODS.find(p => p.key === period);
    return { from: p.from(), to: p.to() };
  };

  // Заказы периода берутся из базы по диапазону дат (а не «последние 500» с фильтром на
  // месте), итоги считаются по ВСЕМ заказам периода, список подгружается порциями.
  const load = useCallback(() => {
    try {
      const { from, to } = getRange();
      const page = getSalesOrders(from, to, { limit: PAGE, offset: 0 });
      setOrders(page);
      setHasMore(page.length === PAGE);
      setItemsMap(getOrderItemsBatch(page.map(o => o.id)));
      setSummary(getSalesSummary(from, to));
      setPayMethods(getPayMethods());
    } catch (e) {
      console.error(e);
      toast.show('Не удалось загрузить заказы', 'warn');
    }
    fadeAnim.setValue(0); slideAnim.setValue(12);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [period, dateFrom, dateTo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMore = () => {
    try {
      const { from, to } = getRange();
      const next = getSalesOrders(from, to, { limit: PAGE, offset: orders.length });
      setOrders(prev => [...prev, ...next]);
      setItemsMap(prev => ({ ...prev, ...getOrderItemsBatch(next.map(o => o.id)) }));
      setHasMore(next.length === PAGE);
    } catch (e) { console.error(e); toast.show('Не удалось загрузить ещё', 'warn'); }
  };

  // Фильтрация списка
  const filtered = orders.filter(o => {
    if (payFilter === 'returns') return o.status === 'returned';
    if (o.status === 'returned') return false;
    if (payFilter === 'cash') return isCash(o);
    if (payFilter === 'card') return isCard(o);
    return true;
  }).filter(o => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    if (String(o.total).includes(q) || String(o.id) === q.replace('№', '')) return true;
    if (o.method?.toLowerCase().includes(q)) return true;
    if (o.cashier_name?.toLowerCase().includes(q) || o.client_name?.toLowerCase().includes(q)) return true;
    return (itemsMap[o.id] || []).some(i => i.name?.toLowerCase().includes(q));
  });
  const grouped = groupByDate(filtered);
  const filtersActive = period !== 'today' || payFilter !== 'all';

  const toggleOrder = (id) => setExpanded(e => e === id ? null : id);

  // Изменение и удаление — только по PIN администратора
  const askPin = (title, message, action) => {
    if (!isAdmin) { toast.show('Это действие доступно только администратору', 'warn'); return; }
    setPinAsk({ title, message, action });
  };

  const openEdit = (o) => { setEditOrder(o); setEditTotal(String(o.total)); setEditMethod(o.method); };
  const confirmEdit = () => {
    if (!editOrder) return;
    const total = parseFloat(String(editTotal).replace(',', '.'));
    if (!isFinite(total) || total <= 0) { toast.show('Введите сумму больше нуля', 'warn'); return; }
    const found = payMethods.find(m => m.name === editMethod);
    const method_type = found ? found.type
      : editMethod === 'Наличные' ? 'cash'
      : editMethod === 'Карта' ? 'card'
      : undefined;
    const target = editOrder;
    askPin('Изменить заказ', `Введите PIN администратора, чтобы изменить заказ №${target.id}.`, () => {
      try { updateOrder(target.id, { total, method: editMethod, method_type }); toast.show('Сохранено'); setEditOrder(null); load(); }
      catch (e) { console.error(e); toast.show('Не удалось сохранить изменения', 'warn'); }
    });
  };
  const confirmReturn = () => {
    if (!returnTarget) return;
    try {
      const ok = returnOrder(returnTarget.id);
      if (ok === false) toast.show('Заказ уже возвращён', 'warn');
      else { toast.show('Возврат оформлен'); load(); }
    } catch (e) { console.error(e); toast.show('Не удалось оформить возврат', 'warn'); }
    setReturnTarget(null);
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    askPin('Удалить заказ', `Введите PIN администратора, чтобы удалить заказ №${target.id} на ${fmt(target.total)} ₽.`, () => {
      try { deleteOrder(target.id); toast.show('Заказ удалён'); setDeleteTarget(null); load(); }
      catch (e) { console.error(e); toast.show('Не удалось удалить заказ', 'warn'); }
    });
  };

  // Раскрытый заказ: состав, скидка/баллы, разбивка смешанной оплаты, действия
  const renderDetail = (order, items, isReturn) => {
    const itemsSum = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const diff = itemsSum - order.total;
    const mixedSplit = isMixed(order) && ((order.cash_amount || 0) + (order.card_amount || 0) > 0);
    return (
      <View style={styles.detail}>
        {items.map(i => (
          <View key={i.id} style={styles.ln}>
            <Text style={styles.lnTxt} numberOfLines={1}>{itemLabel(i)}</Text>
            <Text style={styles.lnVal}>{fmt((i.price || 0) * (i.quantity || 1))} ₽</Text>
          </View>
        ))}
        {diff > 0.5 && (
          <View style={styles.ln}>
            <Text style={styles.lnTxt}>{order.points_discount > 0 ? 'Скидка и баллы' : order.discount_pct > 0 ? `Скидка ${order.discount_pct}%` : 'Скидка'}</Text>
            <Text style={[styles.lnVal, { color: colors.green }]}>−{fmt(diff)} ₽</Text>
          </View>
        )}
        {diff < -0.5 && items.length > 0 && (
          <View style={styles.ln}>
            <Text style={styles.lnTxt}>Сумма изменена вручную</Text>
            <Text style={styles.lnVal}>+{fmt(-diff)} ₽</Text>
          </View>
        )}
        {order.points_spent > 0 && (
          <Text style={styles.splitTxt}>Списано баллов: {fmt(order.points_spent)} (−{fmt(order.points_discount)} ₽)</Text>
        )}
        {mixedSplit && (
          <Text style={styles.splitTxt}>Наличные {fmt(order.cash_amount)} ₽  ·  Карта {fmt(order.card_amount)} ₽</Text>
        )}
        <View style={styles.acts}>
          {!isReturn && (
            <>
              <Pressable style={styles.act} onPress={() => {
                try { addToFiscalQueue(order.id); Alert.alert('Чек', 'Добавлен в очередь. Отправится после подключения кассы.'); }
                catch (e) { console.error(e); toast.show('Не удалось добавить чек в очередь', 'warn'); }
              }}>
                <Icon name="receipt" size={18} color={colors.textDim} /><Text style={styles.actTxt}>Чек</Text>
              </Pressable>
              {can('cancel_orders') && (
                <Pressable style={styles.act} onPress={() => setReturnTarget(order)}>
                  <Icon name="undo" size={18} color={colors.textDim} /><Text style={styles.actTxt}>Возврат</Text>
                </Pressable>
              )}
              <Pressable style={styles.act} onPress={() => openEdit(order)}>
                <Icon name="pencil" size={18} color={colors.textDim} /><Text style={styles.actTxt}>Изменить</Text>
              </Pressable>
            </>
          )}
          <Pressable style={[styles.act, styles.actDanger]} onPress={() => setDeleteTarget(order)}>
            <Icon name="trash" size={18} color={colors.red} /><Text style={[styles.actTxt, { color: colors.red }]}>Удалить</Text>
          </Pressable>
        </View>
        <Text style={styles.pinHint}>Изменение и удаление — по PIN администратора</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenGlow />
      {/* подсветка за правой панелью — стеклянным плиткам сводки нужно что-то просвечивать */}
      {isLandscape && <SoftGlow size={560} color="127,168,217" alpha={0.20} style={{ position: 'absolute', right: -170, top: 40 }} />}

      <TopBar
        title={pluralizeRu(terms.order)}
        onBack={() => goBackSmart(navigation)}
        navigation={navigation}
        activeScreen="Sales"
        rightElement={
          <Pressable onPress={() => setTourOpen(true)} hitSlop={10} style={styles.tourBtn}>
            <Text style={styles.tourBtnTxt}>?</Text>
          </Pressable>
        }
      />

      <View style={{ flex: 1, flexDirection: isLandscape ? 'row' : 'column' }}>

        {!isLandscape && (
          /* Портрет — сводка сверху, по умолчанию свёрнута */
          <Pressable style={[{ margin: 12, marginBottom: 0, position: 'relative' }, summaryHighlight.style]} onPress={() => setSummaryExpanded(v => !v)}>
            <GlassSurface radius={glass.radius.tile} padding={16}>
              <View style={styles.stripRow}>
                <View>
                  <Text style={styles.tileLbl}>Выручка за период</Text>
                  <Text style={styles.stripVal}>{fmt(summary.total)} ₽</Text>
                </View>
                <Text style={styles.stripChevron}>{summaryExpanded ? '▲' : '▼'}</Text>
              </View>
              {summaryExpanded && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.splitTxt}>Заказов: {summary.count}  ·  Средний чек: {fmt(summary.avg)} ₽</Text>
                  {[{ name: 'Наличные', sum: summary.cash }, { name: 'Карта', sum: summary.card }, ...summary.other.map(o => ({ name: o.name, sum: o.sum }))]
                    .filter(p => p.sum > 0.5).map(p => (
                      <View key={p.name} style={styles.payRow}>
                        <Text style={styles.payName}>{p.name}</Text><Text style={styles.paySum}>{fmt(p.sum)} ₽</Text>
                      </View>
                  ))}
                  {summary.returns.count > 0 && (
                    <View style={styles.returnsLine}>
                      <Text style={styles.returnsLbl}>Возвраты</Text><Text style={styles.returnsVal}>{summary.returns.count} · {fmt(summary.returns.sum)} ₽</Text>
                    </View>
                  )}
                </View>
              )}
            </GlassSurface>
            {summaryHighlight.overlay}
          </Pressable>
        )}

        {/* ── Список: поиск + заказы ── */}
        <View style={{ flex: 1 }}>
          <View style={[styles.searchWrap, { position: 'relative' }, searchHighlight.style]}>
            <View style={styles.searchBox}>
              <Icon name="search" size={20} color={colors.muted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Поиск: товар, сумма, кассир, клиент, № заказа"
                placeholderTextColor={colors.muted}
              />
            </View>
            <Pressable
              style={[styles.filtersBtn, filtersActive && styles.filtersBtnActive]}
              onPress={() => setFiltersOpen(true)}
            >
              <Icon name="sliders" size={18} color={filtersActive ? colors.orangeLight : colors.textDim} />
              <Text style={[styles.filtersBtnTxt, filtersActive && styles.filtersBtnTxtActive]}>Фильтры</Text>
            </Pressable>
            {filtersActive && (
              <Pressable style={styles.filtersClearBtn} onPress={() => { setPeriod('today'); setPayFilter('all'); }} hitSlop={8}>
                <Icon name="x" size={16} color={colors.textDim} />
              </Pressable>
            )}
            {searchHighlight.overlay}
          </View>

          {/* Список заказов */}
          <View style={[{ flex: 1, position: 'relative' }, ordersHighlight.style]}>
          {filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTxt}>
                {search ? 'Ничего не найдено' : 'Нет заказов за период'}
              </Text>
              <Text style={styles.emptyHint}>
                {search ? 'Попробуйте другой запрос' : 'Выберите другой период или проведите заказ через Кассу'}
              </Text>
            </View>
          ) : (
            <Animated.ScrollView
              style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
              contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {grouped.map(([date, dayOrders]) => {
                const live = dayOrders.filter(o => o.status !== 'returned');
                const retCount = dayOrders.length - live.length;
                return (
                <View key={date}>
                  {/* Заголовок дня */}
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayLabel}>{fmtDayLabel(date)}</Text>
                    <Text style={styles.dayTotal}>
                      {live.length} зак. · {fmt(live.reduce((s, o) => s + o.total, 0))} ₽{retCount > 0 ? ` · ${retCount} возвр.` : ''}
                    </Text>
                  </View>

                  {/* Карточка дня */}
                  <View style={styles.dayCard}>
                    {dayOrders.map((order, idx) => {
                      const isExp    = expanded === order.id;
                      const items    = itemsMap[order.id] || [];
                      const isReturn = order.status === 'returned';
                      const sub = [`Заказ №${order.id}`, order.cashier_name, order.client_name ? `клиент ${order.client_name}` : null, isReturn ? 'возврат' : null].filter(Boolean).join(' · ');
                      return (
                        <View key={order.id}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.orderRow,
                              idx > 0 && styles.orderRowDiv,
                              isExp && styles.orderRowOpen,
                              isReturn && { opacity: 0.62 },
                              pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                            ]}
                            onPress={() => isAdmin ? toggleOrder(order.id) : null}
                          >
                            <Text style={styles.orderTime}>{fmtTime(order.created_at)}</Text>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.orderItems} numberOfLines={1}>{itemsSummary(items)}</Text>
                              <Text style={styles.orderMeta} numberOfLines={1}>{sub}</Text>
                            </View>
                            <Text style={[styles.orderTotal, isReturn && styles.orderTotalRet]}>{fmt(order.total)} ₽</Text>
                            <View style={[styles.pill, isReturn && styles.pillRet]}>
                              <Text style={[styles.pillTxt, isReturn && { color: colors.red }]} numberOfLines={1}>{isReturn ? 'Возврат' : order.method}</Text>
                            </View>
                            {isAdmin && <Text style={[styles.chevron, isExp && styles.chevronOpen]}>›</Text>}
                          </Pressable>
                          {isExp && isAdmin && renderDetail(order, items, isReturn)}
                        </View>
                      );
                    })}
                  </View>
                </View>
                );
              })}
              {hasMore && (
                <Pressable style={styles.moreBtn} onPress={loadMore}>
                  <Text style={styles.moreBtnTxt}>Показать ещё</Text>
                </Pressable>
              )}
            </Animated.ScrollView>
          )}
          {ordersHighlight.overlay}
          </View>
        </View>

        {isLandscape && (
          /* Альбомная — сводка постоянной панелью справа (стеклянные плитки) */
          <View style={[styles.sidePanel, { position: 'relative' }, summaryHighlight.style]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <SummaryTiles summary={summary} period={period} />
            </ScrollView>
            {summaryHighlight.overlay}
          </View>
        )}
      </View>

      {/* Пикер периода — один календарь, тап на начало и конец */}
      <DatePicker
        visible={picker === 'range'}
        mode="range"
        rangeFrom={dateFrom}
        rangeTo={dateTo}
        onRangeChange={(from, to) => { setDateFrom(from); setDateTo(to); setPeriod('custom'); }}
        onClose={() => setPicker(null)}
      />

      {/* Фильтры: период и способ оплаты — чипами */}
      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры">
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.filtersSheetLabel}>Период</Text>
          <View style={styles.chipsWrap}>
            {PERIODS.map(p => (
              <Pressable
                key={p.key}
                style={[styles.chip, period === p.key && styles.chipOn]}
                onPress={() => { if (p.key === 'custom') setPicker('range'); else setPeriod(p.key); }}
              >
                <Text style={[styles.chipTxt, period === p.key && styles.chipTxtOn]}>
                  {p.key === 'custom' && period === 'custom' ? `${fmtDayLabel(dateFrom)} — ${fmtDayLabel(dateTo)}` : p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.filtersSheetLabel, { marginTop: 22 }]}>Оплата</Text>
          <View style={styles.chipsWrap}>
            {PAY_FILTERS.map(f => (
              <Pressable key={f.key} style={[styles.chip, payFilter === f.key && styles.chipOn]} onPress={() => setPayFilter(f.key)}>
                <Text style={[styles.chipTxt, payFilter === f.key && styles.chipTxtOn]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Sheet>

      {/* Изменить заказ */}
      <Sheet visible={!!editOrder} onClose={() => setEditOrder(null)} title="Изменить заказ">
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Сумма</Text>
          <TextInput style={styles.modalInput} value={editTotal}
            onChangeText={setEditTotal} keyboardType="numeric" placeholder="0"
            placeholderTextColor={colors.muted} />
          <Text style={styles.fieldLabel}>Способ оплаты</Text>
          <View style={styles.chipsWrap}>
            {(payMethods.length > 0 ? payMethods.map(m => m.name) : ['Наличные', 'Карта']).map(name => (
              <Pressable key={name} style={[styles.chip, editMethod === name && styles.chipOn]} onPress={() => setEditMethod(name)}>
                <Text style={[styles.chipTxt, editMethod === name && styles.chipTxtOn]}>{name}</Text>
              </Pressable>
            ))}
          </View>
          {editOrder && editMethod !== editOrder.method && isMixed(editOrder) && (
            <Text style={styles.warnTxt}>Разбивка смешанной оплаты будет сброшена.</Text>
          )}
          <Text style={styles.warnTxt}>Состав заказа не меняется — только сумма и способ оплаты. Сохранение — по PIN администратора.</Text>
          <View style={styles.modalBtns}>
            <Pressable style={styles.modalCancel} onPress={() => setEditOrder(null)}>
              <Text style={styles.modalCancelTxt}>Отмена</Text>
            </Pressable>
            <Pressable style={styles.modalSave} onPress={confirmEdit}>
              <Text style={styles.modalSaveTxt}>Сохранить</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Sheet>

      {/* Удаление */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ ...StyleSheet.absoluteFillObject }} onPress={() => setDeleteTarget(null)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Удалить заказ?</Text>
            <Text style={styles.modalDesc}>Заказ на {fmt(deleteTarget?.total)} ₽ будет удалён безвозвратно, товары вернутся на склад. Потребуется PIN администратора.</Text>
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

      {/* Возврат */}
      <Modal visible={!!returnTarget} transparent animationType="fade" onRequestClose={() => setReturnTarget(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ ...StyleSheet.absoluteFillObject }} onPress={() => setReturnTarget(null)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Оформить возврат?</Text>
            <Text style={styles.modalDesc}>Сумма {fmt(returnTarget?.total)} ₽ будет возвращена, товары вернутся на склад. Статус заказа изменится на «Возврат».</Text>
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

      <PinConfirmModal
        visible={!!pinAsk}
        title={pinAsk?.title}
        message={pinAsk?.message}
        onCancel={() => setPinAsk(null)}
        onConfirm={() => { const a = pinAsk?.action; setPinAsk(null); a?.(); }}
      />

      <TourGuide
        visible={tourOpen}
        onClose={() => { setTourOpen(false); markTourSeen('Sales'); }}
        steps={tourSteps}
      />

    </View>
  );
}

const HAIR = 'rgba(255,255,255,0.07)';
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg, position: 'relative', overflow: 'hidden' },
  tourBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(127,168,217,0.4)', alignItems: 'center', justifyContent: 'center' },
  tourBtnTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },

  // Поиск и кнопка «Фильтры»
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 6 },
  searchBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 14, paddingHorizontal: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: HAIR },
  searchInput: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 16, color: colors.text, padding: 0 },
  filtersBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  filtersBtnActive: { backgroundColor: 'rgba(127,168,217,0.18)', borderColor: 'rgba(157,191,230,0.5)' },
  filtersBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.textDim },
  filtersBtnTxtActive: { color: colors.orangeLight },
  filtersClearBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  filtersSheetLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  chipsWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { height: 40, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  chipOn:      { backgroundColor: 'rgba(127,168,217,0.22)', borderColor: 'rgba(157,191,230,0.5)' },
  chipTxt:     { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  chipTxtOn:   { color: colors.orangeLight },

  // Сводка (стеклянные плитки)
  sidePanel:  { width: 340, padding: 16, paddingLeft: 4, paddingTop: 12 },
  stripe:     { position: 'absolute', left: 0, top: 22, bottom: 22, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.orange },
  heroInner:  { paddingVertical: 20, paddingLeft: 24, paddingRight: 20 },
  tileLbl:    { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textDim, marginBottom: 8 },
  heroVal:    { fontFamily: fonts.display, fontSize: 36, color: colors.text, letterSpacing: -0.8 },
  tileVal:    { fontFamily: fonts.display, fontSize: 24, color: colors.text, letterSpacing: -0.4 },
  delta:      { fontFamily: fonts.familySemibold, fontSize: 14, marginTop: 8 },
  payRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  payName:    { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text, flex: 1, marginRight: 8 },
  paySum:     { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.textDim },
  payTrack:   { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)', marginTop: 8, overflow: 'hidden' },
  payFill:    { height: 4, borderRadius: 2, backgroundColor: colors.orange },
  payEmpty:   { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, marginTop: 10 },
  returnsLine:{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' },
  returnsLbl: { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.textDim },
  returnsVal: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },

  // Портрет — сводка сверху
  stripRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stripVal:   { fontFamily: fonts.display, fontSize: 24, color: colors.text, marginTop: 2 },
  stripChevron: { fontSize: 12, color: colors.textDim },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTxt:   { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.textDim },
  emptyHint:  { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  // Список по дням — плотный слой
  dayHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, paddingTop: 14, paddingBottom: 8 },
  dayLabel:   { fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text },
  dayTotal:   { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted },
  dayCard:    { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: HAIR, overflow: 'hidden', marginBottom: 8 },

  orderRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, gap: 12 },
  orderRowDiv: { borderTopWidth: 1, borderTopColor: HAIR },
  orderRowOpen:{ backgroundColor: 'rgba(127,168,217,0.06)' },
  orderTime:   { width: 52, fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted },
  orderItems:  { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  orderMeta:   { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted, marginTop: 2 },
  orderTotal:  { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text, marginLeft: 4 },
  orderTotalRet: { textDecorationLine: 'line-through', color: colors.textDim },
  pill:        { minWidth: 86, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' },
  pillRet:     { borderColor: 'rgba(219,129,120,0.45)' },
  pillTxt:     { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim },
  chevron:     { fontSize: 22, color: colors.muted, transform: [{ rotate: '90deg' }], marginLeft: 2 },
  chevronOpen: { transform: [{ rotate: '-90deg' }] },

  // Раскрытый заказ
  detail:   { paddingHorizontal: 20, paddingLeft: 84, paddingBottom: 16, backgroundColor: 'rgba(127,168,217,0.06)' },
  ln:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  lnTxt:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, flex: 1, marginRight: 12 },
  lnVal:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  splitTxt: { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted, marginTop: 6 },
  acts:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  act:      { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  actDanger:{ borderColor: 'rgba(219,129,120,0.4)' },
  actTxt:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  pinHint:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 10 },

  moreBtn:    { alignSelf: 'center', height: 44, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  moreBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },

  // Модалки
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:     { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  modalTitle:   { fontFamily: fonts.familySemibold, fontSize: 20, color: colors.text, marginBottom: 4 },
  modalDesc:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, marginBottom: 20, lineHeight: 20 },
  fieldLabel:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginTop: 14 },
  modalInput:   { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.text, fontSize: 16, fontFamily: fonts.familyRegular },
  warnTxt:      { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.textDim, marginTop: 12, lineHeight: 18 },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancel:  { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center' },
  modalCancelTxt:{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  modalSave:    { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  modalSaveTxt: { fontFamily: fonts.family, fontSize: 14, color: colors.onAccent },
});
