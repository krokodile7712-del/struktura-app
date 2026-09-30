import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, radius as radii } from '../constants/theme';

/**
 * Настоящая металлическая золотая поверхность — не плоская заливка цветом,
 * а градиент с диагональным бликом, как у реальной шлифованной поверхности.
 * Для одного-двух самых важных элементов экрана (карточка баланса, главная
 * сумма) — не для рядовых карточек, для них MetalCard: если золотым будет
 * всё, оно перестанет означать «это главное».
 *
 * Использование:
 * <GoldCard><Text>47 250 ₽</Text></GoldCard>
 *
 * Props:
 * - children: содержимое карточки
 * - style: дополнительные стили внешнего контейнера (padding, marginBottom и т.д.)
 * - radius: скругление углов (по умолчанию radius.xl из темы)
 */
export default function GoldCard({ children, style, radius: r = radii.xl }) {
  return (
    <View style={[styles.wrap, { borderRadius: r }, style]}>
      <LinearGradient
        colors={gradients.metalGold}
        locations={gradients.metalGoldLocations}
        start={{ x: 0, y: 0.15 }}
        end={{ x: 1, y: 0.85 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Диагональный блик поверх основного градиента — угол в угол, отдельным слоем */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0.06)', 'transparent']}
        locations={[0, 0.32, 0.46, 0.56, 0.75]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.65, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 14,
  },
  content: {
    padding: 22,
  },
});
