import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, Animated, FlatList,
} from 'react-native';
import { getAllExpenses, insertExpense } from '../../db/queries';
import { can } from '../../db/session';
import { colors, fonts } from '../../constants/theme';

const CATEGORIES = ['Аренда', 'Зарплата', 'Закупка', 'Коммуналка', 'Расходники', 'Реклама', 'Прочее'];
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

export default function ExpensesPanel() {
  const [period, setPeriod]         = useState('week');
  const [expenses, setExpenses]     = useState([]);
  const [addModal, setAddModal]     = useState(false);
  const [category, setCategory]     = useState(CATEGORIES[0]);
  const [amount, setAmount]         = useState('');
  const [comment, setComment]       = useState('');
  const amountRef = useRef(null);

  // Анимации
  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(16))[0];
  const btnScale  = useState(new Animated.Value(1))[0];
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

  useEffect(() => {
    load();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [load]);

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

  const animBtn = (to) => Animated.spring(btnScale, { toValue: to, useNativeDriver: true, tension: 200 }).start();

  // Статистика
  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const byCategory = CATEGORIES.map(cat => ({
    cat,
    sum: expenses.filter(e => e.category === cat).reduce((s,e) => s + (e.amount||0), 0),
  })).filter(c => c.sum > 0).sort((a,b) => b.sum - a.sum);

  return (
    <View style={styles.root}>

      {/* Фильтры периода */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <Pressable
            key={p.key}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodTxt, period === p.key && styles.periodTxtActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Animated.View style={[styles.layout, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {/* Левая колонка — сводка */}
        <View style={styles.left}>
          {/* Итого */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>За период</Text>
            <Text style={styles.totalVal}>{fmt(total)} ₽</Text>
            <Text style={styles.totalSub}>{expenses.length} расходов</Text>
          </View>

          {/* По категориям */}
          {byCategory.length > 0 && (
            <View style={styles.catCard}>
              <Text style={styles.catTitle}>По категориям</Text>
              {byCategory.map((c, i) => (
                <View key={c.cat} style={[styles.catRow, i < byCategory.length-1 && styles.catRowDiv]}>
                  <Text style={styles.catName}>{c.cat}</Text>
                  <View style={styles.catRight}>
                    <Text style={styles.catVal}>{fmt(c.sum)} ₽</Text>
                    <View style={[styles.catBar, { width: `${Math.round(c.sum / total * 100)}%` }]} />
                  </View>
                </View>
              ))}
            </View>
          )}

          {byCategory.length === 0 && (
            <View style={styles.hintCard}>
              <Text style={styles.hintTitle}>Как использовать</Text>
              <Text style={styles.hintText}>
                Фиксируйте все затраты бизнеса — аренду, зарплаты, закупки. Это позволит видеть реальную прибыль в разделе Отчётность.
              </Text>
            </View>
          )}
        </View>

        {/* Правая колонка — список */}
        <FlatList
          style={styles.right}
          data={expenses}
          keyExtractor={e => String(e.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTxt}>Расходов за период нет</Text>
              <Text style={styles.emptyHint}>Нажмите "+ Расход" вверху чтобы добавить</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <View style={styles.expenseCard}>
              <View style={styles.expenseLeft}>
                <Text style={styles.expenseCat}>{item.category}</Text>
                {item.comment ? <Text style={styles.expenseComment}>{item.comment}</Text> : null}
                <Text style={styles.expenseDate}>{fmtDate(item.date?.slice(0,10) || '')}</Text>
              </View>
              <Text style={styles.expenseAmt}>{fmt(item.amount)} ₽</Text>
            </View>
          )}
        />

      </Animated.View>

      {/* Модалка добавления */}
      <Modal visible={addModal} transparent animationType="none" onRequestClose={() => setAddModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setAddModal(false)}>
          <Animated.View
            style={[styles.modalBox, {
              opacity: modalAnim,
              transform: [{ scale: modalAnim.interpolate({ inputRange: [0,1], outputRange: [0.94, 1] }) }],
            }]}
          >
            <Pressable onPress={e => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Новый расход</Text>
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
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.bg },
  layout:     { flex: 1, flexDirection: 'row' },

  periodRow:  { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  periodBtn:  { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  periodBtnActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  periodTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  periodTxtActive: { color: colors.orange },

  // Левая колонка
  left:       { width: 260, padding: 16, gap: 12, borderRightWidth: 1, borderRightColor: colors.border },
  totalCard:  { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18 },
  totalLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  totalVal:   { fontFamily: fonts.family, fontSize: 36, fontWeight: '800', color: colors.red, marginBottom: 4 },
  totalSub:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  catCard:    { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  catTitle:   { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 },
  catRow:     { paddingVertical: 10 },
  catRowDiv:  { borderBottomWidth: 1, borderBottomColor: colors.border },
  catName:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 6 },
  catRight:   { gap: 4 },
  catVal:     { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  catBar:     { height: 3, backgroundColor: colors.orange, borderRadius: 2, opacity: 0.7 },

  hintCard:   { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  hintTitle:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 8 },
  hintText:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18 },

  // Правая колонка
  right:      { flex: 1 },
  emptyWrap:  { padding: 40, alignItems: 'center' },
  emptyTxt:   { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  emptyHint:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 6, opacity: 0.7 },

  expenseCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  expenseLeft: { flex: 1, gap: 3 },
  expenseCat:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  expenseComment: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  expenseDate: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, opacity: 0.7 },
  expenseAmt:  { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.red },

  addBtn:     { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(240,160,80,0.15)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)' },
  addBtnTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },

  // Модалка
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:   { width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 28 },
  modalTitle: { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 6 },
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
