import React, { useState } from 'react';
import EmptyState from '../components/EmptyState';
import Hint from '../components/Hint';
import { getHomeRoute } from '../db/session';
import EmptyState from '../components/EmptyState';
import Hint from '../components/Hint';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import EmptyState from '../components/EmptyState';
import Hint from '../components/Hint';
import { getAllExpenses, insertExpense } from '../db/queries';
import EmptyState from '../components/EmptyState';
import Hint from '../components/Hint';
import { colors, fonts, spacing } from '../constants/theme';

const PERIODS = [
  { key: 'day',    label: 'День' },
  { key: 'week',   label: 'Неделя' },
  { key: 'month',  label: 'Месяц' },
  { key: 'custom', label: 'Свой' },
];

const CATEGORIES = ['Аренда', 'Зарплата', 'Закупка', 'Коммуналка', 'Расходники', 'Прочее'];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekAgoStr() { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); }
function monthAgoStr() { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10); }
function fmtDate(s) {
  if (!s) return '';
  const [y,m,d] = s.split('-');
  return `${d}.${m}.${y}`;
}

export default function ExpensesScreen({ navigation }) {
  // Блок просмотра
  const [period, setPeriod] = useState('day');
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo]   = useState(todayStr());
  const [shown, setShown]     = useState(false);
  const [expenses, setExpenses] = useState([]);

  // Блок добавления
  const [category, setCategory]  = useState(CATEGORIES[0]);
  const [amount, setAmount]       = useState('');
  const [comment, setComment]     = useState('');
  const [newDate, setNewDate]     = useState(todayStr());
  const [dateMode, setDateMode]   = useState('today'); // today | yesterday | custom
  const [saving, setSaving]       = useState(false);

  const handleDateMode = (mode) => {
    setDateMode(mode);
    if (mode === 'today') setNewDate(todayStr());
    if (mode === 'yesterday') { const d = new Date(); d.setDate(d.getDate()-1); setNewDate(d.toISOString().slice(0,10)); }
  };

  const handlePeriodChange = (key) => {
    setPeriod(key); setShown(false);
    if (key === 'day')   { setDateFrom(todayStr());   setDateTo(todayStr()); }
    if (key === 'week')  { setDateFrom(weekAgoStr());  setDateTo(todayStr()); }
    if (key === 'month') { setDateFrom(monthAgoStr()); setDateTo(todayStr()); }
  };

  const handleShow = () => {
    try {
      const all = getAllExpenses();
      const filtered = all.filter(e => {
        const d = e.date?.slice(0,10) || '';
        return d >= dateFrom && d <= dateTo;
      });
      setExpenses(filtered);
      setShown(true);
    } catch (e) { console.error(e); }
  };

  const handleAdd = () => {
    if (!amount || isNaN(parseFloat(amount))) return;
    setSaving(true);
    try {
      insertExpense({ date: newDate, category, amount: parseFloat(amount), comment: comment.trim() });
      setAmount(''); setComment('');
      setDateMode('today'); setNewDate(todayStr());
      if (shown) handleShow(); // обновляем список если уже показан
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = CATEGORIES.map(cat => ({
    cat, sum: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.sum > 0);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Расходы" onBack={() => navigation.navigate(getHomeRoute())} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

        {/* Блок просмотра */}
        <MetalCard>
          <Text style={styles.blockTitle}>📊 Расходы за период</Text>
          <View style={styles.periodRow}>
            {PERIODS.map(p => (
              <Pressable
                key={p.key}
                style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
                onPress={() => handlePeriodChange(p.key)}
              >
                <Text style={[styles.periodLabel, period === p.key && styles.periodLabelActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {period === 'custom' ? (
            <View style={styles.datesRow}>
              <TextInput style={[styles.dateInput, { flex: 1 }]} placeholder="С (ГГГГ-ММ-ДД)" placeholderTextColor={colors.muted} value={dateFrom} onChangeText={v => { setDateFrom(v); setShown(false); }} />
              <Text style={styles.dateSep}>—</Text>
              <TextInput style={[styles.dateInput, { flex: 1 }]} placeholder="По (ГГГГ-ММ-ДД)" placeholderTextColor={colors.muted} value={dateTo} onChangeText={v => { setDateTo(v); setShown(false); }} />
            </View>
          ) : (
            <Text style={styles.dateRange}>
              {period === 'day' ? fmtDate(todayStr()) : `${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`}
            </Text>
          )}

          <MetalButton title="● Показать" variant="action" onPress={handleShow} />

          {shown && (
            <>
              <View style={[styles.row, styles.totalRow]}>
                <Text style={styles.totalLabel}>ИТОГО</Text>
                <Text style={styles.totalValue}>{total.toLocaleString('ru-RU')} ₽</Text>
              </View>

              {byCategory.map(c => (
                <View key={c.cat} style={styles.row}>
                  <Text style={styles.rowSub}>{c.cat}</Text>
                  <Text style={styles.rowSub}>{c.sum.toLocaleString('ru-RU')} ₽</Text>
                </View>
              ))}

              {expenses.length > 0 && <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Записи</Text>}
              {expenses.map(e => (
                <View key={e.id} style={styles.row}>
                  <View>
                    <Text style={styles.rowName}>{e.category}{e.comment ? ` — ${e.comment}` : ''}</Text>
                    <Text style={styles.rowSub}>{fmtDate(e.date?.slice(0,10))}</Text>
                  </View>
                  <Text style={styles.rowPrice}>{e.amount.toLocaleString('ru-RU')} ₽</Text>
                </View>
              ))}

              {shown && expenses.length === 0 && (
                <Text style={styles.empty}>Нет расходов за этот период</Text>
              )}
            </>
          )}
        </MetalCard>

        {/* Блок добавления */}
        <MetalCard style={{ marginTop: 12 }}>
          <Text style={styles.blockTitle}>+ Новый расход</Text>

          <Text style={styles.fieldLabel}>Категория</Text>
          <View style={styles.dropdown}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {CATEGORIES.map(cat => (
                <Pressable key={cat} style={[styles.chip, category === cat && styles.chipActive]} onPress={() => setCategory(cat)}>
                  <Text style={[styles.chipLabel, category === cat && styles.chipLabelActive]}>{cat}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <Text style={styles.fieldLabel}>Сумма</Text>
          <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.muted} keyboardType="numeric" value={amount} onChangeText={setAmount} />

          <Text style={styles.fieldLabel}>Комментарий</Text>
          <TextInput style={styles.input} placeholder="Необязательно" placeholderTextColor={colors.muted} value={comment} onChangeText={setComment} />

          <Text style={styles.fieldLabel}>Дата</Text>
          <View style={styles.dateChipsRow}>
            <Pressable style={[styles.dateChip, dateMode === 'today' && styles.dateChipActive]} onPress={() => handleDateMode('today')}>
              <Text style={[styles.dateChipLabel, dateMode === 'today' && styles.dateChipLabelActive]}>Сегодня</Text>
            </Pressable>
            <Pressable style={[styles.dateChip, dateMode === 'yesterday' && styles.dateChipActive]} onPress={() => handleDateMode('yesterday')}>
              <Text style={[styles.dateChipLabel, dateMode === 'yesterday' && styles.dateChipLabelActive]}>Вчера</Text>
            </Pressable>
            <Pressable style={[styles.dateChip, dateMode === 'custom' && styles.dateChipActive]} onPress={() => setDateMode('custom')}>
              <Text style={[styles.dateChipLabel, dateMode === 'custom' && styles.dateChipLabelActive]}>Другая дата</Text>
            </Pressable>
          </View>
          {dateMode === 'custom' && (
            <TextInput style={styles.input} placeholder="ГГГГ-ММ-ДД" placeholderTextColor={colors.muted} value={newDate} onChangeText={setNewDate} />
          )}
          {dateMode !== 'custom' && (
            <Text style={styles.dateRange}>{fmtDate(newDate)}</Text>
          )}

          <MetalButton title="💾 Добавить расход" variant="success" onPress={handleAdd} />
        </MetalCard>

      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  blockTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14, textAlign: 'center' },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  periodBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e', alignItems: 'center' },
  periodBtnActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  periodLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  periodLabelActive: { color: colors.greenLight },
  datesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dateInput: { padding: 12, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 13, fontFamily: fonts.familyRegular },
  dateSep: { color: colors.muted, fontFamily: fonts.familyRegular },
  dateRange: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.borderHi, marginTop: 8 },
  totalLabel: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  totalValue: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.greenLight },
  rowName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  rowPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 16 },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  dropdown: { marginBottom: 4 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  chipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  chipLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  chipLabelActive: { color: colors.greenLight },
  dateChipsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dateChip: { flex: 1, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e', alignItems: 'center' },
  dateChipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  dateChipLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },
  dateChipLabelActive: { color: colors.greenLight },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, marginBottom: 4, fontFamily: fonts.familyRegular },
});
