import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../constants/theme';

// Глобальная обёртка — просто тёмная подложка на случай, если что-то на
// экране сверху не полностью её покрывает (переходы между экранами и
// т.п.). Атмосферное свечение сюда не годится: у нативного стека экранов
// (native-stack) своя непрозрачная подложка под КАЖДЫМ отдельным экраном —
// то, что нарисовано здесь, ничем не просвечивает сквозь неё, какой бы ни
// был выставлен background-color/contentStyle у самого экрана (проверено).
// Свечение — компонент ScreenGlow, рендерится внутри дерева каждого
// отдельного экрана, а не здесь.
export default function AppBackground({ children }) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
});
