import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import Hint from '../components/Hint';
import InfoTip from '../components/InfoTip';
import EmptyState from '../components/EmptyState';
import { getEquipment, addEquipment, updateEquipment, deleteEquipment, manualIncrementEquipment, getAllProducts } from '../db/queries';
import { getHomeRoute } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';
import { useFocusEffect } from '@react-navigation/native';

const AMORT_TYPES = [
  { key: 'linear',     label: 'Линейная',      hint: 'Стоимость ÷ срок (мес.) = сумма в месяц. Не зависит от загрузки.' },
  { key: 'production', label: 'По циклам',      hint: 'Стоимость ÷ ресурс (циклов) = стоимость за 1 цикл использования.' },
  { key: 'mixed',      label: 'Смешанная',      hint: 'Линейная амортизация + учёт циклов для контроля износа.' },
];
const COUNTER_TYPES = [
  { key: 'order',   label: 'Каждый заказ',          hint: 'Счётчик растёт на N при каждом оформленном заказе.' },
  { key: 'product', label: 'Продажа товара',         hint: 'Счётчик растёт только при продаже выбранного товара.' },
  { key: 'manual',  label: 'Вручную',                hint: 'Сотрудник сам нажимает «+» когда использовал оборудование.' },
];

const EMPTY = { name: '', cost: '', purchase_date: '', amort_type: 'linear', amort_period: '36', amort_cycles: '0', counter_type: 'order', counter_product_id: null, cycles_per_use: '1' };

function amortDesc(eq) {
  if (!eq) return '';
  if (eq.amort_type === 'linear') {
    const monthly = eq.amort_period > 0 ? Math.round(eq.cost / eq.amort_period) : 0;
    return `~${monthly} ₽/мес · срок ${eq.amort_period} мес.`;
  }
  if (eq.amort_type === 'production') {
    const perCycle = eq.amort_cycles > 0 ? Math.round((eq.cost / eq.amort_cycles) * 100) / 100 : 0;
    return `${perCycle} ₽/цикл · ресурс ${eq.amort_cycles} цикл.`;
  }
  return 'Смешанная';
}

export default function EquipmentScreen({ navigation }) {
  const [items, setItems]       = useState([]);
  const [products, setProducts] = useState([]);
  const [modal, setModal]       = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  useFocusEffect(useCallback(() => {
    try { setItems(getEquipment()); setProducts(getAllProducts()); } catch (e) { console.error(e); }
  }, []));

  const openNew  = () => setModal({ ...EMPTY, id: null });
  const openEdit = (eq) => setModal({
    id: eq.id, name: eq.name, cost: String(eq.cost), purchase_date: eq.purchase_date || '',
    amort_type: eq.amort_type, amort_period: String(eq.amort_period), amort_cycles: String(eq.amort_cycles),
    counter_type: eq.counter_type, counter_product_id: eq.counter_product_id,
    cycles_per_use: String(eq.cycles_per_use || 1), current_cycles: eq.current_cycles,
  });

  const save = () => {
    if (!modal || !modal.name.trim()) return;
    const data = {
      name: modal.name.trim(), cost: parseFloat(modal.cost)||0,
      purchase_date: modal.purchase_date, amort_type: modal.amort_type,
      amort_period: parseInt(modal.amort_period)||0, amort_cycles: parseInt(modal.amort_cycles)||0,
      counter_type: modal.counter_type, counter_product_id: modal.counter_product_id||null,
      cycles_per_use: parseFloat(modal.cycles_per_use)||1,
    };
    try {
      if (modal.id) updateEquipment(modal.id, data);
      else addEquipment(data);
      setItems(getEquipment());
    } catch (e) { console.error(e); }
    setModal(null);
  };

  const remove = () => {
    try { deleteEquipment(confirmDel); setItems(getEquipment()); } catch (e) { console.error(e); }
    setConfirmDel(null); setModal(null);
  };

  const manualUse = (id) => {
    try { manualIncrementEquipment(id, 1); setItems(getEquipment()); } catch (e) { console.error(e); }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Оборудование" onBack={() => navigation.navigate(getHomeRoute())} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        {items.length === 0 ? (
          <EmptyState icon="⚙️" title="Оборудование не добавлено"
            text="Добавьте кофемашину, блендер, холодильник — и система будет считать амортизацию за каждую продажу. Это часть реальной себестоимости."
            action="+ Добавить оборудование" onAction={openNew} />
        ) : (
          <MetalCard>
            {items.map(eq => {
              const pct = eq.amort_cycles > 0 ? Math.min(100, Math.round(eq.current_cycles / eq.amort_cycles * 100)) : null;
              return (
                <Pressable key={eq.id} style={styles.row} onPress={() => openEdit(eq)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>⚙️ {eq.name}</Text>
                    <Text style={styles.rowSub}>{amortDesc(eq)}</Text>
                    {pct !== null && (
                      <View style={styles.progressWrap}>
                        <View style={[styles.progressBar, { width: `${pct}%` }]} />
                        <Text style={styles.progressText}>{eq.current_cycles} / {eq.amort_cycles} цикл. ({pct}%)</Text>
                      </View>
                    )}
                    {eq.counter_type === 'manual' && (
                      <Pressable style={styles.manualBtn} onPress={() => manualUse(eq.id)}>
                        <Text style={styles.manualBtnText}>+ Использовал</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.rowPrice}>{eq.cost.toLocaleString('ru-RU')} ₽ ›</Text>
                </Pressable>
              );
            })}
            <MetalButton title="+ Добавить оборудование" variant="default" onPress={openNew} style={{ marginTop: 12 }} />
          </MetalCard>
        )}
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setModal(null)} />
          {modal && (
            <View style={[styles.modalInner, { maxHeight: '90%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modal.id ? 'Редактировать' : 'Новое оборудование'}</Text>
                <Pressable onPress={() => setModal(null)} hitSlop={12}><Text style={styles.modalClose}>✕</Text></Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Название *</Text>
                <TextInput style={styles.input} value={modal.name} onChangeText={v => setModal(m => ({...m, name: v}))} placeholder="Кофемашина La Marzocco" placeholderTextColor={colors.muted} autoFocus={!modal.id} />

                <Text style={styles.fieldLabel}>Стоимость покупки, ₽</Text>
                <TextInput style={styles.input} value={modal.cost} onChangeText={v => setModal(m => ({...m, cost: v}))} keyboardType="numeric" placeholder="150000" placeholderTextColor={colors.muted} />

                <Text style={styles.fieldLabel}>Дата покупки</Text>
                <TextInput style={styles.input} value={modal.purchase_date} onChangeText={v => setModal(m => ({...m, purchase_date: v}))} placeholder="2024-01-15" placeholderTextColor={colors.muted} />

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 6 }}>
                  <Text style={styles.fieldLabel}>Тип амортизации</Text>
                  <InfoTip title="Типы амортизации" text="Линейная — равные суммы каждый месяц. По циклам — стоимость за каждое использование. Смешанная — оба метода одновременно." />
                </View>
                {AMORT_TYPES.map(t => (
                  <Pressable key={t.key} style={[styles.optionRow, modal.amort_type === t.key && styles.optionRowActive]} onPress={() => setModal(m => ({...m, amort_type: t.key}))}>
                    <Text style={[styles.optionLabel, modal.amort_type === t.key && styles.optionLabelActive]}>{modal.amort_type === t.key ? '◉ ' : '○ '}{t.label}</Text>
                    <Text style={styles.optionHint}>{t.hint}</Text>
                  </Pressable>
                ))}

                {(modal.amort_type === 'linear' || modal.amort_type === 'mixed') && <>
                  <Text style={styles.fieldLabel}>Срок амортизации, месяцев</Text>
                  <TextInput style={styles.input} value={modal.amort_period} onChangeText={v => setModal(m => ({...m, amort_period: v}))} keyboardType="numeric" placeholder="36" placeholderTextColor={colors.muted} />
                </>}
                {(modal.amort_type === 'production' || modal.amort_type === 'mixed') && <>
                  <Text style={styles.fieldLabel}>Ресурс оборудования, циклов</Text>
                  <TextInput style={styles.input} value={modal.amort_cycles} onChangeText={v => setModal(m => ({...m, amort_cycles: v}))} keyboardType="numeric" placeholder="50000" placeholderTextColor={colors.muted} />
                  <Hint>Сколько раз можно использовать до полного износа.</Hint>
                </>}

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 6 }}>
                  <Text style={styles.fieldLabel}>Счётчик циклов</Text>
                  <InfoTip title="Как считать циклы?" text="Каждый заказ — для универсального оборудования. Конкретный товар — например кофемашина считает только при продаже кофе. Вручную — сотрудник нажимает '+' на этом экране." />
                </View>
                {COUNTER_TYPES.map(t => (
                  <Pressable key={t.key} style={[styles.optionRow, modal.counter_type === t.key && styles.optionRowActive]} onPress={() => setModal(m => ({...m, counter_type: t.key}))}>
                    <Text style={[styles.optionLabel, modal.counter_type === t.key && styles.optionLabelActive]}>{modal.counter_type === t.key ? '◉ ' : '○ '}{t.label}</Text>
                    <Text style={styles.optionHint}>{t.hint}</Text>
                  </Pressable>
                ))}

                {modal.counter_type === 'product' && <>
                  <Text style={styles.fieldLabel}>Товар-триггер</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    {products.map(p => (
                      <Pressable key={p.id} style={[styles.productChip, modal.counter_product_id === p.id && styles.productChipActive]} onPress={() => setModal(m => ({...m, counter_product_id: p.id}))}>
                        <Text style={[styles.productChipText, modal.counter_product_id === p.id && styles.productChipTextActive]}>{p.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>}

                <Text style={styles.fieldLabel}>Циклов за одно использование</Text>
                <TextInput style={styles.input} value={modal.cycles_per_use} onChangeText={v => setModal(m => ({...m, cycles_per_use: v}))} keyboardType="numeric" placeholder="1" placeholderTextColor={colors.muted} />
                <Hint>Обычно 1. Если оборудование используется N раз за один заказ — укажите N.</Hint>

                <MetalButton title="Сохранить" variant="success" onPress={save} style={{ marginTop: 8 }} />
                {modal.id && <MetalButton title="Удалить" variant="danger" onPress={() => setConfirmDel(modal.id)} style={{ marginTop: 6 }} />}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={!!confirmDel} transparent animationType="fade" onRequestClose={() => setConfirmDel(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setConfirmDel(null)} />
          <View style={[styles.modalInner, { width: '40%' }]}>
            <Text style={styles.modalTitle}>Удалить оборудование?</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.familyRegular, fontSize: 13, marginVertical: 12 }}>Данные об амортизации и циклах будут удалены.</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <MetalButton title="Отмена" variant="back" onPress={() => setConfirmDel(null)} style={{ flex: 1 }} />
              <MetalButton title="Удалить" variant="danger" onPress={remove} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { fontFamily: fonts.family, fontSize: 15, color: colors.text },
  rowSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  rowPrice: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  progressWrap: { marginTop: 6, height: 6, backgroundColor: '#07080a', borderRadius: 3, overflow: 'hidden', position: 'relative' },
  progressBar: { height: '100%', backgroundColor: colors.greenLight, borderRadius: 3 },
  progressText: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, marginTop: 2 },
  manualBtn: { marginTop: 6, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(61,158,146,0.4)', alignSelf: 'flex-start' },
  manualBtnText: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.greenLight },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '58%', maxWidth: 520, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  modalClose: { fontSize: 18, color: colors.muted },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, marginBottom: 4, fontFamily: fonts.family },
  optionRow: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  optionRowActive: { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.08)' },
  optionLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, marginBottom: 2 },
  optionLabelActive: { color: colors.greenLight },
  optionHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  productChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  productChipActive: { borderColor: 'rgba(61,158,146,0.5)', backgroundColor: 'rgba(61,158,146,0.12)' },
  productChipText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  productChipTextActive: { color: colors.greenLight },
});
