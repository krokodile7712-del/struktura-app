import React, { useState, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation, PanResponder, Animated } from 'react-native';
import { colors, fonts } from '../constants/theme';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_LABELS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

// Понедельник — первый день недели (не воскресенье, как в JS Date.getDay())
function mondayIndex(jsDay) { return jsDay === 0 ? 6 : jsDay - 1; }

function buildMonthCells(year, month, onlineDates, manualDates) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = mondayIndex(firstOfMonth.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
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
function MonthPanel({ width, year, month, cells, todayKey, selectedDate, onSelectDay, onEmptyPress }) {
  return (
    <View style={{ width, paddingHorizontal: 4 }}>
      <View style={styles.monthCard}>
        <Text style={styles.monthLabel}>{MONTH_LABELS[month]} {year}</Text>
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
  // остаётся только один финальный рывок пружиной до полного кадра. Как
  // только пружина останавливается, меняем состояние и мгновенно обнуляем
  // сдвиг — визуально ничего не прыгает, потому что новый центр карусели
  // уже стоит ровно там же.
  const commitChange = (delta) => {
    const dir = delta > 0 ? -1 : 1;
    isTransitioning.current = true;
    Animated.spring(slideAnim, {
      toValue: dir * containerW,
      velocity: 0.6,
      tension: 70,
      friction: 13,
      useNativeDriver: true,
    }).start(() => {
      if (expanded) {
        const [y, m] = addMonth(viewYear, viewMonth, delta);
        setViewYear(y);
        setViewMonth(m);
        onMonthChange?.(y, m);
      } else {
        setWeekOffset(o => o + delta);
      }
      slideAnim.setValue(0);
      isTransitioning.current = false;
    });
  };

  const springBack = () => {
    Animated.spring(slideAnim, { toValue: 0, tension: 90, friction: 12, useNativeDriver: true }).start();
  };

  const toggleExpanded = () => {
    if (!collapsible) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
    },
    onPanResponderRelease: (_, g) => {
      if (isTransitioning.current) return;
      const passedDistance = Math.abs(g.dx) > containerW * 0.28;
      const passedVelocity = Math.abs(g.vx) > 0.5;
      if (g.dx < 0 && (passedDistance || passedVelocity)) commitChange(1);
      else if (g.dx > 0 && (passedDistance || passedVelocity)) commitChange(-1);
      else springBack();
    },
  });

  return (
    <View
      style={[styles.root, !embedded && styles.rootCard]}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      {collapsible && (
        <Pressable style={styles.collapseBtn} onPress={toggleExpanded} hitSlop={10}>
          <Text style={styles.collapseArrow}>{expanded ? '▲' : '▼'}</Text>
        </Pressable>
      )}

      <View style={{ overflow: 'hidden' }}>
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            flexDirection: 'row',
            width: containerW * 3,
            marginLeft: -containerW,
            transform: [{ translateX: slideAnim }],
          }}
        >
          {expanded ? (
            <>
              <MonthPanel width={containerW} year={prevYear} month={prevMonth} cells={prevCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} onEmptyPress={clearSelection} />
              <MonthPanel width={containerW} year={viewYear} month={viewMonth} cells={curCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} onEmptyPress={clearSelection} />
              <MonthPanel width={containerW} year={nextYear} month={nextMonth} cells={nextCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} onEmptyPress={clearSelection} />
            </>
          ) : (
            <>
              <WeekPanel width={containerW} cells={prevWeekCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} />
              <WeekPanel width={containerW} cells={curWeekCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} />
              <WeekPanel width={containerW} cells={nextWeekCells} todayKey={todayKey} selectedDate={selectedDate} onSelectDay={onSelectDay} />
            </>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: 12 },
  rootCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },

  collapseBtn: { position: 'absolute', top: 8, right: 8, zIndex: 2, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  collapseArrow: { fontSize: 10, color: colors.muted },

  // Рамка и название теперь принадлежат каждой отдельной месячной панели —
  // едут вместе с её датами, а не остаются позади неподвижным заголовком
  monthCard: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 8 },
  monthLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, textAlign: 'center', marginBottom: 6 },

  weekRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, paddingVertical: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },

  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { borderWidth: 1, borderColor: colors.orange },
  dayCircleSelected: { backgroundColor: colors.orange },
  dayNum: { fontFamily: fonts.familyRegular, fontSize: 15, color: colors.text },
  dayNumToday: { color: colors.orange, fontFamily: fonts.familySemibold },
  dayNumSelected: { color: '#fff', fontFamily: fonts.familySemibold },

  dotsRow: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
