import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { fonts, colors } from '../constants/theme';

// Серая строчка-подсказка под полем ввода или секцией.
// Объясняет зачем нужно поле/раздел простым языком.
export default function Hint({ children, style }) {
  if (!children) return null;
  return <Text style={[styles.hint, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  hint: {
    fontFamily: fonts.familyRegular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 10,
  },
});
