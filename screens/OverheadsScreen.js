import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import Hint from '../components/Hint';
import InfoTip from '../components/InfoTip';
import EmptyState from '../components/EmptyState';
import { getOverheadItems, addOverheadItem, updateOverheadItem, deleteOverheadItem } from '../db/queries';
import { getHomeRoute } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';
import { useFocusEffect } from '@react-navigation/native';

const PERIODS = [
  { key: 'month', label: 'В месяц' },
  { key: 'week',  label: 'В неделю' },
  { key: 'year',  label: 'В год' },
];
const BASES = [
  { key: 'order',       label: 'На заказ',       hint: 'Месячная сумма ÷ кол-во заказов за месяц = стоимость на заказ' },
  { key: 'hour',        label: 'На час работы',   hint: 'Укажите часов в месяц — вычислит накладные на каждый рабочий час' },
  { key: 'revenue_pct', label: '% от выручки',    hint: 'Фиксированный % с каждого заказа. Укажите % в поле «Значение».' },
];

const EMPTY = { name: '', amount: '', period: 'month', basis: 'order', basis_value: '' };

function monthlyAmt(item) {
  const a = item.amount || 0;
  if (item.period === 'year')  return a / 12;
  if (item.period === 'week')  return a * 4.33;
  return a;
}

export default function OverheadsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);

  useFocusEffect(useCallback(() => {
    try { setItems(getOverheadItems()); } catch (e) { console.error(e); }
  }, []));

  const totalMonthly = items.reduce((s, i) => s + monthlyAmt(i), 0);

  const save = () => {
    if (!modal || !modal.name.trim() || !modal.amount) return;
    const data = {
      name: modal.name.trim(), amount: parseFloat(modal.amount)||0,
      period: modal.period, basis: modal.basis,
      basis_value: parseFloat(modal.basis_value)||0,
    };
    try {
      if (modal.id) updateOverheadItem(modal.id, data);
      else addOverheadItem(data);
      setItems(getOverheadItems());
    } catch (e) { console.error(e); }
    setModal(null);
  };

  const remove = () => {
    try { deleteOverheadItem(modal.id); setItems(getOverheadItems()); } catch (e) { console.error(e); }
    setModal(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Накладные расходы" onBack={() => navigation.navigate(getHomeRoute())} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        {items.length === 0 ? (
          <EmptyState icon="🏢" title="Накладные расходы не добавлены"
            text="Аренда, коммунальные, интернет, страховка — всё что вы платите постоянно, независимо от продаж. Без этих цифр реальная себестоимость занижена."
            action="+ Добавить статью расходов" onAction={() => setModal({ ...EMPTY, id: null })} />
        ) : (
          <MetalCard>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Итого накладных в месяц:</Text>
              <Text style={styles.totalValue}>{Math.round(totalMonthly).toLocaleString('ru-RU')} ₽</Text>
            </View>
            {items.map(item => (
              <Pressable key={item.id} style={styles.row} onPress={() => setModal({
                id: item.id, name: item.name, amount: String(item.amount),
                period: item.period, basis: item.basis, basis_value: String(item.basis_value||''),
              })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowSub}>
                    {item.amount.toLocaleString('ru-RU')} ₽ {PERIODS.find(p=>p.key===item.period)?.label?.toLowerCase()} ·{' '}
                    {BASES.find(b=>b.key===item.basis)?.label?.toLowerCase()}
                    {item.basis === 'revenue_pct' ? ` (${item.basis_value}%)` : ''}
                    {item.basis === 'hour' ? ` (${item.basis_value} ч/мес)` : ''}
                  </Text>
                </View>
                <Text style={styles.rowPrice}>{Math.round(monthlyAmt(item)).toLocaleString('ru-RU')} ₽/мес ›</Text>
              </Pressable>
            ))}
            <MetalButton title="+ Добавить статью" variant="default" onPress={() => setModal({ ...EMPTY, id: null })} style={{ marginTop: 12 }} />
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
                <Text style={styles.modalTitle}>{modal.id ? 'Изменить' : 'Новая статья'}</Text>
                <Pressable onPress={() => setModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Название</Text>
                <TextInput style={styles.input} value={modal.name} onChangeText={v => setModal(m=>({...m, name: v}))} placeholder="Аренда, Коммунальные, Интернет..." placeholderTextColor={colors.muted} autoFocus={!modal.id} />

                <Text style={styles.fieldLabel}>Сумма, ₽</Text>
                <TextInput style={styles.input} value={modal.amount} onChangeText={v => setModal(m=>({...m, amount: v}))} keyboardType="numeric" placeholder="50000" placeholderTextColor={colors.muted} />

                <Text style={styles.fieldLabel}>Период</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                  {PERIODS.map(p => (
                    <Pressable key={p.key} style={[styles.chip, modal.period === p.key && styles.chipActive]} onPress={() => setModal(m=>({...m, period: p.key}))}>
                      <Text style={[styles.chipText, modal.period === p.key && styles.chipTextActive]}>{p.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 6 }}>
                  <Text style={styles.fieldLabel}>База распределения</Text>
                  <InfoTip title="База распределения" text="Как делить сумму на единицу продукции. На заказ — поровну между всеми заказами. На час — пропорционально рабочему времени. Процент — фиксированная доля каждого заказа." />
                </View>
                {BASES.map(b => (
                  <Pressable key={b.key} style={[styles.optionRow, modal.basis === b.key && styles.optionRowActive]} onPress={() => setModal(m=>({...m, basis: b.key}))}>
                    <Text style={[styles.optionLabel, modal.basis === b.key && styles.optionLabelActive]}>{modal.basis===b.key?'◉ ':'○ '}{b.label}</Text>
                    <Text style={styles.optionHint}>{b.hint}</Text>
                  </Pressable>
                ))}

                {modal.basis === 'hour' && <>
                  <Text style={styles.fieldLabel}>Рабочих часов в месяц</Text>
                  <TextInput style={styles.input} value={modal.basis_value} onChangeText={v => setModal(m=>({...m, basis_value: v}))} keyboardType="numeric" placeholder="176" placeholderTextColor={colors.muted} />
                </>}
                {modal.basis === 'revenue_pct' && <>
                  <Text style={styles.fieldLabel}>Процент от выручки, %</Text>
                  <TextInput style={styles.input} value={modal.basis_value} onChangeText={v => setModal(m=>({...m, basis_value: v}))} keyboardType="numeric" placeholder="3" placeholderTextColor={colors.muted} />
                </>}

                <MetalButton title="Сохранить" variant="success" onPress={save} style={{ marginTop: 10 }} />
                {modal.id && <MetalButton title="Удалить" variant="danger" onPress={remove} style={{ marginTop: 6 }} />}
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
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  totalLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  totalValue: { fontFamily: fonts.family, fontSize: 18, fontWeight: '700', color: colors.greenLight },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  rowPrice: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '52%', maxWidth: 480, maxHeight: '85%', backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  modalClose: { fontSize: 18, color: colors.muted },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, marginBottom: 4, fontFamily: fonts.family },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.1)' },
  chipText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  chipTextActive: { color: colors.greenLight },
  optionRow: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  optionRowActive: { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.08)' },
  optionLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  optionLabelActive: { color: colors.greenLight },
  optionHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
});
