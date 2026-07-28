import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import StatsBar from '../components/StatsBar';
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

function DashPanel({ stats, name }) {
  return (
    <ScrollView contentContainerStyle={styles.panelContent}>
      <Text style={styles.panelGreeting}>{getGreeting()}{name ? `, ${name}` : ''}</Text>
      <Text style={styles.panelSub}>Сводка за сегодня</Text>
      <View style={styles.statsGrid}>
        {[
          { label: 'Выручка', value: `${stats.revenueToday || 0} ₽` },
          { label: 'Заказов', value: stats.ordersToday || 0 },
          { label: 'Средний чек', value: `${stats.avgCheck || 0} ₽` },
          { label: 'Прибыль', value: `${stats.profit || 0} ₽`, hi: (stats.profit||0) >= 0 },
        ].map((s, i) => (
          <View key={i} style={styles.statCard}>
            <Text style={[styles.statVal, s.hi !== undefined && { color: s.hi ? colors.green : colors.red }]}>{s.value}</Text>
            <Text style={styles.statLbl}>{s.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.panelHint}>Выберите раздел слева для подробной информации</Text>
    </ScrollView>
  );
}

// SalesPanel — импортирован из components/panels/SalesPanel.js

// ReportsPanel импортирован из components/panels/ReportsPanel.js

function StockPanel() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    try { setItems(getAllStockItems().sort((a,b) => (a['остаток']||0) - (b['остаток']||0))); } catch(_) {}
  }, []);
  return (
    <ScrollView contentContainerStyle={styles.panelContent}>
      <Text style={styles.panelTitle}>Склад</Text>
      {items.length === 0 ? <Text style={styles.emptyTxt}>Склад пуст</Text> : (
        <View style={styles.listCard}>
          {items.map((it, idx) => {
            const low = it.threshold && (it['остаток']||0) <= it.threshold;
            return (
              <View key={it.id} style={[styles.listRow, idx < items.length-1 && styles.listRowDiv]}>
                <Text style={[styles.listName, { flex: 1 }]} numberOfLines={1}>{it.name}</Text>
                <Text style={[styles.listVal, low && { color: colors.red }]}>
                  {it['остаток'] || 0} {it.unit}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function ExpensesPanel() {
  const [items, setItems] = useState([]);
  const today = new Date().toISOString().slice(0,10);
  useEffect(() => {
    try { setItems(getExpenses(today, today) || []); } catch(_) {}
  }, []);
  const total = items.reduce((s,e) => s + (e.amount||0), 0);
  return (
    <ScrollView contentContainerStyle={styles.panelContent}>
      <Text style={styles.panelTitle}>Расходы</Text>
      <Text style={styles.bigNum}>{total} ₽</Text>
      <Text style={styles.panelSub}>за сегодня</Text>
      {items.length > 0 && (
        <View style={[styles.listCard, { marginTop: 16 }]}>
          {items.map((e, idx) => (
            <View key={e.id} style={[styles.listRow, idx < items.length-1 && styles.listRowDiv]}>
              <Text style={[styles.listName, { flex: 1 }]} numberOfLines={1}>{e.name || e.category}</Text>
              <Text style={styles.listVal}>{e.amount} ₽</Text>
            </View>
          ))}
        </View>
      )}
      {items.length === 0 && <Text style={styles.emptyTxt}>Расходов за сегодня нет</Text>}
    </ScrollView>
  );
}

function BookingsPanel({ navigation, bookingActive }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!bookingActive) return;
    setLoading(true);
    const profile = getBusinessProfile();
    getBookings(null, null, profile?.booking_slug)
      .then(d => setBookings((d||[]).filter(b => b.status === 'pending').slice(0,10)))
      .catch(()=>{})
      .finally(() => setLoading(false));
  }, [bookingActive]);

  if (!bookingActive) return (
    <View style={styles.panelContent}>
      <Text style={styles.panelTitle}>Записи</Text>
      <Text style={styles.emptyTxt}>Онлайн запись не подключена</Text>
      <Pressable style={styles.panelOpenBtn} onPress={() => navigation.navigate('Settings')}>
        <Text style={styles.panelOpenTxt}>Подключить в Настройках →</Text>
      </Pressable>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.panelContent}>
      <Text style={styles.panelTitle}>Записи</Text>
      {loading ? <ActivityIndicator color={colors.orange} /> :
       bookings.length === 0 ? <Text style={styles.emptyTxt}>Новых записей нет</Text> : (
        <View style={styles.listCard}>
          {bookings.map((b, idx) => (
            <View key={b.id} style={[styles.listRow, idx < bookings.length-1 && styles.listRowDiv]}>
              <Text style={styles.listTime}>{b.time_start?.slice(0,5) || '—'}</Text>
              <Text style={[styles.listName, { flex: 1 }]} numberOfLines={1}>{b.client_name}</Text>
              <Text style={[styles.listVal, { color: colors.amber }]}>Новая</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function SettingsPanel() {
  const profile = getBusinessProfile();
  const rows = [
    { label: 'Название', value: profile?.business_name || '—' },
    { label: 'Город', value: profile?.city || '—' },
    { label: 'Телефон', value: profile?.phone || '—' },
    { label: 'Адрес', value: profile?.address || '—' },
    { label: 'ИНН', value: profile?.inn || '—' },
    { label: 'Часы работы', value: profile?.work_hours_from ? `${profile.work_hours_from} — ${profile.work_hours_to}` : '—' },
  ];
  return (
    <ScrollView contentContainerStyle={styles.panelContent}>
      <Text style={styles.panelTitle}>Настройки</Text>
      <Text style={styles.panelSub}>Профиль бизнеса</Text>
      <View style={styles.listCard}>
        {rows.map((r, i) => (
          <View key={r.label} style={[styles.listRow, i < rows.length-1 && styles.listRowDiv]}>
            <Text style={[styles.listName, { color: colors.muted, width: 120 }]}>{r.label}</Text>
            <Text style={[styles.listName, { flex: 1 }]} numberOfLines={1}>{r.value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

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
      case 'Bookings': return <BookingsPanel navigation={navigation} bookingActive={bookingActive} />;
      case 'Settings': return <SettingsPanel />;
      default:         return <DashPanel stats={stats} name={session?.name?.split(' ')[0]} />;
    }
  };

  return (
    <View style={styles.root}>
      <TopBar title={roleNames.admin || 'Администратор'} navigation={navigation} activeScreen="Admin" />
      {!hasShift && <ShiftBanner onOpen={() => navigation.navigate('Shift')} />}
      <StatsBar stats={stats} modules={modules}
        onShiftPress={() => navigation.navigate('ShiftClose')}
        onStockPress={() => navigation.navigate('Stock')} />

      <View style={styles.layout}>
        {/* Левая панель */}
        <View style={styles.leftPanel}>
          <View style={styles.bizHeader}>
            <Text style={styles.bizName} numberOfLines={1}>{profile?.business_name || 'Мой бизнес'}</Text>
            {profile?.city ? <Text style={styles.bizCity}>{profile.city}</Text> : null}
          </View>

          <Pressable style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
            onPress={() => navigation.navigate('Kassa')}>
            <Text style={styles.ctaLabel}>Новый {terms.order?.toLowerCase()}</Text>
            <Text style={styles.ctaSub}>Открыть кассу</Text>
          </Pressable>

          <View style={styles.divider} />

          <ScrollView showsVerticalScrollIndicator={false}>
            {SECTIONS.map(s => {
              const isActive = active === s.key;
              if (s.key === 'Bookings' && !bookingActive) return (
                <Pressable key={s.key}
                  style={[styles.menuItem, styles.menuItemInactive]}
                  onPress={() => setActive(s.key)}>
                  <Text style={styles.menuLabelInactive}>{s.label}</Text>
                  <Text style={styles.menuSub}>Не подключено</Text>
                </Pressable>
              );
              return (
                <Pressable key={s.key}
                  style={({ pressed }) => [styles.menuItem, isActive && styles.menuItemActive, pressed && { backgroundColor: 'rgba(245,240,232,0.04)' }]}
                  onPress={() => setActive(s.key)}>
                  {isActive && <View style={styles.activeBar} />}
                  <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>{s.label}</Text>
                </Pressable>
              );
            })}

            <View style={styles.divider} />
            <Pressable style={styles.menuItem} onPress={() => navigation.navigate('Login')}>
              <Text style={[styles.menuLabel, { color: colors.muted, fontSize: 13 }]}>Сменить аккаунт</Text>
            </Pressable>
          </ScrollView>
        </View>

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

  leftPanel:   { width: 220, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
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

  rightPanel:  { flex: 1, backgroundColor: colors.bg },

  panelContent:{ padding: 24, paddingBottom: 40 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  panelTitle:  { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text },
  panelOpenBtn:{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  panelOpenTxt:{ fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },
  panelGreeting:{ fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 4 },
  panelSub:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 24 },
  panelHint:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 24, opacity: 0.6 },

  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard:    { flex: 1, minWidth: '44%', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 18 },
  statVal:     { fontFamily: fonts.family, fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4 },
  statLbl:     { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },

  listCard:    { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  listRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  listRowDiv:  { borderBottomWidth: 1, borderBottomColor: colors.border },
  listTime:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, width: 40 },
  listName:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  listVal:     { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  listArrow:   { fontSize: 18, color: colors.muted },

  bigNum:      { fontFamily: fonts.family, fontSize: 48, fontWeight: '800', color: colors.text, marginBottom: 4 },
  emptyTxt:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 32 },
});
