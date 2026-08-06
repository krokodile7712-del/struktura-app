import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getHomeRoute } from '../db/session';
import { getBookings, updateBookingStatus } from '../db/supabase';
import { getBusinessProfile } from '../db/queries';
import { colors, fonts } from '../constants/theme';

const STATUS = {
  pending:   { label: 'Новая',        color: colors.amber,  bg: 'rgba(212,175,106,0.12)' },
  confirmed: { label: 'Подтверждена', color: colors.green,  bg: 'rgba(123,175,142,0.12)' },
  cancelled: { label: 'Отменена',     color: colors.red,    bg: 'rgba(217,95,95,0.12)'   },
  done:      { label: 'Выполнена',    color: colors.muted,  bg: 'rgba(64,60,55,0.1)'     },
};

const FILTERS = [
  { key: 'all',       label: 'Все' },
  { key: 'pending',   label: 'Новые' },
  { key: 'confirmed', label: 'Подтверждены' },
  { key: 'done',      label: 'Выполнены' },
  { key: 'cancelled', label: 'Отменены' },
];

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  if (d.getTime() === today.getTime()) return 'Сегодня';
  if (d.getTime() === tomorrow.getTime()) return 'Завтра';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export default function BookingsScreen({ navigation }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [filter, setFilter]     = useState('all');

  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(16))[0];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profile = getBusinessProfile();
      const slug = profile?.booking_slug;
      if (!slug) { setLoading(false); return; }
      const data = await getBookings(null, null, slug);
      setBookings(data || []);
    } catch(e) { console.error(e); }
    setLoading(false);

    fadeAnim.setValue(0); slideAnim.setValue(16);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleStatus = async (id, status) => {
    try {
      await updateBookingStatus(id, status);
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
      setExpanded(null);
    } catch(e) { Alert.alert('Ошибка', e.message); }
  };

  const filtered = bookings.filter(b => filter === 'all' || b.status === filter);

  // Группировка по дате
  const grouped = filtered.reduce((acc, b) => {
    const key = b.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  // Счётчики по статусам
  const counts = bookings.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <View style={styles.root}>
      <TopBar
        title="Записи"
        onBack={() => navigation.navigate(getHomeRoute())}
        rightElement={
          <Pressable onPress={load} hitSlop={12}>
            <Text style={styles.refreshBtn}>↻</Text>
          </Pressable>
        }
      />

      <View style={styles.layout} onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>

        {/* Левая панель */}
        <View style={[styles.left, containerWidth > 0 && { width: Math.min(380, Math.max(260, containerWidth * 0.3)) }]}>
          <Text style={styles.sectionLabel}>Фильтр</Text>
          {FILTERS.map(f => {
            const count = f.key === 'all' ? bookings.length : (counts[f.key] || 0);
            return (
              <Pressable
                key={f.key}
                style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
                onPress={() => setFilter(f.key)}
              >
                {filter === f.key && <View style={styles.filterBar} />}
                <Text style={[styles.filterTxt, filter === f.key && styles.filterTxtActive]}>{f.label}</Text>
                {count > 0 && (
                  <View style={[styles.countBadge, f.key === 'pending' && count > 0 && styles.countBadgeNew]}>
                    <Text style={[styles.countTxt, f.key === 'pending' && count > 0 && styles.countTxtNew]}>{count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}

          <View style={styles.divider} />

          {/* Подсказка */}
          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>Онлайн запись</Text>
            <Text style={styles.hintTxt}>
              Клиенты записываются через форму по QR-коду. Новые записи появляются здесь автоматически.
            </Text>
          </View>
        </View>

        {/* Правая панель */}
        <View style={styles.right}>
          {loading ? (
            <View style={styles.centerWrap}>
              <ActivityIndicator color={colors.orange} size="large" />
              <Text style={styles.loadingTxt}>Загрузка записей...</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.centerWrap}>
              <Text style={styles.emptyTxt}>
                {filter === 'all' ? 'Нет записей' : `Нет записей в категории «${FILTERS.find(f=>f.key===filter)?.label}»`}
              </Text>
              <Text style={styles.emptyHint}>
                Поделитесь QR-кодом из Настроек чтобы клиенты могли записаться
              </Text>
            </View>
          ) : (
            <Animated.ScrollView
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
            >
              {Object.entries(grouped)
                .sort(([a],[b]) => a.localeCompare(b))
                .map(([date, items]) => (
                  <View key={date} style={styles.group}>
                    <Text style={styles.groupDate}>{fmtDate(date)}</Text>
                    <View style={styles.groupCard}>
                      {items.map((b, idx) => {
                        const st = STATUS[b.status] || STATUS.pending;
                        const isExp = expanded === b.id;
                        return (
                          <View key={b.id}>
                            <Pressable
                              style={({ pressed }) => [
                                styles.bookingRow,
                                idx < items.length - 1 && !isExp && styles.rowDiv,
                                pressed && { backgroundColor: 'rgba(245,240,232,0.03)' },
                              ]}
                              onPress={() => setExpanded(isExp ? null : b.id)}
                            >
                              {/* Время */}
                              <Text style={styles.bookingTime}>
                                {b.time_start?.slice(0,5) || '—'}
                              </Text>

                              {/* Инфо */}
                              <View style={{ flex: 1 }}>
                                <Text style={styles.bookingName}>{b.client_name}</Text>
                                <Text style={styles.bookingSub} numberOfLines={1}>
                                  {b.services?.name || 'Без услуги'}
                                  {b.client_phone ? ` · ${b.client_phone}` : ''}
                                </Text>
                                {b.note ? <Text style={styles.bookingNote}>💬 {b.note}</Text> : null}
                              </View>

                              {/* Статус */}
                              <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                                <Text style={[styles.statusTxt, { color: st.color }]}>{st.label}</Text>
                              </View>

                              <Text style={[styles.chevron, isExp && styles.chevronOpen]}>›</Text>
                            </Pressable>

                            {/* Действия */}
                            {isExp && (
                              <View style={[styles.actionsPanel, idx < items.length - 1 && styles.rowDiv]}>
                                {b.status !== 'confirmed' && (
                                  <Pressable style={styles.actionBtn} onPress={() => handleStatus(b.id, 'confirmed')}>
                                    <Text style={[styles.actionTxt, { color: colors.green }]}>✓ Подтвердить</Text>
                                  </Pressable>
                                )}
                                {b.status !== 'done' && b.status !== 'cancelled' && (
                                  <Pressable style={styles.actionBtn} onPress={() => handleStatus(b.id, 'done')}>
                                    <Text style={styles.actionTxt}>✔ Выполнено</Text>
                                  </Pressable>
                                )}
                                {b.status !== 'cancelled' && (
                                  <Pressable style={[styles.actionBtn, { borderColor: 'rgba(217,95,95,0.35)' }]}
                                    onPress={() => handleStatus(b.id, 'cancelled')}>
                                    <Text style={[styles.actionTxt, { color: colors.red }]}>✕ Отменить</Text>
                                  </Pressable>
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
            </Animated.ScrollView>
          )}
        </View>

      </View>

      <BottomBar navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg },
  layout: { flex: 1, flexDirection: 'row' },

  // Левая панель
  left:   { width: 200, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, padding: 14 },
  sectionLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },

  filterBtn:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 14, borderRadius: 12, position: 'relative', gap: 8 },
  filterBtnActive: { backgroundColor: 'rgba(240,160,80,0.08)' },
  filterBar:   { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  filterTxt:   { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted, flex: 1 },
  filterTxtActive: { color: colors.orange },
  countBadge:  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.surface2 },
  countBadgeNew: { backgroundColor: 'rgba(212,175,106,0.2)' },
  countTxt:    { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  countTxtNew: { color: colors.amber },

  hintCard:  { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  hintTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, marginBottom: 6 },
  hintTxt:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, lineHeight: 17 },

  // Правая панель
  right:      { flex: 1 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingTxt: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 12 },
  emptyTxt:   { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted, textAlign: 'center' },
  emptyHint:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 20, opacity: 0.7 },

  group:       { marginBottom: 16 },
  groupDate:   { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 8, paddingHorizontal: 2 },
  groupCard:   { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },

  bookingRow:  { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 10 },
  rowDiv:      { borderBottomWidth: 1, borderBottomColor: colors.border },
  bookingTime: { fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text, width: 50 },
  bookingName: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  bookingSub:  { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },
  bookingNote: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.indigo, marginTop: 2 },

  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10 },
  statusTxt:   { fontFamily: fonts.familySemibold, fontSize: 11 },
  chevron:     { fontSize: 18, color: colors.muted, transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '-90deg' }] },

  actionsPanel:{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, backgroundColor: colors.surface2 },
  actionBtn:   { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  actionTxt:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },

  refreshBtn:  { fontSize: 20, color: colors.muted },
});
