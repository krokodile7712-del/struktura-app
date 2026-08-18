import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import AppNav from '../components/AppNav';
import ShiftBanner from '../components/ShiftBanner';
import { useResponsive } from '../hooks/useResponsive';
import {
  getOpenShift, getBusinessProfile, getDashboardStats, getRoleNames,
} from '../db/queries';
import { getSession, can } from '../db/session';
import { colors, fonts } from '../constants/theme';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Доброе утро';
  if (h < 17) return 'Добрый день';
  return 'Добрый вечер';
}
function fmt(n) { return (n || 0).toLocaleString('ru-RU'); }

// Список разделов сотрудника — только то, на что есть права.
const SECTIONS = [
  { key: 'Sales',       label: 'Продажи', route: 'Sales',    perm: 'view_order_history' },
  { key: 'ClientsList', label: 'Клиенты', route: 'ClientsList', perm: 'view_clients' },
  { key: 'Expenses',    label: 'Расходы', route: 'Expenses', perm: 'add_expenses' },
  { key: 'Stock',       label: 'Склад',   route: 'Products', params: { initialTab: 'stock' }, perm: 'view_stock' },
];

// Этап 2 разворота на адаптивность: Dashboard — тоже просто "Обзор"
// сотрудника + хост навигации. В альбомной ориентации рядом появляется
// широкая боковая панель с доступными сотруднику разделами.
export default function DashboardScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const [profile, setProfile]         = useState(null);
  const [stats, setStats]             = useState({});
  const [hasShift, setHasShift]       = useState(false);
  const [roleNames, setRoleNames]     = useState({ barista: 'Сотрудник' });
  const [sessionName, setSessionName] = useState('');

  const load = useCallback(() => {
    try {
      const p = getBusinessProfile();
      setProfile(p);
      setRoleNames(getRoleNames());
      setStats(getDashboardStats());
      setHasShift(!!getOpenShift());
      const sess = getSession();
      setSessionName(sess?.name?.split(' ')[0] || '');
    } catch(e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const availableSections = SECTIONS.filter(s => can(s.perm));

  const overviewContent = (
      <ScrollView contentContainerStyle={styles.dashContent}>
        <Text style={styles.greeting}>{getGreeting()}{sessionName ? `, ${sessionName}` : ''}</Text>
        <Text style={styles.greetingSub}>{profile?.business_name || 'Сводка текущей смены'}</Text>

        <View style={styles.statsGrid}>
          {[
            { label: 'Выручка',     value: `${fmt(stats.todayTotal)} ₽` },
            { label: 'Заказов',     value: stats.todayOrders || 0 },
            { label: 'Средний чек', value: `${stats.todayOrders > 0 ? fmt(Math.round((stats.todayTotal||0) / stats.todayOrders)) : 0} ₽` },
            { label: 'Наличные',    value: `${fmt(stats.todayCash)} ₽` },
          ].map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Text style={styles.statVal}>{s.value}</Text>
              <Text style={styles.statLbl}>{s.label}</Text>
            </View>
          ))}
        </View>

        {stats.shift && (
          <>
            <View style={styles.shiftDivider} />
            <Pressable
              style={({ pressed }) => [styles.shiftCloseBtn, pressed && { opacity: 0.85 }]}
              onPress={() => navigation.navigate('ShiftClose')}
            >
              <View>
                <Text style={styles.shiftCloseTxt}>Закрыть смену</Text>
                <Text style={styles.shiftCloseSub}>Открыта {stats.shiftDuration || ''} · {fmt(stats.todayTotal)} ₽</Text>
              </View>
              <Text style={{ fontSize: 18, color: colors.red }}>›</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
  );

  return (
    <View style={styles.root}>
      <TopBar title={roleNames.barista || 'Сотрудник'} navigation={navigation} activeScreen="Dashboard" />
      {!hasShift && <ShiftBanner onOpen={() => navigation.navigate('Shift')} />}

      <View style={[{ flex: 1 }, isLandscape && { flexDirection: 'row' }]}>
        {isLandscape && (
          <View style={styles.leftPanel}>
            <View style={styles.bizHeader}>
              <Text style={styles.bizName} numberOfLines={1}>{profile?.business_name || 'Мой бизнес'}</Text>
            </View>

            <Pressable style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
              onPress={() => navigation.navigate('Kassa')}>
              <Text style={styles.ctaLabel}>Новый заказ</Text>
              <Text style={styles.ctaSub}>Открыть кассу</Text>
            </Pressable>

            <View style={styles.divider} />

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.menuItem, styles.menuItemActive]}>
                <View style={styles.activeBar} />
                <Text style={[styles.menuLabel, styles.menuLabelActive]}>Обзор</Text>
              </View>

              {availableSections.map(s => (
                <Pressable key={s.key}
                  style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: 'rgba(245,240,232,0.04)' }]}
                  onPress={() => navigation.navigate(s.route, s.params)}>
                  <Text style={styles.menuLabel}>{s.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ flex: 1 }}>
          {overviewContent}
        </View>
      </View>

      {!isLandscape && <AppNav navigation={navigation} activeScreen="Dashboard" />}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },

  leftPanel:   { width: 220, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  bizHeader:   { padding: 18, paddingBottom: 10 },
  bizName:     { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },

  ctaBtn:      { marginHorizontal: 12, marginBottom: 12, padding: 14, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center' },
  ctaLabel:    { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff' },
  ctaSub:      { fontFamily: fonts.familyRegular, fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  divider:     { height: 1, backgroundColor: colors.border, marginHorizontal: 12, marginVertical: 4 },

  menuItem:        { paddingVertical: 12, paddingHorizontal: 16, position: 'relative' },
  menuItemActive:  { backgroundColor: 'rgba(245,240,232,0.06)' },
  activeBar:       { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  menuLabel:       { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  menuLabelActive: { color: colors.text },

  dashContent: { padding: 24, paddingBottom: 40 },
  greeting:    { fontFamily: fonts.family, fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4 },
  greetingSub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 28 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard:  { flex: 1, minWidth: '44%', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
  statVal:   { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 4 },
  statLbl:   { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },

  shiftDivider:  { height: 1, backgroundColor: colors.border, marginBottom: 16 },
  shiftCloseBtn: { backgroundColor: 'rgba(217,95,95,0.07)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(217,95,95,0.3)', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  shiftCloseTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, marginBottom: 3 },
  shiftCloseSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
});
