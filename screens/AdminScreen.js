import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import NextStepsCard from '../components/NextStepsCard';
import EmployeeStatsSheet from '../components/EmployeeStatsSheet';
import TourGuide from '../components/TourGuide';
import { useTourHighlight, useTourActiveKey } from '../components/TourRegistry';
import GlassSurface from '../components/GlassSurface';
import ScreenGlow from '../components/ScreenGlow';
import {
  getOpenShift, getBusinessProfile, getDashboardStats, getRoleNames, markTourSeen,
} from '../db/queries';
import { getSession } from '../db/session';
import { colors, fonts, withOpacity, glass } from '../constants/theme';

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
  const stockBannerHighlight = useTourHighlight('admin.stockBanner');
  const nextStepsHighlight = useTourHighlight('admin.nextSteps', 18);
  const statsGridHighlight = useTourHighlight('admin.statsGrid');
  const shiftActionHighlight = useTourHighlight('admin.statsGrid.shiftAction', 14);
  // По одной подсветке на каждую карточку сводки — без них на шаге «Смена»
  // соседние карточки оставались обычными (не гасли), раз само затемнение
  // сетки целиком отключилось, когда «Смена» стала дочерним шагом «Сводки»
  const revenueHighlight  = useTourHighlight('admin.statsGrid.revenue', 14);
  const ordersHighlight   = useTourHighlight('admin.statsGrid.orders', 14);
  const avgCheckHighlight = useTourHighlight('admin.statsGrid.avgCheck', 14);
  const cashHighlight     = useTourHighlight('admin.statsGrid.cash', 14);
  const cardHighlight     = useTourHighlight('admin.statsGrid.card', 14);
  const statCardHighlights = [revenueHighlight, ordersHighlight, avgCheckHighlight, cashHighlight, cardHighlight];
  const activeTourKey = useTourActiveKey();
  const scrollRef = useRef(null);
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

  return (
    <View style={styles.root}>
      <ScreenGlow />
      <TopBar
        title={roleNames.admin || 'Администратор'}
        navigation={navigation}
        activeScreen="Admin"
        rightElement={
          <Pressable onPress={() => setTourOpen(true)} hitSlop={10} style={styles.tourBtn}>
            <Text style={styles.tourBtnTxt}>?</Text>
          </Pressable>
        }
      />

      <View style={{ flex: 1 }}>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.panelContent} style={{ flex: 1 }}>
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable style={styles.avatar} onPress={() => setMeOpen(true)} hitSlop={8}>
              <Text style={styles.avatarTxt}>{(sessionName || '?').charAt(0).toUpperCase()}</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelGreeting}>{getGreeting()}{sessionName ? <Text style={styles.panelGreetingName}>{`, ${sessionName}`}</Text> : ''}</Text>
              <Text style={styles.panelSub}>{profile?.business_name || 'Сводка за сегодня'}</Text>
            </View>
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
                  <Text style={styles.revenueLbl}>Выручка сегодня</Text>
                  <Text style={styles.revenueVal}>{(stats.todayTotal || 0).toLocaleString('ru-RU')} ₽</Text>
                </View>
              </GlassSurface>
              {statCardHighlights[0].overlay}
            </View>

            {[
              { label: 'Заказов', value: stats.todayOrders || 0 },
              { label: 'Средний чек', value: `${stats.todayOrders > 0 ? Math.round((stats.todayTotal||0) / stats.todayOrders).toLocaleString('ru-RU') : 0} ₽` },
              { label: 'Наличные', value: `${(stats.todayCash || 0).toLocaleString('ru-RU')} ₽` },
              { label: 'Карта', value: `${(stats.todayCard || 0).toLocaleString('ru-RU')} ₽` },
            ].map((s, i) => (
              <View key={i} style={[{ flex: 1, minWidth: '44%', position: 'relative' }, statCardHighlights[i + 1].style]}>
                <GlassSurface radius={glass.radius.tile} padding={20} style={styles.statTile}>
                  <Text style={styles.statLbl}>{s.label}</Text>
                  <Text style={styles.statVal}>{s.value}</Text>
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
  panelSub:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginBottom: 24 },

  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  revenueCard: { marginBottom: 2 },
  stripe:      { position: 'absolute', left: 0, top: 24, bottom: 24, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.orange },
  revenueInner:{ paddingVertical: 24, paddingLeft: 28, paddingRight: 24 },
  revenueLbl:  { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textDim, marginBottom: 8 },
  revenueVal:  { fontFamily: fonts.display, fontSize: 48, letterSpacing: -1, color: colors.text },
  statTile:    { minHeight: 100 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  statVal:     { fontFamily: fonts.display, fontSize: 28, color: colors.text, letterSpacing: -0.4 },
  statLbl:     { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.textDim, marginBottom: 8 },

  shiftClip:   { overflow: 'hidden', borderRadius: glass.radius.tile },
  shiftRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 22, paddingLeft: 28, paddingRight: 22 },
  shiftStatVal:{ fontFamily: fonts.display, fontSize: 20, color: colors.text, marginBottom: 2 },
  shiftStatLbl:{ fontFamily: fonts.familyMedium, fontSize: 14, color: colors.textDim },
  shiftStatChevron: { fontSize: 24 },

  stockBanner:     { backgroundColor: withOpacity(colors.red, 0.06), borderWidth: 1, borderColor: withOpacity(colors.red, 0.25), borderRadius: 12, padding: 10, paddingHorizontal: 16, marginBottom: 16 },
  stockBannerOpen: { backgroundColor: withOpacity(colors.red, 0.09) },
  stockBannerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockBannerTxt:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.red },
  stockBannerChevron: { fontSize: 12, color: colors.red, opacity: 0.7 },
  stockBannerItem: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.red, opacity: 0.8, marginTop: 4 },
  stockBannerLink: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.red, marginTop: 8, textDecorationLine: 'underline' },

  shiftSep:    { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  shiftCloseBtn: { backgroundColor: withOpacity(colors.red, 0.07), borderRadius: 14, borderWidth: 1, borderColor: withOpacity(colors.red, 0.3), padding: 16, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftCloseTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, marginBottom: 3 },
  shiftCloseSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  shiftOpenBtn: { backgroundColor: withOpacity(colors.green, 0.08), borderRadius: 14, borderWidth: 1, borderColor: withOpacity(colors.green, 0.3), padding: 16, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftOpenTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.green, marginBottom: 3 },
  shiftOpenSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  tourBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: withOpacity(colors.orange, 0.1), borderWidth: 1, borderColor: withOpacity(colors.orange, 0.4), alignItems: 'center', justifyContent: 'center' },
  tourBtnTxt: { fontFamily: fonts.family, fontSize: 18, color: colors.orange },
});
