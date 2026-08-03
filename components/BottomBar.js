import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { colors, fonts, anim } from '../constants/theme';

const TABS = [
  { key: 'Loyalty', label: 'Лояльность' },
  { key: 'Kassa',    label: 'Касса' },
];

export default function BottomBar({ navigation, activeTab }) {
  const activeIndex = TABS.findIndex(t => t.key === activeTab); // -1, если экран не Лояльность и не Касса
  const [barWidth, setBarWidth] = useState(0);
  const indicatorAnim = useRef(new Animated.Value(Math.max(0, activeIndex))).current;
  const scaleAnims = useRef(TABS.map((_, i) => new Animated.Value(i === activeIndex ? 1 : 0.96))).current;

  useEffect(() => {
    if (activeIndex >= 0) {
      Animated.spring(indicatorAnim, {
        toValue: activeIndex,
        ...anim.spring,
        useNativeDriver: true,
      }).start();
    }
    TABS.forEach((_, i) => {
      Animated.spring(scaleAnims[i], {
        toValue: i === activeIndex ? 1 : 0.96,
        ...anim.spring,
        useNativeDriver: true,
      }).start();
    });
  }, [activeIndex]);

  const handlePress = (tab) => {
    navigation.navigate(tab.key);
  };

  const tabWidth = barWidth / TABS.length;

  return (
    <View style={styles.bar} onLayout={e => setBarWidth(e.nativeEvent.layout.width)}>
      {barWidth > 0 && activeIndex >= 0 && (
        <Animated.View
          style={[
            styles.indicator,
            {
              width: tabWidth,
              transform: [{
                translateX: indicatorAnim.interpolate({
                  inputRange: TABS.map((_, i) => i),
                  outputRange: TABS.map((_, i) => i * tabWidth),
                }),
              }],
            },
          ]}
        />
      )}
      {TABS.map((tab, i) => {
        const isActive = activeIndex === i;
        return (
          <Pressable key={tab.key} style={styles.button} onPress={() => handlePress(tab)}>
            <Animated.Text
              style={[
                styles.label,
                isActive && styles.labelActive,
                { transform: [{ scale: scaleAnims[i] }] },
              ]}
            >
              {tab.label}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
    paddingBottom: 14,
  },
  indicator: {
    position: 'absolute',
    top: 0, left: 0,
    height: 2,
    backgroundColor: colors.orange,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.familySemibold,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  labelActive: {
    color: colors.orange,
  },
});
