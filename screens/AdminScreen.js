import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import ShiftBanner from '../components/ShiftBanner';
import {
  getOpenShift, getBusinessProfile, getTerms, pluralizeRu,
  getDashboardStats, getRecentOrders, getOrderItems,
  getAllStockItems, getExpenses, getRoleNames,
} from '../db/queries';
import { getBookings } from '../db/supabase';
import { getSession } from '../db/session';
import SalesPanel from '../components/panels/SalesPanel';
import ReportsPanel from '../components/panels/ReportsPanel';
import StockPanel from '../components/panels/StockPanel';
import ExpensesPanel from '../components/panels/ExpensesPanel';
import BookingsPanel from '../components/panels/BookingsPanel';
import SettingsFullPanel from '../components/panels/SettingsFullPanel';
import { colors, fonts, spacing } from '../constants/theme';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Доброе утро';
  if (h < 17) return 'Добрый день';
  return 'Добрый вечер';
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ─── Панели разделов ──────────────────────────────────────────────────────────

function DashPanel({ stats, name, navigation }) {
  const [stockOpen, setStockOpen] = useState(false);
  return (
    <ScrollView contentContainerStyle={styles.panelContent}>
      {stats.lowStockCount > 0 && (
        <Pressable
          style={[styles.stockBanner, stockOpen && styles.stockBannerOpen]}
          onPress={() => setStockOpen(v => !v)}
        >
          <View style={styles.stockBannerRow}>
            <Text style={styles.stockBannerTxt}>
              Мало на складе: {stats.lowStockCount} поз.
            </Text>
            <Text style={styles.stockBannerChevron}>{stockOpen ? '▲' : '▼'}</Text>
          </View>
          {stockOpen && (
            <Pressable onPress={() => navigation.navigate('Stock')}>
              {(stats.lowStockItems || []).map((it, i) => (
                <Text key={i} style={styles.stockBannerItem}>
                  · {it.name} — {it['остаток']} {it.unit}
                </Text>
              ))}
              <Text style={styles.stockBannerLink}>Перейти на склад →</Text>
            </Pressable>
          )}
        </Pressable>
      )}

      <Text style={styles.panelGreeting}>{getGreeting()}{name ? `, ${name}` : ''}</Text>
      <Text style={styles.panelSub}>Сводка за сегодня</Text>

      <View style={styles.statsGrid}>
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

      {stats.shift && (
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
      )}

      <Text style={styles.tapHint}>Выберите раздел слева для подробной информации</Text>
    </ScrollView>
  );
}

// SalesPanel — импортирован из components/panels/SalesPanel.js

// ReportsPanel импортирован из components/panels/ReportsPanel.js

// StockPanel импортирован из components/panels/StockPanel.js

// ExpensesPanel импортирован из components/panels/ExpensesPanel.js

// BookingsPanel импортирован из components/panels/BookingsPanel.js

// SettingsPanel импортирован из components/panels/SettingsPanel.js

// ─── Главный компонент ────────────────────────────────────────────────────────

import { useEffect } from 'react';

const SECTIONS = [
  { key: 'dash',     label: 'Обзор' },
  { key: 'Sales',    label: 'Продажи' },
  { key: 'Reports',  label: 'Отчётность' },
  { key: 'Stock',    label: 'Склад' },
  { key: 'Expenses', label: 'Расходы' },
  { key: 'Bookings', label: 'Записи' },
  { key: 'Settings', label: 'Настройки' },
];

export default function AdminScreen({ navigation }) {
  const [profile, setProfile]         = useState(null);
  const [terms, setTerms]             = useState({ order: 'Заказ', client: 'Клиент' });
  const [stats, setStats]             = useState({});
  const [hasShift, setHasShift]       = useState(false);
  const [modules, setModules]         = useState({});
  const [roleNames, setRoleNames]     = useState({ admin: 'Администратор' });
  const [bookingActive, setBookingActive] = useState(false);
  const [active, setActive]           = useState('dash');
  const animWidth = useState(new Animated.Value(220))[0];

  const setActiveAnimated = (key) => {
    setActive(key);
    Animated.spring(animWidth, {
      toValue: (key === 'Settings' || key === 'Reports' || key === 'Sales') ? 52 : 220,
      useNativeDriver: false,
      tension: 40,
      friction: 10,
    }).start();
  };

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

  const session = getSession();

  const renderRight = () => {
    switch(active) {
      case 'Sales':    return <SalesPanel />;
      case 'Reports':  return <ReportsPanel />;
      case 'Stock':    return <StockPanel />;
      case 'Expenses': return <ExpensesPanel />;
      case 'Bookings': return <BookingsPanel />;
      case 'Settings': return <SettingsFullPanel navigation={navigation} />;
      default:         return <DashPanel stats={stats} name={session?.name?.split(' ')[0]} navigation={navigation} />;
    }
  };

  return (
    <View style={styles.root}>
      <TopBar title={roleNames.admin || 'Администратор'} navigation={navigation} activeScreen="Admin" />
      {!hasShift && <ShiftBanner onOpen={() => navigation.navigate('Shift')} />}

      <View style={styles.layout}>
        {/* Левая панель */}
        <Animated.View style={[styles.leftPanel, { width: animWidth }]}>
          <View style={styles.bizHeader}>
            {(active !== 'Settings' && active !== 'Reports' && active !== 'Sales') && <Text style={styles.bizName} numberOfLines={1}>{profile?.business_name || 'Мой бизнес'}</Text>}
{(active !== 'Settings' && active !== 'Reports' && active !== 'Sales') && profile?.city ? <Text style={styles.bizCity}>{profile.city}</Text> : null}
          </View>

          {(active !== 'Settings' && active !== 'Reports' && active !== 'Sales') && (
            <Pressable style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
              onPress={() => navigation.navigate('Kassa')}>
              <Text style={styles.ctaLabel}>Новый {terms.order?.toLowerCase()}</Text>
              <Text style={styles.ctaSub}>Открыть кассу</Text>
            </Pressable>
          )}

          <View style={styles.divider} />

          <ScrollView showsVerticalScrollIndicator={false}>
            {SECTIONS.map(s => {
              const isActive = active === s.key;
              if (s.key === 'Bookings' && !bookingActive) return (
                <Pressable key={s.key}
                  style={[styles.menuItem, styles.menuItemInactive]}
                  onPress={() => setActiveAnimated(s.key)}>
                  <Text style={styles.menuLabelInactive}>{s.label}</Text>
                  <Text style={styles.menuSub}>Не подключено</Text>
                </Pressable>
              );
              return (
                <Pressable key={s.key}
                  style={({ pressed }) => [styles.menuItem, isActive && styles.menuItemActive, pressed && { backgroundColor: 'rgba(245,240,232,0.04)' }]}
                  onPress={() => setActiveAnimated(s.key)}>
                  {isActive && <View style={styles.activeBar} />}
                  {(active !== 'Settings' && active !== 'Reports' && active !== 'Sales')
                    ? <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>{s.label}</Text>
                    : <View style={[styles.menuDot, isActive && styles.menuDotActive]} />}
                </Pressable>
              );
            })}

            <View style={styles.divider} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, styles.logoutBtn, pressed && { opacity: 0.6 }]}
              onPress={() => navigation.navigate('Login')}>
              <Text style={styles.logoutIcon}>⎋</Text>
              {(active !== 'Settings' && active !== 'Reports' && active !== 'Sales') && (
                <Text style={styles.logoutLabel}>Сменить аккаунт</Text>
              )}
            </Pressable>
          </ScrollView>
        </Animated.View>

        {/* Правая панель */}
        <View style={styles.rightPanel}>
          {renderRight()}
        </View>
      </View>

      <BottomBar navigation={navigation} activeTab="Kassa" />
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.bg },
  layout:      { flex: 1, flexDirection: 'row' },

  leftPanel:   { borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden', maxWidth: 220 },
  bizHeader:   { padding: 18, paddingBottom: 10 },
  bizName:     { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  bizCity:     { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },

  ctaBtn:      { marginHorizontal: 12, marginBottom: 12, padding: 14, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center' },
  ctaLabel:    { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff', textTransform: 'capitalize' },
  ctaSub:      { fontFamily: fonts.familyRegular, fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  divider:     { height: 1, backgroundColor: colors.border, marginHorizontal: 12, marginVertical: 4 },

  menuItem:       { paddingVertical: 12, paddingHorizontal: 16, position: 'relative' },
  menuItemActive: { backgroundColor: 'rgba(245,240,232,0.06)' },
  menuItemInactive:{ paddingVertical: 12, paddingHorizontal: 16, opacity: 0.45 },
  activeBar:      { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  menuLabel:      { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  menuLabelActive:{ color: colors.text },
  menuLabelInactive:{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  menuSub:        { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, marginTop: 1 },
  menuDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border, marginVertical: 2 },
  logoutBtn:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  logoutIcon:     { fontSize: 18, color: colors.muted, width: 20, textAlign: 'center' },
  logoutLabel:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  menuDotActive:  { backgroundColor: colors.orange },

  rightPanel:  { flex: 1, backgroundColor: colors.bg },

  panelContent:{ padding: 24, paddingBottom: 40 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  panelTitle:  { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text },
  panelOpenBtn:{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  panelOpenTxt:{ fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },
  panelGreeting:{ fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 4 },
  panelSub:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 24 },
  panelHint:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 24, opacity: 0.6 },

  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard:    { flex: 1, minWidth: '44%', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  statVal:     { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 2 },
  statLbl:     { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },

  listCard:    { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  listRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  listRowDiv:  { borderBottomWidth: 1, borderBottomColor: colors.border },
  listTime:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, width: 40 },
  listName:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  listVal:     { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  listArrow:   { fontSize: 18, color: colors.muted },

  bigNum:      { fontFamily: fonts.family, fontSize: 48, fontWeight: '800', color: colors.text, marginBottom: 4 },
  emptyTxt:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 32 },
  tapHint:     { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 24, opacity: 0.6 },
  stockBanner:     { backgroundColor: 'rgba(217,95,95,0.06)', borderBottomWidth: 1, borderColor: 'rgba(217,95,95,0.25)', padding: 10, paddingHorizontal: 16, marginBottom: 16 },
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
});
