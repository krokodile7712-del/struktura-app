import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getNextStepsStatus, getSetting, setSetting } from '../db/queries';
import { colors, fonts } from '../constants/theme';

export const NEXT_STEPS = [
  { key: 'products',   icon: '🛍', label: 'Добавить первый товар или услугу', screen: 'Products', sub: 'Меню и цены' },
  { key: 'payMethods', icon: '💳', label: 'Настроить способы оплаты',         screen: 'Settings', params: { section: 'payment' }, sub: 'Оплата и скидки' },
  { key: 'employees',  icon: '👥', label: 'Добавить сотрудников',             screen: 'Employees', sub: 'Имена и PIN-коды' },
  { key: 'overheads',  icon: '🏢', label: 'Внести накладные расходы',         screen: 'Overheads', sub: 'Аренда, коммунальные, интернет' },
  { key: 'loyalty',    icon: '⭐', label: 'Настроить программу лояльности',   screen: 'Settings', params: { section: 'loyalty' }, sub: 'Баллы или скидки для клиентов' },
  { key: 'stock',      icon: '📦', label: 'Добавить склад и закупки',        screen: 'Stock',     sub: 'Остатки, пороги, движение' },
];

// Общая проверка — используется и карточкой, и напоминающей плашкой в TopBar,
// чтобы не дублировать логику "всё готово / есть что скрывать".
export function useNextStepsProgress() {
  const [status, setStatus] = useState({});
  const [dismissed, setDismissed] = useState(true);

  const load = useCallback(() => {
    try {
      setStatus(getNextStepsStatus());
      setDismissed(getSetting('next_steps_dismissed') === '1');
    } catch (_) {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doneCount = NEXT_STEPS.filter(s => status[s.key]).length;
  const allDone = doneCount === NEXT_STEPS.length;
  const visible = !dismissed && !allDone;

  return { status, doneCount, allDone, dismissed, visible, refresh: load };
}

export default function NextStepsCard({ navigation }) {
  const { status, doneCount, visible } = useNextStepsProgress();
  if (!visible) return null;

  const dismiss = () => { try { setSetting('next_steps_dismissed', '1'); } catch (_) {} };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Что дальше</Text>
          <Text style={styles.sub}>Выполнено {doneCount} из {NEXT_STEPS.length}</Text>
        </View>
        <Pressable onPress={dismiss} hitSlop={10} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(6, (doneCount / NEXT_STEPS.length) * 100)}%` }]} />
      </View>

      {NEXT_STEPS.map((s, i) => {
        const done = !!status[s.key];
        return (
          <Pressable
            key={s.key}
            style={({ pressed }) => [
              styles.row,
              i < NEXT_STEPS.length - 1 && styles.rowDiv,
              pressed && !done && { backgroundColor: 'rgba(255,255,255,0.03)' },
            ]}
            onPress={() => !done && navigation.navigate(s.screen, s.params)}
          >
            <View style={[styles.checkbox, done && styles.checkboxDone]}>
              {done && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={[styles.icon, done && { opacity: 0.4 }]}>{s.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, done && styles.labelDone]}>{s.label}</Text>
              <Text style={styles.stepSub}>{s.sub}</Text>
            </View>
            {!done && <Text style={styles.arrow}>›</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 12 },
  title: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  closeBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 12, color: colors.muted, fontFamily: fonts.familySemibold },

  progressTrack: { height: 5, backgroundColor: colors.surface2, marginHorizontal: 16, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: colors.orange, borderRadius: 3 },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, gap: 12 },
  rowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: colors.green, borderColor: colors.green },
  checkMark: { color: '#fff', fontSize: 12, fontFamily: fonts.familySemibold },
  icon: { fontSize: 18 },
  label: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  labelDone: { color: colors.muted, textDecorationLine: 'line-through' },
  stepSub: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 1 },
  arrow: { fontSize: 18, color: colors.border },
});
