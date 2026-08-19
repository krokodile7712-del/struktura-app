import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Animated } from 'react-native';
import TopBar from '../components/TopBar';
import { useResponsive } from '../hooks/useResponsive';
import AppNav from '../components/AppNav';
import InfoTip from '../components/InfoTip';
import Toggle from '../components/Toggle';
import { useFocusEffect } from '@react-navigation/native';
import DatePicker from '../components/DatePicker';
import { getEquipment, addEquipment, updateEquipment, deleteEquipment, getAllProducts } from '../db/queries';
import { getHomeRoute, goBackSmart } from '../db/session';
import { colors, fonts, anim } from '../constants/theme';

const AMORT_TYPES = [
  { key: 'linear',     label: 'Линейная',   hint: 'Стоимость ÷ срок (мес.) = сумма в месяц. Не зависит от загрузки.' },
  { key: 'production', label: 'По циклам',  hint: 'Стоимость ÷ ресурс (циклов) = стоимость за 1 цикл использования.' },
  { key: 'mixed',      label: 'Смешанная',  hint: 'Линейная + учёт циклов для контроля износа.' },
];
const COUNTER_TYPES = [
  { key: 'order',   label: 'Каждый заказ',   hint: 'Счётчик растёт при каждом оформленном заказе.' },
  { key: 'product', label: 'Продажа товара',  hint: 'Счётчик растёт только при продаже выбранного товара.' },
  { key: 'shift',   label: 'Каждая смена',    hint: 'Счётчик растёт при каждом закрытии смены — даже если продаж не было.' },
];
const EMPTY = { name: '', cost: '', purchase_date: '', amort_type: 'linear', amort_period: '36', amort_cycles: '0', counter_type: 'order', counter_product_id: null, cycles_per_use: '1' };

const fmt = n => (n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 });

function amortMonthly(eq) {
  if (!eq?.cost) return 0;
  if (eq.amort_type === 'linear' || eq.amort_type === 'mixed') {
    const months = parseInt(eq.amort_period) || 36;
    return Math.round(parseFloat(eq.cost) / months);
  }
  return 0;
}

function wearPct(eq) {
  if (!eq) return 0;
  if (eq.amort_type === 'production' || eq.amort_type === 'mixed') {
    const total = parseInt(eq.amort_cycles) || 1;
    return Math.min(100, Math.round((eq.current_cycles || 0) / total * 100));
  }
  if (eq.purchase_date) {
    const months = Math.floor((Date.now() - new Date(eq.purchase_date)) / 2592000000);
    const period = parseInt(eq.amort_period) || 36;
    return Math.min(100, Math.round(months / period * 100));
  }
  return 0;
}

export default function EquipmentScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const [items, setItems]       = useState([]);
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft]       = useState(null);
  const [isNew, setIsNew]       = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(20))[0];

  const load = useCallback(() => {
    try {
      setItems(getEquipment());
      setProducts(getAllProducts());
    } catch(e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setIsNew(true);
    setDraft({ ...EMPTY });
    setSelected(null);
    animate();
  };

  const openEdit = (item) => {
    setIsNew(false);
    setDraft({ ...EMPTY, ...item, cost: String(item.cost || ''), amort_period: String(item.amort_period || '36'), amort_cycles: String(item.amort_cycles || '0'), cycles_per_use: String(item.cycles_per_use || '1') });
    setSelected(item);
    animate();
  };

  const animate = () => {
    fadeAnim.setValue(0); slideAnim.setValue(anim.slideFrom);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: anim.fadeDuration, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, ...anim.spring, useNativeDriver: true }),
    ]).start();
  };

  const handleSave = () => {
    if (!draft.name.trim()) { Alert.alert('Введите название'); return; }
    try {
      const data = { ...draft, cost: parseFloat(draft.cost)||0, amort_period: parseInt(draft.amort_period)||36, amort_cycles: parseInt(draft.amort_cycles)||0, cycles_per_use: parseInt(draft.cycles_per_use)||1 };
      if (isNew) addEquipment(data);
      else updateEquipment(selected.id, data);
      load();
      setDraft(null);
      setSelected(null);
    } catch(e) { Alert.alert('Ошибка', e.message); }
  };

  const handleDelete = () => {
    Alert.alert('Удалить оборудование?', selected?.name, [
      { text: 'Отмена' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        try { deleteEquipment(selected.id); load(); setDraft(null); setSelected(null); } catch(e) {}
      }}
    ]);
  };

  return (
    <View style={styles.root}>
      <TopBar
        title="Оборудование"
        onBack={() => goBackSmart(navigation)}
        rightElement={
          <Pressable style={styles.addBtn} onPress={openNew}>
            <Text style={styles.addBtnTxt}>+ Добавить</Text>
          </Pressable>
        }
      />

      <View style={[{ flex: 1 }, isLandscape && { flexDirection: 'row' }]}>
        {isLandscape && <AppNav navigation={navigation} activeScreen="Equipment" />}
        <View style={{ flex: 1 }}>

      <View style={styles.layout}>

        {/* Левая панель */}
        <View style={styles.left}>
          <Text style={styles.listHint}>Оборудование и его износ</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTxt}>Нет оборудования</Text>
                <Text style={styles.emptyHint}>Добавьте станок, холодильник и другую технику чтобы отслеживать амортизацию</Text>
              </View>
            ) : (
              <View style={styles.listCard}>
                {items.map((item, idx) => {
                  const wear = wearPct(item);
                  const isActive = selected?.id === item.id;
                  const monthly = amortMonthly(item);
                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.itemRow,
                        idx < items.length - 1 && styles.itemRowDiv,
                        isActive && styles.itemRowActive,
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={() => openEdit(item)}
                    >
                      {isActive && <View style={styles.activeBar} />}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemName, isActive && { color: colors.orange }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.itemSub}>{monthly > 0 ? `${fmt(monthly)} ₽/мес` : 'Амортизация не задана'}</Text>
                        {/* Полоска износа */}
                        <View style={styles.wearTrack}>
                          <View style={[styles.wearFill, { width: `${wear}%`, backgroundColor: wear > 80 ? colors.red : wear > 50 ? colors.amber : colors.green }]} />
                        </View>
                        <Text style={styles.wearTxt}>{wear}% износа</Text>
                      </View>

                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>

        {/* Правая панель */}
        <View style={styles.right}>
          {draft ? (
            <Animated.ScrollView
              contentContainerStyle={styles.editorContent}
              style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.editorTitle}>{isNew ? 'Новое оборудование' : draft.name}</Text>
              <Text style={styles.editorSub}>{isNew ? 'Заполните данные и нажмите Сохранить' : 'Редактирование'}</Text>

              <View style={styles.divider} />

              {/* Подсказка об амортизации */}
              <View style={styles.amortHint}>
                <Text style={styles.amortHintTitle}>Что такое амортизация?</Text>
                <Text style={styles.amortHintText}>
                  Амортизация — это постепенное списание стоимости оборудования. Например, станок за 150 000 ₽ со сроком 36 месяцев будет «стоить» 4 167 ₽ каждый месяц — эта сумма учитывается в себестоимости продукции.
                </Text>
              </View>

              {/* Название */}
              <Text style={styles.fieldLabel}>Название <Text style={{ color: colors.orange }}>*</Text></Text>
              <TextInput style={styles.input} color={colors.text} value={draft.name} onChangeText={v => setDraft(d => ({ ...d, name: v }))} placeholder="Станок, холодильник, инструмент..." placeholderTextColor={colors.muted} autoFocus={isNew} />

              {/* Стоимость */}
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Стоимость покупки</Text>
                <InfoTip title="Стоимость" text="Начальная цена оборудования. Используется для расчёта ежемесячной амортизации." />
              </View>
              <View style={styles.inputRow}>
                <TextInput style={[styles.input, { flex: 1 }]} color={colors.text} value={draft.cost} onChangeText={v => setDraft(d => ({ ...d, cost: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} />
                <Text style={styles.unitTxt}>₽</Text>
              </View>

              {/* Дата покупки */}
              <Text style={styles.fieldLabel}>Дата покупки</Text>
              <Pressable style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setShowDatePicker(true)}>
                <Text style={{ fontFamily: fonts.familyRegular, fontSize: 14, color: draft.purchase_date ? colors.text : colors.muted }}>
                  {draft.purchase_date ? draft.purchase_date.split('-').reverse().join('.') : 'Выбрать дату...'}
                </Text>
                <Text style={{ fontSize: 16, color: colors.muted }}>📅</Text>
              </Pressable>

              {/* Тип амортизации */}
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Тип амортизации</Text>
                <InfoTip title="Амортизация" text="Способ списания стоимости оборудования. Линейная — равномерно по месяцам. По циклам — по количеству использований." />
              </View>
              <View style={styles.chips}>
                {AMORT_TYPES.map(t => (
                  <Pressable key={t.key} style={[styles.chip, draft.amort_type === t.key && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, amort_type: t.key }))}>
                    <Text style={[styles.chipTxt, draft.amort_type === t.key && styles.chipTxtActive]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hintTxt}>{AMORT_TYPES.find(t => t.key === draft.amort_type)?.hint}</Text>

              {/* Срок (для линейной и смешанной) */}
              {(draft.amort_type === 'linear' || draft.amort_type === 'mixed') && (
                <>
                  <Text style={styles.fieldLabel}>Срок амортизации, мес.</Text>
                  <View style={styles.inputRow}>
                    <TextInput style={[styles.input, { flex: 1 }]} color={colors.text} value={draft.amort_period} onChangeText={v => setDraft(d => ({ ...d, amort_period: v }))} keyboardType="numeric" placeholder="36" placeholderTextColor={colors.muted} />
                    <Text style={styles.unitTxt}>мес</Text>
                  </View>
                  {draft.cost && draft.amort_period ? (
                    <Text style={styles.calcHint}>≈ {fmt(Math.round(parseFloat(draft.cost) / parseInt(draft.amort_period)))} ₽/мес</Text>
                  ) : null}
                </>
              )}

              {/* Ресурс циклов (для production и mixed) */}
              {(draft.amort_type === 'production' || draft.amort_type === 'mixed') && (
                <>
                  <Text style={styles.fieldLabel}>Ресурс, циклов</Text>
                  <View style={styles.inputRow}>
                    <TextInput style={[styles.input, { flex: 1 }]} color={colors.text} value={draft.amort_cycles} onChangeText={v => setDraft(d => ({ ...d, amort_cycles: v }))} keyboardType="numeric" placeholder="10000" placeholderTextColor={colors.muted} />
                    <Text style={styles.unitTxt}>цикл</Text>
                  </View>
                </>
              )}

              {/* Тип счётчика */}
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Счётчик циклов</Text>
                <InfoTip title="Счётчик" text="Как считать использования оборудования. Влияет на расчёт износа по циклам." />
              </View>
              <View style={styles.chips}>
                {COUNTER_TYPES.map(t => (
                  <Pressable key={t.key} style={[styles.chip, draft.counter_type === t.key && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, counter_type: t.key }))}>
                    <Text style={[styles.chipTxt, draft.counter_type === t.key && styles.chipTxtActive]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hintTxt}>{COUNTER_TYPES.find(t => t.key === draft.counter_type)?.hint}</Text>

              {/* Конкретный товар для counter_type=product */}
              {draft.counter_type === 'product' && (
                <>
                  <Text style={styles.fieldLabel}>Товар</Text>
                  <View style={styles.prodList}>
                    {products.map(p => (
                      <Pressable key={p.id} style={[styles.prodRow, draft.counter_product_id === p.id && styles.prodRowActive]} onPress={() => setDraft(d => ({ ...d, counter_product_id: p.id }))}>
                        <Text style={[styles.prodName, draft.counter_product_id === p.id && { color: colors.orange }]}>{p.name}</Text>
                        {draft.counter_product_id === p.id && <Text style={{ color: colors.orange, fontSize: 14 }}>✓</Text>}
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Циклов за использование */}
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Циклов за 1 использование</Text>
                <InfoTip title="Циклов за раз" text="Сколько циклов ресурса расходуется при одном использовании. Обычно 1." />
              </View>
              <TextInput style={styles.input} color={colors.text} value={draft.cycles_per_use} onChangeText={v => setDraft(d => ({ ...d, cycles_per_use: v }))} keyboardType="numeric" placeholder="1" placeholderTextColor={colors.muted} />

              {/* Кнопки */}
              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnTxt}>{isNew ? 'Добавить оборудование' : 'Сохранить'}</Text>
              </Pressable>

              {!isNew && (
                <Pressable style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnTxt}>Удалить оборудование</Text>
                </Pressable>
              )}

            </Animated.ScrollView>
          ) : (
            <View style={styles.emptyRight}>
              <Text style={styles.emptyRightTxt}>Выберите оборудование или нажмите «+ Добавить»</Text>
              <Text style={styles.emptyRightSub}>Здесь отслеживается износ и амортизация техники</Text>
            </View>
          )}
        </View>

      </View>

        </View>
      </View>

      {!isLandscape && <AppNav navigation={navigation} activeScreen="Equipment" />}
      <DatePicker
        visible={showDatePicker}
        value={draft?.purchase_date || new Date().toISOString().slice(0,10)}
        onChange={v => { setDraft(d => ({ ...d, purchase_date: v })); setShowDatePicker(false); }}
        onClose={() => setShowDatePicker(false)}
        title="Дата покупки"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg },
  layout: { flex: 1, flexDirection: 'row' },

  left:   { width: 280, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  listHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, padding: 12, paddingBottom: 6 },
  listCard: { margin: 8, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  itemRow:  { padding: 13, position: 'relative' },
  itemRowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemRowActive: { backgroundColor: 'rgba(240,160,80,0.06)' },
  activeBar: { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  itemName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 2 },
  itemSub:  { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginBottom: 6 },
  wearTrack:{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', marginBottom: 3 },
  wearFill: { height: '100%', borderRadius: 2 },
  wearTxt:  { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted },

  emptyWrap: { padding: 32, alignItems: 'center' },
  emptyTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 18, opacity: 0.7 },

  right:   { flex: 1, backgroundColor: colors.bg },
  emptyRight: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyRightTxt: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted, textAlign: 'center' },
  emptyRightSub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8, opacity: 0.6 },

  editorContent: { padding: 24, paddingBottom: 40 },
  editorTitle:   { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text },
  editorSub:     { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 4 },
  divider:       { height: 1, backgroundColor: colors.border, marginVertical: 20 },

  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  labelRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 },
  input:      { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 14, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },
  inputRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unitTxt:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, width: 36 },
  calcHint:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange, marginTop: 6 },

  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  chipTxt:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  chipTxtActive: { color: colors.orange },
  hintTxt:    { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 18 },

  prodList:   { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', maxHeight: 200 },
  prodRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  prodRowActive: { backgroundColor: 'rgba(240,160,80,0.06)' },
  prodName:   { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },

  saveBtn:    { backgroundColor: colors.orange, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  saveBtnTxt: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff' },
  deleteBtn:  { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: 'rgba(217,95,95,0.4)', backgroundColor: 'rgba(217,95,95,0.07)' },
  deleteBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },

  amortHint:     { backgroundColor: 'rgba(139,127,212,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(139,127,212,0.2)', padding: 14, marginBottom: 4 },
  amortHintTitle:{ fontFamily: fonts.familySemibold, fontSize: 13, color: colors.indigo, marginBottom: 6 },
  amortHintText: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim, lineHeight: 18 },
  addBtn:     { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(240,160,80,0.12)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)' },
  addBtnTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },
});
