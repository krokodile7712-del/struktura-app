import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Animated, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import Sheet from '../components/Sheet';
import SwipeableRow from '../components/SwipeableRow';
import { useResponsive } from '../hooks/useResponsive';
import { getHomeRoute, goBackSmart } from '../db/session';
import { getBookings, updateBookingStatus } from '../db/supabase';
import {
  getBusinessProfile, getManualBookings, insertManualBooking,
  updateManualBooking, updateManualBookingStatus, deleteManualBooking,
} from '../db/queries';
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
  const { isLandscape } = useResponsive();
  const [mainTab, setMainTab] = useState(() => {
    try {
      const profile = getBusinessProfile();
      return profile?.booking_slug ? 'online' : 'manual';
    } catch (e) { return 'online'; }
  }); // online | manual

  // Предупреждение при заходе в раздел, если онлайн-запись не подключена —
  // один раз за это открытие экрана, не при каждом обновлении
  useEffect(() => {
    try {
      const profile = getBusinessProfile();
      if (!profile?.booking_slug) {
        Alert.alert(
          'Онлайн-запись не подключена',
          'Клиенты пока не могут записываться через интернет. Настройте это в Настройках, либо продолжайте вносить записи вручную — во вкладке «По телефону».'
        );
      }
    } catch (e) { console.error(e); }
  }, []);

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [filter, setFilter]     = useState('all');

  // ── Записи по телефону (локальные) ──
  const [manualBookings, setManualBookings] = useState([]);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [manualEditingId, setManualEditingId] = useState(null);
  const [mfDate, setMfDate]     = useState('');
  const [mfTime, setMfTime]     = useState('');
  const [mfName, setMfName]     = useState('');
  const [mfPhone, setMfPhone]   = useState('');
  const [mfService, setMfService] = useState('');
  const [mfPrice, setMfPrice]   = useState('');
  const [mfComment, setMfComment] = useState('');

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

  const loadManual = useCallback(() => {
    try { setManualBookings(getManualBookings()); } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); loadManual(); }, [load, loadManual]));

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const openManualForm = () => {
    setManualEditingId(null);
    setMfDate(todayStr());
    setMfTime('');
    setMfName('');
    setMfPhone('');
    setMfService('');
    setMfPrice('');
    setMfComment('');
    setManualFormOpen(true);
  };

  const openManualEdit = (b) => {
    setManualEditingId(b.id);
    setMfDate(b.date);
    setMfTime(b.time_start);
    setMfName(b.client_name);
    setMfPhone(b.client_phone || '');
    setMfService(b.service_name || '');
    setMfPrice(b.service_price ? String(b.service_price) : '');
    setMfComment(b.comment || '');
    setManualFormOpen(true);
  };

  const saveManualBooking = () => {
    if (!mfName.trim() || !mfDate || !mfTime) {
      Alert.alert('Заполните обязательные поля', 'Имя клиента, дата и время нужны обязательно');
      return;
    }
    try {
      const payload = {
        date: mfDate,
        time_start: mfTime,
        client_name: mfName.trim(),
        client_phone: mfPhone.trim(),
        service_name: mfService.trim(),
        service_price: parseFloat(mfPrice) || 0,
        comment: mfComment.trim(),
        status: 'confirmed',
      };
      if (manualEditingId) {
        updateManualBooking(manualEditingId, payload);
      } else {
        insertManualBooking(payload);
      }
      setManualFormOpen(false);
      setManualEditingId(null);
      loadManual();
    } catch (e) { console.error(e); Alert.alert('Ошибка', 'Не удалось сохранить запись'); }
  };

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

  // Группировка локальных записей по дате
  const manualGrouped = manualBookings.reduce((acc, b) => {
    const key = b.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  return (
    <>
    <View style={styles.root}>
      <TopBar
        title="Записи"
        onBack={() => goBackSmart(navigation)}
        navigation={navigation}
        activeScreen="Bookings"
        rightElement={
          <Pressable onPress={load} hitSlop={12}>
            <Text style={styles.refreshBtn}>↻</Text>
          </Pressable>
        }
      />

      {/* Вкладки — Онлайн / По телефону */}
      <View style={styles.mainTabBar}>
        <Pressable style={[styles.mainTabBtn, mainTab === 'online' && styles.mainTabBtnActive]} onPress={() => setMainTab('online')}>
          <Text style={[styles.mainTabTxt, mainTab === 'online' && styles.mainTabTxtActive]}>Онлайн</Text>
        </Pressable>
        <Pressable style={[styles.mainTabBtn, mainTab === 'manual' && styles.mainTabBtnActive]} onPress={() => setMainTab('manual')}>
          <Text style={[styles.mainTabTxt, mainTab === 'manual' && styles.mainTabTxtActive]}>По телефону</Text>
        </Pressable>
      </View>

      {mainTab === 'online' && (
      <View style={[styles.layout, !isLandscape && { flexDirection: 'column' }]} onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>

        {isLandscape ? (
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
        ) : (
          <View style={styles.filterRowOuter}>
            {FILTERS.map(f => {
              const count = f.key === 'all' ? bookings.length : (counts[f.key] || 0);
              return (
                <Pressable
                  key={f.key}
                  style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={[styles.filterChipTxt, filter === f.key && styles.filterChipTxtActive]}>
                    {f.label}{count > 0 ? ` · ${count}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

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
      )}

      {mainTab === 'manual' && (
        <View style={styles.right}>
          <Pressable style={styles.addManualBtn} onPress={openManualForm}>
            <Text style={styles.addManualBtnTxt}>+ Добавить запись</Text>
          </Pressable>

          {manualBookings.length === 0 ? (
            <View style={styles.centerWrap}>
              <Text style={styles.emptyTxt}>Пока нет записей по телефону</Text>
              <Text style={styles.emptyHint}>Добавляйте сюда клиентов, которые записались, позвонив вам напрямую</Text>
            </View>
          ) : (
            <Animated.ScrollView contentContainerStyle={{ padding: 16 }}>
              {Object.keys(manualGrouped).sort().map(date => (
                <View key={date} style={{ marginBottom: 20 }}>
                  <Text style={styles.groupDate}>{fmtDate(date)}</Text>
                  <View style={styles.groupCard}>
                    {manualGrouped[date].map((b, idx) => (
                      <SwipeableRow
                        key={b.id}
                        onAction={() => {
                          Alert.alert('Удалить запись?', `${b.client_name} · ${b.time_start?.slice(0,5)}`, [
                            { text: 'Отмена', style: 'cancel' },
                            { text: 'Удалить', style: 'destructive', onPress: () => { deleteManualBooking(b.id); loadManual(); } },
                          ]);
                        }}
                        label="Удалить"
                      >
                        <Pressable
                          style={[styles.bookingRow, idx < manualGrouped[date].length - 1 && styles.rowDiv]}
                          onPress={() => openManualEdit(b)}
                        >
                          <Text style={styles.bookingTime}>{b.time_start?.slice(0,5) || '—'}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.bookingName}>{b.client_name}</Text>
                            <Text style={styles.bookingSub}>
                              📞 {b.service_name || 'Без услуги'}
                              {b.client_phone ? ` · ${b.client_phone}` : ''}
                            </Text>
                          </View>
                        </Pressable>
                      </SwipeableRow>
                    ))}
                  </View>
                </View>
              ))}
            </Animated.ScrollView>
          )}
        </View>
      )}
    </View>

    <Sheet
      visible={manualFormOpen}
      onClose={() => { setManualFormOpen(false); setManualEditingId(null); }}
      title={manualEditingId ? 'Изменить запись' : 'Новая запись по телефону'}
    >
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.fieldLabel}>Имя клиента <Text style={{ color: colors.orange }}>*</Text></Text>
        <TextInput style={styles.input} color={colors.text} value={mfName} onChangeText={setMfName}
          placeholder="Как зовут клиента" placeholderTextColor={colors.muted} />

        <Text style={styles.fieldLabel}>Телефон</Text>
        <TextInput style={styles.input} color={colors.text} value={mfPhone} onChangeText={setMfPhone}
          keyboardType="phone-pad" placeholder="Необязательно" placeholderTextColor={colors.muted} />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Дата <Text style={{ color: colors.orange }}>*</Text></Text>
            <TextInput style={styles.input} color={colors.text} value={mfDate} onChangeText={setMfDate}
              placeholder="ГГГГ-ММ-ДД" placeholderTextColor={colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Время <Text style={{ color: colors.orange }}>*</Text></Text>
            <TextInput style={styles.input} color={colors.text} value={mfTime} onChangeText={setMfTime}
              placeholder="ЧЧ:ММ" placeholderTextColor={colors.muted} />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Услуга</Text>
        <TextInput style={styles.input} color={colors.text} value={mfService} onChangeText={setMfService}
          placeholder="Необязательно" placeholderTextColor={colors.muted} />

        <Text style={styles.fieldLabel}>Стоимость</Text>
        <TextInput style={styles.input} color={colors.text} value={mfPrice} onChangeText={setMfPrice}
          keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} />

        <Text style={styles.fieldLabel}>Комментарий</Text>
        <TextInput style={[styles.input, { minHeight: 60 }]} color={colors.text} value={mfComment} onChangeText={setMfComment}
          placeholder="Необязательно" placeholderTextColor={colors.muted} multiline />

        <Pressable style={styles.saveManualBtn} onPress={saveManualBooking}>
          <Text style={styles.saveManualBtnTxt}>Сохранить</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg },
  layout: { flex: 1, flexDirection: 'row' },

  // Левая панель
  left:   { width: 200, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, padding: 14 },
  filterRowOuter: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: 'rgba(240,160,80,0.14)', borderColor: colors.orange },
  filterChipTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  filterChipTxtActive: { color: colors.orange },
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
  mainTabBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  mainTabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  mainTabBtnActive: { backgroundColor: 'rgba(240,160,80,0.14)' },
  mainTabTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  mainTabTxtActive: { color: colors.orange },
  addManualBtn: { margin: 16, marginBottom: 8, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center' },
  addManualBtnTxt: { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#fff' },

  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },
  saveManualBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center' },
  saveManualBtnTxt: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff' },
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
