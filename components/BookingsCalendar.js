import React, { useState, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation, PanResponder } from 'react-native';
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

/**
 * Компактный месячный календарь с точками-индикаторами по источнику записи.
 * onlineDates / manualDates — Set строк 'YYYY-MM-DD' с записями за текущий видимый месяц.
 * onSelectDay(dateStr, hasBookings) — тап по дню.
 * onMonthChange(year, month0) — month0 — индекс месяца с нуля (как в Date).
 * embedded — без собственной рамки/фона, вписывается как верхняя часть уже
 *   существующей карточки (используется в альбомной ориентации).
 * collapsible — сворачивается в одну строку недели, разворачивается тапом
 *   по заголовку в полный месяц (используется в портретной ориентации).
 */
export default function BookingsCalendar({ onlineDates, manualDates, selectedDate, onSelectDay, onMonthChange, embedded = false, collapsible = false }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based
  const [expanded, setExpanded] = useState(!collapsible);

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = mondayIndex(firstOfMonth.getDay());
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const result = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startOffset + 1;
      if (dayNum < 1 || dayNum > daysInMonth) { result.push(null); continue; }
      const key = dateKey(viewYear, viewMonth, dayNum);
      result.push({
        day: dayNum,
        key,
        isOnline: onlineDates?.has(key) || false,
        isManual: manualDates?.has(key) || false,
      });
    }
    return result;
  }, [viewYear, viewMonth, onlineDates, manualDates]);

  // Неделя от сегодняшнего дня вперёд (не Пн-Вс календарной недели) — для
  // свёрнутого вида: если сегодня 5 сентября, показываем 5..11 сентября
  const weekCells = useMemo(() => {
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
      result.push({
        day: d.getDate(),
        key,
        isOnline: onlineDates?.has(key) || false,
        isManual: manualDates?.has(key) || false,
      });
    }
    return result;
  }, [onlineDates, manualDates]);

  const changeMonth = (delta) => {
    let y = viewYear, m = viewMonth + delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewYear(y);
    setViewMonth(m);
    onMonthChange?.(y, m);
  };

  const toggleExpanded = () => {
    if (!collapsible) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  };

  const clearSelection = () => onSelectDay?.(null, false);

  // Свайп влево/вправо между месяцами — вместо стрелок. Порог по горизонтали
  // с проверкой, что движение преимущественно горизонтальное, не вертикальный скролл
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -40) changeMonth(1);
        else if (g.dx >= 40) changeMonth(-1);
      },
    })
  ).current;

  return (
    <View style={[styles.root, !embedded && styles.rootCard]}>
      <Pressable style={styles.header} onPress={toggleExpanded} disabled={!collapsible}>
        <Text style={styles.monthLabel}>{MONTH_LABELS[viewMonth]} {viewYear}</Text>
        {collapsible && <Text style={styles.collapseArrow}>{expanded ? '▲' : '▼'}</Text>}
      </Pressable>

      {expanded ? (
        <View {...panResponder.panHandlers}>
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
                onEmptyPress={clearSelection}
              />
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.grid}>
          {weekCells.map((cell, i) => (
            <DayCell
              key={i}
              cell={cell}
              isToday={cell.key === todayKey}
              isSelected={cell.key === selectedDate}
              onPress={() => onSelectDay?.(cell.key, cell.isOnline || cell.isManual)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: 12 },
  rootCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8, paddingHorizontal: 4 },
  monthLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  collapseArrow: { fontSize: 10, color: colors.muted, marginLeft: 6 },

  weekRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, paddingVertical: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },

  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { borderWidth: 1, borderColor: colors.orange },
  dayCircleSelected: { backgroundColor: colors.orange },
  dayNum: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text },
  dayNumToday: { color: colors.orange, fontFamily: fonts.familySemibold },
  dayNumSelected: { color: '#fff', fontFamily: fonts.familySemibold },

  dotsRow: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
