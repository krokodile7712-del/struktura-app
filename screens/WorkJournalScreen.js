import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Animated, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import TopBar from '../components/TopBar';
import Sheet from '../components/Sheet';
import EmptyState from '../components/EmptyState';
import { useResponsive } from '../hooks/useResponsive';
import { useFocusEffect } from '@react-navigation/native';
import {
  getWorkJournal, getShiftOrderItems, getBusinessProfile, markTourSeen,
  getAllEmployeesSalary, calcEmployeeSalary, updateShiftHours,
  openShift, closeShift, getOpenShift,
} from '../db/queries';
import { getHomeRoute, goBackSmart, can, getSession } from '../db/session';
import { colors, fonts, anim } from '../constants/theme';
import TourGuide from '../components/TourGuide';
import { useTourHighlight } from '../components/TourRegistry';
import { useToast } from '../components/Toast';

const fmt = n => Math.round(n||0).toLocaleString('ru-RU');
const todayStr    = () => new Date().toISOString().slice(0, 10);
const weekAgoStr  = () => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().slice(0,10); };
const monthStartStr = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); };
const SALARY_PERIODS = [
  { key: 'month', label: 'Этот месяц', from: monthStartStr, to: todayStr },
  { key: 'week',  label: 'Неделя',     from: weekAgoStr,     to: todayStr },
  { key: 'today', label: 'Сегодня',    from: todayStr,       to: todayStr },
];

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
  const toast = useToast();
  const [mainTab, setMainTab] = useState('shifts'); // shifts | salary
  const [entries, setEntries]   = useState([]);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null); // портрет — разворот на месте
  const [selected, setSelected] = useState(null); // альбомная — подробности справа
  const [itemsMap, setItemsMap] = useState({});
  const [tourOpen, setTourOpen] = useState(false);

  // Зарплата
  const [salaryPeriod, setSalaryPeriod] = useState('month');
  const salaryFrom = SALARY_PERIODS.find(p => p.key === salaryPeriod).from();
  const salaryTo = SALARY_PERIODS.find(p => p.key === salaryPeriod).to();
  const [salaryList, setSalaryList] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null); // выбранный сотрудник (детализация)
  const [empDetail, setEmpDetail] = useState(null); // calcEmployeeSalary(selectedEmp.user.id, ...)
  const [editingShiftId, setEditingShiftId] = useState(null); // id смены, для которой сейчас правим часы
  const [editDate, setEditDate] = useState(new Date());
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [showEditTimePicker, setShowEditTimePicker] = useState(false);

  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(anim.slideFrom))[0];
  const searchHighlight = useTourHighlight('workjournal.search');
  const listHighlight   = useTourHighlight('workjournal.list');
  const statsHighlight  = useTourHighlight('workjournal.stats');

  const tourSteps = [
    { key: 'workjournal.search', title: 'Поиск', text: 'Найдите смену по имени сотрудника или по дате.' },
    { key: 'workjournal.list',   title: 'История смен', text: 'Тап по карточке показывает подробности — количество заказов, оплаты, сами позиции. Зелёная точка — смена закрыта, оранжевая — ещё открыта.' },
    { key: 'workjournal.stats',  title: 'Сводка', text: 'Общая выручка за все смены в списке и сравнение по сотрудникам.' },
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

  const selectEntry = (entry) => {
    setSelected(s => s?.id === entry.id ? null : entry);
    if (!itemsMap[entry.id]) {
      try { setItemsMap(m => ({ ...m, [entry.id]: getShiftOrderItems(entry.id) })); } catch(_) {}
    }
  };

  const onCardPress = (entry) => isLandscape ? selectEntry(entry) : toggleExpand(entry.id);

  // ─── Зарплата ───────────────────────────────────────────────────────────
  const loadSalary = useCallback(() => {
    try { setSalaryList(getAllEmployeesSalary(salaryFrom, salaryTo)); } catch (e) { console.error(e); }
  }, [salaryFrom, salaryTo]);

  useEffect(() => {
    if (mainTab === 'salary') loadSalary();
  }, [mainTab, salaryPeriod]);

  const selectEmployee = (row) => {
    setSelectedEmp(row);
    try { setEmpDetail(calcEmployeeSalary(row.user.id, salaryFrom, salaryTo)); } catch (e) { console.error(e); }
  };

  const backToSalaryList = () => { setSelectedEmp(null); setEmpDetail(null); };

  const refreshEmpDetail = () => {
    if (!selectedEmp) return;
    try {
      setEmpDetail(calcEmployeeSalary(selectedEmp.user.id, salaryFrom, salaryTo));
      loadSalary();
    } catch (e) { console.error(e); }
  };

  const startEditShift = (shiftId, currentClosedAt) => {
    setEditingShiftId(shiftId);
    setEditDate(currentClosedAt ? new Date(currentClosedAt) : new Date());
  };

  const saveShiftEdit = () => {
    if (!editingShiftId) return;
    try {
      updateShiftHours(editingShiftId, editDate.toISOString());
      toast.show('Часы смены обновлены');
      setEditingShiftId(null);
      refreshEmpDetail();
    } catch (e) { console.error(e); toast.show('Ошибка сохранения', 'warn'); }
  };

  // Открыть/закрыть смену за сотрудника — тот же openShift/closeShift, что
  // и обычный ход дел, просто userId берётся не из своей сессии, а из
  // выбранного в списке сотрудника. Доступно только администратору.
  const toggleShiftForEmployee = (row) => {
    const open = getOpenShift(row.user.id);
    if (open) {
      Alert.alert('Закрыть смену?', `${row.user.name} — смена закроется прямо сейчас.`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Закрыть', onPress: () => {
          try { closeShift(open.id); toast.show('Смена закрыта'); refreshEmpDetail(); } catch (e) { console.error(e); }
        } },
      ]);
    } else {
      Alert.alert('Открыть смену?', `Смена откроется за ${row.user.name}, начиная с текущего момента.`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть', onPress: () => {
          try { openShift(0, row.user.id, row.user.name); toast.show('Смена открыта'); refreshEmpDetail(); } catch (e) { console.error(e); }
        } },
      ]);
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

  const empDetailContent = selectedEmp && empDetail && (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Pressable onPress={backToSalaryList} style={styles.backToSummary} hitSlop={8}>
        <Text style={styles.backToSummaryTxt}>← Все сотрудники</Text>
      </Pressable>

      <Text style={styles.sideShiftDate}>{selectedEmp.user.name}</Text>
      <Text style={styles.sideShiftUser}>{empDetail.hours} ч за период</Text>

      <View style={[styles.statsRow, { marginTop: 16 }]}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{fmt(empDetail.base)} ₽</Text>
          <Text style={styles.statLbl}>База</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{fmt(empDetail.kpiBonus)} ₽</Text>
          <Text style={styles.statLbl}>Премия KPI</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: colors.orange }]}>{fmt(empDetail.total)} ₽</Text>
          <Text style={styles.statLbl}>Итого</Text>
        </View>
      </View>

      {getSession()?.role === 'admin' && (
        <Pressable style={styles.shiftToggleBtn} onPress={() => toggleShiftForEmployee(selectedEmp)}>
          <Text style={styles.shiftToggleBtnTxt}>
            {getOpenShift(selectedEmp.user.id) ? '⏹ Закрыть смену сейчас' : '▶ Открыть смену сейчас'}
          </Text>
        </Pressable>
      )}

      <Text style={styles.ordersTitle}>Смены за период</Text>
      {empDetail.shiftBreakdown.length === 0 ? (
        <Text style={styles.cardUser}>Смен за этот период нет</Text>
      ) : (
        empDetail.shiftBreakdown.map((s, ii, arr) => (
          <View key={s.id} style={[styles.shiftEditRow, ii < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderName}>{fmtDate(s.opened_at)}</Text>
              <Text style={styles.orderQty}>
                {s.closed_at ? `→ ${fmtDate(s.closed_at)}` : 'ещё открыта'}
                {s.hoursEdited ? ' · часы скорректированы' : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.orderAmt}>{s.hours != null ? `${s.hours} ч` : '—'}</Text>
              {s.pay != null && <Text style={styles.orderQty}>{fmt(s.pay)} ₽</Text>}
            </View>
            <Pressable style={styles.editHoursBtn} onPress={() => startEditShift(s.id, s.closed_at)} hitSlop={8}>
              <Text style={styles.editHoursBtnTxt}>✎</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );

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

      <View style={styles.mainTabBar}>
        <Pressable style={[styles.mainTabBtn, mainTab === 'shifts' && styles.mainTabBtnActive]} onPress={() => setMainTab('shifts')}>
          <Text style={[styles.mainTabTxt, mainTab === 'shifts' && styles.mainTabTxtActive]}>Смены</Text>
        </Pressable>
        <Pressable style={[styles.mainTabBtn, mainTab === 'salary' && styles.mainTabBtnActive]} onPress={() => setMainTab('salary')}>
          <Text style={[styles.mainTabTxt, mainTab === 'salary' && styles.mainTabTxtActive]}>Зарплата</Text>
        </Pressable>
      </View>

      {mainTab === 'shifts' && (
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
              const isOpen = isLandscape ? selected?.id === entry.id : expanded === entry.id;
              const duration = fmtDuration(entry.opened_at, entry.closed_at);
              const items = itemsMap[entry.id] || [];

              return (
                <View key={entry.id} style={[styles.card, idx > 0 && { marginTop: 10 }, isLandscape && isOpen && styles.cardActive]}>
                  {/* Шапка смены */}
                  <Pressable style={styles.cardHeader} onPress={() => onCardPress(entry)}>
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

                  {/* Статистика — только в портрете, разворачивается на месте; в альбомной уходит в панель справа */}
                  {!isLandscape && isOpen && (
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

      {isLandscape && (
        <View style={[styles.sidePanel, { position: 'relative' }, statsHighlight.style]}>
          {selected ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable onPress={() => setSelected(null)} style={styles.backToSummary} hitSlop={8}>
                <Text style={styles.backToSummaryTxt}>← Все смены</Text>
              </Pressable>

              <Text style={styles.sideShiftDate}>{fmtDate(selected.opened_at)}</Text>
              <Text style={styles.sideShiftUser}>{selected.user_name || 'Сотрудник'}</Text>

              <View style={[styles.statsRow, { marginTop: 16 }]}>
                {[
                  { label: 'Заказов',   val: selected.order_count || 0 },
                  ...(can('view_revenue') ? [
                    { label: 'Наличные',  val: `${fmt(selected.cash_total)} ₽` },
                    { label: 'Карта',     val: `${fmt(selected.card_total)} ₽` },
                  ] : []),
                ].map((s, i) => (
                  <View key={i} style={styles.statBox}>
                    <Text style={styles.statVal}>{s.val}</Text>
                    <Text style={styles.statLbl}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.timeRow}>
                <View style={styles.timeItem}>
                  <Text style={styles.timeLbl}>Открыта</Text>
                  <Text style={styles.timeVal}>{fmtDate(selected.opened_at)}</Text>
                </View>
                {selected.closed_at && (
                  <View style={styles.timeItem}>
                    <Text style={styles.timeLbl}>Закрыта</Text>
                    <Text style={styles.timeVal}>{fmtDate(selected.closed_at)}</Text>
                  </View>
                )}
              </View>

              {(itemsMap[selected.id] || []).length > 0 && (
                <>
                  <Text style={styles.ordersTitle}>Заказы смены</Text>
                  {(itemsMap[selected.id] || []).map((item, ii, arr) => (
                    <View key={ii} style={[styles.orderRow, ii < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                      <Text style={styles.orderName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.orderQty}>×{item.quantity}</Text>
                      {can('view_revenue') && <Text style={styles.orderAmt}>{fmt(item.total)} ₽</Text>}
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          ) : filtered.length > 0 && can('view_revenue') ? (
            <>
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
            </>
          ) : (
            <EmptyState icon="🕓" title="Выберите смену" text="Тап по карточке слева покажет её подробности здесь" />
          )}
          {statsHighlight.overlay}
        </View>
      )}
      </View>
      )}

      {mainTab === 'salary' && (
      <View key={isLandscape ? 'landscape-salary' : 'portrait-salary'} style={{ flex: 1, flexDirection: isLandscape ? 'row' : 'column' }}>
        <View style={{ flex: 1 }}>
          {(!isLandscape && selectedEmp) ? (
            empDetailContent
          ) : (
            <>
              <View style={styles.periodRow}>
                {SALARY_PERIODS.map(p => (
                  <Pressable
                    key={p.key}
                    style={[styles.periodBtn, salaryPeriod === p.key && styles.periodBtnActive]}
                    onPress={() => setSalaryPeriod(p.key)}
                  >
                    <Text style={[styles.periodTxt, salaryPeriod === p.key && styles.periodTxtActive]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>

              {salaryList.length === 0 ? (
                <EmptyState icon="💰" title="Нет активных сотрудников" text="Добавьте сотрудников в разделе «Сотрудники»" />
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
                  {salaryList.map((row, idx) => (
                    <Pressable
                      key={row.user.id}
                      style={[styles.card, idx > 0 && { marginTop: 10 }, isLandscape && selectedEmp?.user.id === row.user.id && styles.cardActive]}
                      onPress={() => selectEmployee(row)}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardHeaderLeft}>
                          <View style={[styles.statusDot, { backgroundColor: getOpenShift(row.user.id) ? colors.green : colors.border }]} />
                          <View>
                            <Text style={styles.cardDate}>{row.user.name}</Text>
                            <Text style={styles.cardUser}>{row.hours} ч{row.kpiBonus > 0 ? ` · премия ${fmt(row.kpiBonus)} ₽` : ''}</Text>
                          </View>
                        </View>
                        <View style={styles.cardHeaderRight}>
                          <Text style={styles.cardTotal}>{fmt(row.total)} ₽</Text>
                          <Text style={styles.chevron}>›</Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </View>

        {isLandscape && (
          <View style={styles.sidePanel}>
            {empDetailContent || (
              <EmptyState icon="💰" title="Выберите сотрудника" text="Тап по карточке слева покажет начисление и смены за период" />
            )}
          </View>
        )}
      </View>
      )}

      <Sheet
        visible={!!editingShiftId}
        onClose={() => setEditingShiftId(null)}
        title="Время закрытия смены"
      >
        <View style={{ padding: 20 }}>
          <Text style={styles.editHint}>
            Для случаев, когда сотрудник ушёл, не закрыв смену в приложении — укажите, когда смена реально закончилась.
          </Text>

          <Text style={styles.fieldLabel}>Дата</Text>
          <Pressable style={styles.editInput} onPress={() => setShowEditDatePicker(true)}>
            <Text style={styles.editInputTxt}>{editDate.toLocaleDateString('ru-RU')}</Text>
          </Pressable>

          <Text style={styles.fieldLabel}>Время</Text>
          <Pressable style={styles.editInput} onPress={() => setShowEditTimePicker(true)}>
            <Text style={styles.editInputTxt}>{editDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Text>
          </Pressable>

          {showEditDatePicker && (
            <DateTimePicker
              value={editDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
              onChange={(event, selectedDate) => {
                setShowEditDatePicker(Platform.OS === 'ios');
                if (event.type !== 'dismissed' && selectedDate) {
                  setEditDate(d => {
                    const nd = new Date(d);
                    nd.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                    return nd;
                  });
                }
              }}
            />
          )}
          {Platform.OS === 'ios' && showEditDatePicker && (
            <Pressable style={styles.pickerDoneBtn} onPress={() => setShowEditDatePicker(false)}>
              <Text style={styles.pickerDoneBtnTxt}>Готово</Text>
            </Pressable>
          )}

          {showEditTimePicker && (
            <DateTimePicker
              value={editDate}
              mode="time"
              display="spinner"
              is24Hour
              onChange={(event, selectedDate) => {
                setShowEditTimePicker(Platform.OS === 'ios');
                if (event.type !== 'dismissed' && selectedDate) {
                  setEditDate(d => {
                    const nd = new Date(d);
                    nd.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
                    return nd;
                  });
                }
              }}
            />
          )}
          {Platform.OS === 'ios' && showEditTimePicker && (
            <Pressable style={styles.pickerDoneBtn} onPress={() => setShowEditTimePicker(false)}>
              <Text style={styles.pickerDoneBtnTxt}>Готово</Text>
            </Pressable>
          )}

          <Pressable style={styles.saveEditBtn} onPress={saveShiftEdit}>
            <Text style={styles.saveEditBtnTxt}>Сохранить</Text>
          </Pressable>
        </View>
      </Sheet>

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
  backToSummary: { marginBottom: 16 },
  backToSummaryTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  sideShiftDate: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text },
  sideShiftUser: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },
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
  cardActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.06)' },
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

  // ── Переключатель вкладок Смены/Зарплата ──
  mainTabBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface },
  mainTabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  mainTabBtnActive: { backgroundColor: 'rgba(240,160,80,0.12)' },
  mainTabTxt: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  mainTabTxtActive: { color: colors.orange },

  // ── Зарплата: период, детализация, правка часов ──
  periodRow:  { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.borderHi },
  periodBtn:  { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  periodBtnActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  periodTxt:  { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  periodTxtActive: { color: colors.orange },

  shiftToggleBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.borderHi, alignItems: 'center' },
  shiftToggleBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },

  shiftEditRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 },
  editHoursBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  editHoursBtnTxt: { fontSize: 15, color: colors.muted },

  editHint: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 16 },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, marginTop: 14, marginBottom: 6 },
  editInput: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 13 },
  editInputTxt: { fontFamily: fonts.familyRegular, fontSize: 16, color: colors.text },
  pickerDoneBtn: { marginTop: 10, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center' },
  pickerDoneBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  saveEditBtn: { marginTop: 20, paddingVertical: 15, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  saveEditBtnTxt: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: '#fff' },
});
