import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Alert, Animated } from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import InfoTip from '../components/InfoTip';
import { useFocusEffect } from '@react-navigation/native';
import {
  getInventoryActs, createInventoryAct, deleteInventoryAct,
  getAllStock, getBusinessProfile,
} from '../db/queries';
import { getHomeRoute } from '../db/session';
import { colors, fonts } from '../constants/theme';

const fmt = n => Math.round(n||0).toLocaleString('ru-RU');

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

const SCOPE_OPTIONS = [
  { key: 'all',      label: 'Весь склад',    hint: 'Пересчитать все позиции склада' },
  { key: 'category', label: 'По категории',  hint: 'Выбрать одну категорию товаров' },
  { key: 'manual',   label: 'Выборочно',     hint: 'Отметить конкретные позиции вручную' },
];

export default function InventoryScreen({ navigation }) {
  const [acts, setActs]             = useState([]);
  const [stock, setStock]           = useState([]);
  const [showSetup, setShowSetup]   = useState(false);
  const [scope, setScope]           = useState('all');
  const [expanded, setExpanded]     = useState(null);
  const fadeAnim = useState(new Animated.Value(0))[0];

  const load = useCallback(() => {
    try {
      setActs(getInventoryActs());
      setStock(getAllStock());
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    } catch(e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCreate = () => {
    try {
      createInventoryAct({ scope, location_id: null });
      setShowSetup(false);
      load();
    } catch(e) { Alert.alert('Ошибка', e.message); }
  };

  const handleDelete = (id) => {
    Alert.alert('Удалить акт?', 'Данные инвентаризации будут удалены', [
      { text: 'Отмена' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        try { deleteInventoryAct(id); load(); } catch(e) {}
      }}
    ]);
  };

  const categories = [...new Set(stock.map(s => s.category).filter(Boolean))];

  return (
    <View style={styles.root}>
      <TopBar
        title="Инвентаризация"
        onBack={() => navigation.navigate(getHomeRoute())}
        rightElement={
          <Pressable style={styles.addBtn} onPress={() => setShowSetup(true)}>
            <Text style={styles.addBtnTxt}>+ Новый акт</Text>
          </Pressable>
        }
      />

      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>

        {/* Подсказка */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Что такое инвентаризация?</Text>
          <Text style={styles.infoTxt}>
            Сверка фактических остатков с данными в системе. Помогает выявить расхождения — недостачи или излишки. Проводится периодически или по необходимости.
          </Text>
        </View>

        {acts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTxt}>Нет актов инвентаризации</Text>
            <Text style={styles.emptyHint}>Нажмите «+ Новый акт» чтобы начать пересчёт склада</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            {acts.map((act, idx) => {
              const isOpen = expanded === act.id;
              const items = act.items || [];
              const discrepancies = items.filter(i => i.fact_qty !== i.system_qty).length;

              return (
                <View key={act.id} style={[styles.card, idx > 0 && { marginTop: 10 }]}>
                  <Pressable style={styles.cardHeader} onPress={() => setExpanded(isOpen ? null : act.id)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        {SCOPE_OPTIONS.find(s => s.key === act.scope)?.label || 'Инвентаризация'}
                      </Text>
                      <Text style={styles.cardDate}>{fmtDate(act.created_at)}</Text>
                    </View>
                    <View style={styles.cardRight}>
                      {discrepancies > 0 && (
                        <View style={styles.discBadge}>
                          <Text style={styles.discBadgeTxt}>{discrepancies} расхождений</Text>
                        </View>
                      )}
                      <View style={[styles.statusBadge, { backgroundColor: act.status === 'completed' ? 'rgba(123,175,142,0.12)' : 'rgba(240,160,80,0.1)' }]}>
                        <Text style={[styles.statusTxt, { color: act.status === 'completed' ? colors.green : colors.orange }]}>
                          {act.status === 'completed' ? 'Завершён' : 'В процессе'}
                        </Text>
                      </View>
                      <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>›</Text>
                    </View>
                  </Pressable>

                  {isOpen && (
                    <View style={styles.cardBody}>
                      {items.length === 0 ? (
                        <Text style={styles.noItems}>Позиции не добавлены</Text>
                      ) : (
                        <>
                          <View style={styles.tableHeader}>
                            <Text style={[styles.tableHd, { flex: 2 }]}>Позиция</Text>
                            <Text style={styles.tableHd}>По системе</Text>
                            <Text style={styles.tableHd}>Факт</Text>
                            <Text style={styles.tableHd}>Разница</Text>
                          </View>
                          {items.map((item, ii) => {
                            const diff = (item.fact_qty || 0) - (item.system_qty || 0);
                            return (
                              <View key={ii} style={[styles.tableRow, ii < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                                <Text style={[styles.tableName, { flex: 2 }]} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.tableVal}>{fmt(item.system_qty)}</Text>
                                <Text style={styles.tableVal}>{fmt(item.fact_qty)}</Text>
                                <Text style={[styles.tableDiff, { color: diff === 0 ? colors.muted : diff > 0 ? colors.green : colors.red }]}>
                                  {diff > 0 ? '+' : ''}{fmt(diff)}
                                </Text>
                              </View>
                            );
                          })}
                        </>
                      )}

                      <Pressable style={styles.deleteBtn} onPress={() => handleDelete(act.id)}>
                        <Text style={styles.deleteBtnTxt}>Удалить акт</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </Animated.View>

      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка создания акта */}
      <Modal visible={showSetup} transparent animationType="fade" onRequestClose={() => setShowSetup(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowSetup(false)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Новый акт инвентаризации</Text>
            <Text style={styles.modalSub}>Выберите охват пересчёта</Text>

            <View style={styles.scopeList}>
              {SCOPE_OPTIONS.map((s, idx) => (
                <Pressable
                  key={s.key}
                  style={[styles.scopeRow, idx < SCOPE_OPTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }, scope === s.key && styles.scopeRowActive]}
                  onPress={() => setScope(s.key)}
                >
                  <View style={[styles.scopeCheck, scope === s.key && styles.scopeCheckActive]}>
                    {scope === s.key && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.scopeLabel, scope === s.key && { color: colors.orange }]}>{s.label}</Text>
                    <Text style={styles.scopeHint}>{s.hint}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.createBtn} onPress={handleCreate}>
              <Text style={styles.createBtnTxt}>Начать инвентаризацию</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setShowSetup(false)}>
              <Text style={styles.cancelBtnTxt}>Отмена</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg },

  infoCard:  { margin: 12, backgroundColor: 'rgba(139,127,212,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(139,127,212,0.2)', padding: 14 },
  infoTitle: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.indigo, marginBottom: 6 },
  infoTxt:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim, lineHeight: 18 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTxt:  { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 18, opacity: 0.7 },

  card:       { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  cardTitle:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 2 },
  cardDate:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  cardRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discBadge:  { backgroundColor: 'rgba(217,95,95,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  discBadgeTxt: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.red },
  statusBadge:{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusTxt:  { fontFamily: fonts.familySemibold, fontSize: 11 },
  chevron:    { fontSize: 20, color: colors.muted, transform: [{ rotate: '90deg' }] },
  chevronOpen:{ transform: [{ rotate: '-90deg' }] },

  cardBody:   { borderTopWidth: 1, borderTopColor: colors.border, padding: 16 },
  noItems:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 12 },

  tableHeader:{ flexDirection: 'row', marginBottom: 8 },
  tableHd:    { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, width: 70, textAlign: 'right' },
  tableRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  tableName:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text },
  tableVal:   { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, width: 70, textAlign: 'right' },
  tableDiff:  { fontFamily: fonts.familySemibold, fontSize: 13, width: 70, textAlign: 'right' },

  deleteBtn:  { marginTop: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(217,95,95,0.3)', backgroundColor: 'rgba(217,95,95,0.06)', alignItems: 'center' },
  deleteBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.red },

  addBtn:     { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(240,160,80,0.12)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)' },
  addBtnTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  modalBox:   { width: '50%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  modalTitle: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 },
  modalSub:   { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 20 },

  scopeList:  { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 16 },
  scopeRow:   { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  scopeRowActive: { backgroundColor: 'rgba(240,160,80,0.06)' },
  scopeCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  scopeCheckActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  scopeLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 2 },
  scopeHint:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  createBtn:  { backgroundColor: colors.orange, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  createBtnTxt: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff' },
  cancelBtn:  { paddingVertical: 12, alignItems: 'center' },
  cancelBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
});
