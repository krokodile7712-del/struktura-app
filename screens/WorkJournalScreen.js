import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Animated } from 'react-native';
import TopBar from '../components/TopBar';
import EmptyState from '../components/EmptyState';
import { useResponsive } from '../hooks/useResponsive';
import { useFocusEffect } from '@react-navigation/native';
import { getWorkJournal, getShiftOrderItems, getBusinessProfile, markTourSeen } from '../db/queries';
import { getHomeRoute, goBackSmart, can } from '../db/session';
import { colors, fonts, anim } from '../constants/theme';
import TourGuide from '../components/TourGuide';
import { useTourHighlight } from '../components/TourRegistry';

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
  const { isLandscape } = useResponsive();
  const [entries, setEntries]   = useState([]);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [itemsMap, setItemsMap] = useState({});
  const [tourOpen, setTourOpen] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(anim.slideFrom))[0];
  const searchHighlight = useTourHighlight('workjournal.search');
  const listHighlight   = useTourHighlight('workjournal.list');
  const statsHighlight  = useTourHighlight('workjournal.stats');

  const tourSteps = [
    { key: 'workjournal.search', title: 'Поиск', text: 'Найдите смену по имени сотрудника или по дате.' },
    { key: 'workjournal.list',   title: 'История смен', text: 'Тап по карточке разворачивает подробности — количество заказов, оплаты, сами позиции. Зелёная точка — смена закрыта, оранжевая — ещё открыта.' },
    { key: 'workjournal.stats',  title: 'Сводка', text: 'Общая выручка за все смены в списке и сравнение по сотрудникам — видно, только если есть право видеть выручку.' },
  ];

  // Автозапуск при первом визите в раздел
  useEffect(() => {
    try {
      const p = getBusinessProfile();
      if (!p?.tours_seen?.WorkJournal) {
        const t = setTimeout(() => setTourOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch (_) {}
  }, []);

  const load = useCallback(() => {
    try {
      setEntries(getWorkJournal({ limit: 100 }));
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: anim.fadeDuration, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, ...anim.spring, useNativeDriver: true }),
      ]).start();
    } catch(e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { fadeAnim.setValue(0); slideAnim.setValue(anim.slideFrom); load(); }, [load]));

  const toggleExpand = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!itemsMap[id]) {
      try { setItemsMap(m => ({ ...m, [id]: getShiftOrderItems(id) })); } catch(_) {}
    }
  };

  const filtered = entries.filter(e =>
    !search.trim() ||
    e.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    fmtDate(e.opened_at).includes(search)
  );

  // Сводка — итоги и разбивка по сотрудникам
  const totalRevenue = filtered.reduce((s, e) => s + (e.total_revenue || 0), 0);
  const avgRevenue = filtered.length > 0 ? totalRevenue / filtered.length : 0;
  const byEmployee = Object.values(
    filtered.reduce((acc, e) => {
      const name = e.user_name || 'Сотрудник';
      if (!acc[name]) acc[name] = { name, shifts: 0, revenue: 0 };
      acc[name].shifts += 1;
      acc[name].revenue += e.total_revenue || 0;
      return acc;
    }, {})
  ).sort((a, b) => b.revenue - a.revenue);

  return (
    <View style={styles.root}>
      <TopBar
        title="Журнал работы"
        onBack={() => goBackSmart(navigation)}
        navigation={navigation}
        activeScreen="WorkJournal"
        rightElement={
          <Pressable style={styles.tourBtn} onPress={() => setTourOpen(true)} hitSlop={10} accessibilityLabel="Подсказка" accessibilityRole="button">
            <Text style={styles.tourBtnTxt}>?</Text>
          </Pressable>
        }
      />

      <View key={isLandscape ? 'landscape' : 'portrait'} style={{ flex: 1, flexDirection: isLandscape ? 'row' : 'column' }}>
      <Animated.View style={[styles.content, { flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {/* Поиск */}
        <View style={[styles.searchWrap, { position: 'relative' }, searchHighlight.style]}>
          <TextInput
            style={styles.searchInput}
            color={colors.text}
            value={search}
            onChangeText={setSearch}
            placeholder="Поиск по сотруднику или дате..."
            placeholderTextColor={colors.muted}
          />
          {searchHighlight.overlay}
        </View>

        <View style={[{ flex: 1, position: 'relative' }, listHighlight.style]}>
        {filtered.length === 0 ? (
          <EmptyState
            icon="🕓"
            title="Нет записей"
            text="История смен появится здесь после первого закрытия смены"
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
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
                      {can('view_revenue') && <Text style={styles.cardTotal}>{fmt(entry.total_revenue)} ₽</Text>}
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
                          ...(can('view_revenue') ? [
                            { label: 'Наличные',  val: `${fmt(entry.cash_total)} ₽` },
                            { label: 'Карта',     val: `${fmt(entry.card_total)} ₽` },
                          ] : []),
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
                              {can('view_revenue') && <Text style={styles.orderAmt}>{fmt(item.total)} ₽</Text>}
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
        {listHighlight.overlay}
        </View>
      </Animated.View>

      {isLandscape && filtered.length > 0 && can('view_revenue') && (
        /* Альбомная — сводка постоянной панелью справа */
        <View style={[styles.sidePanel, { position: 'relative' }, statsHighlight.style]}>
          <Text style={styles.sideLabel}>Выручка за смены</Text>
          <Text style={styles.sideVal}>{fmt(totalRevenue)} ₽</Text>
          <Text style={styles.sideSub}>{filtered.length} смен · ср. {fmt(avgRevenue)} ₽</Text>

          <View style={styles.sideDivider} />

          <Text style={styles.sideLabel}>По сотрудникам</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 4 }}>
            {byEmployee.map((emp, i) => (
              <View key={emp.name} style={[styles.catRow, i < byEmployee.length - 1 && styles.catRowDiv]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.catName} numberOfLines={1}>{emp.name}</Text>
                  <Text style={styles.catSub}>{emp.shifts} смен</Text>
                </View>
                <Text style={styles.catVal}>{fmt(emp.revenue)} ₽</Text>
              </View>
            ))}
          </ScrollView>
          {statsHighlight.overlay}
        </View>
      )}
      </View>

      <TourGuide
        visible={tourOpen}
        onClose={() => { setTourOpen(false); markTourSeen('WorkJournal'); }}
        steps={tourSteps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
  tourBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(240,160,80,0.1)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center', justifyContent: 'center' },
  tourBtnTxt: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.orange },

  // ── Боковая панель сводки (альбомная) ──
  sidePanel:  { flex: 1, backgroundColor: colors.bg, margin: 12, marginLeft: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', padding: 20 },
  sideLabel:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  sideVal:    { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.orange, marginTop: 6 },
  sideSub:    { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },
  sideDivider:{ height: 1, backgroundColor: colors.border, marginVertical: 16 },
  catRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  catRowDiv:  { borderBottomWidth: 1, borderBottomColor: colors.borderHi },
  catName:    { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  catSub:     { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 1 },
  catVal:     { fontFamily: fonts.familyRegular, fontSize: 15, color: colors.muted, marginLeft: 8 },

  searchWrap:  { padding: 12, paddingBottom: 4, width: '100%', maxWidth: 792, alignSelf: 'center' },
  searchInput: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.borderHi, paddingVertical: 14, paddingHorizontal: 14, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 16 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTxt:  { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },
  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 19, opacity: 0.7 },

  card:       { backgroundColor: colors.surface2, borderRadius: 16, borderWidth: 1, borderColor: colors.borderHi, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  cardHeaderLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot:  { width: 9, height: 9, borderRadius: 5 },
  cardDate:   { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  cardUser:   { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },
  cardTotal:  { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  cardDuration:{ fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  chevron:    { fontSize: 20, color: colors.muted, transform: [{ rotate: '90deg' }] },
  chevronOpen:{ transform: [{ rotate: '-90deg' }] },

  cardBody:   { borderTopWidth: 1, borderTopColor: colors.borderHi, padding: 16 },
  statsRow:   { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statBox:    { flex: 1, backgroundColor: colors.surface3, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center' },
  statVal:    { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text, marginBottom: 3 },
  statLbl:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },

  timeRow:    { flexDirection: 'row', gap: 12, marginBottom: 14 },
  timeItem:   { flex: 1 },
  timeLbl:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 3 },
  timeVal:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },

  ordersTitle:{ fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  orderRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  orderName:  { fontFamily: fonts.familyRegular, fontSize: 15, color: colors.text, flex: 1 },
  orderQty:   { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginRight: 10 },
  orderAmt:   { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.orange },
});
