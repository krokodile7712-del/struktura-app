import React, { useState, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation, PanResponder, Animated } from 'react-native';
import { colors, fonts } from '../constants/theme';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_LABELS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

// Пружина по принципу Apple: КРИТИЧЕСКОЕ демпфирование (ζ = 1) — без перелёта —
// и параметр «отклик» (response) вместо сырых tension/friction. Для критического
// демпфирования: жёсткость k = ω², затухание c = 2ω, где ω = 2π / отклик.
// Раньше стояли tension 70 / friction 13 с порогом покоя 0,001 px: последние
// ~10 px пружина «доползала» ещё 0,15–0,25 с — это и ощущалось как отскок/доскок
// в конце перелистывания. Теперь порог покоя 1 px (разница до цели невидима),
// а overshootClamping не даёт выйти за цель вообще.
const SPRING_RESPONSE = 0.30; // секунд; у Apple для шторок/листов 0,3–0,4
const SPRING_OMEGA = (2 * Math.PI) / SPRING_RESPONSE;
const SPRING_CONFIG = {
  stiffness: SPRING_OMEGA * SPRING_OMEGA,
  damping: 2 * SPRING_OMEGA,
  mass: 1,
  overshootClamping: true,
  restDisplacementThreshold: 1,
  restSpeedThreshold: 30,
};
const MAX_FLING_VELOCITY = 4000; // px/с — защита от аномальных значений жеста
const FLICK_DECELERATION = 0.99; // у Apple 0,998 — обычный скролл, 0,99 — «отзывчивее» (постраничное листание)
function clampVelocity(v) { return Math.max(-MAX_FLING_VELOCITY, Math.min(MAX_FLING_VELOCITY, v)); }
// Куда долетел бы палец по инерции (формула из WWDC «Designing Fluid Interfaces»).
// Вход — скорость в px/с, выход — расстояние в px.
function projectFling(vPxPerSec) {
  return (vPxPerSec / 1000) * FLICK_DECELERATION / (1 - FLICK_DECELERATION);
}

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

// Понедельник — первый день недели (не воскресенье, как в JS Date.getDay())
function mondayIndex(jsDay) { return jsDay === 0 ? 6 : jsDay - 1; }

function buildMonthCells(year, month, onlineDates, manualDates) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = mondayIndex(firstOfMonth.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Раньше здесь всегда было 42 ячейки (6 строк) — чтобы высота карточки
  // не менялась между месяцами. Теперь наоборот, важнее компактность —
  // ровно столько строк (35 или 42 ячейки), сколько реально нужно этому
  // месяцу, без лишней пустой строки внизу
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const result = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1;
    if (dayNum < 1 || dayNum > daysInMonth) { result.push(null); continue; }
    const key = dateKey(year, month, dayNum);
    result.push({
      day: dayNum,
      key,
      isOnline: onlineDates?.has(key) || false,
      isManual: manualDates?.has(key) || false,
    });
  }
  return result;
}

// 7 дней от «сегодня + смещение*7 дней» вперёд — для свёрнутого недельного
// вида. weekOffset=0 — неделя, начинающаяся сегодня; +1/-1 — соседние недели
function buildWeekCells(today, weekOffset, onlineDates, manualDates) {
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + weekOffset * 7 + i);
    const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    result.push({
      day: d.getDate(),
      key,
      isOnline: onlineDates?.has(key) || false,
      isManual: manualDates?.has(key) || false,
    });
  }
  return result;
}

function addMonth(year, month, delta) {
  let y = year, m = month + delta;
  if (m < 0) { m = 11; y -= 1; }
  if (m > 11) { m = 0; y += 1; }
  return [y, m];
}

function DayCell({ cell, isToday, isSelected, onPress, onEmptyPress }) {
  if (!cell) return <Pressable style={styles.cell} onPress={onEmptyPress} />;
  return (
    <Pressable style={styles.cell} onPress={onPress}>
      <View style={[
        styles.dayCircle,
        isToday && styles.dayCircleToday,
        isSelected && styles.dayCircleSelected,
      ]}>
        <Text style={[
          styles.dayNum,
          isToday && styles.dayNumToday,
          isSelected && styles.dayNumSelected,
        ]}>{cell.day}</Text>
      </View>
      <View style={styles.dotsRow}>
        {cell.isOnline && <View style={[styles.dot, { backgroundColor: colors.orange }]} />}
        {cell.isManual && <View style={[styles.dot, { backgroundColor: colors.purple }]} />}
      </View>
    </Pressable>
  );
}

// Один месяц целиком — своё название и своя рамка едут вместе с датами,
// а не остаются позади статичным заголовком. Три таких панели стоят в ряд
// (предыдущий/текущий/следующий), все смонтированы одновременно, поэтому
// при свайпе соседний месяц со своим названием и рамкой сразу виден и
// едет вместе с пальцем, а не появляется только после отпускания.
function MonthPanel({ width, year, month, cells, todayKey, selectedDate, onSelectDay, onEmptyPress, onPrev, onNext, onHeight }) {
  return (
    <View style={{ width, paddingHorizontal: 4 }} onLayout={onHeight ? (e) => onHeight(e.nativeEvent.layout.height) : undefined}>
      <View style={styles.monthCard}>
        <View style={styles.monthHeader}>
          <Pressable onPress={onPrev} hitSlop={10} style={styles.monthArrowBtn}>
            <Text style={styles.monthArrow}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel}>{MONTH_LABELS[month]} {year}</Text>
          <Pressable onPress={onNext} hitSlop={10} style={styles.monthArrowBtn}>
            <Text style={styles.monthArrow}>›</Text>
          </Pressable>
        </View>
        <View style={styles.weekRow}>
          {WEEKDAY_LABELS.map(w => (
            <Text key={w} style={styles.weekdayLabel}>{w}</Text>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((cell, i) => (
            <DayCell
              key={i}
              cell={cell}
              isToday={cell?.key === todayKey}
              isSelected={cell?.key === selectedDate}
              onPress={() => cell && onSelectDay?.(cell.key, cell.isOnline || cell.isManual)}
              onEmptyPress={onEmptyPress}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// Одна неделя целиком — та же логика, что MonthPanel, только без заголовка
// и без собственной рамки (свёрнутый вид компактнее, рамка тут не нужна)
function WeekPanel({ width, cells, todayKey, selectedDate, onSelectDay }) {
  return (
    <View style={{ width }}>
      <View style={styles.grid}>
        {cells.map((cell, i) => (
          <DayCell
            key={i}
            cell={cell}
            isToday={cell.key === todayKey}
            isSelected={cell.key === selectedDate}
            onPress={() => onSelectDay?.(cell.key, cell.isOnline || cell.isManual)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Компактный месячный календарь с точками-индикаторами по источнику записи.
 * onlineDates / manualDates — Set строк 'YYYY-MM-DD' с записями за текущий видимый месяц.
 * onSelectDay(dateStr, hasBookings) — тап по дню.
 * onMonthChange(year, month0) — month0 — индекс месяца с нуля (как в Date).
 * embedded — без собственной рамки/фона, вписывается как верхняя часть уже
 *   существующей карточки (используется в альбомной ориентации).
 * collapsible — сворачивается в одну строку недели (тоже листается свайпом),
 *   разворачивается тапом по стрелке в полный месяц (портретная ориентация).
 */
export default function BookingsCalendar({ onlineDates, manualDates, selectedDate, onSelectDay, onMonthChange, embedded = false, collapsible = false }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based
  const [weekOffset, setWeekOffset] = useState(0);
  const [expanded, setExpanded] = useState(!collapsible);
  const [containerW, setContainerW] = useState(320);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const isTransitioning = useRef(false);

  // Высота карточки. Три месяца стоят в ряд одновременно, и раньше высота блока
  // была равна САМОМУ ВЫСОКОМУ из трёх — если сосед на 6 недель, то под
  // 5-недельным текущим месяцем оставалась пустая строка, а при смене центра
  // всё, что ниже календаря, прыгало на строку. Теперь высота задана явно:
  // равна высоте ТЕКУЩЕГО месяца, за пальцем плавно тянется к высоте соседа и
  // доезжает пружиной вместе с листанием. Значение анимируется через JS-драйвер
  // (высота — не нативное свойство), поэтому это ОТДЕЛЬНОЕ значение от slideAnim.
  const heightAnim = useRef(new Animated.Value(0)).current;
  const [heightKnown, setHeightKnown] = useState(false);
  const slotH = useRef({ prev: 0, cur: 0, next: 0 });
  const heightBusy = useRef(false);
  const handleSlotHeight = (slot) => (h) => {
    slotH.current[slot] = h;
    if (slot === 'cur') {
      if (!heightBusy.current) heightAnim.setValue(h);
      setHeightKnown(true);
    }
  };
  const heightAt = (dx) => {
    const { prev, cur, next } = slotH.current;
    const target = dx < 0 ? next : prev;
    if (!cur || !target) return null;
    return cur + (target - cur) * Math.min(1, Math.abs(dx) / containerW);
  };
  const animateHeightTo = (toValue) => {
    if (!expanded || !toValue) return;
    heightBusy.current = true;
    Animated.spring(heightAnim, { ...SPRING_CONFIG, toValue, useNativeDriver: false })
      .start(() => { heightBusy.current = false; });
  };

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [prevYear, prevMonth] = addMonth(viewYear, viewMonth, -1);
  const [nextYear, nextMonth] = addMonth(viewYear, viewMonth, 1);

  const prevCells = useMemo(() => buildMonthCells(prevYear, prevMonth, onlineDates, manualDates), [prevYear, prevMonth, onlineDates, manualDates]);
  const curCells = useMemo(() => buildMonthCells(viewYear, viewMonth, onlineDates, manualDates), [viewYear, viewMonth, onlineDates, manualDates]);
  const nextCells = useMemo(() => buildMonthCells(nextYear, nextMonth, onlineDates, manualDates), [nextYear, nextMonth, onlineDates, manualDates]);

  const prevWeekCells = useMemo(() => buildWeekCells(today, weekOffset - 1, onlineDates, manualDates), [weekOffset, onlineDates, manualDates]);
  const curWeekCells = useMemo(() => buildWeekCells(today, weekOffset, onlineDates, manualDates), [weekOffset, onlineDates, manualDates]);
  const nextWeekCells = useMemo(() => buildWeekCells(today, weekOffset + 1, onlineDates, manualDates), [weekOffset, onlineDates, manualDates]);

  // Завершение жеста — соседняя панель (месяц или неделя, в зависимости от
  // текущего вида) уже смонтирована и едет вместе с пальцем, поэтому здесь
  // остаётся только один финальный рывок пружиной до полного кадра. Пружина
  // стартует с РЕАЛЬНОЙ скоростью пальца в момент отпускания (velocity, px/с) —
  // шва между перетаскиванием и анимацией нет. Как только она останавливается,
  // меняем состояние и мгновенно обнуляем сдвиг — визуально ничего не прыгает,
  // потому что новый центр карусели уже стоит ровно там же.
  const commitChange = (delta, velocity = 0) => {
    const dir = delta > 0 ? -1 : 1;
    isTransitioning.current = true;
    animateHeightTo(delta > 0 ? slotH.current.next : slotH.current.prev);
    Animated.spring(slideAnim, {
      ...SPRING_CONFIG,
      toValue: dir * containerW,
      velocity: clampVelocity(velocity),
      useNativeDriver: true,
    }).start(() => {
      slideAnim.setValue(dir * containerW); // фиксируем ровно цель — до неё могло оставаться меньше порога покоя (1 px)
      if (expanded) {
        const [y, m] = addMonth(viewYear, viewMonth, delta);
        setViewYear(y);
        setViewMonth(m);
        onMonthChange?.(y, m);
      } else {
        setWeekOffset(o => o + delta);
      }
      // Сброс позиции — только после того, как React реально перерисует
      // дерево с новым месяцем в качестве центра. Если сбросить сразу
      // (setValue работает на нативном слое, минуя JS), позиция может
      // обнулиться раньше, чем JS успеет подменить содержимое — доля
      // секунды старого контента в новой позиции, воспринимается как доскок.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          slideAnim.setValue(0);
          isTransitioning.current = false;
        });
      });
    });
  };

  const springBack = (velocity = 0) => {
    Animated.spring(slideAnim, {
      ...SPRING_CONFIG,
      toValue: 0,
      velocity: clampVelocity(velocity),
      useNativeDriver: true,
    }).start();
    animateHeightTo(slotH.current.cur);
  };

  const toggleExpanded = () => {
    if (!collapsible) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHeightKnown(false); // у недельного и месячного вида разная высота — пока новая не измерена, высота автоматическая
    setExpanded(v => !v);
  };

  const clearSelection = () => onSelectDay?.(null, false);

  // Свайп влево/вправо — сетка следует за пальцем в реальном времени (не
  // ждёт отпускания), завершение — пружиной, а не линейным движением. Один
  // и тот же жест работает и для месяца (развёрнутый вид), и для недели
  // (свёрнутый) — какая именно смена происходит, решает commitChange по
  // текущему expanded. Порог по горизонтали с проверкой, что движение
  // преимущественно горизонтальное, не вертикальный скролл. Пересоздаём
  // объект на каждом рендере (не useRef) — иначе он замыкает состояние из
  // САМОГО ПЕРВОГО рендера навсегда, и каждый следующий свайп считает delta
  // от исходного значения, а не от текущего.
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => {
      if (isTransitioning.current) return;
      slideAnim.setValue(g.dx);
      if (expanded) {
        const h = heightAt(g.dx);
        if (h != null) heightAnim.setValue(h);
      }
    },
    onPanResponderRelease: (_, g) => {
      if (isTransitioning.current) return;
      // Решение — по проекции: куда палец долетел бы по инерции (а не по точке
      // отпускания). Лёгкий быстрый бросок листает, медленное «передумал» — нет;
      // направление определяет знак проекции, а не только смещение.
      const v = clampVelocity(g.vx * 1000); // PanResponder отдаёт px/мс, пружине нужны px/с
      const projected = g.dx + projectFling(v);
      if (Math.abs(projected) > containerW * 0.25) commitChange(projected < 0 ? 1 : -1, v);
      else springBack(v);
    },
  });

  return (
    <View style={[styles.root, !embedded && styles.rootCard]}>
      {collapsible && (
        <Pressable style={styles.collapseBtn} onPress={toggleExpanded} hitSlop={10}>
          <Text style={styles.collapseArrow}>{expanded ? '▲' : '▼'}</Text>
        </Pressable>
      )}

      <View style={{ overflow: 'hidden' }} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
        <Animated.View style={expanded && heightKnown ? { height: heightAnim, overflow: 'hidden' } : undefined}>
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            width: containerW * 3,
            marginLeft: -containerW,
            transform: [{ translateX: slideAnim }],
          }}
        >
          {expanded ? (
            <>
              <MonthPanel width={containerW} year={prevYear} month={prevMonth} cells={prevCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} onEmptyPress={clearSelection} onPrev={() => commitChange(-1)} onNext={() => commitChange(1)} onHeight={handleSlotHeight('prev')} />
              <MonthPanel width={containerW} year={viewYear} month={viewMonth} cells={curCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} onEmptyPress={clearSelection} onPrev={() => commitChange(-1)} onNext={() => commitChange(1)} onHeight={handleSlotHeight('cur')} />
              <MonthPanel width={containerW} year={nextYear} month={nextMonth} cells={nextCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} onEmptyPress={clearSelection} onPrev={() => commitChange(-1)} onNext={() => commitChange(1)} onHeight={handleSlotHeight('next')} />
            </>
          ) : (
            <>
              <WeekPanel width={containerW} cells={prevWeekCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} />
              <WeekPanel width={containerW} cells={curWeekCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} />
              <WeekPanel width={containerW} cells={nextWeekCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} />
            </>
          )}
        </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 },
  rootCard: { backgroundColor: colors.surface2, borderRadius: 16, borderWidth: 1, borderColor: colors.borderHi },

  collapseBtn: { position: 'absolute', top: 10, right: 10, zIndex: 2, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  collapseArrow: { fontSize: 13, color: colors.muted },

  // Рамка и название теперь принадлежат каждой отдельной месячной панели —
  // едут вместе с её датами, а не остаются позади неподвижным заголовком
  monthCard: { borderRadius: 12, borderWidth: 1, borderColor: colors.borderHi, padding: 8, backgroundColor: colors.surface3 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  monthArrowBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  monthArrow: { fontSize: 16, color: colors.muted, fontWeight: '700' },
  monthLabel: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center', flex: 1 },

  weekRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, paddingVertical: 3 },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 1 },

  dayCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { borderWidth: 1.5, borderColor: colors.orange },
  dayCircleSelected: { backgroundColor: colors.orange },
  dayNum: { fontFamily: fonts.familyRegular, fontSize: 15, color: colors.text },
  dayNumToday: { color: colors.orange, fontFamily: fonts.familySemibold },
  dayNumSelected: { color: '#fff', fontFamily: fonts.familySemibold },

  dotsRow: { flexDirection: 'row', gap: 3, height: 6, marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
