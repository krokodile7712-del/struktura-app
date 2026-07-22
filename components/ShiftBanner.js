import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { fonts, colors } from '../constants/theme';

// Баннер "Смена не открыта" — показывается под TopBar если нет открытой смены
export default function ShiftBanner({ onOpen }) {
  return (
    <Pressable style={styles.banner} onPress={onOpen}>
      <Text style={styles.icon}>⏸</Text>
      <Text style={styles.text}>Смена не открыта</Text>
      <View style={styles.btn}>
        <Text style={styles.btnText}>Открыть →</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(61,95,168,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(61,95,168,0.25)',
    gap: 8,
  },
  icon: { fontSize: 13 },
  text: {
    flex: 1,
    fontFamily: fonts.familySemibold,
    fontSize: 13,
    color: 'rgba(141,169,230,0.9)',
  },
  btn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(61,95,168,0.4)',
    backgroundColor: 'rgba(61,95,168,0.15)',
  },
  btnText: {
    fontFamily: fonts.familySemibold,
    fontSize: 12,
    color: 'rgba(141,169,230,1)',
  },
});
