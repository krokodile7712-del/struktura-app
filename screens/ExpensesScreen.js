import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

const CATEGORIES = ['Аренда', 'Зарплата', 'Закупка', 'Коммуналка', 'Прочее'];

const MOCK_EXPENSES = [
  { id: '1', date: '01.06.2026', category: 'Аренда', amount: 45000, comment: 'Июнь' },
  { id: '2', date: '03.06.2026', category: 'Закупка', amount: 12300, comment: 'Зерно, молоко, сиропы' },
  { id: '3', date: '05.06.2026', category: 'Зарплата', amount: 28000, comment: 'Аванс бариста' },
  { id: '4', date: '10.06.2026', category: 'Коммуналка', amount: 6200, comment: '' },
];

export default function ExpensesScreen({ navigation }) {
  const [expenses, setExpenses] = useState(MOCK_EXPENSES);
  const [adding, setAdding] = useState(false);
  const [filterCategory, setFilterCategory] = useState(null);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [comment, setComment] = useState('');

  const resetForm = () => {
    setAmount('');
    setCategory(CATEGORIES[0]);
    setComment('');
    setAdding(false);
  };

  const saveExpense = () => {
    if (!amount || isNaN(parseFloat(amount))) return;
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
    setExpenses(prev => [
      { id: String(Date.now()), date: dateStr, category, amount: parseFloat(amount), comment: comment.trim() },
      ...prev,
    ]);
    resetForm();
  };

  const filtered = filterCategory ? expenses.filter(e => e.category === filterCategory) : expenses;
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const byCategory = CATEGORIES.map(cat => ({
    cat,
    sum: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.sum > 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.cardTitle}>💸 Расходы</Text>

          <MetalButton title="← Назад" variant="back" onPress={() => navigation.navigate('Dashboard')} />

          {!adding && (
            <MetalButton title="+ Новый расход" variant="action" onPress={() => setAdding(true)} />
          )}

          {adding && (
            <View style={styles.form}>
              <Text style={styles.sectionTitle}>Категория</Text>
              <View style={styles.chipsRow}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat}
                    style={[styles.chip, category === cat && styles.chipActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.chipLabel, category === cat && styles.chipLabelActive]}>{cat}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Сумма</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={styles.sectionTitle}>Комментарий</Text>
              <TextInput
                style={styles.input}
                placeholder="Необязательно"
                placeholderTextColor={colors.muted}
                value={comment}
                onChangeText={setComment}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <MetalButton title="Сохранить" variant="success" onPress={saveExpense} style={{ flex: 1 }} />
                <MetalButton title="Отмена" variant="back" onPress={resetForm} style={{ flex: 1 }} />
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Фильтр по категории</Text>
          <View style={styles.chipsRow}>
            <Pressable
              style={[styles.chip, !filterCategory && styles.chipActive]}
              onPress={() => setFilterCategory(null)}
            >
              <Text style={[styles.chipLabel, !filterCategory && styles.chipLabelActive]}>Все</Text>
            </Pressable>
            {CATEGORIES.map(cat => (
              <Pressable
                key={cat}
                style={[styles.chip, filterCategory === cat && styles.chipActive]}
                onPress={() => setFilterCategory(cat)}
              >
                <Text style={[styles.chipLabel, filterCategory === cat && styles.chipLabelActive]}>{cat}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Записи</Text>
          {filtered.map((e) => (
            <View key={e.id} style={styles.row}>
              <View>
                <Text style={styles.rowName}>{e.category}{e.comment ? ` — ${e.comment}` : ''}</Text>
                <Text style={styles.rowSub}>{e.date}</Text>
              </View>
              <Text style={styles.rowPrice}>{e.amount.toLocaleString('ru-RU')} ₽</Text>
            </View>
          ))}

          <View style={[styles.row, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>ИТОГО</Text>
            <Text style={styles.grandTotalValue}>{total.toLocaleString('ru-RU')} ₽</Text>
          </View>

          {!filterCategory && byCategory.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 12 }]}>По категориям</Text>
              {byCategory.map(c => (
                <View key={c.cat} style={styles.row}>
                  <Text style={styles.rowSub}>{c.cat}</Text>
                  <Text style={styles.rowSub}>{c.sum.toLocaleString('ru-RU')} ₽</Text>
                </View>
              ))}
            </>
          )}
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Login" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingTop: 40, paddingBottom: 100, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  cardTitle: {
    fontFamily: fonts.family,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.textDim,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
    marginTop: 8,
  },
  form: {
    marginTop: 10,
    marginBottom: 6,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    padding: 13,
    backgroundColor: '#07080a',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 14,
    marginBottom: 10,
    fontFamily: fonts.familyRegular,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#0b0c0e',
  },
  chipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.18)' },
  chipLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  chipLabelActive: { color: colors.greenLight },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  rowPrice: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: colors.borderHi, borderBottomWidth: 0, paddingTop: 14, marginTop: 4 },
  grandTotalLabel: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
  grandTotalValue: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text },
});
