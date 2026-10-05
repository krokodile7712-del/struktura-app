import React from 'react';
import { View, StyleSheet } from 'react-native';
import SoftGlow from './SoftGlow';

/**
 * Мягкая подсветка фона — холодный небесный свет сверху слева, едва заметный
 * тёплый сверху справа и ещё одно холодное пятно снизу справа. Нужна, чтобы у
 * стеклянных поверхностей (плитки статистики, окна) было что просвечивать.
 * Раньше это были плоские круги с жёстким краем, теперь — плавный спад яркости.
 *
 * Рендерится ПЕРВЫМ элементом внутри самого экрана (позади прокручиваемого
 * содержимого), не глобальной обёрткой поверх навигации — у нативного стека
 * экранов (native-stack) своя непрозрачная подложка под каждым экраном, сквозь
 * неё ничего извне не просвечивает. Поэтому у каждого экрана свой слой.
 *
 * Использование: первым ребёнком в корневом View экрана (position: 'relative',
 * overflow: 'hidden').
 */
export default function ScreenGlow() {
  return (
    <View style={styles.atmosphere} pointerEvents="none">
      <SoftGlow size={760} color="127,168,217" alpha={0.15} style={{ position: 'absolute', top: -330, left: -250 }} />
      <SoftGlow size={560} color="217,172,98" alpha={0.065} style={{ position: 'absolute', top: -270, right: -220 }} />
      <SoftGlow size={620} color="127,168,217" alpha={0.10} style={{ position: 'absolute', bottom: -330, right: -200 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  atmosphere: { ...StyleSheet.absoluteFillObject },
});
