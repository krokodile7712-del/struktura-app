import React from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';

/**
 * Стандартное поле ввода СТРУКТУРЫ.
 * Применяется везде вместо дублирующихся styles.input.
 *
 * Использование:
 * <Input value={x} onChangeText={setX} placeholder="..." />
 * <Input multiline style={{ height: 80, textAlignVertical: 'top' }} />
 * <Input error={!!errors.name} />  // красная рамка при ошибке
 */
export default function Input({ style, error, ...props }) {
  return (
    <TextInput
      style={[styles.input, error && styles.inputError, style]}
      placeholderTextColor={colors.muted}
      {...props}
    />
  );
}

export const inputStyle = {
  padding: 14,
  backgroundColor: '#07080a',
  borderWidth: 1,
  borderColor: '#252830',
  borderRadius: radius.sm,
  color: '#ddd8d0',
  fontSize: 15,
  fontFamily: 'AnekDevanagari_400Regular',
  marginBottom: 4,
};

const styles = StyleSheet.create({
  input: {
    ...inputStyle,
  },
  inputError: {
    borderColor: 'rgba(160,16,32,0.7)',
  },
});
