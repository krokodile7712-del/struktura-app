import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';

// Готовый набор — самые частые единицы для любой сферы бизнеса.
// "Своя" всегда доступна отдельным полем рядом, если ни одна не подходит.
export const UNIT_PRESETS = ['шт', 'г', 'кг', 'мл', 'л', 'уп'];

export default function UnitPicker({ value, onChange }) {
  const isCustom = !!value && !UNIT_PRESETS.includes(value);
  const [customMode, setCustomMode] = useState(isCustom);

  return (
    <View>
      <View style={styles.row}>
        {UNIT_PRESETS.map(u => (
          <Pressable
            key={u}
            style={[styles.chip, !customMode && value === u && styles.chipActive]}
            onPress={() => { setCustomMode(false); onChange(u); }}
          >
            <Text style={[styles.chipTxt, !customMode && value === u && styles.chipTxtActive]}>{u}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, customMode && styles.chipActive]}
          onPress={() => { setCustomMode(true); onChange(isCustom ? value : ''); }}
        >
          <Text style={[styles.chipTxt, customMode && styles.chipTxtActive]}>Своя</Text>
        </Pressable>
      </View>
      {customMode && (
        <TextInput
          style={styles.input}
          color={colors.text}
          value={value}
          onChangeText={onChange}
          placeholder="напр. уп. по 12 шт"
          placeholderTextColor={colors.muted}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: 'rgba(240,160,80,0.12)', borderColor: 'rgba(240,160,80,0.5)' },
  chipTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  chipTxtActive: { color: colors.orange },
  input: { marginTop: 8, padding: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontFamily: fonts.family, fontSize: 15 },
});
