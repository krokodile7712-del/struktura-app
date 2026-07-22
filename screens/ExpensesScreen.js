import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, useWindowDimensions,
} from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import EmptyState from '../components/EmptyState';
import InfoTip from '../components/InfoTip';
import { useFocusEffect } from '@react-navigation/native';
import { getAllExpenses, insertExpense } from '../db/queries';
import DatePicker from '../components/DatePicker';
import { getHomeRoute, can } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

const CATEGORIES = ['Аренда', 'Зарплата', 'Закупка', 'Коммуналка', 'Расходники', 'Реклама', 'Прочее'];

const todayStr    = () => new Date().toISOString().slice(0, 10);
const weekAgoStr  = () => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().slice(0,10); };
const monthAgoStr = () => { const d = new Date(); d.setDate(d.getDate()-29); return d.toISOString().slice(0,10); };
const fmtDate     = s => { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}.${m}`; };
const fmt         = n => (n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const PERIODS = [
  { key: 'today', label: 'Сегодня', from: todayStr,    to: todayStr },
  { key: 'week',  label: 'Неделя',  from: weekAgoStr,  to: todayStr },
  { key: 'month', label: 'Месяц',   from: monthAgoStr, to: todayStr },
  { key: 'custom',label: 'Свой',    from: monthAgoStr, to: todayStr },
];

export default function ExpensesScreen({ navigation }) {
  const { width: W } = useWindowDimensions();
  const [period, setPeriod]       = useState('week');
  const [customFrom, setCustomFrom] = useState(monthAgoStr());
  const [customTo, setCustomTo]   = useState(todayStr());
  const [showCustom, setShowCustom] = useState(false);
  const [expenses, setExpenses]   = useState([]);
  const [addModal, setAddModal]   = useState(false);
  const [picker, setPicker]         = useState(null); // 'from' | 'to' | 'date'

  // Форма добавления
  const [category, setCategory]   = useState(CATEGORIES[0]);
  const [amount, setAmount]       = useState('');
  const [comment, setComment]     = useState('');
  const [dateMode, setDateMode]   = useState('today');
  const [customDate, setCustomDate] = useState(todayStr());

  const getRange = () => {
    if (period === 'custom') return { from: customFrom, to: customTo };
    const p = PERIODS.find(p => p.key === period);
    return { from: p.from(), to: p.to() };
  };

  const load = useCallback(() => {
    try {
      const { from, to } = getRange();
      const all = getAllExpenses();
      setExpenses(all.filter(e => {
        const d = e.date?.slice(0,10) || '';
        return d >= from && d <= to;
      }));
    } catch(e) { console.error(e); }
  }, [period, customFrom, customTo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const getNewDate = () => {
    if (dateMode === 'today') return todayStr();
    if (dateMode === 'yesterday') { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }
    return customDate;
  };

  const handleAdd = () => {
    if (!amount || isNaN(parseFloat(amount))) return;
    try {
      insertExpense({ date: getNewDate(), category, amount: parseFloat(amount), comment: comment.trim() });
      setAmount(''); setComment(''); setDateMode('today');
      setAddModal(false);
      load();
    } catch(e) { console.error(e); }
  };

  // Группировка по категориям
  const total = expenses.reduce((s,e) => s + e.amount, 0);
  const grouped = CATEGORIES
    .map(cat => ({ cat, items: expenses.filter(e => e.category === cat) }))
    .filter(g => g.items.length > 0);

  const { from, to } = getRange();
  const rangeLabel = period === 'today' ? 'Сегодня'
    : period === 'custom' ? `${fmtDate(from)} — ${fmtDate(to)}`
    : PERIODS.find(p => p.key === period)?.label || '';

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Расходы"
        onBack={() => navigation.navigate(getHomeRoute())}

      />

      {/* Периоды */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.periodBar} contentContainerStyle={styles.periodInner}>
        {PERIODS.map(p => (
          <Pressable
            key={p.key}
            style={[styles.periodChip, period === p.key && styles.periodChipActive]}
            onPress={() => {
              if (p.key === 'custom') { setPeriod('custom'); setShowCustom(true); }
              else { setPeriod(p.key); }
            }}
          >
            <Text style={[styles.periodChipText, period === p.key && styles.periodChipTextActive]}>
              {p.key === 'custom' && period === 'custom' ? `${fmtDate(customFrom)}—${fmtDate(customTo)}` : p.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Итого */}
      {expenses.length > 0 && (
        <View style={styles.totalBar}>
          <Text style={styles.totalLabel}>{rangeLabel}</Text>
          <Text style={styles.totalValue}>{fmt(total)} ₽</Text>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {expenses.length === 0 ? (
          <EmptyState icon="💸" title="Нет расходов"
            text={`За ${rangeLabel.toLowerCase()} расходов не найдено. Нажмите ＋ чтобы добавить.`} />
        ) : (
          grouped.map(g => {
            const catTotal = g.items.reduce((s,e) => s + e.amount, 0);
            return (
              <View key={g.cat} style={styles.catGroup}>
                {/* Заголовок категории */}
                <View style={styles.catHeadRow}>
                  <Text style={styles.catName}>{g.cat}</Text>
                  <Text style={styles.catTotal}>{fmt(catTotal)} ₽</Text>
                </View>
                {/* Записи */}
                <View style={styles.card}>
                  {g.items.map((e, idx) => (
                    <View key={e.id} style={[styles.expRow, idx < g.items.length - 1 && styles.rowDiv]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.expComment} numberOfLines={1}>
                          {e.comment || g.cat}
                        </Text>
                        <Text style={styles.expDate}>{fmtDate(e.date?.slice(0,10))}</Text>
                      </View>
                      <Text style={styles.expAmount}>{fmt(e.amount)} ₽</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {can('add_expenses') && (
        <Pressable style={styles.fab} onPress={() => setAddModal(true)}>
          <Text style={styles.fabText}>＋ Добавить расход</Text>
        </Pressable>
      )}
      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка добавления */}
      <Modal visible={addModal} transparent animationType="fade" onRequestClose={() => setAddModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setAddModal(false)} />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новый расход</Text>
              <Pressable onPress={() => setAddModal(false)} hitSlop={14} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* Категория */}
              <Text style={styles.fieldLabel}>Категория</Text>
              <View style={styles.card}>
                {CATEGORIES.map((cat, idx) => (
                  <Pressable
                    key={cat}
                    style={[styles.expRow, idx < CATEGORIES.length - 1 && styles.rowDiv]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.expComment, { flex: 1 }]}>{cat}</Text>
                    <View style={[styles.checkbox, category === cat && styles.checkboxOn]}>
                      {category === cat && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                    </View>
                  </Pressable>
                ))}
              </View>

              {/* Сумма */}
              <Text style={styles.fieldLabel}>Сумма, ₽</Text>
              <TextInput
                color={colors.text}
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.muted}
                autoFocus
              />

              {/* Комментарий */}
              <Text style={styles.fieldLabel}>Комментарий</Text>
              <TextInput
                color={colors.text}
                style={styles.input}
                value={comment}
                onChangeText={setComment}
                placeholder="Необязательно"
                placeholderTextColor={colors.muted}
              />

              {/* Дата */}
              <Text style={styles.fieldLabel}>Дата</Text>
              <View style={styles.card}>
                {[
                  { key: 'today',     label: 'Сегодня'  },
                  { key: 'yesterday', label: 'Вчера'    },
                  { key: 'custom',    label: 'Другая'   },
                ].map((d, idx) => (
                  <Pressable
                    key={d.key}
                    style={[styles.expRow, idx < 2 && styles.rowDiv]}
                    onPress={() => setDateMode(d.key)}
                  >
                    <Text style={[styles.expComment, { flex: 1 }]}>{d.label}</Text>
                    <View style={[styles.checkbox, dateMode === d.key && styles.checkboxOn]}>
                      {dateMode === d.key && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                    </View>
                  </Pressable>
                ))}
              </View>
              {dateMode === 'custom' && (
                <Pressable style={[styles.input, { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                  onPress={() => setPicker('date')}>
                  <Text style={{ fontFamily: fonts.familySemibold, fontSize: 14, color: customDate ? colors.text : colors.muted }}>
                    {customDate ? customDate.split('-').reverse().join('.') : 'Выбрать дату'}
                  </Text>
                  <Text style={{ color: colors.muted }}>📅</Text>
                </Pressable>
              )}

              {/* Сохранить */}
              <Pressable
                style={({ pressed }) => [styles.confirmBtn, !amount && styles.confirmBtnOff, { marginTop: 20 }, pressed && amount && { opacity: 0.88 }]}
                onPress={handleAdd}
                disabled={!amount}
              >
                <Text style={styles.confirmBtnText}>
                  {amount ? `Добавить ${fmt(parseFloat(amount) || 0)} ₽` : 'Введите сумму'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Модалка своего периода */}
      <Modal visible={showCustom} transparent animationType="fade" onRequestClose={() => setShowCustom(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowCustom(false)} />
          <View style={[styles.modalBox, { maxHeight: 320 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Свой период</Text>
              <Pressable onPress={() => setShowCustom(false)} hitSlop={14} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>
            <View style={{ padding: 20, paddingTop: 8 }}>
              <Text style={styles.fieldLabel}>Начало</Text>
              <Pressable style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                onPress={() => setPicker('from')}>
                <Text style={{ fontFamily: fonts.familySemibold, fontSize: 14, color: customFrom ? colors.text : colors.muted }}>
                  {customFrom ? customFrom.split('-').reverse().join('.') : 'Выбрать'}
                </Text>
                <Text style={{ color: colors.muted }}>📅</Text>
              </Pressable>
              <Text style={styles.fieldLabel}>Конец</Text>
              <Pressable style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                onPress={() => setPicker('to')}>
                <Text style={{ fontFamily: fonts.familySemibold, fontSize: 14, color: customTo ? colors.text : colors.muted }}>
                  {customTo ? customTo.split('-').reverse().join('.') : 'Выбрать'}
                </Text>
                <Text style={{ color: colors.muted }}>📅</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.confirmBtn, { marginTop: 16 }, pressed && { opacity: 0.88 }]}
                onPress={() => { setShowCustom(false); load(); }}>
                <Text style={styles.confirmBtnText}>Применить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <DatePicker
        visible={picker === 'date'}
        value={customDate}
        onChange={setCustomDate}
        onClose={() => setPicker(null)}
        title="Дата расхода"
      />
      <DatePicker
        visible={picker === 'from'}
        value={customFrom}
        onChange={v => { setCustomFrom(v); load(); }}
        onClose={() => setPicker(null)}
        title="Начало периода"
      />
      <DatePicker
        visible={picker === 'to'}
        value={customTo}
        onChange={v => { setCustomTo(v); load(); }}
        onClose={() => setPicker(null)}
        title="Конец периода"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 16, paddingBottom: 24 },

  // Шапка
  fab: {
    position: 'absolute',
    bottom: 72,
    left: 20,
    right: 20,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: 'rgba(61,158,146,0.9)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },
  addBtn:     { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(61,158,146,0.15)', borderWidth: 1, borderColor: 'rgba(61,158,146,0.4)', alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 20, color: colors.greenLight, lineHeight: 26 },

  // Периоды
  periodBar:   { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  periodInner: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  periodChip:  { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', backgroundColor: '#07080a' },
  periodChipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.12)' },
  periodChipText:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  periodChipTextActive: { color: colors.greenLight },

  // Итого
  totalBar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#07080a' },
  totalLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  totalValue: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },

  // Группы
  catGroup:   { marginBottom: 16 },
  catHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2 },
  catName:    { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  catTotal:   { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },

  // Карточка
  card:   { backgroundColor: '#0b0c0f', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', overflow: 'hidden' },
  expRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14 },
  rowDiv: { borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },
  expComment: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 2 },
  expDate:    { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  expAmount:  { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: colors.text },

  // Чекбокс
  checkbox:   { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(74,77,84,0.5)', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.greenLight, borderColor: colors.greenLight },

  // Модалка
  modalRoot:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox:      { width: '46%', maxHeight: '88%', backgroundColor: '#0e0f11', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)', overflow: 'hidden' },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.3)' },
  modalTitle:    { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  modalCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(74,77,84,0.25)', alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { fontSize: 13, color: colors.text, fontFamily: fonts.familySemibold },

  fieldLabel:  { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  amountInput: { padding: 14, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 12, color: colors.text, fontSize: 28, fontFamily: fonts.family, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  input:       { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', borderRadius: 12, color: colors.text, fontSize: 14, fontFamily: fonts.family },
  confirmBtn:    { paddingVertical: 15, borderRadius: 14, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center' },
  confirmBtnOff: { backgroundColor: 'rgba(74,77,84,0.3)' },
  confirmBtnText:{ fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },
});
