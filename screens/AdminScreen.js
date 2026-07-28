import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import StatsBar from '../components/StatsBar';
import ShiftBanner from '../components/ShiftBanner';
import {
  getOpenShift, getBusinessProfile, getTerms, pluralizeRu,
  getDashboardStats, getPayMethods,
} from '../db/queries';
import { getRoleNames } from '../db/queries';
import { getSession, getHomeRoute } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

const getMenuItems = (terms, bookingActive) => [
  {
    key: 'Sales',
    label: pluralizeRu(terms.order),
    sub: 'История продаж',
    hint: 'Все транзакции, возвраты и поиск по чекам',
  },
  {
    key: 'Reports',
    label: 'Отчётность',
    sub: 'P&L · графики',
    hint: 'Прибыль, расходы, динамика по дням',
  },
  {
    key: 'Stock',
    label: 'Склад',
    sub: 'Остатки · закупки',
    hint: 'Текущие остатки, пороги и движение товара',
  },
  {
    key: 'Expenses',
    label: 'Расходы',
    sub: 'Затраты за день',
    hint: 'Фиксируйте ежедневные траты бизнеса',
  },
  {
    key: bookingActive ? 'Bookings' : 'Settings',
    label: 'Записи',
    sub: bookingActive ? 'Онлайн бронирование' : 'Не подключено',
    hint: bookingActive
      ? 'Входящие заявки от клиентов через форму'
      : 'Подключите онлайн запись в Настройках',
    inactive: !bookingActive,
  },
  {
    key: 'Settings',
    label: 'Настройки',
    sub: 'Профиль · модули',
    hint: 'Бизнес, сотрудники, оплата, лояльность',
  },
];

export default function AdminScreen({ navigation }) {
  const [profile, setProfile]         = useState(null);
  const [terms, setTerms]             = useState({ order: 'Заказ', client: 'Клиент', item: 'Товар', category: 'Категория' });
  const [stats, setStats]             = useState({});
  const [hasShift, setHasShift]       = useState(false);
  const [modules, setModules]         = useState({});
  const [roleNames, setRoleNames]     = useState({ admin: 'Администратор', barista: 'Сотрудник' });
  const [bookingActive, setBookingActive] = useState(false);

  const loadStats = useCallback(() => {
    try {
      const p = getBusinessProfile();
      setProfile(p);
      setModules(p?.modules || {});
      setBookingActive(!!(p?.booking_slug));
      setHasShift(!!getOpenShift());
      setTerms(getTerms());
      setRoleNames(getRoleNames());
      setStats(getDashboardStats());
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  const menuItems = getMenuItems(terms, bookingActive);

  const handleSelect = (item) => {
    navigation.navigate(item.key);
  };

  const session = getSession();
  const isAdmin = session?.role === 'admin';

  return (
    <View style={styles.root}>
      <TopBar title={roleNames.admin || 'Администратор'} navigation={navigation} activeScreen="Admin" />
      {!hasShift && <ShiftBanner onOpen={() => navigation.navigate('Shift')} />}
      <StatsBar
        stats={stats}
        modules={modules}
        onShiftPress={() => navigation.navigate('ShiftClose')}
        onStockPress={() => navigation.navigate('Stock')}
      />

      <View style={styles.layout}>

        {/* ── Левая панель ── */}
        <View style={styles.leftPanel}>
          {/* Название бизнеса */}
          <View style={styles.bizHeader}>
            <Text style={styles.bizName} numberOfLines={1}>
              {profile?.business_name || 'Мой бизнес'}
            </Text>
            {profile?.city ? (
              <Text style={styles.bizCity}>{profile.city}</Text>
            ) : null}
          </View>

          {/* Новый заказ — главное CTA */}
          <Pressable
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
            onPress={() => navigation.navigate('Kassa')}
          >
            <Text style={styles.ctaLabel}>Новый {terms.order?.toLowerCase()}</Text>
            <Text style={styles.ctaSub}>Открыть кассу</Text>
          </Pressable>

          {/* Разделитель */}
          <View style={styles.divider} />

          {/* Меню */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {menuItems.map((item) => {
              const isActive = false;
              return (
                <Pressable
                  key={item.key + item.label}
                  style={({ pressed }) => [
                    styles.menuItem,
                    isActive && styles.menuItemActive,
                    pressed && { backgroundColor: 'rgba(245,240,232,0.04)' },
                    item.inactive && { opacity: 0.45 },
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  {isActive && <View style={styles.activeBar} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                      {item.label}
                    </Text>
                    <Text style={styles.menuSub}>{item.sub}</Text>
                  </View>
                  <Text style={[styles.menuArrow, isActive && styles.menuArrowActive]}>›</Text>
                </Pressable>
              );
            })}

            <View style={styles.divider} />

            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.6 }]}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={[styles.menuLabel, { color: colors.muted, fontSize: 13 }]}>
                Сменить аккаунт
              </Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* ── Правая панель ── */}
        <View style={styles.rightPanel}>
          <View style={styles.dashWrap}>
            <Text style={styles.dashGreeting}>
              {getGreeting()}, {getSession()?.name?.split(' ')[0] || 'добро пожаловать'}
            </Text>
            <Text style={styles.dashSub}>Сводка за сегодня</Text>

            <View style={styles.statsGrid}>
              {[
                { label: 'Выручка', value: `${stats.revenueToday || 0} ₽` },
                { label: 'Заказов', value: stats.ordersToday || 0 },
                { label: 'Средний чек', value: `${stats.avgCheck || 0} ₽` },
                { label: 'Прибыль', value: `${stats.profit || 0} ₽`, color: (stats.profit || 0) >= 0 ? colors.green : colors.red },
              ].map((s, i) => (
                <View key={i} style={styles.statCard}>
                  <Text style={[styles.statVal, s.color ? { color: s.color } : {}]}>{s.value}</Text>
                  <Text style={styles.statLbl}>{s.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.tapHint}>Нажмите на раздел слева для перехода</Text>
          </View>
        </View>
      </View>

      <BottomBar navigation={navigation} activeTab="Kassa" />
    </View>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Доброе утро';
  if (h < 17) return 'Добрый день';
  return 'Добрый вечер';
}

function SectionPreview({ item, stats }) {
  const previews = {
    Sales:    [{ label: 'Заказов сегодня', value: stats.ordersToday || 0 }, { label: 'Выручка', value: `${stats.revenueToday || 0} ₽` }],
    Reports:  [{ label: 'Прибыль за период', value: `${stats.profit || 0} ₽` }, { label: 'Расходы', value: `${stats.expenses || 0} ₽` }],
    Stock:    [{ label: 'Позиций на складе', value: stats.stockItems || 0 }, { label: 'Мало на складе', value: stats.stockLow || 0 }],
    Expenses: [{ label: 'Расходы сегодня', value: `${stats.expensesToday || 0} ₽` }, { label: 'За месяц', value: `${stats.expensesMonth || 0} ₽` }],
    Bookings: [{ label: 'Новых записей', value: stats.bookingsPending || 0 }, { label: 'На сегодня', value: stats.bookingsToday || 0 }],
    Settings: [{ label: 'Версия', value: '1.0' }, { label: 'Модулей включено', value: Object.values(stats.modules || {}).filter(Boolean).length || '—' }],
  };

  const rows = previews[item.key] || [];
  return (
    <View style={{ gap: 12, marginVertical: 16 }}>
      {rows.map((r, i) => (
        <View key={i} style={styles.previewRow}>
          <Text style={styles.previewRowLbl}>{r.label}</Text>
          <Text style={styles.previewRowVal}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.bg },
  layout:     { flex: 1, flexDirection: 'row' },

  // Левая панель
  leftPanel:  { width: 260, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  bizHeader:  { padding: 20, paddingBottom: 12 },
  bizName:    { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },
  bizCity:    { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },

  ctaBtn:     { marginHorizontal: 12, marginBottom: 16, padding: 16, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  ctaLabel:   { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: '#fff', textTransform: 'capitalize' },
  ctaSub:     { fontFamily: fonts.familyRegular, fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  divider:    { height: 1, backgroundColor: colors.border, marginHorizontal: 12, marginVertical: 4 },

  menuItem:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, position: 'relative' },
  menuItemActive: { backgroundColor: 'rgba(245,240,232,0.06)' },
  activeBar:  { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  menuLabel:  { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.textDim },
  menuLabelActive: { color: colors.text },
  menuSub:    { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  menuArrow:  { fontSize: 18, color: colors.muted },
  menuArrowActive: { color: colors.text },

  // Правая панель
  rightPanel: { flex: 1, backgroundColor: colors.bg },
  dashWrap:   { flex: 1, padding: 32, justifyContent: 'center' },
  dashGreeting: { fontFamily: fonts.family, fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6 },
  dashSub:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginBottom: 32 },

  statsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 },
  statCard:   { flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20 },
  statVal:    { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 6 },
  statLbl:    { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },

  previewWrap:    { flex: 1, padding: 32 },
  previewTitle:   { fontFamily: fonts.family, fontSize: 30, fontWeight: '800', color: colors.text, marginBottom: 8 },
  previewHint:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, lineHeight: 21 },
  previewRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  previewRowLbl:  { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted },
  previewRowVal:  { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text },

  openBtn:    { marginTop: 24, paddingVertical: 16, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  openBtnTxt: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: '#fff' },

  tapHint:    { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 16, opacity: 0.6 },
});
