import React, { useRef } from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

/**
 * Мягкое пятно света — настоящий радиальный градиент (react-native-svg): яркость
 * плавно спадает от центра к краю до нуля, без колец и без жёсткой границы.
 * Раньше пятно собиралось из 10 вложенных кругов, и на планшете были видны
 * кольцевые полосы.
 *
 * Props:
 * - size: диаметр пятна
 * - color: 'R,G,B' (например '127,168,217')
 * - alpha: яркость в центре (0–1)
 */
export default function SoftGlow({ size = 480, color = '127,168,217', alpha = 0.12, style }) {
  const id = useRef('glow' + Math.random().toString(36).slice(2, 9)).current;
  const c = `rgb(${color})`;
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={c} stopOpacity={alpha} />
            <Stop offset="30%"  stopColor={c} stopOpacity={alpha * 0.66} />
            <Stop offset="58%"  stopColor={c} stopOpacity={alpha * 0.28} />
            <Stop offset="82%"  stopColor={c} stopOpacity={alpha * 0.07} />
            <Stop offset="100%" stopColor={c} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
