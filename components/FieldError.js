import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { fonts, colors } from '../constants/theme';

// Ошибка валидации под полем ввода
// Использование: {errors.name && <FieldError>{errors.name}</FieldError>}
export default function FieldError({ children }) {
  if (!children) return null;
  return <Text style={styles.err}>{children}</Text>;
}

const styles = StyleSheet.create({
  err: {
    fontFamily: fonts.familyRegular,
    fontSize: 12,
    color: colors.redLight,
    marginTop: 3,
    marginBottom: 4,
    marginLeft: 2,
  },
});
