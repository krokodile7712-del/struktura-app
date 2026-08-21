import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, PanResponder, Modal as RNModal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../hooks/useResponsive';
import { colors, fonts } from '../constants/theme';

// Этап 3 разворота на адаптивность: единый выезжающий слой поверх контента.
// Структура намеренно повторяет уже проверенный по всему проекту паттерн
// модалок (flex:1 + сплошной цвет фона напрямую на самом Modal-контейнере,
// без отдельного анимированного слоя затемнения) — только с добавленной
// анимацией выезда самой карточки. Снизу на узком/среднем экране, сбоку на
// широком — решает useResponsive.
export default function Sheet({ visible, onClose, onBack, title, children, sideWidth = 480 }) {
  const { sheetPosition, width: screenWidth } = useResponsive();
  const insets = useSafeAreaInsets();
  const isBottom = sheetPosition === 'bottom';
  const [shouldRender, setShouldRender] = useState(visible);

  const offscreen = isBottom ? 1200 : 600; // с запасом — реальный сдвиг всегда больше высоты/ширины самой карточки
  const translateAnim = useRef(new Animated.Value(offscreen)).current;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      translateAnim.setValue(offscreen);
      Animated.spring(translateAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 12 }).start();
    } else if (shouldRender) {
      Animated.timing(translateAnim, { toValue: offscreen, duration: 200, useNativeDriver: true })
        .start(() => setShouldRender(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const closeThreshold = isBottom ? 110 : 90;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        isBottom ? g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx) : g.dx > 4 && Math.abs(g.dx) > Math.abs(g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) =>
        isBottom ? g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx) : g.dx > 4 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const delta = isBottom ? g.dy : g.dx;
        if (delta > 0) translateAnim.setValue(delta);
      },
      onPanResponderRelease: (_, g) => {
        const delta = isBottom ? g.dy : g.dx;
        if (delta > closeThreshold) {
          onClose?.();
        } else {
          Animated.spring(translateAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 12 }).start();
        }
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  if (!shouldRender) return null;

  const transformStyle = isBottom
    ? { transform: [{ translateY: translateAnim }] }
    : { transform: [{ translateX: translateAnim }] };

  return (
    <RNModal transparent visible={shouldRender} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.overlay, isBottom ? { justifyContent: 'flex-end' } : { alignItems: 'flex-end' }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        <Animated.View
          style={[
            isBottom ? styles.sheetBottom : styles.sheetSide,
            isBottom
              ? { height: '90%', paddingBottom: Math.max(insets.bottom, 16) }
              : { width: Math.min(sideWidth, screenWidth * 0.92), height: '100%', paddingTop: Math.max(insets.top, 20) },
            transformStyle,
          ]}
        >
          <View {...pan.panHandlers}>
            {isBottom && <View style={styles.grabber} />}
            <View style={styles.header}>
              {onBack && (
                <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
                  <Text style={styles.backTxt}>‹</Text>
                </Pressable>
              )}
              {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : <View style={{ flex: 1 }} />}
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Text style={styles.closeTxt}>✕</Text>
              </Pressable>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            {children}
          </View>
        </Animated.View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },

  sheetBottom: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: colors.border, borderBottomWidth: 0,
  },
  sheetSide: {
    backgroundColor: colors.surface,
    borderLeftWidth: 1, borderColor: colors.border,
  },

  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, marginRight: 12 },
  backBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  backTxt: { fontSize: 22, color: colors.orange, fontFamily: fonts.family, marginTop: -2 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 13, color: colors.muted, fontFamily: fonts.familySemibold },
});
