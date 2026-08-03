import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { colors, fonts } from '../constants/theme';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                 'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function fmtShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Пн=0
}

// value: 'YYYY-MM-DD' | null — режим одиночной даты (mode не указан или 'single')
// rangeFrom/rangeTo: 'YYYY-MM-DD' | null — режим диапазона (mode="range")
// onChange: (dateStr) => void — для одиночного режима
// onRangeChange: (from, to) => void — для режима диапазона, вызывается когда обе даты выбраны
// onClose: () => void
// visible: bool
export default function DatePicker({
  visible, value, onChange, onClose, title = 'Выберите дату',
  mode = 'single', rangeFrom = null, rangeTo = null, onRangeChange,
}) {
  const today = new Date();
  const isRange = mode === 'range';
  const initDate = (isRange ? rangeFrom : value) ? new Date(isRange ? rangeFrom : value) : today;

  const [viewYear, setViewYear]   = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [draftFrom, setDraftFrom] = useState(rangeFrom);
  const [draftTo, setDraftTo]     = useState(rangeTo);

  // Сбрасываем черновик диапазона при каждом открытии — чтобы не тащить старый выбор
  useEffect(() => {
    if (visible && isRange) { setDraftFrom(rangeFrom); setDraftTo(rangeTo); }
  }, [visible]);

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

  const dayStr = (day) => `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

  const selectDay = (day) => {
    if (!day) return;
    const dateStr = dayStr(day);

    if (isRange) {
      if (!draftFrom || (draftFrom && draftTo)) {
        // Начинаем новый выбор диапазона
        setDraftFrom(dateStr);
        setDraftTo(null);
        return;
      }
      // Уже есть начало — выбираем конец (меняем местами, если конец раньше начала)
      const from = dateStr < draftFrom ? dateStr : draftFrom;
      const to   = dateStr < draftFrom ? draftFrom : dateStr;
      setDraftFrom(from);
      setDraftTo(to);
      onRangeChange?.(from, to);
      onClose();
      return;
    }

    onChange(dateStr);
    onClose();
  };

  const isSelected = (day) => {
    if (!day || !selectedStr) return false;
    return dayStr(day) === selectedStr;
  };

  const isToday = (day) => {
    if (!day) return false;
    return dayStr(day) === todayStr;
  };

  const isRangeEdge = (day) => {
    if (!day || !isRange) return false;
    const s = dayStr(day);
    return s === draftFrom || s === draftTo;
  };

  const isInRange = (day) => {
    if (!day || !isRange || !draftFrom || !draftTo) return false;
    const s = dayStr(day);
    return s > draftFrom && s < draftTo;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.picker}>
          {/* Заголовок */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {isRange ? (draftFrom && !draftTo ? 'Выберите конец периода' : 'Выберите начало периода') : title}
              </Text>
              {isRange && (
                <Text style={styles.rangeSub}>
                  {draftFrom ? fmtShort(draftFrom) : '...'} — {draftTo ? fmtShort(draftTo) : '...'}
                </Text>
              )}
            </View>
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
              const sel = isRange ? isRangeEdge(day) : isSelected(day);
              const tod = isToday(day);
              const inRange = isInRange(day);
              const isSat = day && (firstDay + day - 1) % 7 === 5;
              const isSun = day && (firstDay + day - 1) % 7 === 6;
              return (
                <Pressable
                  key={idx}
                  style={[
                    styles.cell,
                    inRange && styles.cellInRange,
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

          {/* Кнопка Сегодня — только для одиночного выбора */}
          {!isRange && (
            <Pressable style={styles.todayBtn} onPress={() => { onChange(todayStr); onClose(); }}>
              <Text style={styles.todayBtnText}>Сегодня</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  picker:  { width: 320, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(64,60,55,0.5)', overflow: 'hidden' },

  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(64,60,55,0.3)' },
  title:    { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.text },
  rangeSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.orange, marginTop: 2 },
  closeBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(64,60,55,0.25)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 12, color: colors.muted, fontFamily: fonts.familySemibold },

  navRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  navBtn:      { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(64,60,55,0.4)', alignItems: 'center', justifyContent: 'center' },
  navArrow:    { fontSize: 20, color: colors.text, lineHeight: 24 },
  monthLabel:  { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },

  weekRow:    { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  weekDay:    { width: CELL_SIZE, textAlign: 'center', fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase' },
  weekDayRed: { color: 'rgba(160,16,32,0.6)' },

  grid:     { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 8 },
  cell:     { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  cellInRange:  { backgroundColor: 'rgba(240,160,80,0.14)', borderRadius: 4 },
  cellSelected: { backgroundColor: colors.greenLight },
  cellToday:    { backgroundColor: 'rgba(240,160,80,0.15)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.5)' },

  cellText:         { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  cellTextSelected: { color: '#fff' },
  cellTextToday:    { color: colors.greenLight },
  cellTextWeekend:  { color: 'rgba(160,16,32,0.7)' },

  todayBtn:     { margin: 12, marginTop: 4, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(64,60,55,0.3)', alignItems: 'center' },
  todayBtnText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.greenLight },
});
