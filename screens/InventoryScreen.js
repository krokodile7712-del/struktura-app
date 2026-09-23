import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Animated, TextInput } from 'react-native';
import TopBar from '../components/TopBar';
import Sheet from '../components/Sheet';
import EmptyState from '../components/EmptyState';
import { useResponsive } from '../hooks/useResponsive';
import InfoTip from '../components/InfoTip';
import { useFocusEffect } from '@react-navigation/native';
import TourGuide from '../components/TourGuide';
import { useTourHighlight, useTourActiveKey } from '../components/TourRegistry';
import {
  getInventoryActs, createInventoryAct, deleteInventoryAct,
  setInventoryItemActual, confirmInventoryAct,
  getAllStock, getBusinessProfile, markTourSeen,
} from '../db/queries';
import { getHomeRoute, goBackSmart } from '../db/session';
import { colors, fonts, anim } from '../constants/theme';

const fmt = n => Math.round(n||0).toLocaleString('ru-RU');

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

const SCOPE_OPTIONS = [
  { key: 'all',      label: 'Весь склад',    hint: 'Пересчитать все позиции склада' },
  { key: 'category', label: 'По категории',  hint: 'Выбрать одну категорию товаров' },
  { key: 'manual',   label: 'Выборочно',     hint: 'Отметить конкретные позиции вручную' },
];

// Демо-акт для тура — целиком в памяти, никогда не пишется в базу
// (флаг __demo проверяется перед любым сохранением)
const DEMO_ACT = { __demo: true, id: 'demo', scope: 'all', status: 'draft', created_at: new Date().toISOString() };
const DEMO_ITEMS = [
  { id: 'demo-1', stock_name: 'Молоко, 1 л',       unit: 'л',  expected: 10,  actual: 10 },
  { id: 'demo-2', stock_name: 'Кофе (зерно)',      unit: 'кг', expected: 5,   actual: 3 },
  { id: 'demo-3', stock_name: 'Сироп ваниль',      unit: 'мл', expected: 500, actual: 500 },
];

export default function InventoryScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const [acts, setActs]             = useState([]);
  const [stock, setStock]           = useState([]);
  const [showSetup, setShowSetup]   = useState(false);
  const [scope, setScope]           = useState('all');
  const [scopeCategory, setScopeCategory] = useState('');
  const [scopeManualIds, setScopeManualIds] = useState([]);
  const [expanded, setExpanded]     = useState(null);
  const [activeAct, setActiveAct]   = useState(null);
  const [actItems, setActItems]     = useState([]);
  const [actVals, setActVals]       = useState({});
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(anim.slideFrom))[0];

  const [discrepancy, setDiscrepancy] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);
  const activeTourKey = useTourActiveKey();
  const addBtnHighlight  = useTourHighlight('inventory.addBtn');
  const scopeHighlight   = useTourHighlight('inventory.scope');
  const listHighlight    = useTourHighlight('inventory.list');
  const fillHighlightRaw    = useTourHighlight('inventory.fill');
  const confirmHighlightRaw = useTourHighlight('inventory.confirm');
  // Список позиций никогда не гасится на этих двух шагах — важно
  // продолжать видеть, что именно заполняешь/подтверждаешь. Рамку
  // получает только тот элемент, чей шаг активен именно сейчас.
  const isFillOrConfirmStep = activeTourKey === 'inventory.fill' || activeTourKey === 'inventory.confirm';
  const fillHighlight = {
    style: fillHighlightRaw.isActive ? fillHighlightRaw.style : null,
    overlay: isFillOrConfirmStep ? null : fillHighlightRaw.overlay,
  };
  const confirmHighlight = {
    style: confirmHighlightRaw.isActive ? confirmHighlightRaw.style : null,
    overlay: null,
  };
  const statsHighlight   = useTourHighlight('inventory.stats');

  const tourSteps = [
    { key: 'inventory.addBtn', title: '+ Новый акт', text: 'Отсюда начинается любая инвентаризация.' },
    { key: 'inventory.scope',  title: 'Охват пересчёта', text: '«Весь склад» — все позиции разом. «По категории» — только один раздел товаров. «Выборочно» — отметьте вручную, что именно пересчитываете.' },
    { key: 'inventory.list',   title: 'Список актов', text: 'Тап разворачивает карточку — видно позиции и расхождения. Оранжевый бейдж — сколько позиций разошлось с учётом.' },
    { key: 'inventory.fill',   title: 'Заполнение остатков', text: 'Вводите то, что реально на складе. Поле подсвечивается оранжевым, если отличается от учётного значения.', cardPosition: 'top' },
    { key: 'inventory.confirm', title: 'Подтверждение', text: 'Подтверждение необратимо переписывает остатки на складе введёнными значениями — как в жизни, пути назад нет.', cardPosition: 'top' },
    { key: 'inventory.stats', title: 'Статистика', text: 'Расхождение план/факт в деньгах по завершённым актам, и сколько позиций уже мало на складе.' },
  ];
  const demoStepKeys = new Set(['inventory.fill', 'inventory.confirm']);

  // Автозапуск при первом визите в раздел
  useEffect(() => {
    try {
      const p = getBusinessProfile();
      if (!p?.tours_seen?.Inventory) {
        const t = setTimeout(() => setTourOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch (_) {}
  }, []);

  // Шаг про охват сам открывает Sheet создания акта; шаги про заполнение
  // и подтверждение сами открывают демо-акт, закрывают его при выходе
  useEffect(() => {
    if (activeTourKey === 'inventory.scope') setShowSetup(true);
    else if (tourOpen && showSetup) setShowSetup(false);

    if (demoStepKeys.has(activeTourKey)) {
      setActiveAct(DEMO_ACT);
      setActItems(DEMO_ITEMS);
      setActVals({ 'demo-1': '10', 'demo-2': '3', 'demo-3': '500' });
    } else if (tourOpen && activeAct?.__demo) {
      setActiveAct(null);
    }
  }, [activeTourKey]);

  const load = useCallback(() => {
    try {
      const list = getInventoryActs();
      setActs(list);
      setStock(getAllStock());

      // Суммарное расхождение план/факт в деньгах по завершённым актам из списка
      try {
        const db = require('../db/database').getDb();
        const completedIds = list.filter(a => a.status === 'confirmed').map(a => a.id);
        if (completedIds.length > 0) {
          const row = db.getFirstSync(
            `SELECT SUM(diff_money) AS total FROM inventory_act_items WHERE act_id IN (${completedIds.join(',')})`
          );
          setDiscrepancy(row?.total || 0);
        } else {
          setDiscrepancy(0);
        }
      } catch (_) { setDiscrepancy(0); }

      fadeAnim.setValue(0);
      slideAnim.setValue(anim.slideFrom);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: anim.fadeDuration, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, ...anim.spring, useNativeDriver: true }),
      ]).start();
    } catch(e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAct = (act) => {
    try {
      const db = require('../db/database').getDb();
      const items = db.getAllSync('SELECT * FROM inventory_act_items WHERE act_id = ? ORDER BY stock_name', [act.id]);
      setActItems(items);
      const vals = {};
      items.forEach(i => { vals[i.id] = i.actual !== null && i.actual !== undefined ? String(i.actual) : ''; });
      setActVals(vals);
      setActiveAct(act);
    } catch(e) { console.error(e); }
  };

  const saveActItem = (itemId, val) => {
    if (typeof itemId === 'string' && itemId.startsWith('demo-')) return; // демо — никогда не пишем в базу
    try {
      const num = parseFloat(val);
      if (!isNaN(num)) setInventoryItemActual(itemId, num);
    } catch(e) {}
  };

  // Сохраняет всё введённое (включая поле, которое ещё в фокусе и не
  // потеряло его — onBlur может не успеть отработать до закрытия) и
  // только потом закрывает экран — ничего введённого не теряется
  const handleBack = () => {
    if (!activeAct?.__demo) {
      Object.entries(actVals).forEach(([id, val]) => {
        const num = parseFloat(val);
        if (!isNaN(num)) setInventoryItemActual(parseInt(id), num);
      });
    }
    setActiveAct(null);
    load();
  };

  const handleConfirm = () => {
    if (activeAct?.__demo) {
      Alert.alert('Это пример', 'В реальном акте нажатие «Подтвердить» перезапишет остатки на складе.');
      return;
    }
    Alert.alert('Подтвердить инвентаризацию?', 'Фактические остатки будут применены к складу', [
      { text: 'Отмена' },
      { text: 'Подтвердить', onPress: () => {
        try {
          // Сохраняем все введённые значения
          Object.entries(actVals).forEach(([id, val]) => {
            const num = parseFloat(val);
            if (!isNaN(num)) setInventoryItemActual(parseInt(id), num);
          });
          confirmInventoryAct(activeAct.id);
          setActiveAct(null);
          load();
        } catch(e) { Alert.alert('Ошибка', e.message); }
      }}
    ]);
  };

  const handleCreate = () => {
    try {
      const scopeValue = scope === 'category' ? scopeCategory : scope === 'manual' ? scopeManualIds.join(',') : '';
      createInventoryAct({ scope, scopeValue, locationId: null });
      setShowSetup(false);
      setScope('all');
      setScopeCategory('');
      setScopeManualIds([]);
      load();
    } catch(e) { Alert.alert('Ошибка', e.message); }
  };

  const handleDelete = (id) => {
    Alert.alert('Удалить акт?', 'Данные инвентаризации будут удалены', [
      { text: 'Отмена' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        try { deleteInventoryAct(id); load(); } catch(e) {}
      }}
    ]);
  };

  const categories = [...new Set(stock.map(s => s.category).filter(Boolean))];

  const fillContent = activeAct && (
    <>
      <View style={styles.fillPanelHeader}>
        <Pressable onPress={handleBack} style={styles.fillCloseBtn} hitSlop={8}>
          <Text style={styles.fillCloseBtnTxt}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.fillPanelTitle}>Фактические остатки</Text>
          <Text style={styles.fillPanelSub}>{SCOPE_OPTIONS.find(s => s.key === activeAct.scope)?.label || 'Инвентаризация'}</Text>
        </View>
        <Pressable style={[styles.confirmBtn, { position: 'relative' }, confirmHighlight.style]} onPress={handleConfirm}>
          <Text style={styles.confirmBtnTxt}>Подтвердить</Text>
          {confirmHighlight.overlay}
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        <View style={[styles.fillCard, { position: 'relative' }, fillHighlight.style]}>
          {actItems.length === 0 && (
            <Text style={{ padding: 16, color: colors.muted, fontFamily: fonts.familyRegular, fontSize: 14 }}>
              Список позиций пуст (actItems.length === 0)
            </Text>
          )}
          {actItems.map((item, idx) => {
            const changed = actVals[item.id] && parseFloat(actVals[item.id]) !== item.expected;
            return (
              <View key={item.id} style={[styles.fillRow, idx < actItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderHi }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fillName}>{item.stock_name}</Text>
                  <Text style={styles.fillUnit}>По системе: {fmt(item.expected)} {item.unit}</Text>
                </View>
                <TextInput
                  style={[styles.fillInput, changed && { borderColor: colors.orange, color: colors.orange }]}
                  color={colors.text}
                  value={actVals[item.id]}
                  onChangeText={v => setActVals(prev => ({ ...prev, [item.id]: v }))}
                  onBlur={() => saveActItem(item.id, actVals[item.id])}
                  keyboardType="numeric"
                  placeholder={String(item.expected)}
                  placeholderTextColor={colors.muted}
                />
              </View>
            );
          })}
          {fillHighlight.overlay}
        </View>
      </ScrollView>
    </>
  );

  return (
    <View style={styles.root}>
      <TopBar
        title="Инвентаризация"
        onBack={() => goBackSmart(navigation)}
        navigation={navigation}
        activeScreen="Inventory"
        rightElement={
          <Pressable style={styles.tourBtn} onPress={() => setTourOpen(true)} hitSlop={10} accessibilityLabel="Подсказка" accessibilityRole="button">
            <Text style={styles.tourBtnTxt}>?</Text>
          </Pressable>
        }
      />

      <View key={isLandscape ? 'landscape' : 'portrait'} style={{ flex: 1, flexDirection: isLandscape ? 'row' : 'column' }}>
      <Animated.View style={[isLandscape ? styles.leftCol : { flex: 1 }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        <Pressable style={[styles.addBtnBig, { position: 'relative' }, addBtnHighlight.style]} onPress={() => setShowSetup(true)}>
          <Text style={styles.addBtnBigTxt}>+ Новый акт</Text>
          {addBtnHighlight.overlay}
        </Pressable>

        <View style={[{ flex: 1, position: 'relative' }, listHighlight.style]}>
        {acts.length === 0 ? (
          <EmptyState
            icon="📋"
            title="Инвентаризаций ещё не было"
            text="Сверьте фактические остатки склада с тем, что в системе — так вы увидите недостачи или излишки"
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
            {acts.map((act, idx) => {
              const isOpen = expanded === act.id;
              const items = act.items || [];
              const discrepancies = items.filter(i => i.actual !== null && i.actual !== i.expected).length;

              return (
                <View key={act.id} style={[styles.card, idx > 0 && { marginTop: 10 }]}>
                  <Pressable style={styles.cardHeader} onPress={() => setExpanded(isOpen ? null : act.id)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        {SCOPE_OPTIONS.find(s => s.key === act.scope)?.label || 'Инвентаризация'}
                      </Text>
                      <Text style={styles.cardDate}>{fmtDate(act.created_at)}</Text>
                    </View>
                    <View style={styles.cardRight}>
                      {discrepancies > 0 && (
                        <View style={styles.discBadge}>
                          <Text style={styles.discBadgeTxt}>{discrepancies} расхождений</Text>
                        </View>
                      )}
                      <View style={[styles.statusBadge, { backgroundColor: act.status === 'confirmed' ? 'rgba(123,175,142,0.12)' : 'rgba(240,160,80,0.1)' }]}>
                        <Text style={[styles.statusTxt, { color: act.status === 'confirmed' ? colors.green : colors.orange }]}>
                          {act.status === 'confirmed' ? 'Завершён' : 'В процессе'}
                        </Text>
                      </View>
                      <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>›</Text>
                    </View>
                  </Pressable>

                  {isOpen && (
                    <View style={styles.cardBody}>
                      {items.length === 0 ? (
                        <Text style={styles.noItems}>Позиции не добавлены</Text>
                      ) : (
                        <>
                          <View style={styles.tableHeader}>
                            <Text style={[styles.tableHd, { flex: 2 }]}>Позиция</Text>
                            <Text style={styles.tableHd}>По системе</Text>
                            <Text style={styles.tableHd}>Факт</Text>
                            <Text style={styles.tableHd}>Разница</Text>
                          </View>
                          {items.map((item, ii) => {
                            const hasActual = item.actual !== null && item.actual !== undefined;
                            const diff = hasActual ? item.actual - (item.expected || 0) : 0;
                            return (
                              <View key={ii} style={[styles.tableRow, ii < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                                <Text style={[styles.tableName, { flex: 2 }]} numberOfLines={1}>{item.stock_name}</Text>
                                <Text style={styles.tableVal}>{fmt(item.expected)}</Text>
                                <Text style={styles.tableVal}>{hasActual ? fmt(item.actual) : '—'}</Text>
                                <Text style={[styles.tableDiff, { color: !hasActual ? colors.muted : diff === 0 ? colors.muted : diff > 0 ? colors.green : colors.red }]}>
                                  {hasActual ? (diff > 0 ? '+' : '') + fmt(diff) : '—'}
                                </Text>
                              </View>
                            );
                          })}
                        </>
                      )}

                      {act.status === 'draft' && (
                          <Pressable style={styles.fillBtn} onPress={() => openAct(act)}>
                            <Text style={styles.fillBtnTxt}>Заполнить фактические остатки →</Text>
                          </Pressable>
                        )}
                      <Pressable style={styles.deleteBtn} onPress={() => handleDelete(act.id)}>
                        <Text style={styles.deleteBtnTxt}>Удалить акт</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
        {listHighlight.overlay}
        </View>

        {!isLandscape && (
          <View style={[styles.infoCard, { marginTop: 16, marginHorizontal: 16, marginBottom: 16 }]}>
            <Text style={styles.infoTitle}>Что такое инвентаризация?</Text>
            <Text style={styles.infoTxt}>
              Сверка фактических остатков с данными в системе. Помогает выявить расхождения — недостачи или излишки. Проводится периодически или по необходимости.
            </Text>
          </View>
        )}
      </Animated.View>

      {isLandscape && (
        /* Альбомная — заполнение остатков, если акт открыт; иначе подсказка + статистика */
        <View style={styles.sidePanel}>
          {activeAct ? fillContent : (
            <>
              <View style={styles.infoCardBig}>
                <Text style={styles.infoTitleBig}>Что такое инвентаризация?</Text>
                <Text style={styles.infoTxtBig}>
                  Сверка фактических остатков с данными в системе. Помогает выявить расхождения — недостачи или излишки. Проводится периодически или по необходимости.
                </Text>
              </View>

              {(acts.length > 0 || activeTourKey === 'inventory.stats') && (
                <View style={[{ width: '100%', maxWidth: 620, alignSelf: 'center', position: 'relative', marginTop: 16, padding: 12 }, statsHighlight.style]}>
                  <Text style={styles.sideLabel}>Актов всего</Text>
                  <Text style={styles.sideVal}>{acts.length}</Text>
                  <Text style={styles.sideSub}>
                    {acts.filter(a => a.status === 'confirmed').length} завершено · {acts.filter(a => a.status !== 'confirmed').length} в процессе
                  </Text>

                  <View style={styles.sideDivider} />

                  <Text style={styles.sideLabel}>Расхождение план/факт</Text>
                  <Text style={[styles.sideVal, { fontSize: 26, color: discrepancy >= 0 ? colors.green : colors.red }]}>
                    {discrepancy >= 0 ? '+' : ''}{fmt(discrepancy)} ₽
                  </Text>
                  <Text style={styles.sideSub}>
                    {discrepancy >= 0 ? 'Найдено больше, чем ожидалось' : 'Недостача по завершённым актам'}
                  </Text>

                  <View style={styles.sideDivider} />

                  <Text style={styles.sideLabel}>Мало на складе</Text>
                  <Text style={styles.sideSub}>
                    {stock.filter(s => s['остаток'] <= (s.threshold || 0)).length} позиций ниже порога
                  </Text>
                  {statsHighlight.overlay}
                </View>
              )}
            </>
          )}
        </View>
      )}
      </View>

      {/* Портрет — заполнение остатков через Sheet, как и остальные формы в приложении */}
      {!isLandscape && (
        <Sheet visible={!!activeAct} onClose={handleBack} title="Фактические остатки">
          {activeAct && (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20 }}>
              <Text style={styles.fillPanelSub}>{SCOPE_OPTIONS.find(s => s.key === activeAct.scope)?.label || 'Инвентаризация'}</Text>
              <View style={[styles.fillCard, { marginTop: 12, position: 'relative' }, fillHighlight.style]}>
                {actItems.map((item, idx) => {
                  const changed = actVals[item.id] && parseFloat(actVals[item.id]) !== item.expected;
                  return (
                    <View key={item.id} style={[styles.fillRow, idx < actItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderHi }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fillName}>{item.stock_name}</Text>
                        <Text style={styles.fillUnit}>По системе: {fmt(item.expected)} {item.unit}</Text>
                      </View>
                      <TextInput
                        style={[styles.fillInput, changed && { borderColor: colors.orange, color: colors.orange }]}
                        color={colors.text}
                        value={actVals[item.id]}
                        onChangeText={v => setActVals(prev => ({ ...prev, [item.id]: v }))}
                        onBlur={() => saveActItem(item.id, actVals[item.id])}
                        keyboardType="numeric"
                        placeholder={String(item.expected)}
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                  );
                })}
                {fillHighlight.overlay}
              </View>
              <Pressable style={[styles.confirmBtn, { marginTop: 20, alignSelf: 'stretch', paddingVertical: 15, position: 'relative' }, confirmHighlight.style]} onPress={handleConfirm}>
                <Text style={[styles.confirmBtnTxt, { textAlign: 'center', fontSize: 16 }]}>Подтвердить</Text>
                {confirmHighlight.overlay}
              </Pressable>
            </ScrollView>
          )}
        </Sheet>
      )}

      {/* Модалка создания акта */}
      <Sheet visible={showSetup} onClose={() => setShowSetup(false)} title="Новый акт инвентаризации">
        <View style={{ padding: 20 }}>
            <Text style={styles.modalSub}>Выберите охват пересчёта</Text>

            <View style={[styles.scopeList, { position: 'relative' }, scopeHighlight.style]}>
              {SCOPE_OPTIONS.map((s, idx) => (
                <Pressable
                  key={s.key}
                  style={[styles.scopeRow, idx < SCOPE_OPTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }, scope === s.key && styles.scopeRowActive]}
                  onPress={() => setScope(s.key)}
                >
                  <View style={[styles.scopeCheck, scope === s.key && styles.scopeCheckActive]}>
                    {scope === s.key && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.scopeLabel, scope === s.key && { color: colors.orange }]}>{s.label}</Text>
                    <Text style={styles.scopeHint}>{s.hint}</Text>
                  </View>
                </Pressable>
              ))}
              {scopeHighlight.overlay}
            </View>

            {scope === 'category' && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.modalSub}>Какая категория</Text>
                {categories.length === 0 ? (
                  <Text style={styles.scopeHint}>На складе пока нет ни одной категории</Text>
                ) : (
                  <View style={styles.catChips}>
                    {categories.map(cat => (
                      <Pressable key={cat} style={[styles.catChip, scopeCategory === cat && styles.catChipActive]} onPress={() => setScopeCategory(cat)}>
                        <Text style={[styles.catChipTxt, scopeCategory === cat && styles.catChipTxtActive]}>{cat}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {scope === 'manual' && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.modalSub}>Какие позиции ({scopeManualIds.length} выбрано)</Text>
                <ScrollView style={styles.manualList} keyboardShouldPersistTaps="handled">
                  {stock.map((s, idx) => {
                    const checked = scopeManualIds.includes(s.id);
                    return (
                      <Pressable
                        key={s.id}
                        style={[styles.manualRow, idx < stock.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                        onPress={() => setScopeManualIds(prev => checked ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                      >
                        <View style={[styles.scopeCheck, checked && styles.scopeCheckActive]}>
                          {checked && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                        </View>
                        <Text style={styles.manualName} numberOfLines={1}>{s.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <Pressable
              style={[styles.createBtn, ((scope === 'category' && !scopeCategory) || (scope === 'manual' && scopeManualIds.length === 0)) && { opacity: 0.4 }]}
              disabled={(scope === 'category' && !scopeCategory) || (scope === 'manual' && scopeManualIds.length === 0)}
              onPress={handleCreate}
            >
              <Text style={styles.createBtnTxt}>Начать инвентаризацию</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setShowSetup(false)}>
              <Text style={styles.cancelBtnTxt}>Отмена</Text>
            </Pressable>
        </View>
      </Sheet>

      <TourGuide
        visible={tourOpen}
        remountSignal={showSetup}
        onClose={() => {
          setTourOpen(false);
          markTourSeen('Inventory');
          if (activeAct?.__demo) setActiveAct(null);
          if (showSetup) setShowSetup(false);
        }}
        steps={tourSteps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg },
  tourBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(240,160,80,0.1)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center', justifyContent: 'center' },
  tourBtnTxt: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.orange },

  // ── Боковая панель сводки (альбомная) ──
  sidePanel:  { flex: 1, backgroundColor: colors.bg, margin: 12, marginLeft: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', padding: 20 },
  leftCol:    { flex: 0, width: '38%', maxWidth: 480, marginTop: 12, marginBottom: 12, marginLeft: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.borderHi, overflow: 'hidden', backgroundColor: colors.surface2 },
  addBtnBig:  { marginHorizontal: 16, marginTop: 16, marginBottom: 8, paddingVertical: 16, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  addBtnBigTxt: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: '#fff' },

  infoCard:  { margin: 12, backgroundColor: 'rgba(139,127,212,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(139,127,212,0.2)', padding: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  infoTitle: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.indigo, marginBottom: 6 },
  infoTxt:   { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, lineHeight: 20 },

  // Та же подсказка, но крупнее и с отступом сверху — для боковой панели
  // в альбомной, не прижата к самому верху под шапкой
  infoCardBig: { marginTop: 24, backgroundColor: 'rgba(139,127,212,0.08)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(139,127,212,0.25)', padding: 20, width: '100%', maxWidth: 620, alignSelf: 'center' },
  infoTitleBig: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.indigo, marginBottom: 8 },
  infoTxtBig:   { fontFamily: fonts.familyRegular, fontSize: 15, color: colors.textDim, lineHeight: 22 },
  sideLabel:  { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  sideVal:    { fontFamily: fonts.family, fontSize: 30, fontWeight: '800', color: colors.orange, marginTop: 6 },
  sideSub:    { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  sideDivider:{ height: 1, backgroundColor: colors.border, marginVertical: 16 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTxt:  { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 18, opacity: 0.7 },

  card:       { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  cardTitle:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 2 },
  cardDate:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  cardRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discBadge:  { backgroundColor: 'rgba(217,95,95,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  discBadgeTxt: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.red },
  statusBadge:{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusTxt:  { fontFamily: fonts.familySemibold, fontSize: 11 },
  chevron:    { fontSize: 20, color: colors.muted, transform: [{ rotate: '90deg' }] },
  chevronOpen:{ transform: [{ rotate: '-90deg' }] },

  cardBody:   { borderTopWidth: 1, borderTopColor: colors.border, padding: 16 },
  noItems:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 12 },

  tableHeader:{ flexDirection: 'row', marginBottom: 8 },
  tableHd:    { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, width: 70, textAlign: 'right' },
  tableRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  tableName:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text },
  tableVal:   { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, width: 70, textAlign: 'right' },
  tableDiff:  { fontFamily: fonts.familySemibold, fontSize: 13, width: 70, textAlign: 'right' },

  deleteBtn:  { marginTop: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(217,95,95,0.3)', backgroundColor: 'rgba(217,95,95,0.06)', alignItems: 'center' },
  deleteBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.red },

  fillBtn:    { marginTop: 14, marginBottom: 8, paddingVertical: 13, borderRadius: 12, backgroundColor: 'rgba(240,160,80,0.12)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center' },
  fillBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },

  // ─── Заполнение фактических остатков — встроено в правую колонку/Sheet ──
  fillPanelHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 16, gap: 12 },
  fillCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  fillCloseBtnTxt: { fontSize: 15, color: colors.muted, fontWeight: '700' },
  fillPanelTitle:  { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },
  fillPanelSub:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  confirmBtn: { backgroundColor: colors.orange, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18 },
  confirmBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: '#fff' },

  fillCard:   { backgroundColor: colors.surface2, borderRadius: 16, borderWidth: 1, borderColor: colors.borderHi, overflow: 'hidden' },
  fillRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  fillName:   { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  fillUnit:   { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  fillInput:  { width: 110, backgroundColor: colors.surface3, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 12, fontFamily: fonts.familySemibold, fontSize: 15, textAlign: 'right', color: colors.text },

  addBtn:     { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(240,160,80,0.12)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)' },
  addBtnTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  modalBox:   { width: '50%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  modalTitle: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 },
  modalSub:   { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 20 },

  scopeList:  { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 16 },
  catChips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip:    { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  catChipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.1)' },
  catChipTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  catChipTxtActive: { color: colors.orange },
  manualList: { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', maxHeight: 260 },
  manualRow:  { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  manualName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text, flex: 1 },
  scopeRow:   { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  scopeRowActive: { backgroundColor: 'rgba(240,160,80,0.06)' },
  scopeCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  scopeCheckActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  scopeLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 2 },
  scopeHint:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  createBtn:  { backgroundColor: colors.orange, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  createBtnTxt: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff' },
  cancelBtn:  { paddingVertical: 12, alignItems: 'center' },
  cancelBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
});
