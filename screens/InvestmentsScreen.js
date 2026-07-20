import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import Hint from '../components/Hint';
import InfoTip from '../components/InfoTip';
import EmptyState from '../components/EmptyState';
import { getInvestments, addInvestment, updateInvestment, deleteInvestment, getInvestmentSummary, getPnL } from '../db/queries';
import { getHomeRoute } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';
import { useFocusEffect } from '@react-navigation/native';

const CATEGORIES = [
  { key: 'equipment',  label: 'Оборудование',   icon: '⚙️' },
  { key: 'renovation', label: 'Ремонт',          icon: '🔨' },
  { key: 'marketing',  label: 'Реклама/запуск',  icon: '📣' },
  { key: 'deposit',    label: 'Депозит',         icon: '🔑', returnable: true },
  { key: 'other',      label: 'Прочее',          icon: '📦' },
];

const EMPTY = { name: '', amount: '', invest_date: '', amort_months: '', category: 'other', returnable: false };

function fmt(n) { return Math.round(n||0).toLocaleString('ru-RU'); }

export default function InvestmentsScreen({ navigation }) {
  const [items, setItems]     = useState([]);
  const [summary, setSummary] = useState(null);
  const [avgMonthlyProfit, setAvgMonthlyProfit] = useState(0);
  const [modal, setModal]     = useState(null);

  useFocusEffect(useCallback(() => {
    try {
      setItems(getInvestments());
      const s = getInvestmentSummary();
      setSummary(s);
      // Средняя прибыль за последние 3 месяца
      const d = new Date();
      const to = d.toISOString().slice(0,10);
      d.setMonth(d.getMonth()-3);
      const from = d.toISOString().slice(0,10);
      const p3 = getPnL(from, to);
      setAvgMonthlyProfit(Math.round((p3.netProfit || 0) / 3));
    } catch (e) { console.error(e); }
  }, []));

  const save = () => {
    if (!modal || !modal.name.trim() || !modal.amount) return;
    const data = {
      name: modal.name.trim(), amount: parseFloat(modal.amount)||0,
      invest_date: modal.invest_date, amort_months: parseInt(modal.amort_months)||0,
      category: modal.category, returnable: modal.returnable ? 1 : 0,
    };
    try {
      if (modal.id) updateInvestment(modal.id, data);
      else addInvestment(data);
      setItems(getInvestments());
      setSummary(getInvestmentSummary());
    } catch (e) { console.error(e); }
    setModal(null);
  };

  const remove = () => {
    try { deleteInvestment(modal.id); setItems(getInvestments()); setSummary(getInvestmentSummary()); } catch (e) { console.error(e); }
    setModal(null);
  };

  const nonReturnableTotal = items.filter(i => !i.returnable).reduce((s,i) => s + i.amount, 0);
  const returnableTotal    = items.filter(i => i.returnable).reduce((s,i) => s + i.amount, 0);
  const recovered = summary?.totalRevenue ? Math.min(nonReturnableTotal, summary.totalRevenue * 0.15) : 0; // упрощённо
  const remaining  = Math.max(0, nonReturnableTotal - recovered);
  const monthsLeft = avgMonthlyProfit > 0 ? Math.ceil(remaining / avgMonthlyProfit) : null;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Инвестиции" onBack={() => navigation.navigate(getHomeRoute())} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

        {/* Сводка */}
        {items.length > 0 && (
          <MetalCard style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>Окупаемость</Text>
              <InfoTip title="Как считается окупаемость?" text="Вложено — сумма всех невозвратных инвестиций. Средняя чистая прибыль берётся из P&L за последние 3 месяца. Прогноз = Осталось ÷ Прибыль в месяц." />
            </View>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryVal}>{fmt(nonReturnableTotal)} ₽</Text>
                <Text style={styles.summaryLabel}>Вложено</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={[styles.summaryVal, { color: colors.greenLight }]}>{fmt(remaining)} ₽</Text>
                <Text style={styles.summaryLabel}>Осталось отбить</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryVal}>{fmt(avgMonthlyProfit)} ₽</Text>
                <Text style={styles.summaryLabel}>Прибыль/мес (ср.)</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={[styles.summaryVal, { color: monthsLeft ? '#f5c842' : colors.muted }]}>
                  {monthsLeft ? `${monthsLeft} мес.` : '—'}
                </Text>
                <Text style={styles.summaryLabel}>До окупаемости</Text>
              </View>
            </View>
            {returnableTotal > 0 && (
              <Text style={styles.depositNote}>+ {fmt(returnableTotal)} ₽ возвратных вложений (депозиты) учитываются отдельно</Text>
            )}
          </MetalCard>
        )}

        {/* Список */}
        {items.length === 0 ? (
          <EmptyState icon="💰" title="Вложения не добавлены"
            text="Внесите всё что вы потратили на запуск бизнеса: ремонт, оборудование, рекламу. Система покажет через сколько месяцев вы окупитесь при текущей прибыли."
            action="+ Добавить вложение" onAction={() => setModal({ ...EMPTY, id: null })} />
        ) : (
          <MetalCard>
            {items.map(item => {
              const cat = CATEGORIES.find(c => c.key === item.category);
              return (
                <Pressable key={item.id} style={styles.row} onPress={() => setModal({
                  id: item.id, name: item.name, amount: String(item.amount),
                  invest_date: item.invest_date, amort_months: String(item.amort_months||''),
                  category: item.category, returnable: !!item.returnable,
                })}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{cat?.icon || '📦'} {item.name}{item.returnable ? ' 🔄' : ''}</Text>
                    <Text style={styles.rowSub}>
                      {item.invest_date || ''}
                      {item.amort_months > 0 ? ` · ${item.amort_months} мес.` : ''}
                      {item.returnable ? ' · возвратные' : ''}
                    </Text>
                  </View>
                  <Text style={styles.rowPrice}>{fmt(item.amount)} ₽ ›</Text>
                </Pressable>
              );
            })}
            <MetalButton title="+ Добавить вложение" variant="default" onPress={() => setModal({ ...EMPTY, id: null })} style={{ marginTop: 12 }} />
          </MetalCard>
        )}
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setModal(null)} />
          {modal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modal.id ? 'Изменить' : 'Новое вложение'}</Text>
                <Pressable onPress={() => setModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Название</Text>
                <TextInput style={styles.input} value={modal.name} onChangeText={v => setModal(m=>({...m, name: v}))} placeholder="Ремонт, Холодильник, Реклама..." placeholderTextColor={colors.muted} autoFocus={!modal.id} />

                <Text style={styles.fieldLabel}>Сумма, ₽</Text>
                <TextInput style={styles.input} value={modal.amount} onChangeText={v => setModal(m=>({...m, amount: v}))} keyboardType="numeric" placeholder="500000" placeholderTextColor={colors.muted} />

                <Text style={styles.fieldLabel}>Дата вложения</Text>
                <TextInput style={styles.input} value={modal.invest_date} onChangeText={v => setModal(m=>({...m, invest_date: v}))} placeholder="2024-01-01" placeholderTextColor={colors.muted} />

                <Text style={styles.fieldLabel}>Категория</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {CATEGORIES.map(c => (
                    <Pressable key={c.key} style={[styles.chip, modal.category === c.key && styles.chipActive]} onPress={() => setModal(m => ({...m, category: c.key, returnable: c.returnable || false}))}>
                      <Text style={[styles.chipText, modal.category === c.key && styles.chipTextActive]}>{c.icon} {c.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Срок окупаемости/списания, месяцев</Text>
                <TextInput style={styles.input} value={modal.amort_months} onChangeText={v => setModal(m=>({...m, amort_months: v}))} keyboardType="numeric" placeholder="60 (оставьте 0 если не знаете)" placeholderTextColor={colors.muted} />
                <Hint>Необязательно. Ремонт обычно списывают за 3-10 лет (36-120 месяцев).</Hint>

                <Pressable style={styles.row} onPress={() => setModal(m => ({...m, returnable: !m.returnable}))}>
                  <Text style={styles.rowName}>Возвратные вложения (депозит)</Text>
                  <Text style={styles.rowPrice}>{modal.returnable ? '☑' : '☐'}</Text>
                </Pressable>
                <Hint>Депозит аренды и подобные суммы которые вернутся к вам. Не учитываются в сумме для окупаемости.</Hint>

                <MetalButton title="Сохранить" variant="success" onPress={save} style={{ marginTop: 10 }} />
                {modal.id && !modal.equipment_id && <MetalButton title="Удалить" variant="danger" onPress={remove} style={{ marginTop: 6 }} />}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCell: { flex: 1, minWidth: 130, padding: 12, backgroundColor: '#07080a', borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  summaryVal: { fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.text },
  summaryLabel: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, marginTop: 4, textAlign: 'center' },
  depositNote: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 10, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.family, fontSize: 14, color: colors.text, flex: 1 },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  rowPrice: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '52%', maxWidth: 480, maxHeight: '88%', backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  modalClose: { fontSize: 18, color: colors.muted },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, marginBottom: 4, fontFamily: fonts.family },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.1)' },
  chipText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  chipTextActive: { color: colors.greenLight },
});
