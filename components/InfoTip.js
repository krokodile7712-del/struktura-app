import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable } from 'react-native';
import { fonts, colors } from '../constants/theme';

// Кнопка ⓘ рядом с непонятным термином или полем.
// Тап → всплывает объяснение на простом языке → кнопка "Понятно"
//
// Использование:
// <InfoTip title="Что такое артикул?" text="Артикул — уникальный код товара..." />
// или встроенно в строку:
// <View style={{ flexDirection: 'row', alignItems: 'center' }}>
//   <Text>SKU</Text>
//   <InfoTip ... />
// </View>

export default function InfoTip({ title, text }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={12}
        style={styles.trigger}
        accessibilityLabel={`Подробнее: ${title}`}
      >
        <Text style={styles.icon}>ⓘ</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.text}>{text}</Text>
            <Pressable style={styles.btn} onPress={() => setOpen(false)}>
              <Text style={styles.btnText}>Понятно</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    marginLeft: 6,
    paddingHorizontal: 4,
  },
  icon: {
    fontSize: 14,
    color: colors.muted,
    fontFamily: fonts.familyRegular,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0e0f11',
    borderRadius: 20,
    padding: 24,
    maxWidth: 420,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(74,77,84,0.5)',
  },
  title: {
    fontFamily: fonts.family,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  text: {
    fontFamily: fonts.familyRegular,
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 20,
  },
  btn: {
    backgroundColor: 'rgba(61,158,146,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(61,158,146,0.4)',
    padding: 13,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: colors.greenLight,
  },
});
