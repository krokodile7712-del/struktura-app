import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getNextStepsStatus, getSetting, setSetting } from '../db/queries';
import { colors, fonts } from '../constants/theme';

export const NEXT_STEPS = [
  { key: 'businessType', icon: '🎯', label: 'Подобрать тип бизнеса',       screen: 'Settings', params: { section: 'business' }, sub: 'Подставит термины и разделы' },
  { key: 'products',   icon: '🛍', label: 'Добавить первый товар или услугу', screen: 'Products', sub: 'Меню и цены' },
  { key: 'payMethods', icon: '💳', label: 'Настроить способы оплаты',         screen: 'Settings', params: { section: 'payment' }, sub: 'Оплата и скидки' },
  { key: 'employees',  icon: '👥', label: 'Добавить сотрудников',             screen: 'Employees', sub: 'Имена и PIN-коды' },
  { key: 'overheads',  icon: '🏢', label: 'Внести накладные расходы',         screen: 'Finances', params: { initialTab: 'expenses' }, sub: 'Аренда, коммунальные, интернет — с распределением по заказам' },
  { key: 'loyalty',    icon: '⭐', label: 'Настроить программу лояльности',   screen: 'Settings', params: { section: 'loyalty' }, sub: 'Баллы или скидки для клиентов' },
  { key: 'stock',      icon: '📦', label: 'Добавить склад и закупки',        screen: 'Products',  params: { initialTab: 'stock' }, sub: 'Остатки, пороги, движение' },
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

// Карусель шагов — одна карточка на экран (со скруглёнными краями и
// крупным номером вместо чек-листа), открывается сразу на первом
// невыполненном шаге, точки снизу вместо длинного списка. Пролистанные
// вручную шаги не перескакивают обратно при обновлении статуса —
// автопрокрутка на первый невыполненный срабатывает только один раз.
export default function NextStepsCard({ navigation, forceVisible = false }) {
  const { status, doneCount, visible } = useNextStepsProgress();
  const [containerW, setContainerW] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);
  const hasAutoScrolled = useRef(false);

  const firstUnfinished = NEXT_STEPS.findIndex(s => !status[s.key]);

  // Один раз при появлении карточки — сразу открываем на первом
  // невыполненном шаге, не листаем туда при каждом обновлении статуса
  useEffect(() => {
    if (hasAutoScrolled.current || containerW === 0) return;
    if (firstUnfinished > 0) {
      scrollRef.current?.scrollTo({ x: firstUnfinished * containerW, animated: false });
      setActiveIndex(firstUnfinished);
    }
    hasAutoScrolled.current = true;
  }, [containerW, firstUnfinished]);

  if (!visible && !forceVisible) return null;

  const dismiss = () => { try { setSetting('next_steps_dismissed', '1'); } catch (_) {} };

  const onScrollEnd = (e) => {
    if (!containerW) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / containerW);
    setActiveIndex(Math.max(0, Math.min(NEXT_STEPS.length - 1, i)));
  };

  const goTo = (i) => {
    scrollRef.current?.scrollTo({ x: i * containerW, animated: true });
    setActiveIndex(i);
  };

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

      <View onLayout={e => setContainerW(e.nativeEvent.layout.width)}>
        {containerW > 0 && (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            scrollEventThrottle={16}
          >
            {NEXT_STEPS.map((s, i) => {
              const done = !!status[s.key];
              return (
                <View key={s.key} style={{ width: containerW, paddingHorizontal: 16 }}>
                  <Pressable
                    style={({ pressed }) => [styles.stepCard, pressed && !done && { opacity: 0.9 }]}
                    onPress={() => !done && navigation.navigate(s.screen, s.params)}
                  >
                    <View style={[styles.numberBadge, done && styles.numberBadgeDone]}>
                      {done ? <Text style={styles.numberDoneTxt}>✓</Text> : <Text style={styles.numberTxt}>{i + 1}</Text>}
                    </View>
                    <Text style={styles.stepIcon}>{s.icon}</Text>
                    <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{s.label}</Text>
                    <Text style={styles.stepSub}>{s.sub}</Text>
                    {!done && (
                      <View style={styles.ctaBtn}>
                        <Text style={styles.ctaTxt}>Перейти</Text>
                      </View>
                    )}
                    {done && <Text style={styles.doneLabel}>Готово</Text>}
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.dotsRow}>
        {NEXT_STEPS.map((s, i) => (
          <Pressable key={s.key} onPress={() => goTo(i)} hitSlop={8}>
            <View style={[
              styles.dot,
              i === activeIndex && styles.dotActive,
              status[s.key] && styles.dotDone,
            ]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface2, borderRadius: 18, borderWidth: 1, borderColor: colors.borderHi, overflow: 'hidden', marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 12 },
  title: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 15, color: colors.muted, fontFamily: fonts.familySemibold },

  progressTrack: { height: 8, backgroundColor: colors.surface3, marginHorizontal: 16, borderRadius: 4, overflow: 'hidden', marginBottom: 16 },
  progressFill: { height: '100%', backgroundColor: colors.orange, borderRadius: 4 },

  stepCard: { backgroundColor: colors.surface3, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', minHeight: 180 },
  numberBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(240,160,80,0.12)', borderWidth: 1.5, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  numberBadgeDone: { backgroundColor: colors.green, borderColor: colors.green },
  numberTxt: { fontFamily: fonts.family, fontSize: 19, fontWeight: '800', color: colors.orange },
  numberDoneTxt: { fontFamily: fonts.family, fontSize: 19, fontWeight: '800', color: '#fff' },
  stepIcon: { fontSize: 26, marginBottom: 8 },
  stepLabel: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text, textAlign: 'center' },
  stepLabelDone: { color: colors.muted, textDecorationLine: 'line-through' },
  stepSub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  ctaBtn: { marginTop: 14, backgroundColor: colors.orange, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 24 },
  ctaTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: '#fff' },
  doneLabel: { marginTop: 14, fontFamily: fonts.familySemibold, fontSize: 14, color: colors.green },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: colors.orange },
  dotDone: { backgroundColor: colors.green },
});
