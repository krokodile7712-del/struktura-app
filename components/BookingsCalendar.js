import React, { useState, useMemo, useRef, useLayoutEffect } from 'react';
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
function MonthPanel({ width, tx, inFlow, year, month, cells, todayKey, selectedDate, onSelectDay, onEmptyPress, onPrev, onNext }) {
  return (
    <Animated.View style={[{ width, paddingHorizontal: 4 }, !inFlow && styles.panelAbs, { transform: [{ translateX: tx }] }]}>
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
    </Animated.View>
  );
}

// Одна неделя целиком — та же логика, что MonthPanel, только без заголовка
// и без собственной рамки (свёрнутый вид компактнее, рамка тут не нужна)
function WeekPanel({ width, tx, inFlow, cells, todayKey, selectedDate, onSelectDay }) {
  return (
    <Animated.View style={[{ width }, !inFlow && styles.panelAbs, { transform: [{ translateX: tx }] }]}>
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
    </Animated.View>
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

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  // ── Устройство карусели ──────────────────────────────────────────────────
  // Раньше три панели стояли в ряд, и в конце анимации содержимое подменялось
  // (центр становился соседом), а сдвиг сбрасывался в ноль двойным
  // requestAnimationFrame. Эти два действия не могли произойти в одном кадре, а
  // в тот же момент экран Записей перерисовывался целиком (загрузка точек
  // календаря) — отсюда «доскок» в конце. Теперь подмены нет совсем:
  //   • у каждой страницы (месяц или неделя) есть постоянный номер относительно
  //     стартовой — pageRel;
  //   • страница с номером N ВСЕГДА стоит в точке N·ширина, её сдвиг =
  //     общий сдвиг + N·ширина (Animated.add, считается нативно);
  //   • общий сдвиг при покое равен −pageRel·ширина, при листании просто
  //     едет к −(pageRel±1)·ширина и там и остаётся — НИЧЕГО не сбрасывается;
  //   • смена состояния (какой месяц «текущий») ничего не двигает визуально:
  //     панели сохраняют свой номер и свой сдвиг.
  const baseMonthRef = useRef(today.getFullYear() * 12 + today.getMonth());
  const monthRel = viewYear * 12 + viewMonth - baseMonthRef.current;
  const pageRel = expanded ? monthRel : weekOffset;

  const pages = useMemo(() => {
    const out = [];
    for (let d = -1; d <= 1; d++) {
      const idx = pageRel + d;
      if (expanded) {
        const abs = baseMonthRef.current + idx;
        const y = Math.floor(abs / 12);
        const m = abs - y * 12;
        out.push({ idx, year: y, month: m, cells: buildMonthCells(y, m, onlineDates, manualDates) });
      } else {
        out.push({ idx, cells: buildWeekCells(today, idx, onlineDates, manualDates) });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRel, expanded, onlineDates, manualDates]);

  // Сдвиг каждой страницы: общий сдвиг + её постоянное положение.
  const txs = useMemo(
    () => [-1, 0, 1].map(d => Animated.add(slideAnim, (pageRel + d) * containerW)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageRel, containerW],
  );

  // При смене ширины (поворот) или вида (месяц/неделя) ставим общий сдвиг на
  // покой текущей страницы — до отрисовки кадра, чтобы не мигнуть.
  useLayoutEffect(() => {
    slideAnim.setValue(-pageRel * containerW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerW, expanded]);

  // Завершение жеста. Состояние (какой месяц/неделя текущие) меняем СРАЗУ, в
  // момент отпускания: визуально это ничего не двигает (см. выше), зато
  // карточка уже меняет высоту под новый месяц — нативной анимацией
  // LayoutAnimation, параллельно с пружиной, без работы JS на каждом кадре
  // (прежняя анимация высоты через JS-драйвер и давала дрожание). Пружина
  // едет с РЕАЛЬНОЙ скоростью пальца (velocity, px/с) к постоянной точке
  // новой страницы. Загрузку точек календаря в экране Записей (onMonthChange)
  // откладываем до конца анимации, чтобы тяжёлая перерисовка не мешала движению.
  const commitChange = (delta, velocity = 0) => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    let changed = null;
    LayoutAnimation.configureNext({ duration: 280, update: { type: LayoutAnimation.Types.easeOut } });
    if (expanded) {
      changed = addMonth(viewYear, viewMonth, delta);
      setViewYear(changed[0]);
      setViewMonth(changed[1]);
    } else {
      setWeekOffset(o => o + delta);
    }
    Animated.spring(slideAnim, {
      ...SPRING_CONFIG,
      toValue: -(pageRel + delta) * containerW,
      velocity: clampVelocity(velocity),
      useNativeDriver: true,
    }).start(() => {
      isTransitioning.current = false;
      if (changed) onMonthChange?.(changed[0], changed[1]);
    });
  };

  const springBack = (velocity = 0) => {
    Animated.spring(slideAnim, {
      ...SPRING_CONFIG,
      toValue: -pageRel * containerW,
      velocity: clampVelocity(velocity),
      useNativeDriver: true,
    }).start();
  };

  const toggleExpanded = () => {
    if (!collapsible) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  };

  const clearSelection = () => onSelectDay?.(null, false);

  // Свайп влево/вправо — сетка следует за пальцем в реальном времени (не
  // ждёт отпускания), завершение — пружиной. Один и тот же жест работает и
  // для месяца (развёрнутый вид), и для недели (свёрнутый). Порог по
  // горизонтали с проверкой, что движение преимущественно горизонтальное,
  // не вертикальный скролл. Пересоздаём объект на каждом рендере (не useRef) —
  // иначе он замыкает состояние из САМОГО ПЕРВОГО рендера навсегда.
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => {
      if (isTransitioning.current) return;
      slideAnim.setValue(-pageRel * containerW + g.dx);
    },
    onPanResponderRelease: (_, g) => {
      if (isTransitioning.current) return;
      // Решение — по проекции: куда палец долетел бы по инерции (а не по точке
      // отпускания). Быстрый бросок листает, медленное «передумал» — нет;
      // направление определяет знак проекции.
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

      {/* Высоту блока задаёт ОДНА страница — текущая (она в обычном потоке);
          остальные лежат поверх неё и сдвинуты в стороны. Поэтому карточка
          всегда ровно по высоте текущего месяца, без пустой строки. */}
      <View
        style={{ overflow: 'hidden' }}
        onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        {pages.map((pg, i) => (expanded ? (
          <MonthPanel
            key={pg.idx}
            width={containerW}
            tx={txs[i]}
            inFlow={i === 1}
            year={pg.year}
            month={pg.month}
            cells={pg.cells}
            todayKey={todayKey}
            selectedDate={selectedDate}
            onSelectDay={onSelectDay}
            onEmptyPress={clearSelection}
            onPrev={() => commitChange(-1)}
            onNext={() => commitChange(1)}
          />
        ) : (
          <WeekPanel
            key={pg.idx}
            width={containerW}
            tx={txs[i]}
            inFlow={i === 1}
            cells={pg.cells}
            todayKey={todayKey}
            selectedDate={selectedDate}
            onSelectDay={onSelectDay}
          />
        )))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panelAbs: { position: 'absolute', top: 0, left: 0 },
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
