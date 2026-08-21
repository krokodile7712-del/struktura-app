import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Animated, FlatList,
} from 'react-native';
import TopBar from '../components/TopBar';
import Sheet from '../components/Sheet';
import { useResponsive } from '../hooks/useResponsive';
import { useFocusEffect } from '@react-navigation/native';
import { getAllExpenses, insertExpense } from '../db/queries';
import { goBackSmart, can } from '../db/session';
import { colors, fonts } from '../constants/theme';

const CATEGORIES = ['Аренда', 'Зарплата', 'Закупка', 'Коммуналка', 'Расходники', 'Реклама', 'Амортизация', 'Накладные', 'Прочее'];
const todayStr    = () => new Date().toISOString().slice(0, 10);
const weekAgoStr  = () => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().slice(0,10); };
const monthAgoStr = () => { const d = new Date(); d.setDate(d.getDate()-29); return d.toISOString().slice(0,10); };
const fmt = n => (n || 0).toLocaleString('ru-RU');
const fmtDate = s => { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}.${m}.${y.slice(2)}`; };

const PERIODS = [
  { key: 'today', label: 'Сегодня', from: todayStr,    to: todayStr },
  { key: 'week',  label: 'Неделя',  from: weekAgoStr,  to: todayStr },
  { key: 'month', label: 'Месяц',   from: monthAgoStr, to: todayStr },
];

// Экран Расходов — список↔сводка. В альбомной ориентации список сужается
// до колонки, сводка постоянно видна справа. В портрете сводка — компактная
// сворачиваемая полоска сверху (по умолчанию свёрнута — только итог), список
// на всю ширину ниже неё. Строки списка — тонкие, без карточек-рамок, суммы
// выровнены по правому краю в колонку.
export default function ExpensesScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const [period, setPeriod]         = useState('week');
  const [expenses, setExpenses]     = useState([]);
  const [addModal, setAddModal]     = useState(false);
  const [category, setCategory]     = useState(CATEGORIES[0]);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [amount, setAmount]         = useState('');
  const [comment, setComment]       = useState('');
  const amountRef = useRef(null);

  // Анимации
  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(16))[0];
  const numAnim   = useState(new Animated.Value(1))[0];
  const modalAnim = useState(new Animated.Value(0))[0];

  const getRange = () => {
    const p = PERIODS.find(p => p.key === period);
    return { from: p.from(), to: p.to() };
  };

  const load = useCallback(() => {
    try {
      const { from, to } = getRange();
      const all = getAllExpenses();
      const filtered = all.filter(e => {
        const d = e.date?.slice(0,10) || '';
        return d >= from && d <= to;
      });
      setExpenses(filtered.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
    } catch(e) { console.error(e); }
  }, [period]);

  useFocusEffect(useCallback(() => {
    load();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [load]));

  // Плавная перерисовка сводки при смене периода — короткое притухание/зажигание
  const changePeriod = (key) => {
    if (key === period) return;
    Animated.sequence([
      Animated.timing(numAnim, { toValue: 0, duration: 90, useNativeDriver: true }),
    ]).start(() => {
      setPeriod(key);
      Animated.timing(numAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    });
  };

  const openModal = () => {
    setAddModal(true);
    modalAnim.setValue(0);
    Animated.spring(modalAnim, { toValue: 1, tension: 60, friction: 12, useNativeDriver: true }).start(
      () => setTimeout(() => amountRef.current?.focus(), 100)
    );
  };

  const handleAdd = () => {
    if (!amount || parseFloat(amount) <= 0) return;
    try {
      insertExpense({
        category,
        amount: parseFloat(amount),
        comment: comment.trim(),
        date: todayStr(),
      });
      setAmount('');
      setComment('');
      setAddModal(false);
      load();
    } catch(e) { console.error(e); }
  };

  // Статистика
  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const byCategory = CATEGORIES.map(cat => ({
    cat,
    sum: expenses.filter(e => e.category === cat).reduce((s,e) => s + (e.amount||0), 0),
  })).filter(c => c.sum > 0).sort((a,b) => b.sum - a.sum);

  const periodChips = (
    <View style={styles.periodRow}>
      {PERIODS.map(p => (
        <Pressable
          key={p.key}
          style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
          onPress={() => changePeriod(p.key)}
        >
          <Text style={[styles.periodTxt, period === p.key && styles.periodTxtActive]}>
            {p.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const addBtn = can('add_expense') !== false && (
    <Pressable style={styles.addBtn} onPress={openModal}>
      <Text style={styles.addBtnTxt}>+ Добавить расход</Text>
    </Pressable>
  );

  const list = (
    <FlatList
      style={{ flex: 1 }}
      data={expenses}
      keyExtractor={e => String(e.id)}
      contentContainerStyle={{ paddingBottom: 40 }}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTxt}>Расходов за период нет</Text>
          <Text style={styles.emptyHint}>Нажмите «+ Добавить расход» чтобы начать</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <View style={[styles.expenseRow, index < expenses.length - 1 && styles.expenseRowDiv]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.expenseCat} numberOfLines={1}>
              {item.category}{item.comment ? ` · ${item.comment}` : ''}
            </Text>
            <Text style={styles.expenseDate}>{fmtDate(item.date?.slice(0,10) || '')}</Text>
          </View>
          <Text style={styles.expenseAmt}>{fmt(item.amount)} ₽</Text>
        </View>
      )}
    />
  );

  // ── Содержимое сводки — общее и для боковой панели (альбомная), и для
  // раскрытой полоски сверху (портрет) ──
  const summaryBody = (
    <>
      {byCategory.length > 0 ? (
        <View style={{ marginTop: 4 }}>
          {byCategory.map((c, i) => (
            <View key={c.cat} style={[styles.catRow, i < byCategory.length - 1 && styles.catRowDiv]}>
              <Text style={styles.catName} numberOfLines={1}>{c.cat}</Text>
              <Text style={styles.catVal}>{fmt(c.sum)} ₽</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.hintText}>
          Фиксируйте все затраты бизнеса — аренду, зарплаты, закупки. Это позволит видеть реальную прибыль в разделе Отчётность.
        </Text>
      )}
    </>
  );

  return (
    <View style={styles.root}>
      <TopBar
        title="Расходы"
        onBack={() => goBackSmart(navigation)}
        navigation={navigation}
        activeScreen="Expenses"
      />

      <View style={{ flex: 1, flexDirection: isLandscape ? 'row' : 'column' }}>

        {!isLandscape && (
          /* Портрет — компактная сводка сверху, по умолчанию свёрнута */
          <Pressable style={styles.stripWrap} onPress={() => setSummaryExpanded(v => !v)}>
            <View style={styles.stripRow}>
              <View>
                <Text style={styles.stripLabel}>Расходы за период</Text>
                <Animated.Text style={[styles.stripVal, { opacity: numAnim }]}>{fmt(total)} ₽</Animated.Text>
              </View>
              <Text style={styles.stripChevron}>{summaryExpanded ? '▲' : '▼'}</Text>
            </View>
            {summaryExpanded && <View style={styles.stripBody}>{summaryBody}</View>}
          </Pressable>
        )}

        <Animated.View style={{ flex: isLandscape ? 0.6 : 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {periodChips}
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>{addBtn}</View>
          <View style={{ flex: 1, paddingHorizontal: 16 }}>{list}</View>
        </Animated.View>

        {isLandscape && (
          /* Альбомная — сводка постоянной узкой панелью справа */
          <View style={styles.sidePanel}>
            <Text style={styles.sideLabel}>За период</Text>
            <Animated.Text style={[styles.sideVal, { opacity: numAnim }]}>{fmt(total)} ₽</Animated.Text>
            <Text style={styles.sideSub}>{expenses.length} расходов</Text>
            <View style={styles.sideDivider} />
            <ScrollView showsVerticalScrollIndicator={false}>{summaryBody}</ScrollView>
          </View>
        )}
      </View>

      {/* Модалка добавления */}
      <Sheet visible={addModal} onClose={() => setAddModal(false)} title="Новый расход">
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalHint}>Укажите категорию, сумму и при необходимости комментарий</Text>

              {/* Категории */}
              <Text style={styles.fieldLabel}>Категория</Text>
              <View style={styles.catChips}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat}
                    style={[styles.catChip, category === cat && styles.catChipActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.catChipTxt, category === cat && styles.catChipTxtActive]}>{cat}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Сумма */}
              <Text style={styles.fieldLabel}>Сумма <Text style={{ color: colors.orange }}>*</Text></Text>
              <View style={styles.amountWrap}>
                <TextInput
                  ref={amountRef}
                  style={styles.amountInput}
                  color={colors.text}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                  returnKeyType="next"
                />
                <Text style={styles.amountCurrency}>₽</Text>
              </View>

              {/* Комментарий */}
              <Text style={styles.fieldLabel}>Комментарий</Text>
              <TextInput
                style={styles.commentInput}
                color={colors.text}
                placeholder="Необязательно — например, номер счёта или поставщик"
                placeholderTextColor={colors.muted}
                value={comment}
                onChangeText={setComment}
                returnKeyType="done"
                onSubmitEditing={handleAdd}
              />

              {/* Кнопки */}
              <View style={styles.modalBtns}>
                <Pressable style={styles.cancelBtn} onPress={() => setAddModal(false)}>
                  <Text style={styles.cancelTxt}>Отмена</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, (!amount || parseFloat(amount) <= 0) && { opacity: 0.5 }]}
                  onPress={handleAdd}
                >
                  <Text style={styles.saveTxt}>Сохранить</Text>
                </Pressable>
              </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.bg },

  periodRow:  { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  periodBtn:  { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  periodBtnActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  periodTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  periodTxtActive: { color: colors.orange },

  addBtn:     { paddingVertical: 12, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center', marginBottom: 12 },
  addBtnTxt:  { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#fff' },

  // ── Список — тонкие строки, без карточек-рамок ──
  emptyWrap:  { padding: 40, alignItems: 'center' },
  emptyTxt:   { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  emptyHint:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 6, opacity: 0.7 },

  expenseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  expenseRowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  expenseCat: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  expenseDate:{ fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  expenseAmt: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.red, textAlign: 'right', minWidth: 90 },

  // ── Сводка — общие строки категорий (переиспользуются в обоих режимах) ──
  catRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  catRowDiv:  { borderBottomWidth: 1, borderBottomColor: colors.border },
  catName:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, flex: 1 },
  catVal:     { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  hintText:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 4 },

  // ── Портрет — сворачиваемая полоска сверху ──
  stripWrap:  { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 },
  stripRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stripLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  stripVal:   { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.red, marginTop: 2 },
  stripChevron: { fontSize: 11, color: colors.muted, opacity: 0.6 },
  stripBody:  { marginTop: 10 },

  // ── Альбомная — постоянная боковая панель сводки ──
  sidePanel:  { width: '40%', maxWidth: 340, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface, padding: 20 },
  sideLabel:  { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  sideVal:    { fontFamily: fonts.family, fontSize: 34, fontWeight: '800', color: colors.red, marginTop: 6 },
  sideSub:    { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  sideDivider:{ height: 1, backgroundColor: colors.border, marginVertical: 16 },

  // ── Модалка добавления ──
  modalHint:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 20, lineHeight: 19 },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  catChips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip:    { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  catChipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.1)' },
  catChipTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  catChipTxtActive: { color: colors.orange },

  amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  amountInput:{ flex: 1, paddingVertical: 16, fontSize: 28, fontFamily: fonts.family, fontWeight: '800', color: colors.text, textAlign: 'center' },
  amountCurrency: { fontFamily: fonts.familySemibold, fontSize: 20, color: colors.muted },

  commentInput: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },

  modalBtns:  { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn:  { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  saveBtn:    { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  saveTxt:    { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#fff' },
});
