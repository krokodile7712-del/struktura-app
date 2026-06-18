import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { colors } from '../constants/theme';

const { width, height } = Dimensions.get('window');

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

      {/* Дышащие цветные пятна (лёгкие полупрозрачные круги) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: spotOpacity }]} pointerEvents="none">
        <View style={[styles.spot, { top: -height * 0.15, left: -width * 0.25, backgroundColor: colors.olive }]} />
        <View style={[styles.spot, { top: -height * 0.2, left: width * 0.4, backgroundColor: colors.blue }]} />
        <View style={[styles.spot, { top: height * 0.5, left: width * 0.05, backgroundColor: colors.green }]} />
      </Animated.View>

      {/* Контент экрана */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, zIndex: 1 },
  spot: {
    position: 'absolute',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width * 0.45,
    opacity: 0.18,
    transform: [{ scaleY: 0.6 }],
  },
});
