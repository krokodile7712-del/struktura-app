import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import NextStepsCard from '../components/NextStepsCard';
import ShiftBanner from '../components/ShiftBanner';
import TourGuide from '../components/TourGuide';
import { useTourHighlight, useTourActiveKey } from '../components/TourRegistry';
import {
  getOpenShift, getBusinessProfile, getDashboardStats, getRoleNames, markTourSeen,
} from '../db/queries';
import { getSession } from '../db/session';
import { colors, fonts } from '../constants/theme';

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
  const [stockOpen, setStockOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const shiftBannerHighlight = useTourHighlight('admin.shiftBanner');
  const stockBannerHighlight = useTourHighlight('admin.stockBanner');
  const nextStepsHighlight = useTourHighlight('admin.nextSteps');
  const statsGridHighlight = useTourHighlight('admin.statsGrid');
  const shiftActionHighlight = useTourHighlight('admin.shiftAction');
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
      setHasShift(!!getOpenShift());
      setRoleNames(getRoleNames());
      setStats(getDashboardStats());
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
    ...(!hasShift ? [{ key: 'admin.shiftBanner', title: 'Смена не открыта', text: 'Напоминание сверху экрана — нажмите, чтобы открыть смену и начать учёт продаж за сегодня.' }] : []),
    { key: 'admin.stockBanner', title: 'Мало на складе', text: 'Появляется, когда на складе заканчивается что-то важное. Нажмите, чтобы развернуть список и перейти на склад.' },
    { key: 'admin.nextSteps', title: 'Что дальше', text: 'Чек-лист первоначальной настройки — добавить товары, способы оплаты, сотрудников и так далее. Можно скрыть крестиком, когда не нужен.' },
    { key: 'admin.statsGrid', title: 'Сводка за сегодня', text: 'Выручка, количество заказов, средний чек и разбивка по способам оплаты — всё за текущий день.' },
    { key: 'admin.shiftAction', title: 'Смена', text: 'Здесь же — открыть смену, если она ещё не начата, или закрыть, когда рабочий день закончен.' },
  ];

  // Автопрокрутка к активному шагу тура — карточка тура закреплена внизу
  // экрана и может полностью закрыть собой то, что не поднято в видимую
  // область (особенно последние шаги — статистика, блок смены)
  useEffect(() => {
    if (!activeTourKey) return;
    const y = sectionY.current[activeTourKey];
    if (y == null) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 70), animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [activeTourKey]);

  return (
    <View style={styles.root}>
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
      {!hasShift && (
        <View style={shiftBannerHighlight.style}>
          <ShiftBanner onOpen={() => navigation.navigate('Shift')} />
        </View>
      )}

      <View style={{ flex: 1 }}>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.panelContent} style={{ flex: 1 }}>
          {(stats.lowStockCount > 0 || tourOpen) && (() => {
            const isDemo = !(stats.lowStockCount > 0);
            const demoCount = isDemo ? 2 : stats.lowStockCount;
            const demoItems = isDemo ? [{ name: 'Стаканы 250мл', 'остаток': 8, unit: 'шт' }, { name: 'Молоко', 'остаток': 1, unit: 'л' }] : (stats.lowStockItems || []);
            return (
            <View style={stockBannerHighlight.style} onLayout={rememberY('admin.stockBanner')}>
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
            </View>
            );
          })()}

          <Text style={styles.panelGreeting}>{getGreeting()}{sessionName ? `, ${sessionName}` : ''}</Text>
          <Text style={styles.panelSub}>{profile?.business_name || 'Сводка за сегодня'}</Text>

          <View style={nextStepsHighlight.style} onLayout={rememberY('admin.nextSteps')}>
            <NextStepsCard navigation={navigation} forceVisible={tourOpen} />
          </View>

          <View style={[styles.statsGrid, statsGridHighlight.style]} onLayout={rememberY('admin.statsGrid')}>
            {[
              { label: 'Выручка', value: `${(stats.todayTotal || 0).toLocaleString('ru-RU')} ₽` },
              { label: 'Заказов', value: stats.todayOrders || 0 },
              { label: 'Средний чек', value: `${stats.todayOrders > 0 ? Math.round((stats.todayTotal||0) / stats.todayOrders).toLocaleString('ru-RU') : 0} ₽` },
              { label: 'Наличные', value: `${(stats.todayCash || 0).toLocaleString('ru-RU')} ₽` },
              { label: 'Карта', value: `${(stats.todayCard || 0).toLocaleString('ru-RU')} ₽` },
              { label: 'Смена открыта', value: stats.shiftDuration || '—' },
            ].map((s, i) => (
              <View key={i} style={styles.statCard}>
                <Text style={styles.statVal}>{s.value}</Text>
                <Text style={styles.statLbl}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={shiftActionHighlight.style} onLayout={rememberY('admin.shiftAction')}>
          {stats.shift ? (
            <>
            <View style={styles.shiftSep} />
            <Pressable
              style={({ pressed }) => [styles.shiftCloseBtn, pressed && { opacity: 0.85 }]}
              onPress={() => navigation.navigate('ShiftClose')}
            >
              <View>
                <Text style={styles.shiftCloseTxt}>Закрыть смену</Text>
                <Text style={styles.shiftCloseSub}>Открыта {stats.shiftDuration || ''} · {(stats.todayTotal||0).toLocaleString('ru-RU')} ₽</Text>
              </View>
              <Text style={{ fontSize: 18, color: colors.muted }}>›</Text>
            </Pressable>
            </>
          ) : (
            <>
            <View style={styles.shiftSep} />
            <Pressable
              style={({ pressed }) => [styles.shiftOpenBtn, pressed && { opacity: 0.85 }]}
              onPress={() => navigation.navigate('Shift')}
            >
              <View>
                <Text style={styles.shiftOpenTxt}>Открыть смену</Text>
                <Text style={styles.shiftOpenSub}>Начните учёт продаж и расходов за сегодня</Text>
              </View>
              <Text style={{ fontSize: 18, color: colors.green }}>›</Text>
            </Pressable>
            </>
          )}
          </View>
        </ScrollView>
      </View>

      <TourGuide
        visible={tourOpen}
        onClose={() => { setTourOpen(false); markTourSeen('Admin'); }}
        steps={tourSteps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.bg },

  panelContent:{ padding: 24, paddingBottom: 40 },
  panelGreeting:{ fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 4 },
  panelSub:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 24 },

  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard:    { flex: 1, minWidth: '44%', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  statVal:     { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 2 },
  statLbl:     { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },

  stockBanner:     { backgroundColor: 'rgba(217,95,95,0.06)', borderWidth: 1, borderColor: 'rgba(217,95,95,0.25)', borderRadius: 12, padding: 10, paddingHorizontal: 16, marginBottom: 16 },
  stockBannerOpen: { backgroundColor: 'rgba(217,95,95,0.09)' },
  stockBannerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockBannerTxt:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.red },
  stockBannerChevron: { fontSize: 10, color: colors.red, opacity: 0.7 },
  stockBannerItem: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.red, opacity: 0.8, marginTop: 4 },
  stockBannerLink: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.red, marginTop: 8, textDecorationLine: 'underline' },

  shiftSep:    { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  shiftCloseBtn: { backgroundColor: 'rgba(217,95,95,0.07)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(217,95,95,0.3)', padding: 16, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftCloseTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, marginBottom: 3 },
  shiftCloseSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  shiftOpenBtn: { backgroundColor: 'rgba(123,175,142,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(123,175,142,0.3)', padding: 16, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftOpenTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.green, marginBottom: 3 },
  shiftOpenSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  tourBtn:  { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tourBtnTxt: { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: colors.muted },
});
