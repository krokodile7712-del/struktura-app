import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassSurface from './GlassSurface';
import SoftGlow from './SoftGlow';
import PlusIcon from './PlusIcon';
import { colors, fonts } from '../constants/theme';
import { getTerms } from '../db/queries';

/**
 * Кнопка «Новый заказ» — стеклянная акцентная плитка. Лежит в строке приветствия
 * справа; при прокрутке вниз «уезжает» в верхнюю полосу (compact), см. hooks/useDock.js.
 * Стеклянность: прозрачная акцентная заливка, яркий блик по верхней кромке, отсвет
 * акцента снизу (как будто стекло светится изнутри) и мягкое свечение под кнопкой.
 */
export default function NewOrderButton({ onPress, compact = false, style }) {
  const terms = getTerms();
  const label = `Новый ${terms.order?.toLowerCase() || 'заказ'}`;
  const h = compact ? 44 : 64;
  const r = compact ? 22 : 24;
  const glowSize = compact ? 150 : 340;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={compact ? 6 : 0}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }, style]}
    >
      {/* свечение под кнопкой: она «парит» и светится акцентом */}
      <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: glowSize, height: glowSize, marginLeft: -glowSize / 2, marginTop: -glowSize / 2 }}>
        <SoftGlow size={glowSize} color="127,168,217" alpha={compact ? 0.16 : 0.22} />
      </View>
      <GlassSurface
        radius={r}
        alpha={compact ? 0.30 : 0.24}
        tint="127,168,217"
        blur={34}
        sheen={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.03)']}
        rimColors={{ top: 'rgba(210,230,252,0.85)', left: 'rgba(180,208,240,0.50)', right: 'rgba(157,191,230,0.38)', bottom: 'rgba(157,191,230,0.22)' }}
        contentStyle={{ height: h, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: compact ? 18 : 30 }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(127,168,217,0)', 'rgba(127,168,217,0.32)']}
          style={[StyleSheet.absoluteFill, { borderRadius: r }]}
        />
        <View pointerEvents="none" style={[styles.spec, { left: r, right: r }]} />
        <PlusIcon size={compact ? 16 : 20} color={colors.orangeLight} />
        <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>{label}</Text>
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  spec:         { position: 'absolute', top: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.55)' },
  label:        { fontFamily: fonts.family, fontSize: 18, color: colors.text, marginLeft: 12 },
  labelCompact: { fontSize: 14, marginLeft: 10 },
});
