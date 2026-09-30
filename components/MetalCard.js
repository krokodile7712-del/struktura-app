import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, gradients } from '../constants/theme';

// Тот же интерфейс пропсов, что был у обеих прежних версий (металлической
// и плоской) — обёртка для группы контента (карточка склада, результаты
// поиска и т.п.), не единственный акцентный элемент экрана. Настоящая
// глубина через тонкий градиент и тень, но сдержанная — не золотой металл,
// тот теперь у GoldCard, для действительно важных мест.
export default function MetalCard({ children, style }) {
  return (
    <View style={[styles.card, style]}>
      <LinearGradient
        colors={gradients.cardSurface}
        locations={gradients.cardSurfaceLocations}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  content: {
    padding: 20,
  },
});
