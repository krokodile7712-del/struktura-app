import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Animated, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import NextStepsCard from '../components/NextStepsCard';
import EmployeeStatsSheet from '../components/EmployeeStatsSheet';
import TourGuide from '../components/TourGuide';
import { useTourHighlight, useTourActiveKey } from '../components/TourRegistry';
import GlassSurface from '../components/GlassSurface';
import NewOrderButton from '../components/NewOrderButton';
import { useDock } from '../hooks/useDock';
import { useResponsive } from '../hooks/useResponsive';
import ScreenGlow from '../components/ScreenGlow';
import {
  getOpenShift, getBusinessProfile, getDashboardStats, getOverviewExtras, getRoleNames, markTourSeen,
} from '../db/queries';
import { getSession } from '../db/session';
import { colors, fonts, withOpacity, glass } from '../constants/theme';

// Изменение относительно вчера. Нет вчерашней базы для сравнения — нет и строки.
function pctDelta(cur, prev) {
  if (!prev || prev <= 0) return null;
  return Math.round((cur - prev) / prev * 100);
}

function Delta({ value, unit = '%' }) {
  if (value === null || value === undefined) return null;
  const up = value > 0;
  const down = value < 0;
  // Падение — не красным: на Обзоре это справочная цифра, а не тревога (красный — для ошибок)
  const color = up ? colors.green : down ? colors.warning : colors.textDim;
  const arrow = up ? '↑' : down ? '↓' : '→';
  return <Text style={[styles.delta, { color }]}>{arrow} {Math.abs(value)}{unit} ко вчера</Text>;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Доброе утро';
  if (h < 17) return 'Добрый день';
  return 'Добрый вечер';
}

// Обзор администратора. AppNav сам решает, как себя показать — снизу
// компактной панелью в портрете, широкой боковой панелью со всеми
// разделами в альбомной ориентации (см. components/AppNav.js) — этому
// экрану не нужно ничего специально достраивать самому.
export default function AdminScreen({ navigation }) {
  const [profile, setProfile]   = useState(null);
  const [stats, setStats]       = useState({});
  const [hasShift, setHasShift] = useState(false);
  const [roleNames, setRoleNames] = useState({ admin: 'Администратор' });
  const [sessionName, setSessionName] = useState('');
  const [meOpen, setMeOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [extras, setExtras] = useState({ yesterday: { orders: 0, total: 0, avg: 0 }, recent: [], popular: [] });
  const [refreshing, setRefreshing] = useState(false);
  const { isWide } = useResponsive();
  const stockBannerHighlight = useTourHighlight('admin.stockBanner');
  const nextStepsHighlight = useTourHighlight('admin.nextSteps', 18);
  const statsGridHighlight = useTourHighlight('admin.statsGrid');
  const shiftActionHighlight = useTourHighlight('admin.statsGrid.shiftAction', 14);
  // По одной подсветке на каждую карточку сводки — без них на шаге «Смена»
  // соседние карточки оставались обычными (не гасли), раз само затемнение
  // сетки целиком отключилось, когда «Смена» стала дочерним шагом «Сводки»
  const recentHighlight  = useTourHighlight('admin.recentSales', 18);
  const popularHighlight = useTourHighlight('admin.popular', 18);
  const revenueHighlight  = useTourHighlight('admin.statsGrid.revenue', 14);
  const ordersHighlight   = useTourHighlight('admin.statsGrid.orders', 14);
  const avgCheckHighlight = useTourHighlight('admin.statsGrid.avgCheck', 14);
  const cashHighlight     = useTourHighlight('admin.statsGrid.cash', 14);
  const cardHighlight     = useTourHighlight('admin.statsGrid.card', 14);
  const statCardHighlights = [revenueHighlight, ordersHighlight, avgCheckHighlight, cashHighlight, cardHighlight];
  const activeTourKey = useTourActiveKey();
  const scrollRef = useRef(null);
  // Кнопка «Новый заказ» в строке приветствия; при прокрутке вниз её копия «стыкуется»
  // в верхней полосе (справа), а в центре верхней полосы появляется выручка за сегодня.
  const dock = useDock(90);
  const goKassa = () => navigation.navigate('Kassa');
  const sectionY = useRef({});
  const rememberY = (key) => (e) => { sectionY.current[key] = e.nativeEvent.layout.y; };

  const loadStats = useCallback(() => {
    try {
      const p = getBusinessProfile();
      setProfile(p);
      const sess = getSession();
      setSessionName(sess?.name?.split(' ')[0] || '');
      setHasShift(!!getOpenShift(sess?.id));
      setRoleNames(getRoleNames());
      setStats(getDashboardStats(sess?.id));
      setExtras(getOverviewExtras());
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  // Автозапуск тура при первом заходе на Обзор
  useEffect(() => {
    try {
      const p = getBusinessProfile();
      if (!p?.tours_seen?.Admin) {
        const t = setTimeout(() => setTourOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch (_) {}
  }, []);

  const tourSteps = [
    { key: 'admin.stockBanner', title: 'Мало на складе', text: 'Появляется, когда на складе заканчивается что-то важное. Нажмите, чтобы развернуть список и перейти на склад.' },
    { key: 'admin.nextSteps', title: 'Что дальше', text: 'Чек-лист первоначальной настройки — добавить товары, способы оплаты, сотрудников и так далее. Пролистывайте карточки свайпом, каждая ведёт в свой раздел. Исчезнет сам, когда всё будет готово.', cardPosition: 'top' },
    { key: 'admin.statsGrid', title: 'Сводка за сегодня', text: 'Выручка, количество заказов, средний чек и разбивка по способам оплаты — всё за текущий день.', cardPosition: 'top' },
    { key: 'admin.statsGrid.shiftAction', title: 'Смена', text: 'Здесь же — открыть смену, если она ещё не начата, или закрыть, когда рабочий день закончен.', cardPosition: 'top' },
    { key: 'admin.recentSales', title: 'Последние продажи', text: 'Четыре последних заказа за сегодня: время, состав, сумма и способ оплаты. «Все продажи» открывает полную историю.', cardPosition: 'top' },
    { key: 'admin.popular', title: 'Популярное сегодня', text: 'Какие позиции берут чаще всего сегодня — по числу проданных порций.', cardPosition: 'top' },
    { key: 'admin.navPanel', title: 'Разделы', text: 'Здесь все разделы приложения — переключайтесь между ними в любой момент. У некоторых из них есть и свой собственный тур — ищите кнопку «?» в шапке экрана.', cardPosition: 'top' },
  ];

  // Автопрокрутка к активному шагу тура — карточка тура закреплена внизу
  // экрана и может полностью закрыть собой то, что не поднято в видимую
  // область (особенно последние шаги — статистика, блок смены)
  useEffect(() => {
    if (!activeTourKey) return;
    const y = sectionY.current[activeTourKey];
    if (y == null) return;
    const step = tourSteps.find(s => s.key === activeTourKey);
    // Если карточка тура сверху — не подводим элемент к самому верху,
    // иначе он окажется под ней; отступ побольше, под высоту карточки
    const offset = step?.cardPosition === 'top' ? 280 : 70;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - offset), animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [activeTourKey]);

  const todayTotal = stats.todayTotal || 0;
  const todayOrders = stats.todayOrders || 0;
  const avgNow = todayOrders > 0 ? todayTotal / todayOrders : 0;
  const yest = extras.yesterday;
  const revDelta = pctDelta(todayTotal, yest.total);
  const ordDelta = yest.orders > 0 ? todayOrders - yest.orders : null;
  const avgDelta = pctDelta(avgNow, yest.avg);
  const shareOf = (v) => (todayTotal > 0 && v > 0 ? `${Math.round(v / todayTotal * 100)}% выручки` : null);
  const popMax = Math.max(1, ...extras.popular.map(x => x.qty));
  const fmt = (n) => Math.round(n || 0).toLocaleString('ru-RU');

  return (
    <View style={styles.root}>
      <ScreenGlow />
      <TopBar
        title={roleNames.admin || 'Администратор'}
        navigation={navigation}
        activeScreen="Admin"
        centerElement={dock.docked ? (
          <Animated.View style={{ opacity: dock.anim, flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.dockLbl}>Выручка сегодня</Text>
            <Text style={styles.dockVal}>{(stats.todayTotal || 0).toLocaleString('ru-RU')} ₽</Text>
          </Animated.View>
        ) : null}
        rightElement={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Animated.View
              pointerEvents={dock.docked ? 'auto' : 'none'}
              style={{ opacity: dock.anim, transform: [{ translateY: dock.anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}
            >
              <NewOrderButton compact onPress={goKassa} />
            </Animated.View>
            <Pressable onPress={() => setTourOpen(true)} hitSlop={10} style={styles.tourBtn}>
              <Text style={styles.tourBtnTxt}>?</Text>
            </Pressable>
          </View>
        }
      />

      <View style={{ flex: 1 }}>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.panelContent} style={{ flex: 1 }} onScroll={dock.onScroll} scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.orange} colors={[colors.orange]} progressBackgroundColor={colors.surface2}
            onRefresh={() => { setRefreshing(true); loadStats(); setTimeout(() => setRefreshing(false), 400); }} />}>
          {(stats.lowStockCount > 0 || tourOpen) && (() => {
            const isDemo = !(stats.lowStockCount > 0);
            const demoCount = isDemo ? 2 : stats.lowStockCount;
            const demoItems = isDemo ? [{ name: 'Стаканы 250мл', 'остаток': 8, unit: 'шт' }, { name: 'Молоко', 'остаток': 1, unit: 'л' }] : (stats.lowStockItems || []);
            return (
            <View style={[{ position: 'relative' }, stockBannerHighlight.style]} onLayout={rememberY('admin.stockBanner')}>
            <Pressable
              style={[styles.stockBanner, stockOpen && styles.stockBannerOpen]}
              onPress={() => setStockOpen(v => !v)}
            >
              <View style={styles.stockBannerRow}>
                <Text style={styles.stockBannerTxt}>
                  Мало на складе: {demoCount} поз.{isDemo ? ' (пример)' : ''}
                </Text>
                <Text style={styles.stockBannerChevron}>{stockOpen ? '▲' : '▼'}</Text>
              </View>
              {stockOpen && (
                <Pressable onPress={() => !isDemo && navigation.navigate('Products', { initialTab: 'stock' })}>
                  {demoItems.map((it, i) => (
                    <Text key={i} style={styles.stockBannerItem}>
                      · {it.name} — {it['остаток']} {it.unit}
                    </Text>
                  ))}
                  <Text style={styles.stockBannerLink}>Перейти на склад →</Text>
                </Pressable>
              )}
            </Pressable>
            {stockBannerHighlight.overlay}
            </View>
            );
          })()}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <Pressable style={styles.avatar} onPress={() => setMeOpen(true)} hitSlop={8}>
              <Text style={styles.avatarTxt}>{(sessionName || '?').charAt(0).toUpperCase()}</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelGreeting}>{getGreeting()}{sessionName ? <Text style={styles.panelGreetingName}>{`, ${sessionName}`}</Text> : ''}</Text>
              <Text style={styles.panelSub}>{profile?.business_name || 'Сводка за сегодня'}</Text>
            </View>
            <NewOrderButton onPress={goKassa} style={{ marginLeft: 16 }} />
          </View>

          <View style={[{ position: 'relative' }, nextStepsHighlight.style]} onLayout={rememberY('admin.nextSteps')}>
            <NextStepsCard navigation={navigation} forceVisible={tourOpen} />
            {nextStepsHighlight.overlay}
          </View>

          <View style={[styles.statsGrid, { position: 'relative' }, statsGridHighlight.style]} onLayout={rememberY('admin.statsGrid')}>

            {/* Выручка — главная плитка экрана: крупнее остальных и с тонкой акцентной
                линией слева. Все плитки статистики — стекло (заливка 22%) поверх мягкой
                подсветки фона; содержимое экрана ниже остаётся плотным слоем. */}
            <View style={[{ width: '100%', position: 'relative' }, statCardHighlights[0].style]}>
              <GlassSurface radius={glass.radius.tile} style={styles.revenueCard}>
                <View style={styles.stripe} />
                <View style={styles.revenueInner}>
                  <View>
                    <Text style={styles.revenueLbl}>Выручка сегодня</Text>
                    <Text style={styles.revenueVal}>{fmt(todayTotal)} ₽</Text>
                  </View>
                  <Delta value={revDelta} />
                </View>
              </GlassSurface>
              {statCardHighlights[0].overlay}
            </View>

            {[
              { label: 'Заказов', value: todayOrders, delta: ordDelta, unit: '' },
              { label: 'Средний чек', value: `${fmt(avgNow)} ₽`, delta: avgDelta, unit: '%' },
              { label: 'Наличные', value: `${fmt(stats.todayCash)} ₽`, share: shareOf(stats.todayCash) },
              { label: 'Карта', value: `${fmt(stats.todayCard)} ₽`, share: shareOf(stats.todayCard) },
            ].map((s, i) => (
              <View key={i} style={[{ flex: 1, minWidth: '44%', position: 'relative' }, statCardHighlights[i + 1].style]}>
                <GlassSurface radius={glass.radius.tile} padding={20} style={styles.statTile}>
                  <Text style={styles.statLbl}>{s.label}</Text>
                  <Text style={styles.statVal}>{s.value}</Text>
                  {s.share ? <Text style={styles.shareTxt}>{s.share}</Text> : <Delta value={s.delta} unit={s.unit} />}
                </GlassSurface>
                {statCardHighlights[i + 1].overlay}
              </View>
            ))}

            {/* Смена — та же плитка, но интерактивная: статус показан цветной полоской
                слева (красная — не открыта, зелёная — открыта), тап открывает или
                закрывает смену. */}
            <Pressable
              style={({ pressed }) => [
                { flex: 1, minWidth: '44%', position: 'relative' },
                shiftActionHighlight.style,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => navigation.navigate(stats.shift ? 'ShiftClose' : 'Shift')}
              onLayout={rememberY('admin.statsGrid.shiftAction')}
            >
              <GlassSurface radius={glass.radius.tile}>
                <View style={styles.shiftClip}>
                  <View style={[styles.stripe, { top: 0, bottom: 0, borderRadius: 0, backgroundColor: stats.shift ? colors.green : colors.red }]} />
                  <View style={styles.shiftRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shiftStatVal}>{stats.shift ? (stats.shiftDuration || '—') : 'Не открыта'}</Text>
                      <Text style={styles.shiftStatLbl}>{stats.shift ? 'Смена открыта' : 'Смена закрыта'}</Text>
                    </View>
                    <Text style={[styles.shiftStatChevron, { color: colors.textDim }]}>›</Text>
                  </View>
                </View>
              </GlassSurface>
              {shiftActionHighlight.overlay}
            </Pressable>
            {statsGridHighlight.overlay}
          </View>

          {/* Содержимое ниже плиток — плотный слой (не стекло): список должен читаться */}
          <View style={isWide ? styles.listsRow : null}>
            <View style={[styles.listCard, isWide && { flex: 3, marginRight: 12 }, !isWide && { marginBottom: 12 }, { position: 'relative' }, recentHighlight.style]} onLayout={rememberY('admin.recentSales')}>
              <Pressable style={styles.listHead} onPress={() => navigation.navigate('Sales')} hitSlop={6}>
                <View>
                  <Text style={styles.listTitle}>Последние продажи</Text>
                  <Text style={styles.listSub}>Сегодня</Text>
                </View>
                <Text style={styles.listLink}>Все продажи ›</Text>
              </Pressable>
              {extras.recent.length === 0 ? (
                <Text style={styles.emptyTxt}>Сегодня продаж ещё не было. Первый заказ появится здесь.</Text>
              ) : extras.recent.map((o, i) => (
                <View key={o.id} style={[styles.saleRow, i === 0 && { borderTopWidth: 0 }]}>
                  <Text style={styles.saleTime}>{o.time}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.saleName} numberOfLines={1}>{o.summary}</Text>
                    <Text style={styles.saleSub}>Заказ №{o.id}</Text>
                  </View>
                  <Text style={styles.saleSum}>{fmt(o.total)} ₽</Text>
                  <View style={styles.pill}><Text style={styles.pillTxt}>{o.method}</Text></View>
                </View>
              ))}
              {recentHighlight.overlay}
            </View>

            <View style={[styles.listCard, isWide && { flex: 2 }, { position: 'relative' }, popularHighlight.style]} onLayout={rememberY('admin.popular')}>
              <View style={styles.listHead}>
                <View>
                  <Text style={styles.listTitle}>Популярное сегодня</Text>
                  <Text style={styles.listSub}>Порций за день</Text>
                </View>
              </View>
              {extras.popular.length === 0 ? (
                <Text style={styles.emptyTxt}>Пока нет данных — появится после первых продаж.</Text>
              ) : extras.popular.map(pp => (
                <View key={pp.name} style={styles.barRow}>
                  <Text style={styles.barName} numberOfLines={1}>{pp.name}</Text>
                  <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(6, Math.round(pp.qty / popMax * 100))}%` }]} /></View>
                  <Text style={styles.barQty}>{pp.qty}</Text>
                </View>
              ))}
              {popularHighlight.overlay}
            </View>
          </View>
        </ScrollView>
      </View>

      <EmployeeStatsSheet visible={meOpen} onClose={() => setMeOpen(false)} userId={getSession()?.id} />

      <TourGuide
        visible={tourOpen}
        onClose={() => { setTourOpen(false); markTourSeen('Admin'); }}
        steps={tourSteps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  avatarTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },
  root:        { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },

  panelContent:{ padding: 24, paddingBottom: 40 },
  // Приветствие и имя — один размер: раньше было 15 и 24, и строка выглядела рваной.
  // Иерархию задают цвет и начертание, а не размер.
  panelGreeting:{ fontFamily: fonts.familyRegular, fontSize: 20, color: colors.textDim, marginBottom: 4 },
  panelGreetingName: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  panelSub:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginBottom: 0 },

  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  revenueCard: { marginBottom: 2 },
  stripe:      { position: 'absolute', left: 0, top: 24, bottom: 24, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.orange },
  revenueInner:{ paddingVertical: 24, paddingLeft: 28, paddingRight: 24, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  revenueLbl:  { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textDim, marginBottom: 8 },
  revenueVal:  { fontFamily: fonts.display, fontSize: 48, letterSpacing: -1, color: colors.text },
  statTile:    { minHeight: 132 },
  delta:       { fontFamily: fonts.familySemibold, fontSize: 14, marginTop: 8 },
  shareTxt:    { fontFamily: fonts.familyMedium, fontSize: 14, color: colors.textDim, marginTop: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  statVal:     { fontFamily: fonts.display, fontSize: 28, color: colors.text, letterSpacing: -0.4 },
  statLbl:     { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.textDim, marginBottom: 8 },

  shiftClip:   { overflow: 'hidden', borderRadius: glass.radius.tile },
  shiftRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 22, paddingLeft: 28, paddingRight: 22 },
  shiftStatVal:{ fontFamily: fonts.display, fontSize: 20, color: colors.text, marginBottom: 2 },
  shiftStatLbl:{ fontFamily: fonts.familyMedium, fontSize: 14, color: colors.textDim },
  shiftStatChevron: { fontSize: 24 },

  // Предупреждение о складе: плотная карточка с янтарной полоской слева, не красная заливка
  stockBanner:     { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderLeftWidth: 3, borderLeftColor: colors.warning, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18, marginBottom: 16 },
  stockBannerOpen: { backgroundColor: colors.surface2 },
  stockBannerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockBannerTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.warning },
  stockBannerChevron: { fontSize: 12, color: colors.textDim },
  stockBannerItem: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, marginTop: 6 },
  stockBannerLink: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orangeLight, marginTop: 10 },

  shiftSep:    { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  shiftCloseBtn: { backgroundColor: withOpacity(colors.red, 0.07), borderRadius: 14, borderWidth: 1, borderColor: withOpacity(colors.red, 0.3), padding: 16, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftCloseTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, marginBottom: 3 },
  shiftCloseSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  shiftOpenBtn: { backgroundColor: withOpacity(colors.green, 0.08), borderRadius: 14, borderWidth: 1, borderColor: withOpacity(colors.green, 0.3), padding: 16, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftOpenTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.green, marginBottom: 3 },
  shiftOpenSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  dockLbl:     { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textDim, marginRight: 12 },
  dockVal:     { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  listsRow:    { flexDirection: 'row', alignItems: 'flex-start' },
  listCard:    { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingVertical: 20, paddingHorizontal: 24 },
  listHead:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  listTitle:   { fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text },
  listSub:     { fontFamily: fonts.familyMedium, fontSize: 12, color: colors.muted, marginTop: 2 },
  listLink:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orangeLight },
  emptyTxt:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, paddingVertical: 16, lineHeight: 20 },
  saleRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  saleTime:    { width: 56, fontFamily: fonts.familyMedium, fontSize: 14, color: colors.muted },
  saleName:    { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  saleSub:     { fontFamily: fonts.familyMedium, fontSize: 12, color: colors.muted, marginTop: 2 },
  saleSum:     { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text, marginHorizontal: 16 },
  pill:        { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 3 },
  pillTxt:     { fontFamily: fonts.familyMedium, fontSize: 12, color: colors.textDim },
  barRow:      { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  barName:     { width: 104, fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  barTrack:    { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill:     { height: 4, borderRadius: 2, backgroundColor: colors.orange },
  barQty:      { width: 32, textAlign: 'right', fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  tourBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: withOpacity(colors.orange, 0.1), borderWidth: 1, borderColor: withOpacity(colors.orange, 0.4), alignItems: 'center', justifyContent: 'center' },
  tourBtnTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },
});
