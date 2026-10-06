import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { glass, glassFill } from '../constants/theme';
import SoftGlow from './SoftGlow';

// Настоящее размытие на Android в expo-blur требует отдельной привязки к тому, что
// размывать (BlurTargetView), и на слабых планшетах может быть тяжёлым. Пока оно
// выключено: стекло на Android — полупрозрачная заливка 22% + блик + световая
// кромка поверх мягкой подсветки фона. На iOS размытие настоящее. Включить на
// Android позже, после проверки на планшете: REAL_BLUR_ANDROID = true.
export const REAL_BLUR_ANDROID = false;

/**
 * Стеклянная поверхность: заливка (по умолчанию 22%), размытие там, где оно есть,
 * блик сверху, тонкая световая кромка (светлее сверху-слева, темнее снизу-справа)
 * и — для парящих элементов (floating) — мягкая тень снизу, которая не просвечивает
 * сквозь стекло (тень рисуется только ВНЕ контура: на Android elevation просвечивает
 * через полупрозрачный фон, поэтому она не используется).
 *
 * Props: children, style, radius, alpha (заливка 0–1), blur (iOS), floating,
 *        padding (внутренний отступ), contentStyle (стиль внутреннего контейнера)
 */
export default function GlassSurface({
  children, style, contentStyle,
  radius = glass.radius.tile, alpha = glass.alpha, blur = glass.blur,
  floating = false, padding = 0,
  tint, sheen, rimColors, shadowScale = 1,
}) {
  const rc = rimColors || {};
  const useBlur = Platform.OS !== 'android' || REAL_BLUR_ANDROID;
  return (
    <View style={[{ borderRadius: radius }, style]}>
      {floating && <FloatShadow radius={radius} scale={shadowScale} />}
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
        {useBlur && (
          <BlurView
            intensity={blur}
            tint="dark"
            style={StyleSheet.absoluteFill}
            blurMethod={Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined}
          />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint ? `rgba(${tint},${alpha})` : glassFill(alpha) }]} />
        <LinearGradient colors={sheen || glass.sheen} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: radius }, rimColors && { borderTopColor: rc.top || glass.rimBright, borderLeftColor: rc.left || 'rgba(255,255,255,0.18)', borderRightColor: rc.right || glass.rim, borderBottomColor: rc.bottom || 'rgba(255,255,255,0.05)' }]} />
      <View style={[{ padding }, contentStyle]}>{children}</View>
    </View>
  );
}

// Тень «парения»: тонкое кольцо света не нужно, нужна тёмная каёмка снаружи и
// падающая вниз тень. Кольца рисуются рамкой (borderWidth) без заливки, поэтому
// под самим стеклом ничего не темнеет.
function FloatShadow({ radius, scale = 1 }) {
  const w = 7 * scale;
  const rings = [0.20, 0.13, 0.075, 0.04];
  return (
    <>
      {rings.map((a, i) => {
        const out = (i + 1) * w;
        return (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: -out, right: -out, top: -out, bottom: -out,
              borderWidth: w, borderColor: `rgba(0,0,0,${a})`,
              borderRadius: radius + out,
            }}
          />
        );
      })}
      {/* падающая вниз тень — эллипс с мягким спадом (раньше была полоса с жёсткими краями) */}
      <View pointerEvents="none" style={{ position: 'absolute', left: '3%', right: '3%', top: '100%', height: 56 * scale, marginTop: -22 * scale }}>
        <SoftGlow fill color="0,0,0" alpha={0.55} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  rim: {
    borderWidth: 1,
    borderTopColor: glass.rimBright,
    borderLeftColor: 'rgba(255,255,255,0.18)',
    borderRightColor: glass.rim,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
});
