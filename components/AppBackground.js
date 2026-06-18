import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '../constants/theme';

const { width, height } = Dimensions.get('window');

function SoftSpot({ top, left, color, baseSize }) {
  return (
    <View style={{ position: 'absolute', top, left, width: baseSize, height: baseSize }} pointerEvents="none">
      <View
        style={{
          width: baseSize,
          height: baseSize,
          borderRadius: baseSize / 2,
          backgroundColor: color,
          opacity: 0.5,
        }}
      />
    </View>
  );
}

export default function AppBackground({ children }) {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 5000, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 5000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const spotOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.9] });

  return (
    <View style={styles.container}>
      {/* Базовый цвет фона */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />

      {/* Дышащие цветные пятна (размытые через BlurView для мягкого свечения) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: spotOpacity }]} pointerEvents="none">
        <SoftSpot top={-height * 0.05} left={-width * 0.1} color={colors.olive} baseSize={width * 0.7} />
        <SoftSpot top={-height * 0.08} left={width * 0.55} color={colors.blue} baseSize={width * 0.7} />
        <SoftSpot top={height * 0.55} left={width * 0.15} color={colors.green} baseSize={width * 0.7} />
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Контент экрана */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, zIndex: 1 },
});
