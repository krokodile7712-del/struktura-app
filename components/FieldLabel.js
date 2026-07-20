import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fonts, colors } from '../constants/theme';

/**
 * Стандартная метка поля ввода.
 * Заменяет разнобой fieldLabel / blockTitle / sectionTitle.
 *
 * Использование:
 * <FieldLabel>Название</FieldLabel>
 * <FieldLabel required>Email *</FieldLabel>
 * <FieldLabel hint="ⓘ" onHint={() => ...}>Ставка</FieldLabel>
 */
export default function FieldLabel({ children, required, style, right }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, style]}>
        {children}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      {right && right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    marginTop: 14,
  },
  label: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    flex: 1,
  },
  required: {
    color: colors.redLight,
  },
});
