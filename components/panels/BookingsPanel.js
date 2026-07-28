import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { getHomeRoute } from '../../db/session';
import { getBookings, updateBookingStatus } from '../../db/supabase';
import { getBusinessProfile } from '../../db/queries';
import { colors, fonts } from '../../constants/theme';

const STATUS = {
  pending:   { label: 'Новая',        color: '#f5c842', bg: 'rgba(245,200,66,0.12)' },
  confirmed: { label: 'Подтверждена', color: '#3d9e92', bg: 'rgba(61,158,146,0.12)' },
  cancelled: { label: 'Отменена',     color: '#a01020', bg: 'rgba(160,16,32,0.12)' },
  done:      { label: 'Выполнена',    color: '#4a4d54', bg: 'rgba(74,77,84,0.12)' },
};

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export default function BookingsPanel() {
  const [bookings, setBookings]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState(null);
  const [filter, setFilter]       = useState('all'); // all / pending / confirmed / done
  const [businessId, setBusinessId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profile = getBusinessProfile();
      const slug = profile?.booking_slug;
      if (!slug) { setLoading(false); return; }
      const data = await getBookings(null, null, slug);
      setBookings(data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatus = async (id, status) => {
    try {
      await updateBookingStatus(id, status);
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
      setExpanded(null);
    } catch (e) { Alert.alert('Ошибка', e.message); }
  };

  const filtered = bookings.filter(b => filter === 'all' || b.status === filter);

  // Группировка по дате
  const grouped = filtered.reduce((acc, b) => {
    const key = b.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={{ flex: 1 }}>

      {/* Фильтры */}
      <View style={styles.filters}>
        {[
          { key: 'all',       label: 'Все' },
          { key: 'pending',   label: 'Новые' },
          { key: 'confirmed', label: 'Подтверждены' },
          { key: 'done',      label: 'Выполнены' },
        ].map(f => (
          <Pressable key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}>
            <Text style={[styles.filterTxt, filter === f.key && styles.filterTxtActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.greenLight} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
          <Text style={{ fontSize: 40 }}>📅</Text>
          <Text style={{ fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted, marginTop: 12 }}>
            {filter === 'all' ? 'Нет записей' : 'Нет в этой категории'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, items]) => (
              <View key={date}>
                {/* Заголовок даты */}
                <Text style={styles.dateLabel}>
                  {date === today ? 'Сегодня' : fmtDate(date)}
                </Text>

                {/* Карточки записей */}
                <View style={styles.dayCard}>
                  {items.map((b, idx) => {
                    const st = STATUS[b.status] || STATUS.pending;
                    const isExp = expanded === b.id;
                    return (
                      <View key={b.id}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.bookingRow,
                            idx < items.length - 1 && !isExp && styles.rowDiv,
                            pressed && { backgroundColor: 'rgba(255,255,255,0.02)' }
                          ]}
                          onPress={() => setExpanded(isExp ? null : b.id)}
                        >
                          {/* Время */}
                          <Text style={styles.bookingTime}>
                            {b.time_start?.slice(0, 5) || '—'}
                          </Text>

                          {/* Информация */}
                          <View style={{ flex: 1 }}>
                            <Text style={styles.bookingName}>{b.client_name}</Text>
                            <Text style={styles.bookingSub} numberOfLines={1}>
                              {b.services?.name || 'Без услуги'}{b.client_phone ? ` · ${b.client_phone}` : ''}
                            </Text>
                            {b.note ? <Text style={styles.bookingNote}>💬 {b.note}</Text> : null}
                          </View>

                          {/* Статус */}
                          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                            <Text style={[styles.statusTxt, { color: st.color }]}>{st.label}</Text>
                          </View>

                          <Text style={[styles.chevron, isExp && styles.chevronOpen]}>›</Text>
                        </Pressable>

                        {/* Аккордеон — действия */}
                        {isExp && (
                          <View style={[styles.actionsPanel, idx < items.length - 1 && styles.rowDiv]}>
                            {b.status !== 'confirmed' && (
                              <Pressable style={styles.actionBtn}
                                onPress={() => handleStatus(b.id, 'confirmed')}>
                                <Text style={[styles.actionTxt, { color: colors.greenLight }]}>✓ Подтвердить</Text>
                              </Pressable>
                            )}
                            {b.status !== 'done' && (
                              <Pressable style={styles.actionBtn}
                                onPress={() => handleStatus(b.id, 'done')}>
                                <Text style={styles.actionTxt}>✔ Выполнено</Text>
                              </Pressable>
                            )}
                            {b.status !== 'cancelled' && (
                              <Pressable style={[styles.actionBtn, { borderColor: 'rgba(160,16,32,0.3)' }]}
                                onPress={() => handleStatus(b.id, 'cancelled')}>
                                <Text style={[styles.actionTxt, { color: colors.redLight }]}>✕ Отменить</Text>
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
        </ScrollView>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  filters:        { flexDirection: 'row', gap: 8, padding: 12, paddingTop: 8 },
  filterBtn:      { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', backgroundColor: '#07080a' },
  filterBtnActive:{ borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.1)' },
  filterTxt:      { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  filterTxtActive:{ color: colors.greenLight },
  dateLabel:      { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  dayCard:        { backgroundColor: '#0b0c0f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', overflow: 'hidden' },
  bookingRow:     { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowDiv:         { borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.15)' },
  bookingTime:    { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, width: 44 },
  bookingName:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  bookingSub:     { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  bookingNote:    { fontFamily: fonts.familyRegular, fontSize: 11, color: '#7a9e52', marginTop: 2 },
  statusBadge:    { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  statusTxt:      { fontFamily: fonts.familySemibold, fontSize: 11 },
  chevron:        { fontSize: 18, color: 'rgba(74,77,84,0.4)', transform: [{ rotate: '90deg' }] },
  chevronOpen:    { transform: [{ rotate: '-90deg' }] },
  actionsPanel:   { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: 'rgba(74,77,84,0.05)' },
  actionBtn:      { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', alignItems: 'center' },
  actionTxt:      { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
});
