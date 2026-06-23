import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';

export default function TopBar({ title, onBack, rightElement }) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {onBack && (
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backLabel}>Назад</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.title} numberOfLines={1}>{title || ''}</Text>

      <View style={styles.side}>
        {rightElement || null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHi,
    paddingHorizontal: 8,
  },
  side: {
    width: 110,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 2,
  },
  backArrow: {
    fontSize: 26,
    color: colors.greenLight,
    lineHeight: 28,
    fontFamily: fonts.family,
  },
  backLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: colors.greenLight,
    letterSpacing: 0.5,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
});
