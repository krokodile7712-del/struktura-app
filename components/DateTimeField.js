import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, fonts } from '../constants/theme';

const dateTxt = (d) => d.toLocaleDateString('ru-RU');
const timeTxt = (d) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

// Дата и время в одной строке: два нажимаемых поля, под ними открывается системный выбор.
// value — Date, onChange получает новый Date (дата и время меняются независимо).
export default function DateTimeField({ label, value, onChange, disabled = false }) {
  const [picker, setPicker] = useState(null); // 'date' | 'time' | null

  const onPick = (mode) => (event, selected) => {
    if (Platform.OS !== 'ios') setPicker(null); // на Android окно закрывается само
    if (event?.type === 'dismissed' || !selected) return;
    const next = new Date(value);
    if (mode === 'date') next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    else next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    onChange(next);
  };

  return (
    <View style={{ opacity: disabled ? 0.4 : 1 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.field, picker === 'date' && styles.fieldOn]}
          disabled={disabled}
          onPress={() => setPicker(p => (p === 'date' ? null : 'date'))}
        >
          <Text style={styles.fieldTxt}>{dateTxt(value)}</Text>
        </Pressable>
        <Pressable
          style={[styles.field, picker === 'time' && styles.fieldOn]}
          disabled={disabled}
          onPress={() => setPicker(p => (p === 'time' ? null : 'time'))}
        >
          <Text style={styles.fieldTxt}>{timeTxt(value)}</Text>
        </Pressable>
      </View>
      {!!picker && !disabled && (
        <DateTimePicker
          value={value}
          mode={picker}
          display={picker === 'date' ? (Platform.OS === 'ios' ? 'inline' : 'calendar') : 'spinner'}
          is24Hour
          onChange={onPick(picker)}
        />
      )}
      {Platform.OS === 'ios' && !!picker && !disabled && (
        <Pressable style={styles.done} onPress={() => setPicker(null)}>
          <Text style={styles.doneTxt}>Готово</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 13 },
  fieldOn: { borderColor: 'rgba(127,168,217,0.6)' },
  fieldTxt: { fontFamily: fonts.familyRegular, fontSize: 16, color: colors.text },
  done: { marginTop: 10, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center' },
  doneTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
});
