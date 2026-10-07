import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import { colors, fonts } from '../constants/theme';

// Тона стеклянной кнопки: заливка, блик, кромка и затемнение низа («выпуклость»), цвет текста
const TONES = {
  accent:  { tint: '127,168,217', alpha: 0.30, sheen: ['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.03)'], rim: { top: 'rgba(210,230,252,0.75)', left: 'rgba(180,208,240,0.5)', right: 'rgba(157,191,230,0.38)', bottom: 'rgba(157,191,230,0.22)' }, shade: ['rgba(127,168,217,0)', 'rgba(127,168,217,0.34)'], text: colors.text },
  neutral: { tint: '150,172,204', alpha: 0.14, sheen: ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)'], rim: { top: 'rgba(255,255,255,0.30)', left: 'rgba(255,255,255,0.16)', right: 'rgba(255,255,255,0.10)', bottom: 'rgba(255,255,255,0.05)' }, shade: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)'], text: colors.text },
  danger:  { tint: '219,129,120', alpha: 0.16, sheen: ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)'], rim: { top: 'rgba(240,170,162,0.55)', left: 'rgba(230,150,142,0.35)', right: 'rgba(219,129,120,0.28)', bottom: 'rgba(219,129,120,0.18)' }, shade: ['rgba(0,0,0,0)', 'rgba(60,10,8,0.30)'], text: colors.red },
};

/**
 * Стеклянная кнопка с объёмом (как способы оплаты на Кассе): полупрозрачная заливка, блик сверху,
 * кромка, затемнение снизу и мягкая тень; при нажатии сжимается до 97%.
 * tone: 'accent' (главное действие, стекло) | 'solid' (самое главное: сплошная акцентная заливка со свечением) | 'neutral' | 'danger'.
 */
export default function GlassButton({ label, icon, tone = 'neutral', onPress, height = 52, style, disabled }) {
  const t = TONES[tone] || TONES.neutral;
  if (tone === 'solid') {
    return (
      <Pressable
        style={({ pressed }) => [style, styles.solidShadow, disabled && { opacity: 0.4 }, pressed && !disabled && { transform: [{ scale: 0.97 }] }]}
        onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      >
        <LinearGradient colors={['#AECBEE', '#7FA8D9']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.solid, { height }]}>
          {!!icon && <Icon name={icon} size={20} color={colors.onAccent} />}
          <Text style={styles.solidTxt} numberOfLines={1}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [style, disabled && { opacity: 0.4 }, pressed && !disabled && { transform: [{ scale: 0.97 }] }]}
      onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
    >
      <GlassSurface radius={16} floating shadowScale={0.4} tint={t.tint} alpha={t.alpha} sheen={t.sheen} rimColors={t.rim}
        contentStyle={{ height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 }}>
        <LinearGradient pointerEvents="none" colors={t.shade} start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
        {!!icon && <Icon name={icon} size={18} color={t.text} />}
        <Text style={[styles.txt, { color: t.text }]} numberOfLines={1}>{label}</Text>
      </GlassSurface>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  txt: { fontFamily: fonts.family, fontSize: 16 },
  // «Сплошная» главная кнопка: яркая акцентная заливка, светлая кромка сверху и мягкое свечение вокруг
  solid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  solidTxt: { fontFamily: fonts.family, fontSize: 17, color: colors.onAccent },
  solidShadow: { borderRadius: 16, shadowColor: colors.orange, shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
});
