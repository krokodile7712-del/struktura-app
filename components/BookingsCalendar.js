import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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

/**
 * Компактный месячный календарь с точками-индикаторами по источнику записи.
 * onlineDates / manualDates — Set строк 'YYYY-MM-DD' с записями за текущий видимый месяц.
 * onSelectDay(dateStr, hasBookings) — тап по дню.
 * onMonthChange(year, month0) — month0 — индекс месяца с нуля (как в Date).
 */
export default function BookingsCalendar({ onlineDates, manualDates, selectedDate, onSelectDay, onMonthChange }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based

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

  const changeMonth = (delta) => {
    let y = viewYear, m = viewMonth + delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewYear(y);
    setViewMonth(m);
    onMonthChange?.(y, m);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => changeMonth(-1)} hitSlop={10} style={styles.navBtn}>
          <Text style={styles.navBtnTxt}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{MONTH_LABELS[viewMonth]} {viewYear}</Text>
        <Pressable onPress={() => changeMonth(1)} hitSlop={10} style={styles.navBtn}>
          <Text style={styles.navBtnTxt}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map(w => (
          <Text key={w} style={styles.weekdayLabel}>{w}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={i} style={styles.cell} />;
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedDate;
          const hasBookings = cell.isOnline || cell.isManual;
          return (
            <Pressable
              key={i}
              style={styles.cell}
              onPress={() => onSelectDay?.(cell.key, hasBookings)}
            >
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
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  monthLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  navBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  navBtnTxt: { fontSize: 16, color: colors.muted, fontFamily: fonts.family },

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
