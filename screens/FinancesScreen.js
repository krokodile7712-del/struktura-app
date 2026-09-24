import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import ExpensesPanel, { EXPENSES_TOUR_STEPS } from '../components/panels/ExpensesPanel';
import InvestmentsPanel, { INVESTMENTS_TOUR_STEPS } from '../components/panels/InvestmentsPanel';
import TourGuide from '../components/TourGuide';
import { useTourActiveKey } from '../components/TourRegistry';
import { getFinancesSummary, getBusinessProfile, markTourSeen } from '../db/queries';
import { goBackSmart, getSession } from '../db/session';
import { colors, fonts } from '../constants/theme';

const TABS = [
  { key: 'expenses',    label: 'Ежедневные' },
  { key: 'investments', label: 'Крупные покупки' },
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
  const [tourOpen, setTourOpen] = useState(false);
  const [tourFull, setTourFull] = useState(true); // true — весь раздел (обе вкладки), false — только текущая
  const activeTourKey = useTourActiveKey();

  const load = useCallback(() => {
    if (!isAdmin) return; // сводка по всем видам трат — дело администратора
    try {
      const { from, to } = monthStr();
      setSummary(getFinancesSummary(from, to));
    } catch (e) { console.error(e); }
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Переход на конкретную вкладку может случиться, даже когда экран уже
  // открыт (например, подсказка из формы Расходов) — обычный navigate()
  // в этом случае не пересоздаёт компонент, значит начальный useState
  // не сработает заново. Реагируем на смену параметра отдельно.
  useEffect(() => {
    if (isAdmin && route?.params?.initialTab) {
      setTab(route.params.initialTab);
    }
  }, [route?.params?.initialTab, isAdmin]);

  // Тур раздела «Расходы» — начинается с вкладки «Ежедневные», затем сам
  // переключает на «Крупные покупки» и продолжает уже там. При первом
  // визите — весь тур целиком (tourFull=true). При повторном запуске
  // через «?» — только шаги той вкладки, на которой сейчас находишься.
  const fullTourSteps = isAdmin ? [...EXPENSES_TOUR_STEPS, ...INVESTMENTS_TOUR_STEPS] : EXPENSES_TOUR_STEPS;
  const tourStepsToShow = tourFull ? fullTourSteps : (tab === 'expenses' ? EXPENSES_TOUR_STEPS : INVESTMENTS_TOUR_STEPS);
  const expensesStepKeys = new Set(EXPENSES_TOUR_STEPS.map(s => s.key));
  const investmentsStepKeys = new Set(INVESTMENTS_TOUR_STEPS.map(s => s.key));

  // Автозапуск при первом визите в раздел — весь тур целиком
  useEffect(() => {
    try {
      const p = getBusinessProfile();
      if (!p?.tours_seen?.Finances) {
        const t = setTimeout(() => { setTab('expenses'); setTourFull(true); setTourOpen(true); }, 500);
        return () => clearTimeout(t);
      }
    } catch (_) {}
  }, []);

  // Шаги про Расходы держат вкладку «Ежедневные», шаги про Крупные покупки
  // переключают на «Крупные покупки»
  useEffect(() => {
    if (expensesStepKeys.has(activeTourKey)) setTab('expenses');
    else if (investmentsStepKeys.has(activeTourKey)) setTab('investments');
  }, [activeTourKey]);

  return (
    <View style={styles.root}>
      <TopBar
        title="Расходы"
        onBack={() => goBackSmart(navigation)}
        navigation={navigation}
        activeScreen="Finances"
        rightElement={
          <Pressable onPress={() => { setTourFull(false); setTourOpen(true); }} hitSlop={10} style={styles.tourBtn} accessibilityLabel="Подсказка" accessibilityRole="button">
            <Text style={styles.tourBtnTxt}>?</Text>
          </Pressable>
        }
      />

      {/* Компактная сводка за текущий месяц — только у администратора */}
      {isAdmin && summary && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.summaryRow} contentContainerStyle={styles.summaryRowInner}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>Ежедневные</Text>
            <Text style={styles.summaryChipVal}>{fmt(summary.expensesTotal + summary.overheadsTotal)} ₽</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>Крупные покупки</Text>
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
        {isAdmin && tab === 'investments' && <InvestmentsPanel navigation={navigation} />}
      </View>

      <TourGuide
        visible={tourOpen}
        onClose={() => { setTourOpen(false); if (tourFull) markTourSeen('Finances'); }}
        steps={tourStepsToShow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tourBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(240,160,80,0.1)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center', justifyContent: 'center' },
  tourBtnTxt: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.orange },

  summaryRow: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.borderHi, backgroundColor: colors.surface2 },
  summaryRowInner: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  summaryChip: { backgroundColor: colors.surface3, borderRadius: 12, borderWidth: 1, borderColor: colors.borderHi, paddingVertical: 9, paddingHorizontal: 14, minWidth: 120 },
  summaryChipLabel: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  summaryChipVal: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 3 },

  tabBarOuter: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderHi, backgroundColor: colors.surface2 },
  tabBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 12 },
  tabBtnActive: { backgroundColor: 'rgba(240,160,80,0.14)' },
  tabTxt: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  tabTxtActive: { color: colors.orange },
});
