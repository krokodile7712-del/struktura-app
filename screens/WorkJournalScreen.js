import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Animated } from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { useFocusEffect } from '@react-navigation/native';
import { getWorkJournal, getOrderItemsWithNotes } from '../db/queries';
import { getHomeRoute } from '../db/session';
import { colors, fonts } from '../constants/theme';

const fmt = n => Math.round(n||0).toLocaleString('ru-RU');

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(open, close) {
  if (!open || !close) return null;
  const mins = Math.round((new Date(close) - new Date(open)) / 60000);
  if (mins < 60) return `${mins} мин`;
  return `${Math.floor(mins/60)}ч ${mins%60}мин`;
}

export default function WorkJournalScreen({ navigation }) {
  const [entries, setEntries]   = useState([]);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [itemsMap, setItemsMap] = useState({});
  const fadeAnim = useState(new Animated.Value(0))[0];

  const load = useCallback(() => {
    try {
      setEntries(getWorkJournal({ limit: 100 }));
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    } catch(e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { fadeAnim.setValue(0); load(); }, [load]));

  const toggleExpand = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!itemsMap[id]) {
      try { setItemsMap(m => ({ ...m, [id]: getOrderItemsWithNotes(id) })); } catch(_) {}
    }
  };

  const filtered = entries.filter(e =>
    !search.trim() ||
    e.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    fmtDate(e.opened_at).includes(search)
  );

  return (
    <View style={styles.root}>
      <TopBar title="Журнал работы" onBack={() => navigation.navigate(getHomeRoute())} />

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Поиск */}
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            color={colors.text}
            value={search}
            onChangeText={setSearch}
            placeholder="Поиск по сотруднику или дате..."
            placeholderTextColor={colors.muted}
          />
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTxt}>Нет записей</Text>
            <Text style={styles.emptyHint}>История смен появится здесь после первого закрытия смены</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            {filtered.map((entry, idx) => {
              const isOpen = expanded === entry.id;
              const duration = fmtDuration(entry.opened_at, entry.closed_at);
              const items = itemsMap[entry.id] || [];

              return (
                <View key={entry.id} style={[styles.card, idx > 0 && { marginTop: 10 }]}>
                  {/* Шапка смены */}
                  <Pressable style={styles.cardHeader} onPress={() => toggleExpand(entry.id)}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[styles.statusDot, { backgroundColor: entry.closed_at ? colors.green : colors.orange }]} />
                      <View>
                        <Text style={styles.cardDate}>{fmtDate(entry.opened_at)}</Text>
                        <Text style={styles.cardUser}>{entry.user_name || 'Сотрудник'}</Text>
                      </View>
                    </View>
                    <View style={styles.cardHeaderRight}>
                      <Text style={styles.cardTotal}>{fmt(entry.total_revenue)} ₽</Text>
                      {duration && <Text style={styles.cardDuration}>{duration}</Text>}
                      <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>›</Text>
                    </View>
                  </Pressable>

                  {/* Статистика */}
                  {isOpen && (
                    <View style={styles.cardBody}>
                      <View style={styles.statsRow}>
                        {[
                          { label: 'Заказов',   val: entry.order_count || 0 },
                          { label: 'Наличные',  val: `${fmt(entry.cash_total)} ₽` },
                          { label: 'Карта',     val: `${fmt(entry.card_total)} ₽` },
                        ].map((s, i) => (
                          <View key={i} style={styles.statBox}>
                            <Text style={styles.statVal}>{s.val}</Text>
                            <Text style={styles.statLbl}>{s.label}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Время открытия/закрытия */}
                      <View style={styles.timeRow}>
                        <View style={styles.timeItem}>
                          <Text style={styles.timeLbl}>Открыта</Text>
                          <Text style={styles.timeVal}>{fmtDate(entry.opened_at)}</Text>
                        </View>
                        {entry.closed_at && (
                          <View style={styles.timeItem}>
                            <Text style={styles.timeLbl}>Закрыта</Text>
                            <Text style={styles.timeVal}>{fmtDate(entry.closed_at)}</Text>
                          </View>
                        )}
                      </View>

                      {/* Список заказов */}
                      {items.length > 0 && (
                        <>
                          <Text style={styles.ordersTitle}>Заказы смены</Text>
                          {items.map((item, ii) => (
                            <View key={ii} style={[styles.orderRow, ii < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                              <Text style={styles.orderName} numberOfLines={1}>{item.name}</Text>
                              <Text style={styles.orderQty}>×{item.quantity}</Text>
                              <Text style={styles.orderAmt}>{fmt(item.total)} ₽</Text>
                            </View>
                          ))}
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </Animated.View>

      <BottomBar navigation={navigation} activeTab="Kassa" />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },

  searchWrap:  { padding: 12, paddingBottom: 4 },
  searchInput: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 11, paddingHorizontal: 14, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTxt:  { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 18, opacity: 0.7 },

  card:       { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  cardHeaderLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot:  { width: 8, height: 8, borderRadius: 4 },
  cardDate:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  cardUser:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  cardTotal:  { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  cardDuration:{ fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  chevron:    { fontSize: 20, color: colors.muted, transform: [{ rotate: '90deg' }] },
  chevronOpen:{ transform: [{ rotate: '-90deg' }] },

  cardBody:   { borderTopWidth: 1, borderTopColor: colors.border, padding: 16 },
  statsRow:   { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statBox:    { flex: 1, backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: 'center' },
  statVal:    { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text, marginBottom: 3 },
  statLbl:    { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },

  timeRow:    { flexDirection: 'row', gap: 12, marginBottom: 14 },
  timeItem:   { flex: 1 },
  timeLbl:    { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  timeVal:    { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim },

  ordersTitle:{ fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  orderRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  orderName:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text, flex: 1 },
  orderQty:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginRight: 10 },
  orderAmt:   { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },
});
