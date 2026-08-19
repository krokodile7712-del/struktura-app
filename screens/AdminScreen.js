import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import AppNav from '../components/AppNav';
import NextStepsCard from '../components/NextStepsCard';
import ShiftBanner from '../components/ShiftBanner';
import { useResponsive } from '../hooks/useResponsive';
import {
  getOpenShift, getBusinessProfile, getDashboardStats, getRoleNames,
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
  const { isLandscape } = useResponsive();
  const [profile, setProfile]   = useState(null);
  const [stats, setStats]       = useState({});
  const [hasShift, setHasShift] = useState(false);
  const [roleNames, setRoleNames] = useState({ admin: 'Администратор' });
  const [sessionName, setSessionName] = useState('');
  const [stockOpen, setStockOpen] = useState(false);

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

  return (
    <View style={styles.root}>
      <TopBar title={roleNames.admin || 'Администратор'} navigation={navigation} activeScreen="Admin" />
      {!hasShift && <ShiftBanner onOpen={() => navigation.navigate('Shift')} />}

      <View style={{ flex: 1, flexDirection: isLandscape ? 'row' : 'column' }}>
        {isLandscape && <AppNav navigation={navigation} activeScreen="Admin" />}

        <ScrollView contentContainerStyle={styles.panelContent} style={{ flex: 1 }}>
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
                <Pressable onPress={() => navigation.navigate('Products', { initialTab: 'stock' })}>
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

          <Text style={styles.panelGreeting}>{getGreeting()}{sessionName ? `, ${sessionName}` : ''}</Text>
          <Text style={styles.panelSub}>{profile?.business_name || 'Сводка за сегодня'}</Text>

          <NextStepsCard navigation={navigation} />

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
        </ScrollView>
      </View>

      {!isLandscape && <AppNav navigation={navigation} activeScreen="Admin" />}
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
});
