import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { colors, fonts, anim } from '../constants/theme';
import { getCartSummary } from '../db/cartStore';

const TABS = [
  { key: 'Loyalty', label: 'Лояльность' },
  { key: 'Kassa',    label: 'Касса' },
];

export default function BottomBar({ navigation, activeTab }) {
  const activeIndex = TABS.findIndex(t => t.key === activeTab); // -1, если экран не Лояльность и не Касса
  const [barWidth, setBarWidth] = useState(0);
  const indicatorAnim = useRef(new Animated.Value(Math.max(0, activeIndex))).current;
  const scaleAnims = useRef(TABS.map((_, i) => new Animated.Value(i === activeIndex ? 1 : 0.96))).current;

  // Плавающий бейдж корзины — виден на любом экране, кроме самой Кассы,
  // если в отложенных чеках уже есть товары
  const { count: cartCount, total: cartTotal } = getCartSummary();
  const showCartBadge = cartCount > 0 && activeTab !== 'Kassa';
  const badgeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showCartBadge) {
      badgeAnim.setValue(0);
      Animated.spring(badgeAnim, { toValue: 1, ...anim.spring, useNativeDriver: true }).start();
    }
  }, [showCartBadge]);

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
    <View style={styles.wrap}>
      {showCartBadge && (
        <Animated.View
          style={[
            styles.cartBadge,
            {
              opacity: badgeAnim,
              transform: [{ scale: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
            },
          ]}
        >
          <Pressable style={styles.cartBadgeInner} onPress={() => navigation.navigate('Kassa')}>
            <Text style={styles.cartBadgeIcon}>🛒</Text>
            <Text style={styles.cartBadgeCount}>{cartCount}</Text>
            <View style={styles.cartBadgeDivider} />
            <Text style={styles.cartBadgeTotal}>{Math.round(cartTotal)} ₽</Text>
          </Pressable>
        </Animated.View>
      )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
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

  cartBadge: {
    position: 'absolute',
    bottom: '100%',
    alignSelf: 'center',
    marginBottom: 12,
  },
  cartBadgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.orange,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  cartBadgeIcon: {
    fontSize: 15,
  },
  cartBadgeCount: {
    fontFamily: fonts.family,
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  cartBadgeDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  cartBadgeTotal: {
    fontFamily: fonts.familySemibold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
});
