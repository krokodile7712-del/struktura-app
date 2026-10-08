import React from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';

const MIN = 5, MAX = 600;
export const fmtDur = m => (m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`);

/** Длительность в минутах: «−/+» (шаг 5), ввод с клавиатуры и быстрые значения. Минимум 5 минут проверяет вызывающий код (ошибка под полем). */
export default function DurationField({ value, onChange, presets = [30, 60, 90, 120] }) {
  const v = value || 0;
  return (
    <View>
      <View style={st.row}>
        <Pressable style={st.step} onPress={() => onChange(Math.max(MIN, v - 5))} hitSlop={6}><Text style={st.stepT}>−</Text></Pressable>
        <TextInput style={st.inp} color={colors.text} value={v ? String(v) : ''} keyboardType="number-pad" maxLength={3}
          onChangeText={t => onChange(Math.min(MAX, parseInt(t.replace(/\D/g, ''), 10) || 0))} />
        <Text style={st.u}>мин</Text>
        <Pressable style={st.step} onPress={() => onChange(Math.min(MAX, (v || 0) + 5))} hitSlop={6}><Text style={st.stepT}>+</Text></Pressable>
      </View>
      <View style={st.chips}>{presets.map(m => (
        <Pressable key={m} style={[st.chip, v === m && st.chipOn]} onPress={() => onChange(m)}><Text style={[st.chipT, v === m && { color: colors.orangeLight }]}>{fmtDur(m)}</Text></Pressable>))}
      </View>
    </View>
  );
}
const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.35)' }, stepT: { fontFamily: fonts.family, fontSize: 22, color: colors.orangeLight },
  inp: { width: 84, height: 44, borderRadius: 14, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', fontFamily: fonts.familySemibold, fontSize: 18, color: colors.text }, u: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginRight: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }, chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim },
});
