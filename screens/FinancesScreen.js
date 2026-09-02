import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import ExpensesPanel from '../components/panels/ExpensesPanel';
import EquipmentPanel from '../components/panels/EquipmentPanel';
import OverheadsPanel from '../components/panels/OverheadsPanel';
import InvestmentsPanel from '../components/panels/InvestmentsPanel';
import { getFinancesSummary } from '../db/queries';
import { goBackSmart, getSession } from '../db/session';
import { colors, fonts } from '../constants/theme';

const TABS = [
  { key: 'expenses',    label: 'Расходы' },
  { key: 'equipment',   label: 'Оборудование' },
  { key: 'overheads',   label: 'Накладные' },
  { key: 'investments', label: 'Инвестиции' },
];

const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');

function monthStr() {
  const d = new Date();
  return { from: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`, to: d.toISOString().slice(0,10) };
}

export default function FinancesScreen({ navigation, route }) {
  const isAdmin = getSession()?.role === 'admin';
  const [tab, setTab] = useState(isAdmin ? (route?.params?.initialTab || 'expenses') : 'expenses');
  const [summary, setSummary] = useState(null);

  const load = useCallback(() => {
    if (!isAdmin) return; // сводка по всем видам трат — дело администратора
    try {
      const { from, to } = monthStr();
      setSummary(getFinancesSummary(from, to));
    } catch (e) { console.error(e); }
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.root}>
      <TopBar title="Финансы" onBack={() => goBackSmart(navigation)} navigation={navigation} activeScreen="Finances" />

      {/* Компактная сводка за текущий месяц — только у администратора */}
      {isAdmin && summary && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.summaryRow} contentContainerStyle={styles.summaryRowInner}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>Расходы</Text>
            <Text style={styles.summaryChipVal}>{fmt(summary.expensesTotal)} ₽</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>Оборудование</Text>
            <Text style={styles.summaryChipVal}>{fmt(summary.equipmentTotal)} ₽</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>Накладные</Text>
            <Text style={styles.summaryChipVal}>{fmt(summary.overheadsTotal)} ₽</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>Инвестиции</Text>
            <Text style={styles.summaryChipVal}>{fmt(summary.investmentsTotal)} ₽</Text>
          </View>
        </ScrollView>
      )}

      {/* Вкладки — только у администратора, у сотрудника доступна только вкладка Расходы */}
      {isAdmin && (
        <View style={styles.tabBarOuter}>
          {TABS.map(t => (
            <Pressable key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabTxt, tab === t.key && styles.tabTxtActive]} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ flex: 1 }}>
        {tab === 'expenses'    && <ExpensesPanel navigation={navigation} />}
        {isAdmin && tab === 'equipment'   && <EquipmentPanel navigation={navigation} />}
        {isAdmin && tab === 'overheads'   && <OverheadsPanel navigation={navigation} />}
        {isAdmin && tab === 'investments' && <InvestmentsPanel navigation={navigation} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  summaryRow: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  summaryRowInner: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  summaryChip: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 12, minWidth: 108 },
  summaryChipLabel: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryChipVal: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },

  tabBarOuter: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  tabBtnActive: { backgroundColor: 'rgba(240,160,80,0.14)' },
  tabTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  tabTxtActive: { color: colors.orange },
});
