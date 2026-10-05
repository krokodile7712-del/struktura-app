import React from 'react';
import { View } from 'react-native';

/**
 * Мягкое пятно света — концентрические круги с малой прозрачностью дают плавный
 * спад яркости к краю без радиального градиента (react-native-svg в проекте нет)
 * и без жёсткой границы, которая была у прежних плоских кругов.
 *
 * Props:
 * - size: диаметр самого большого круга
 * - color: 'R,G,B' (например '127,168,217')
 * - alpha: итоговая яркость в центре (0–1)
 * - steps: число слоёв (больше — плавнее)
 */
export default function SoftGlow({ size = 480, color = '127,168,217', alpha = 0.12, steps = 10, style }) {
  // Слои накладываются: итог в центре = 1 − (1 − a)^steps; подбираем a так, чтобы получить alpha
  const per = 1 - Math.pow(1 - alpha, 1 / steps);
  const layers = [];
  for (let i = 0; i < steps; i++) {
    const d = size * (1 - i / steps);
    layers.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          width: d, height: d, borderRadius: d / 2,
          left: (size - d) / 2, top: (size - d) / 2,
          backgroundColor: `rgba(${color},${per.toFixed(4)})`,
        }}
      />
    );
  }
  return <View pointerEvents="none" style={[{ width: size, height: size }, style]}>{layers}</View>;
}
