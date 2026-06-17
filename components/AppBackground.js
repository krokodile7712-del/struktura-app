import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect, Pattern } from 'react-native-svg';
import { colors } from '../constants/theme';

const { width, height } = Dimensions.get('window');

export default function AppBackground({ children }) {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 5000, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 5000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const spotOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <View style={styles.container}>
      {/* Базовый цвет */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />

      {/* "Дышащие" цветные пятна */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: spotOpacity }]} pointerEvents="none">
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="spotOlive" cx="15%" cy="40%" r="55%">
              <Stop offset="0" stopColor={colors.olive} stopOpacity="0.14" />
              <Stop offset="1" stopColor={colors.olive} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="spotBlue" cx="85%" cy="20%" r="55%">
              <Stop offset="0" stopColor={colors.blue} stopOpacity="0.14" />
              <Stop offset="1" stopColor={colors.blue} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="spotGreen" cx="55%" cy="85%" r="55%">
              <Stop offset="0" stopColor={colors.green} stopOpacity="0.12" />
              <Stop offset="1" stopColor={colors.green} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="spotPurple" cx="50%" cy="50%" r="65%">
              <Stop offset="0" stopColor={colors.purple} stopOpacity="0.07" />
              <Stop offset="1" stopColor={colors.purple} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={width} height={height} fill="url(#spotOlive)" />
          <Rect width={width} height={height} fill="url(#spotBlue)" />
          <Rect width={width} height={height} fill="url(#spotGreen)" />
          <Rect width={width} height={height} fill="url(#spotPurple)" />
        </Svg>
      </Animated.View>

      {/* Текстура анодированного металла */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Pattern id="metalLines" patternUnits="userSpaceOnUse" width="4" height="4">
            <Rect width="4" height="4" fill="transparent" />
            <Rect y="0" width="4" height="1" fill="rgba(255,255,255,0.018)" />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill="url(#metalLines)" />
      </Svg>

      {/* Контент экрана */}
      <View style={styles.content}>{children}</View>

      {/* Scanlines поверх всего интерфейса */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Defs>
          <Pattern id="scanlines" patternUnits="userSpaceOnUse" width="4" height="4">
            <Rect width="4" height="4" fill="transparent" />
            <Rect y="0" width="4" height="2" fill="rgba(0,0,0,0.1)" />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill="url(#scanlines)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, zIndex: 1 },
});
