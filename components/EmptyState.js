import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MetalButton from './MetalButton';
import { fonts, colors } from '../constants/theme';

// Пустое состояние экрана — когда данных ещё нет.
// Вместо пустого экрана или "нет данных" — объясняем зачем раздел нужен
// и предлагаем первое действие.
//
// Использование:
// <EmptyState
//   icon="📦"
//   title="Склад пока пуст"
//   text="Здесь будут отображаться все ваши запасы. Добавьте первую позицию, чтобы начать следить за остатками."
//   action="Добавить позицию"
//   onAction={() => ...}
// />

export default function EmptyState({ icon, title, text, action, onAction, style }) {
  return (
    <View style={[styles.wrap, style]}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
      {action && onAction ? (
        <MetalButton
          title={action}
          variant="default"
          onPress={onAction}
          style={styles.btn}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.family,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  text: {
    fontFamily: fonts.familyRegular,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 340,
    marginBottom: 20,
  },
  btn: {
    minWidth: 200,
  },
});
