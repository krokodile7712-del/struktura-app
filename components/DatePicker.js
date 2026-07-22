import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { colors, fonts } from '../constants/theme';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                 'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Пн=0
}

// value: 'YYYY-MM-DD' | null
// onChange: (dateStr) => void
// onClose: () => void
// visible: bool
export default function DatePicker({ visible, value, onChange, onClose, title = 'Выберите дату' }) {
  const today = new Date();
  const initDate = value ? new Date(value) : today;

  const [viewYear, setViewYear]   = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const selectedStr = value || '';
  const todayStr = today.toISOString().slice(0, 10);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay    = getFirstDayOfMonth(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectDay = (day) => {
    if (!day) return;
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    onChange(dateStr);
    onClose();
  };

  const isSelected = (day) => {
    if (!day || !selectedStr) return false;
    const s = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return s === selectedStr;
  };

  const isToday = (day) => {
    if (!day) return false;
    const s = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return s === todayStr;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.picker}>
          {/* Заголовок */}
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          {/* Навигация месяца */}
          <View style={styles.navRow}>
            <Pressable onPress={prevMonth} hitSlop={12} style={styles.navBtn}>
              <Text style={styles.navArrow}>‹</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
            <Pressable onPress={nextMonth} hitSlop={12} style={styles.navBtn}>
              <Text style={styles.navArrow}>›</Text>
            </Pressable>
          </View>

          {/* Дни недели */}
          <View style={styles.weekRow}>
            {DAYS.map(d => (
              <Text key={d} style={[styles.weekDay, (d === 'Сб' || d === 'Вс') && styles.weekDayRed]}>{d}</Text>
            ))}
          </View>

          {/* Сетка дней */}
          <View style={styles.grid}>
            {cells.map((day, idx) => {
              const sel = isSelected(day);
              const tod = isToday(day);
              const isSat = day && (firstDay + day - 1) % 7 === 5;
              const isSun = day && (firstDay + day - 1) % 7 === 6;
              return (
                <Pressable
                  key={idx}
                  style={[
                    styles.cell,
                    sel && styles.cellSelected,
                    !sel && tod && styles.cellToday,
                    !day && { opacity: 0 },
                  ]}
                  onPress={() => selectDay(day)}
                  disabled={!day}
                >
                  <Text style={[
                    styles.cellText,
                    sel && styles.cellTextSelected,
                    !sel && tod && styles.cellTextToday,
                    !sel && !tod && (isSat || isSun) && styles.cellTextWeekend,
                  ]}>
                    {day || ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Кнопка Сегодня */}
          <Pressable style={styles.todayBtn} onPress={() => { onChange(todayStr); onClose(); }}>
            <Text style={styles.todayBtnText}>Сегодня</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  picker:  { width: 320, backgroundColor: '#0e0f11', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)', overflow: 'hidden' },

  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.3)' },
  title:    { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.text },
  closeBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(74,77,84,0.25)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 12, color: colors.muted, fontFamily: fonts.familySemibold },

  navRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  navBtn:      { width: 32, height: 32, borderRadius: 10, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', alignItems: 'center', justifyContent: 'center' },
  navArrow:    { fontSize: 20, color: colors.text, lineHeight: 24 },
  monthLabel:  { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },

  weekRow:    { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  weekDay:    { width: CELL_SIZE, textAlign: 'center', fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase' },
  weekDayRed: { color: 'rgba(160,16,32,0.6)' },

  grid:     { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 8 },
  cell:     { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  cellSelected: { backgroundColor: colors.greenLight },
  cellToday:    { backgroundColor: 'rgba(61,158,146,0.15)', borderWidth: 1, borderColor: 'rgba(61,158,146,0.5)' },

  cellText:         { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  cellTextSelected: { color: '#fff' },
  cellTextToday:    { color: colors.greenLight },
  cellTextWeekend:  { color: 'rgba(160,16,32,0.7)' },

  todayBtn:     { margin: 12, marginTop: 4, paddingVertical: 12, borderRadius: 12, backgroundColor: '#07080a', borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', alignItems: 'center' },
  todayBtnText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.greenLight },
});
