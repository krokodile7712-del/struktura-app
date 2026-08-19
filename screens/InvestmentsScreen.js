import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Animated } from 'react-native';
import TopBar from '../components/TopBar';
import { useResponsive } from '../hooks/useResponsive';
import AppNav from '../components/AppNav';
import InfoTip from '../components/InfoTip';
import DatePicker from '../components/DatePicker';
import { useFocusEffect } from '@react-navigation/native';
import { getInvestments, addInvestment, updateInvestment, deleteInvestment, getInvestmentSummary, getPnL } from '../db/queries';
import { getHomeRoute, goBackSmart } from '../db/session';
import { colors, fonts, anim } from '../constants/theme';

const CATEGORIES = [
  { key: 'equipment',  label: 'Оборудование' },
  { key: 'renovation', label: 'Ремонт' },
  { key: 'marketing',  label: 'Реклама' },
  { key: 'deposit',    label: 'Депозит', returnable: true },
  { key: 'other',      label: 'Прочее' },
];

const EMPTY = { name: '', amount: '', invest_date: '', amort_months: '', category: 'other', returnable: false };
const fmt = n => Math.round(n||0).toLocaleString('ru-RU');
const fmtDate = s => s ? s.split('-').reverse().join('.') : '—';

export default function InvestmentsScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const [items, setItems]       = useState([]);
  const [summary, setSummary]   = useState(null);
  const [avgProfit, setAvgProfit] = useState(0);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft]       = useState(null);
  const [isNew, setIsNew]       = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(20))[0];

  const load = useCallback(() => {
    try {
      setItems(getInvestments());
      setSummary(getInvestmentSummary());
      const d = new Date();
      const to = d.toISOString().slice(0,10);
      const from3 = new Date(d.setMonth(d.getMonth()-3)).toISOString().slice(0,10);
      const pnl = getPnL(from3, to);
      setAvgProfit(Math.round((pnl?.netProfit || 0) / 3));
    } catch(e) { console.error(e); }
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
    setDraft({ ...EMPTY, ...item, amount: String(item.amount || ''), amort_months: String(item.amort_months || '') });
    setSelected(item);
    animate();
  };

  const handleSave = () => {
    if (!draft.name.trim()) { Alert.alert('Введите название'); return; }
    if (!draft.amount) { Alert.alert('Введите сумму инвестиции'); return; }
    try {
      const data = { ...draft, amount: parseFloat(draft.amount)||0, amort_months: parseInt(draft.amort_months)||0 };
      if (isNew) addInvestment(data);
      else updateInvestment(selected.id, data);
      load();
      setDraft(null);
      setSelected(null);
    } catch(e) { Alert.alert('Ошибка', e.message); }
  };

  const handleDelete = () => {
    Alert.alert('Удалить?', selected?.name, [
      { text: 'Отмена' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        try { deleteInvestment(selected.id); load(); setDraft(null); setSelected(null); } catch(e) {}
      }}
    ]);
  };

  // Расчёт окупаемости
  const paybackMonths = summary && avgProfit > 0 ? Math.ceil(summary.totalUnamortized / avgProfit) : null;
  const paybackStr = paybackMonths ? (paybackMonths > 120 ? '> 10 лет' : `${paybackMonths} мес.`) : '—';

  return (
    <View style={styles.root}>
      <TopBar
        title="Инвестиции"
        onBack={() => goBackSmart(navigation)}
        rightElement={
          <Pressable style={styles.addBtn} onPress={openNew}>
            <Text style={styles.addBtnTxt}>+ Добавить</Text>
          </Pressable>
        }
      />

      <View style={[{ flex: 1 }, isLandscape && { flexDirection: 'row' }]}>
        {isLandscape && <AppNav navigation={navigation} activeScreen="Investments" />}
        <View style={{ flex: 1 }}>

      <View style={styles.layout}>

        {/* Левая панель */}
        <View style={styles.left}>
          {/* Сводка */}
          {summary && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Вложено</Text>
                <Text style={styles.summaryVal}>{fmt(summary.totalInvested)} ₽</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Осталось окупить</Text>
                <Text style={[styles.summaryVal, { color: colors.amber }]}>{fmt(summary.totalUnamortized)} ₽</Text>
              </View>
              <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.summaryLabel}>Окупаемость</Text>
                  <InfoTip title="Окупаемость" text="Рассчитана на основе средней чистой прибыли за последние 3 месяца." />
                </View>
                <Text style={[styles.summaryVal, { color: colors.green }]}>{paybackStr}</Text>
              </View>
            </View>
          )}

          {/* Список */}
          <Text style={styles.listHint}>Нажмите чтобы редактировать</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTxt}>Нет инвестиций</Text>
                <Text style={styles.emptyHint}>Добавьте начальные вложения в бизнес — оборудование, ремонт, рекламу</Text>
              </View>
            ) : (
              <View style={styles.listCard}>
                {items.map((item, idx) => {
                  const isActive = selected?.id === item.id;
                  const cat = CATEGORIES.find(c => c.key === item.category);
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
                        <Text style={styles.itemCat}>{cat?.label || 'Прочее'} · {fmtDate(item.invest_date)}</Text>
                      </View>
                      <Text style={styles.itemAmt}>{fmt(item.amount)} ₽</Text>
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
              <Text style={styles.editorTitle}>{isNew ? 'Новая инвестиция' : draft.name}</Text>

              <View style={styles.infoCard}>
                <Text style={styles.infoTxt}>
                  Инвестиции — это начальные вложения в бизнес. Они не списываются сразу, а постепенно распределяются на срок окупаемости. Это помогает видеть реальную прибыль с учётом возврата вложений.
                </Text>
              </View>

              <View style={styles.divider} />

              {/* Название */}
              <Text style={styles.fieldLabel}>Название <Text style={{ color: colors.orange }}>*</Text></Text>
              <TextInput style={styles.input} color={colors.text} value={draft.name} onChangeText={v => setDraft(d => ({ ...d, name: v }))} placeholder="Оборудование, ремонт, вывеска..." placeholderTextColor={colors.muted} autoFocus={isNew} />

              {/* Сумма */}
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Сумма <Text style={{ color: colors.orange }}>*</Text></Text>
                <InfoTip title="Сумма инвестиции" text="Полная стоимость вложения. Например, стоимость оборудования или ремонта." />
              </View>
              <View style={styles.inputRow}>
                <TextInput style={[styles.input, { flex: 1 }]} color={colors.text} value={draft.amount} onChangeText={v => setDraft(d => ({ ...d, amount: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} />
                <Text style={styles.unitTxt}>₽</Text>
              </View>

              {/* Дата */}
              <Text style={styles.fieldLabel}>Дата вложения</Text>
              <Pressable style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setShowDatePicker(true)}>
                <Text style={{ fontFamily: fonts.familyRegular, fontSize: 14, color: draft.invest_date ? colors.text : colors.muted }}>
                  {draft.invest_date ? fmtDate(draft.invest_date) : 'Выбрать дату...'}
                </Text>
                <Text style={{ fontSize: 16, color: colors.muted }}>📅</Text>
              </Pressable>

              {/* Категория */}
              <Text style={styles.fieldLabel}>Категория</Text>
              <View style={styles.chips}>
                {CATEGORIES.map(cat => (
                  <Pressable key={cat.key} style={[styles.chip, draft.category === cat.key && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, category: cat.key, returnable: cat.returnable || false }))}>
                    <Text style={[styles.chipTxt, draft.category === cat.key && styles.chipTxtActive]}>{cat.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Срок окупаемости */}
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Срок окупаемости, мес.</Text>
                <InfoTip title="Срок окупаемости" text="За сколько месяцев планируете вернуть вложение. Используется для расчёта ежемесячной нагрузки на P&L." />
              </View>
              <View style={styles.inputRow}>
                <TextInput style={[styles.input, { flex: 1 }]} color={colors.text} value={draft.amort_months} onChangeText={v => setDraft(d => ({ ...d, amort_months: v }))} keyboardType="numeric" placeholder="24" placeholderTextColor={colors.muted} />
                <Text style={styles.unitTxt}>мес</Text>
              </View>
              {draft.amount && draft.amort_months ? (
                <Text style={styles.calcHint}>≈ {fmt(Math.round(parseFloat(draft.amount) / parseInt(draft.amort_months)))} ₽/мес нагрузки на прибыль</Text>
              ) : null}

              {/* Кнопки */}
              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnTxt}>{isNew ? 'Добавить инвестицию' : 'Сохранить'}</Text>
              </Pressable>

              {!isNew && (
                <Pressable style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnTxt}>Удалить</Text>
                </Pressable>
              )}

            </Animated.ScrollView>
          ) : (
            <View style={styles.emptyRight}>
              <Text style={styles.emptyRightTxt}>Выберите инвестицию или нажмите «+ Добавить»</Text>
              <Text style={styles.emptyRightSub}>Отслеживайте вложения и срок их окупаемости</Text>
            </View>
          )}
        </View>

      </View>

        </View>
      </View>

      {!isLandscape && <AppNav navigation={navigation} activeScreen="Investments" />}

      <DatePicker
        visible={showDatePicker}
        value={draft?.invest_date || new Date().toISOString().slice(0,10)}
        onChange={v => { setDraft(d => ({ ...d, invest_date: v })); setShowDatePicker(false); }}
        onClose={() => setShowDatePicker(false)}
        title="Дата вложения"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg },
  layout: { flex: 1, flexDirection: 'row' },

  left:   { width: 280, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },

  summaryCard: { margin: 10, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  summaryRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryLabel:{ fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  summaryVal:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },

  listHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, paddingHorizontal: 12, paddingBottom: 4 },
  listCard: { margin: 8, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  itemRow:  { flexDirection: 'row', alignItems: 'center', padding: 13, position: 'relative' },
  itemRowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemRowActive: { backgroundColor: 'rgba(240,160,80,0.06)' },
  activeBar: { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  itemName: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 2 },
  itemCat:  { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  itemAmt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },

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
  unitTxt:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, width: 36 },
  calcHint:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange, marginTop: 6 },

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
