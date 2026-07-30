import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import ShiftBanner from '../components/ShiftBanner';
import {
  getOpenShift, getBusinessProfile, getTerms, pluralizeRu,
  getDashboardStats, getRoleNames,
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

export default function DashboardScreen({ navigation }) {
  const [profile, setProfile]       = useState(null);
  const [terms, setTerms]           = useState({ order: 'Заказ', client: 'Клиент' });
  const [stats, setStats]           = useState({});
  const [hasShift, setHasShift]     = useState(false);
  const [roleNames, setRoleNames]   = useState({ barista: 'Сотрудник' });
  const [sessionName, setSessionName] = useState('');
  const [active, setActive]         = useState('dash');

  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(16))[0];
  const animWidth = useState(new Animated.Value(220))[0];

  const load = useCallback(() => {
    try {
      const p = getBusinessProfile();
      setProfile(p);
      setTerms(getTerms());
      setRoleNames(getRoleNames());
      setStats(getDashboardStats());
      setHasShift(!!getOpenShift());
      const sess = getSession();
      setSessionName(sess?.name?.split(' ')[0] || '');
    } catch(e) { console.error(e); }

    fadeAnim.setValue(0); slideAnim.setValue(16);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setActiveAnimated = (key) => {
    setActive(key);
    Animated.spring(animWidth, {
      toValue: 52,
      useNativeDriver: false,
      tension: 40,
      friction: 10,
    }).start();
  };

  // Разделы доступные сотруднику по правам
  const SECTIONS = [
    { key: 'dash',         label: 'Обзор',    always: true },
    { key: 'Sales',        label: 'Продажи',  perm: 'view_order_history' },
    { key: 'ClientsList',  label: 'Клиенты',  perm: 'view_clients' },
    { key: 'Expenses',     label: 'Расходы',  perm: 'add_expenses' },
    { key: 'Stock',        label: 'Склад',    perm: 'view_stock' },
  ].filter(s => s.always || can(s.perm));

  return (
    <View style={styles.root}>
      <TopBar title={roleNames.barista || 'Сотрудник'} navigation={navigation} activeScreen="Dashboard" />
      {!hasShift && <ShiftBanner onOpen={() => navigation.navigate('Shift')} />}

      <View style={styles.layout}>

        {/* ── Левая панель ── */}
        <Animated.View style={[styles.leftPanel, { width: animWidth }]}>
          <View style={styles.bizHeader}>
            <Text style={styles.bizName} numberOfLines={1}>{profile?.business_name || 'Мой бизнес'}</Text>
            {profile?.city ? <Text style={styles.bizCity}>{profile.city}</Text> : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
            onPress={() => navigation.navigate('Kassa')}
          >
            <Text style={styles.ctaLabel}>Новый {terms.order?.toLowerCase()}</Text>
            <Text style={styles.ctaSub}>Открыть кассу</Text>
          </Pressable>

          <View style={styles.divider} />

          <ScrollView showsVerticalScrollIndicator={false}>
            {SECTIONS.map(s => {
              const isActive = active === s.key;
              return (
                <Pressable
                  key={s.key}
                  style={({ pressed }) => [
                    styles.menuItem,
                    isActive && styles.menuItemActive,
                    pressed && { backgroundColor: 'rgba(245,240,232,0.04)' },
                  ]}
                  onPress={() => {
                    if (s.key === 'dash') {
                      setActive('dash');
                      Animated.spring(animWidth, { toValue: 220, useNativeDriver: false, tension: 40, friction: 10 }).start();
                    } else {
                      setActiveAnimated(s.key);
                      setTimeout(() => navigation.navigate(s.key), 200);
                    }
                  }}
                >
                  {isActive && <View style={styles.activeBar} />}
                  <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>{s.label}</Text>
                </Pressable>
              );
            })}

            <View style={styles.divider} />

            <Pressable style={styles.menuItem} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.logoutLabel}>⎋  Сменить аккаунт</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>

        {/* ── Правая панель — дашборд ── */}
        <View style={styles.rightPanel}>
          <Animated.ScrollView
            contentContainerStyle={styles.dashContent}
            style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
          >
            <Text style={styles.greeting}>{getGreeting()}{sessionName ? `, ${sessionName}` : ''}</Text>
            <Text style={styles.greetingSub}>Сводка текущей смены</Text>

            <View style={styles.statsGrid}>
              {[
                { label: 'Выручка',    value: `${fmt(stats.todayTotal)} ₽` },
                { label: 'Заказов',    value: stats.todayOrders || 0 },
                { label: 'Средний чек',value: `${stats.todayOrders > 0 ? fmt(Math.round((stats.todayTotal||0) / stats.todayOrders)) : 0} ₽` },
                { label: 'Наличные',   value: `${fmt(stats.todayCash)} ₽` },
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
                    <Text style={styles.shiftCloseSub}>
                      Открыта {stats.shiftDuration || ''} · {fmt(stats.todayTotal)} ₽
                    </Text>
                  </View>
                  <Text style={{ fontSize: 18, color: colors.red }}>›</Text>
                </Pressable>
              </>
            )}

            <Text style={styles.hint}>Нажмите на раздел слева для перехода</Text>
          </Animated.ScrollView>
        </View>

      </View>

      <BottomBar navigation={navigation} activeTab="Kassa" />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  layout:  { flex: 1, flexDirection: 'row' },

  leftPanel:  { borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  bizHeader:  { padding: 18, paddingBottom: 10 },
  bizName:    { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  bizCity:    { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },

  ctaBtn:     { marginHorizontal: 12, marginBottom: 12, padding: 14, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center' },
  ctaLabel:   { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff', textTransform: 'capitalize' },
  ctaSub:     { fontFamily: fonts.familyRegular, fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  divider:    { height: 1, backgroundColor: colors.border, marginHorizontal: 12, marginVertical: 4 },

  menuItem:       { paddingVertical: 12, paddingHorizontal: 16, position: 'relative' },
  menuItemActive: { backgroundColor: 'rgba(245,240,232,0.06)' },
  activeBar:      { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  menuLabel:      { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  menuLabelActive:{ color: colors.text },
  logoutLabel:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },

  rightPanel:   { flex: 1, backgroundColor: colors.bg },
  dashContent:  { padding: 32, paddingBottom: 40 },
  greeting:     { fontFamily: fonts.family, fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4 },
  greetingSub:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 28 },

  statsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard:   { flex: 1, minWidth: '44%', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
  statVal:    { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 4 },
  statLbl:    { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },

  shiftDivider:   { height: 1, backgroundColor: colors.border, marginBottom: 16 },
  shiftCloseBtn:  { backgroundColor: 'rgba(217,95,95,0.07)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(217,95,95,0.3)', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  shiftCloseTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, marginBottom: 3 },
  shiftCloseSub:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  hint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', opacity: 0.5, marginTop: 16 },
});
