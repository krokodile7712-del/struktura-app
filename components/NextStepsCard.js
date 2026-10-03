import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getNextStepsStatus, getSetting, setSetting } from '../db/queries';
import { colors, fonts } from '../constants/theme';

// На Android (старая архитектура) LayoutAnimation нужно включить явно; в новой
// архитектуре вызов безвреден. Нужен для плавного сворачивания карточки.
if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

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
  const [loaded, setLoaded] = useState(false); // статус реально прочитан (до этого status — пустой)

  const load = useCallback(() => {
    try {
      setStatus(getNextStepsStatus());
      setDismissed(getSetting('next_steps_dismissed') === '1');
      setLoaded(true);
    } catch (_) {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dismiss = useCallback(() => {
    try { setSetting('next_steps_dismissed', '1'); } catch (_) {}
    setDismissed(true); // сразу, не дожидаясь следующего фокуса экрана
  }, []);

  const doneCount = NEXT_STEPS.filter(s => status[s.key]).length;
  const allDone = doneCount === NEXT_STEPS.length;
  const visible = !dismissed && !allDone;

  return { status, doneCount, total: NEXT_STEPS.length, allDone, dismissed, visible, dismiss, loaded, refresh: load };
}

// Карусель шагов — одна карточка на экран (со скруглёнными краями и
// крупным номером вместо чек-листа), открывается сразу на первом
// невыполненном шаге, точки снизу вместо длинного списка. Сворачивается в
// аккуратную полоску (название, следующий шаг, шкала из сегментов, счётчик);
// выбор запоминается в настройке next_steps_collapsed. На время вводного
// тура карточка всегда развёрнута — тур показывает её целиком.
//
// Как устроено позиционирование (раньше карточка при запуске встречала на
// стыке 5-го и 6-го шагов): переход на нужный шаг делается НЕ сразу при
// появлении списка (содержимое ещё не измерено, Android оставляет
// промежуточное смещение), а когда реально известна полная ширина
// содержимого, и повторяется без анимации при каждой смене ширины.
export default function NextStepsCard({ navigation, forceVisible = false }) {
  const { status, doneCount, total, visible, loaded } = useNextStepsProgress();
  const [containerW, setContainerW] = useState(0);
  const [activeIndex, setActiveIndex] = useState(null); // null — ещё не определён (статус не прочитан)
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef(null);
  const contentW = useRef(0);
  const positionedFor = useRef(0); // для какой ширины уже выставлено смещение

  const firstUnfinished = NEXT_STEPS.findIndex(s => !status[s.key]);
  const expandedNow = forceVisible || !collapsed;

  // Сохранённое состояние «свёрнуто» — читаем при каждом возврате на экран
  // (в том числе после «Показать подсказки заново» в Настройках)
  useFocusEffect(useCallback(() => {
    try { setCollapsed(getSetting('next_steps_collapsed') === '1'); } catch (_) {}
  }, []));

  // Один раз, когда статус прочитан, — запоминаем, на каком шаге открыться
  useEffect(() => {
    if (activeIndex === null && loaded) setActiveIndex(firstUnfinished >= 0 ? firstUnfinished : 0);
  }, [loaded, firstUnfinished, activeIndex]);

  const tryPosition = useCallback(() => {
    if (!containerW || activeIndex === null) return;
    if (contentW.current < containerW * NEXT_STEPS.length - 1) return; // содержимое ещё не измерено целиком
    if (positionedFor.current === containerW) return;
    positionedFor.current = containerW;
    scrollRef.current?.scrollTo({ x: activeIndex * containerW, animated: false });
  }, [containerW, activeIndex]);

  useEffect(() => { tryPosition(); }, [tryPosition]);

  // Список пересоздаётся при разворачивании — позиционируем заново
  useEffect(() => { positionedFor.current = 0; contentW.current = 0; }, [expandedNow]);

  if (!visible && !forceVisible) return null;

  const current = activeIndex ?? Math.max(0, firstUnfinished);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !collapsed;
    setCollapsed(next);
    try { setSetting('next_steps_collapsed', next ? '1' : '0'); } catch (_) {}
  };

  const onScrollEnd = (e) => {
    if (!containerW) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / containerW);
    setActiveIndex(Math.max(0, Math.min(NEXT_STEPS.length - 1, i)));
  };

  const goTo = (i) => {
    scrollRef.current?.scrollTo({ x: i * containerW, animated: true });
    setActiveIndex(i);
  };

  // ── Свёрнутая полоска ──
  if (!expandedNow) {
    const nextStep = firstUnfinished >= 0 ? NEXT_STEPS[firstUnfinished] : null;
    return (
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel="Развернуть «Что дальше»"
        style={({ pressed }) => [styles.strip, pressed && { opacity: 0.9 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.stripTitle}>Что дальше</Text>
          <Text style={styles.stripSub} numberOfLines={1}>
            {nextStep ? `Далее: ${nextStep.label}` : 'Всё готово'}
          </Text>
        </View>
        <View style={styles.stripSegments}>
          {NEXT_STEPS.map((s, i) => (
            <View
              key={s.key}
              style={[styles.seg, status[s.key] && styles.segDone, !status[s.key] && i === firstUnfinished && styles.segCurrent]}
            />
          ))}
        </View>
        <Text style={styles.stripCount}>{doneCount}/{total}</Text>
        <Text style={styles.chev}>▾</Text>
      </Pressable>
    );
  }

  // ── Развёрнутая карточка ──
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Что дальше</Text>
          <Text style={styles.sub}>Выполнено {doneCount} из {total}</Text>
        </View>
        {!forceVisible && (
          <Pressable
            onPress={toggle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Свернуть «Что дальше»"
            style={styles.closeBtn}
          >
            <Text style={styles.closeTxt}>▴</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(6, (doneCount / total) * 100)}%` }]} />
      </View>

      <View onLayout={e => setContainerW(e.nativeEvent.layout.width)}>
        {containerW > 0 && (
          <ScrollView
            ref={scrollRef}
            horizontal
            snapToInterval={containerW}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={(w) => { contentW.current = w; tryPosition(); }}
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
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{s.label}</Text>
                      <Text style={styles.stepSub} numberOfLines={1}>{s.sub}</Text>
                    </View>
                    {!done ? (
                      <View style={styles.ctaBtn}>
                        <Text style={styles.ctaTxt}>Перейти</Text>
                      </View>
                    ) : (
                      <Text style={styles.doneLabel}>Готово</Text>
                    )}
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
              i === current && styles.dotActive,
              status[s.key] && styles.dotDone,
            ]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Свёрнутая полоска
  strip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface2, borderRadius: 16, borderWidth: 1, borderColor: colors.borderHi, paddingVertical: 10, paddingHorizontal: 16, minHeight: 56, marginBottom: 16 },
  stripTitle: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.text },
  stripSub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 1 },
  stripSegments: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  seg: { width: 12, height: 4, borderRadius: 2, backgroundColor: colors.border },
  segDone: { backgroundColor: colors.green },
  segCurrent: { backgroundColor: colors.orange },
  stripCount: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, minWidth: 30, textAlign: 'right' },
  chev: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },

  card: { backgroundColor: colors.surface2, borderRadius: 18, borderWidth: 1, borderColor: colors.borderHi, overflow: 'hidden', marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 12 },
  title: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 15, color: colors.muted, fontFamily: fonts.familySemibold },

  progressTrack: { height: 8, backgroundColor: colors.surface3, marginHorizontal: 16, borderRadius: 4, overflow: 'hidden', marginBottom: 16 },
  progressFill: { height: '100%', backgroundColor: colors.orange, borderRadius: 4 },

  stepCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface3, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
  numberBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(240,160,80,0.12)', borderWidth: 1.5, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center', justifyContent: 'center' },
  numberBadgeDone: { backgroundColor: colors.green, borderColor: colors.green },
  numberTxt: { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: colors.orange },
  numberDoneTxt: { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#fff' },
  stepIcon: { fontSize: 20 },
  stepLabel: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  stepLabelDone: { color: colors.muted, textDecorationLine: 'line-through' },
  stepSub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  ctaBtn: { backgroundColor: colors.orange, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  ctaTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: '#fff' },
  doneLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.green },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: colors.orange },
  dotDone: { backgroundColor: colors.green },
});
