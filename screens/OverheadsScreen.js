import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Animated } from 'react-native';
import TopBar from '../components/TopBar';
import EmptyState from '../components/EmptyState';
import AppNav from '../components/AppNav';
import InfoTip from '../components/InfoTip';
import { useFocusEffect } from '@react-navigation/native';
import { getOverheadItems, addOverheadItem, updateOverheadItem, deleteOverheadItem } from '../db/queries';
import { getHomeRoute, goBackSmart } from '../db/session';
import { colors, fonts, anim } from '../constants/theme';

const PERIODS = [
  { key: 'month', label: 'В месяц' },
  { key: 'week',  label: 'В неделю' },
  { key: 'year',  label: 'В год' },
];
const BASES = [
  { key: 'order',       label: 'На заказ',     hint: 'Месячная сумма ÷ количество заказов = накладные на 1 заказ' },
  { key: 'hour',        label: 'На час работы', hint: 'Месячная сумма ÷ рабочие часы = накладные за 1 час' },
  { key: 'revenue_pct', label: '% от выручки',  hint: 'Фиксированный % с каждого заказа. Укажите % в поле «Значение».' },
];
const EMPTY = { name: '', amount: '', period: 'month', basis: 'order', basis_value: '' };
const fmt = n => Math.round(n||0).toLocaleString('ru-RU');

function monthlyAmt(item) {
  const a = item.amount || 0;
  if (item.period === 'year')  return a / 12;
  if (item.period === 'week')  return a * 4.33;
  return a;
}

export default function OverheadsScreen({ navigation }) {
  const [items, setItems]       = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft]       = useState(null);
  const [isNew, setIsNew]       = useState(false);

  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(20))[0];

  const load = useCallback(() => {
    try { setItems(getOverheadItems()); } catch(e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const animate = () => {
    fadeAnim.setValue(0); slideAnim.setValue(anim.slideFrom);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: anim.fadeDuration, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, ...anim.spring, useNativeDriver: true }),
    ]).start();
  };

  const openNew = () => {
    setIsNew(true);
    setDraft({ ...EMPTY });
    setSelected(null);
    animate();
  };

  const openEdit = (item) => {
    setIsNew(false);
    setDraft({ ...EMPTY, ...item, amount: String(item.amount || ''), basis_value: String(item.basis_value || '') });
    setSelected(item);
    animate();
  };

  const handleSave = () => {
    if (!draft.name.trim()) { Alert.alert('Введите название'); return; }
    if (!draft.amount) { Alert.alert('Введите сумму'); return; }
    try {
      const data = { ...draft, amount: parseFloat(draft.amount)||0, basis_value: parseFloat(draft.basis_value)||0 };
      if (isNew) addOverheadItem(data);
      else updateOverheadItem(selected.id, data);
      load();
      setDraft(null);
      setSelected(null);
    } catch(e) { Alert.alert('Ошибка', e.message); }
  };

  const handleDelete = () => {
    Alert.alert('Удалить?', selected?.name, [
      { text: 'Отмена' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        try { deleteOverheadItem(selected.id); load(); setDraft(null); setSelected(null); } catch(e) {}
      }}
    ]);
  };

  const totalMonthly = items.reduce((s, i) => s + monthlyAmt(i), 0);

  return (
    <View style={styles.root}>
      <TopBar
        title="Накладные расходы"
        onBack={() => goBackSmart(navigation)}
        rightElement={
          <Pressable style={styles.addBtn} onPress={openNew}>
            <Text style={styles.addBtnTxt}>+ Добавить</Text>
          </Pressable>
        }
      />

      <View style={styles.layout}>

        {/* Левая панель */}
        <View style={styles.left}>
          {totalMonthly > 0 && (
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Итого в месяц</Text>
              <Text style={styles.totalVal}>{fmt(totalMonthly)} ₽</Text>
            </View>
          )}

          <Text style={styles.listHint}>Нажмите чтобы редактировать</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <EmptyState icon="🏢" title="Нет накладных расходов"
                text="Добавьте аренду, коммуналку, интернет и другие постоянные затраты — они автоматически распределятся на каждый рабочий день."
                action="+ Добавить расход"
                onAction={openNew} />
            ) : (
              <View style={styles.listCard}>
                {items.map((item, idx) => {
                  const isActive = selected?.id === item.id;
                  const monthly = monthlyAmt(item);
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
                        <Text style={styles.itemSub}>{PERIODS.find(p => p.key === item.period)?.label} · {BASES.find(b => b.key === item.basis)?.label}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.itemAmt}>{fmt(item.amount)} ₽</Text>
                        {item.period !== 'month' && (
                          <Text style={styles.itemMonthly}>≈ {fmt(monthly)} ₽/мес</Text>
                        )}
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
              <Text style={styles.editorTitle}>{isNew ? 'Новый расход' : draft.name}</Text>

              <View style={styles.infoCard}>
                <Text style={styles.infoTxt}>
                  Накладные расходы — постоянные затраты бизнеса, не зависящие от объёма продаж. Они учитываются в полном P&L и влияют на расчёт себестоимости каждого заказа.
                </Text>
              </View>

              <View style={styles.divider} />

              {/* Название */}
              <Text style={styles.fieldLabel}>Название <Text style={{ color: colors.orange }}>*</Text></Text>
              <TextInput style={styles.input} color={colors.text} value={draft.name} onChangeText={v => setDraft(d => ({ ...d, name: v }))} placeholder="Аренда, коммуналка, интернет..." placeholderTextColor={colors.muted} autoFocus={isNew} />

              {/* Сумма и период */}
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Сумма <Text style={{ color: colors.orange }}>*</Text></Text>
              </View>
              <View style={styles.inputRow}>
                <TextInput style={[styles.input, { flex: 1 }]} color={colors.text} value={draft.amount} onChangeText={v => setDraft(d => ({ ...d, amount: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} />
                <Text style={styles.unitTxt}>₽</Text>
              </View>

              <Text style={styles.fieldLabel}>Периодичность</Text>
              <View style={styles.chips}>
                {PERIODS.map(p => (
                  <Pressable key={p.key} style={[styles.chip, draft.period === p.key && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, period: p.key }))}>
                    <Text style={[styles.chipTxt, draft.period === p.key && styles.chipTxtActive]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
              {draft.amount && draft.period !== 'month' && (
                <Text style={styles.calcHint}>≈ {fmt(monthlyAmt({ amount: parseFloat(draft.amount)||0, period: draft.period }))} ₽/мес</Text>
              )}

              {/* База распределения */}
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>База распределения</Text>
                <InfoTip title="База распределения" text="Как этот расход распределяется на единицу продукции — на заказ, час работы или процент от выручки." />
              </View>
              <View style={styles.chips}>
                {BASES.map(b => (
                  <Pressable key={b.key} style={[styles.chip, draft.basis === b.key && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, basis: b.key }))}>
                    <Text style={[styles.chipTxt, draft.basis === b.key && styles.chipTxtActive]}>{b.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hintTxt}>{BASES.find(b => b.key === draft.basis)?.hint}</Text>

              {/* Значение базы */}
              {draft.basis === 'hour' && (
                <>
                  <Text style={styles.fieldLabel}>Рабочих часов в месяц</Text>
                  <View style={styles.inputRow}>
                    <TextInput style={[styles.input, { flex: 1 }]} color={colors.text} value={draft.basis_value} onChangeText={v => setDraft(d => ({ ...d, basis_value: v }))} keyboardType="numeric" placeholder="160" placeholderTextColor={colors.muted} />
                    <Text style={styles.unitTxt}>ч</Text>
                  </View>
                  {draft.amount && draft.basis_value ? (
                    <Text style={styles.calcHint}>≈ {fmt(monthlyAmt({ amount: parseFloat(draft.amount)||0, period: draft.period }) / (parseFloat(draft.basis_value)||1))} ₽/час</Text>
                  ) : null}
                </>
              )}
              {draft.basis === 'revenue_pct' && (
                <>
                  <Text style={styles.fieldLabel}>Процент от выручки</Text>
                  <View style={styles.inputRow}>
                    <TextInput style={[styles.input, { flex: 1 }]} color={colors.text} value={draft.basis_value} onChangeText={v => setDraft(d => ({ ...d, basis_value: v }))} keyboardType="numeric" placeholder="2" placeholderTextColor={colors.muted} />
                    <Text style={styles.unitTxt}>%</Text>
                  </View>
                </>
              )}

              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnTxt}>{isNew ? 'Добавить' : 'Сохранить'}</Text>
              </Pressable>
              {!isNew && (
                <Pressable style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnTxt}>Удалить</Text>
                </Pressable>
              )}

            </Animated.ScrollView>
          ) : (
            <View style={styles.emptyRight}>
              <Text style={styles.emptyRightTxt}>Выберите расход или нажмите «+ Добавить»</Text>
              <Text style={styles.emptyRightSub}>Постоянные затраты учитываются в полном P&L отчёте</Text>
            </View>
          )}
        </View>

      </View>

      <AppNav navigation={navigation} activeScreen="Overheads" />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg },
  layout: { flex: 1, flexDirection: 'row' },

  left:   { width: 280, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  totalCard: { margin: 10, backgroundColor: 'rgba(217,95,95,0.07)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(217,95,95,0.25)', padding: 14 },
  totalLabel:{ fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
  totalVal:  { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.red },

  listHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, paddingHorizontal: 12, paddingBottom: 4 },
  listCard: { margin: 8, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  itemRow:  { flexDirection: 'row', alignItems: 'center', padding: 13, position: 'relative' },
  itemRowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemRowActive: { backgroundColor: 'rgba(240,160,80,0.06)' },
  activeBar: { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  itemName: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 2 },
  itemSub:  { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  itemAmt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  itemMonthly: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted },

  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 18, opacity: 0.7 },

  right:   { flex: 1, backgroundColor: colors.bg },
  emptyRight: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyRightTxt: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted, textAlign: 'center' },
  emptyRightSub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8, opacity: 0.6 },

  editorContent: { padding: 24, paddingBottom: 40 },
  editorTitle:   { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 12 },
  infoCard:  { backgroundColor: 'rgba(139,127,212,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(139,127,212,0.2)', padding: 14 },
  infoTxt:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim, lineHeight: 18 },
  divider:   { height: 1, backgroundColor: colors.border, marginVertical: 20 },

  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  labelRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 },
  input:      { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 14, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },
  inputRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unitTxt:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, width: 30 },
  calcHint:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange, marginTop: 6 },
  hintTxt:    { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 18 },

  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  chipTxt:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  chipTxtActive: { color: colors.orange },

  saveBtn:    { backgroundColor: colors.orange, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  saveBtnTxt: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff' },
  deleteBtn:  { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: 'rgba(217,95,95,0.4)', backgroundColor: 'rgba(217,95,95,0.07)' },
  deleteBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },

  addBtn:     { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(240,160,80,0.12)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)' },
  addBtnTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },
});
