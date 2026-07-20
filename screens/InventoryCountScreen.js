import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Alert } from 'react-native';
import MetalCard from '../components/MetalCard';
import Hint from '../components/Hint';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import {
  getInventoryAct, setInventoryItemActual, confirmInventoryAct,
} from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmt(n) {
  if (n == null) return '—';
  return String(Math.round(n * 100) / 100);
}

function money(n) {
  if (n == null || n === 0) return '';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Math.round(n)} ₽`;
}

export default function InventoryCountScreen({ navigation, route }) {
  const { actId, readOnly } = route.params || {};
  const [act, setAct]               = useState(null);
  const [items, setItems]           = useState([]);
  const [localActuals, setLocalActuals] = useState({}); // {itemId: string}
  const [reviewModal, setReviewModal] = useState(false);
  const inputRefs = useRef({});

  useEffect(() => { loadAct(); }, [actId]);

  const loadAct = () => {
    try {
      const data = getInventoryAct(actId);
      if (!data) return;
      setAct(data);
      setItems(data.items || []);
      // Инициализируем локальные значения из БД
      const init = {};
      for (const item of data.items || []) {
        init[item.id] = item.actual != null ? String(item.actual) : '';
      }
      setLocalActuals(init);
    } catch (e) { console.error(e); }
  };

  const setActual = (itemId, value) => {
    setLocalActuals(prev => ({ ...prev, [itemId]: value }));
  };

  const saveActual = (item) => {
    const val = parseFloat(localActuals[item.id]);
    if (!isNaN(val)) {
      try { setInventoryItemActual(item.id, val); } catch (e) { console.error(e); }
    }
  };

  const openReview = () => {
    // Сохраняем все актуалы в БД перед показом итогов
    for (const item of items) {
      const val = parseFloat(localActuals[item.id]);
      if (!isNaN(val)) {
        try { setInventoryItemActual(item.id, val); } catch (_) {}
      }
    }
    loadAct();
    setReviewModal(true);
  };

  const handleConfirm = () => {
    try {
      confirmInventoryAct(actId);
      setReviewModal(false);
      navigation.navigate('Inventory');
    } catch (e) { console.error(e); Alert.alert('Ошибка', 'Не удалось подтвердить акт'); }
  };

  if (!act) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <TopBar title="Инвентаризация" onBack={() => navigation.navigate('Inventory')} />
        <Text style={{ color: colors.muted }}>Акт не найден</Text>
      </View>
    );
  }

  // Группируем по категории
  const cats = [...new Set(items.map(i => i.stock_name))]; // fallback
  const grouped = {};
  for (const item of items) {
    const cat = item.category || 'Прочее';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }
  // Если у items нет category (поле не в БД) — показываем плоским списком
  const hasCats = items.some(i => i.category);

  // Итоги для review
  const counted    = items.filter(i => localActuals[i.id] !== '' && !isNaN(parseFloat(localActuals[i.id])));
  const withDiff   = counted.filter(i => {
    const actual = parseFloat(localActuals[i.id]);
    return Math.abs(actual - (i.expected || 0)) > 0.0001;
  });
  const shortage   = withDiff.filter(i => parseFloat(localActuals[i.id]) < (i.expected || 0));
  const surplus    = withDiff.filter(i => parseFloat(localActuals[i.id]) > (i.expected || 0));
  const totalDiffMoney = counted.reduce((s, i) => {
    const actual = parseFloat(localActuals[i.id]);
    return s + (actual - (i.expected || 0)) * (i.cost_per_unit || 0);
  }, 0);

  const isDraft = act.status === 'draft';

  const renderItem = (item) => {
    const actualStr = localActuals[item.id] ?? '';
    const actualNum = parseFloat(actualStr);
    const expected  = item.expected || 0;
    const filled    = actualStr !== '' && !isNaN(actualNum);
    const diffQty   = filled ? actualNum - expected : null;
    const isShortage = diffQty != null && diffQty < -0.0001;
    const isSurplus  = diffQty != null && diffQty >  0.0001;

    return (
      <View key={item.id} style={[
        styles.itemRow,
        isShortage && styles.itemRowShortage,
        isSurplus  && styles.itemRowSurplus,
      ]}>
        <View style={styles.itemLeft}>
          <Text style={styles.itemName} numberOfLines={1}>{item.stock_name}</Text>
          <Text style={styles.itemExpected}>Учётный: {fmt(expected)} {item.unit}</Text>
        </View>

        <View style={styles.itemMiddle}>
          {isDraft && !readOnly ? (
            <TextInput
              ref={r => { inputRefs.current[item.id] = r; }}
              style={[styles.actualInput, filled && styles.actualInputFilled]}
              value={actualStr}
              onChangeText={v => setActual(item.id, v)}
              onBlur={() => saveActual(item)}
              keyboardType="numeric"
              placeholder="факт"
              placeholderTextColor={colors.muted}
            />
          ) : (
            <Text style={styles.actualReadOnly}>
              {item.actual != null ? fmt(item.actual) : '—'}
            </Text>
          )}
          <Text style={styles.itemUnit}>{item.unit}</Text>
        </View>

        {filled && (
          <Text style={[styles.diffText, isShortage && styles.diffShortage, isSurplus && styles.diffSurplus]}>
            {diffQty > 0 ? '+' : ''}{fmt(diffQty)}
            {item.cost_per_unit > 0 ? `\n${money(diffQty * item.cost_per_unit)}` : ''}
          </Text>
        )}
        {!filled && <View style={styles.diffText} />}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title={isDraft ? 'Подсчёт' : `Акт ${fmtDate(act.confirmed_at || act.created_at)}`}
        onBack={() => navigation.navigate('Inventory')}
      />

      {act.location_name ? (
        <View style={styles.metaBar}>
          <Text style={styles.metaText}>📍 {act.location_name}</Text>
          <Text style={styles.metaCount}>{counted.length} / {items.length} заполнено</Text>
        </View>
      ) : (
        <View style={styles.metaBar}>
          <Text style={styles.metaText}>Весь склад</Text>
          <Text style={styles.metaCount}>{counted.length} / {items.length} заполнено</Text>
        </View>
      )}
      {isDraft && !readOnly && (
        <View style={styles.instructionBar}>
          <Text style={styles.instructionText}>
            Пересчитайте физические остатки и введите фактическое количество в поле «факт». Учётный остаток — то что показывает система. После подтверждения склад обновится на введённые цифры.
          </Text>
        </View>
      )}

      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <View style={styles.headerRow}>
          <Text style={[styles.colHead, { flex: 1 }]}>Позиция / Учётный остаток</Text>
          <Text style={[styles.colHead, styles.colMiddle]}>Факт (введите)</Text>
          <Text style={[styles.colHead, styles.colRight]}>Разница</Text>
        </View>

        {hasCats ? (
          Object.entries(grouped).map(([cat, catItems]) => (
            <View key={cat} style={{ marginBottom: 8 }}>
              <Text style={styles.catHeader}>{cat}</Text>
              <MetalCard style={{ padding: 0 }}>
                {catItems.map(renderItem)}
              </MetalCard>
            </View>
          ))
        ) : (
          <MetalCard style={{ padding: 0 }}>
            {items.map(renderItem)}
          </MetalCard>
        )}
      </ScrollView>

      {isDraft && !readOnly && (
        <View style={styles.bottomBar}>
          <MetalButton
            title={`Завершить и просмотреть итоги (${counted.length} позиций)`}
            variant="success"
            onPress={openReview}
          />
        </View>
      )}

      {/* Модалка итогов */}
      <Modal visible={reviewModal} transparent animationType="fade" onRequestClose={() => setReviewModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setReviewModal(false)} />
          <View style={[styles.modalInner, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Итоги инвентаризации</Text>
              <Pressable onPress={() => setReviewModal(false)} hitSlop={12}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryVal}>{counted.length}</Text>
                  <Text style={styles.summaryLabel}>Пересчитано</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={[styles.summaryVal, { color: colors.redLight }]}>{shortage.length}</Text>
                  <Text style={styles.summaryLabel}>Недостач</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={[styles.summaryVal, { color: colors.greenLight }]}>{surplus.length}</Text>
                  <Text style={styles.summaryLabel}>Излишков</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={[styles.summaryVal, { color: totalDiffMoney < 0 ? colors.redLight : colors.greenLight }]}>
                    {money(totalDiffMoney) || '0 ₽'}
                  </Text>
                  <Text style={styles.summaryLabel}>Итого ₽</Text>
                </View>
              </View>

              {withDiff.length > 0 && (
                <>
                  <Text style={styles.diffHeader}>Расхождения</Text>
                  {withDiff.map(item => {
                    const actual = parseFloat(localActuals[item.id]);
                    const diff = actual - (item.expected || 0);
                    const diffM = diff * (item.cost_per_unit || 0);
                    return (
                      <View key={item.id} style={styles.diffRow}>
                        <Text style={styles.diffName} numberOfLines={1}>{item.stock_name}</Text>
                        <Text style={[styles.diffQty, diff < 0 ? styles.diffShortage : styles.diffSurplus]}>
                          {diff > 0 ? '+' : ''}{fmt(diff)} {item.unit}
                        </Text>
                        {item.cost_per_unit > 0 && (
                          <Text style={[styles.diffMoneyText, diff < 0 ? styles.diffShortage : styles.diffSurplus]}>
                            {money(diffM)}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </>
              )}

              {withDiff.length === 0 && counted.length > 0 && (
                <Text style={styles.noDiff}>✓ Расхождений не обнаружено</Text>
              )}
            </ScrollView>

            <Text style={styles.confirmHint}>
              После подтверждения остатки на складе будут обновлены на фактические значения.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <MetalButton title="← Вернуться" variant="back" onPress={() => setReviewModal(false)} style={{ flex: 1 }} />
              <MetalButton title="✓ Подтвердить" variant="success" onPress={handleConfirm} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 100, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  metaBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  instructionBar: { paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: 'rgba(61,95,168,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(61,95,168,0.15)' },
  instructionText: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18 },
  metaText: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  metaCount: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.greenLight },
  headerRow: { flexDirection: 'row', paddingBottom: 6, marginBottom: 4 },
  colHead: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  colMiddle: { width: 100, textAlign: 'center' },
  colRight: { width: 80, textAlign: 'right' },
  catHeader: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemRowShortage: { backgroundColor: 'rgba(160,16,32,0.06)' },
  itemRowSurplus:  { backgroundColor: 'rgba(61,158,146,0.06)' },
  itemLeft: { flex: 1 },
  itemName: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  itemExpected: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  itemMiddle: { width: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  actualInput: { width: 60, padding: 7, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontSize: 15, fontFamily: fonts.family, textAlign: 'center' },
  actualInputFilled: { borderColor: 'rgba(61,158,146,0.5)' },
  actualReadOnly: { fontFamily: fonts.family, fontSize: 15, color: colors.text },
  itemUnit: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  diffText: { width: 80, fontFamily: fonts.familySemibold, fontSize: 12, textAlign: 'right', lineHeight: 18 },
  diffShortage: { color: colors.redLight },
  diffSurplus: { color: colors.greenLight },
  bottomBar: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  // Модалка
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '62%', maxWidth: 580, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  modalClose: { fontSize: 18, color: colors.muted, padding: 4 },
  summaryGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCell: { flex: 1, backgroundColor: '#07080a', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  summaryVal: { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.text },
  summaryLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 4 },
  diffHeader: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  diffRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  diffName: { flex: 1, fontFamily: fonts.family, fontSize: 13, color: colors.text },
  diffQty: { fontFamily: fonts.familySemibold, fontSize: 13 },
  diffMoneyText: { fontFamily: fonts.familySemibold, fontSize: 12, width: 70, textAlign: 'right' },
  noDiff: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.greenLight, textAlign: 'center', paddingVertical: 16 },
  confirmHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 14, textAlign: 'center', lineHeight: 18 },
});
