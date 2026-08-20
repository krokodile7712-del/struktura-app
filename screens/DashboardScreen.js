import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import ShiftBanner from '../components/ShiftBanner';
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
function fmt(n) { return (n || 0).toLocaleString('ru-RU'); }

// Обзор сотрудника. AppNav сам решает, как себя показать — снизу компактной
// панелью в портрете, широкой боковой панелью (с разделами по правам
// доступа) в альбомной ориентации — этому экрану не нужно ничего
// специально достраивать самому.
export default function DashboardScreen({ navigation }) {
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

  return (
    <View style={styles.root}>
      <TopBar title={roleNames.barista || 'Сотрудник'} navigation={navigation} activeScreen="Dashboard" />
      {!hasShift && <ShiftBanner onOpen={() => navigation.navigate('Shift')} />}

      <View style={{ flex: 1 }}>

        <ScrollView contentContainerStyle={styles.dashContent} style={{ flex: 1 }}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },

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
