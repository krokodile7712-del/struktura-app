import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { colors } from '../constants/theme';

const { width, height } = Dimensions.get('window');

function SoftSpot({ top, left, color, baseSize }) {
  const layers = [
    { scale: 1.6, opacity: 0.05 },
    { scale: 1.2, opacity: 0.08 },
    { scale: 0.85, opacity: 0.12 },
    { scale: 0.5, opacity: 0.16 },
  ];
  return (
    <View style={{ position: 'absolute', top, left }} pointerEvents="none">
      {layers.map((layer, idx) => {
        const size = baseSize * layer.scale;
        return (
          <View
            key={idx}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
              opacity: layer.opacity,
              top: -size / 2 + (baseSize / 2) * 0,
              left: -size / 2 + (baseSize / 2) * 0,
            }}
          />
        );
      })}
    </View>
  );
}
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

      {/* Дышащие цветные пятна (мягкое многослойное свечение) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: spotOpacity }]} pointerEvents="none">
        <SoftSpot top={-height * 0.05} left={-width * 0.1} color={colors.olive} baseSize={width * 0.7} />
        <SoftSpot top={-height * 0.08} left={width * 0.55} color={colors.blue} baseSize={width * 0.7} />
        <SoftSpot top={height * 0.55} left={width * 0.15} color={colors.green} baseSize={width * 0.7} />
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
