import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, PanResponder, Modal as RNModal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../hooks/useResponsive';
import { colors, fonts } from '../constants/theme';

// Этап 3 разворота на адаптивность: единый выезжающий слой поверх контента.
// Заменяет разом три раньше отдельных механизма — карточки при выборе из
// списка, все модальные окна, и выезжающую панель действий Склада (которая
// и была прообразом этого компонента). Снизу на узком/среднем экране,
// сбоку на широком — решает useResponsive, не нужно думать об этом в
// каждом месте использования. Закрывается свайпом (вниз/вбок) или крестиком.
export default function Sheet({ visible, onClose, title, children, sideWidth = 480 }) {
  const { sheetPosition, width: screenWidth, height: screenHeight } = useResponsive();
  const insets = useSafeAreaInsets();
  const isBottom = sheetPosition === 'bottom';
  const [shouldRender, setShouldRender] = useState(visible);

  const offscreen = isBottom ? screenHeight : screenWidth;
  const translateAnim = useRef(new Animated.Value(offscreen)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      translateAnim.setValue(offscreen);
      Animated.parallel([
        Animated.spring(translateAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 12 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else if (shouldRender) {
      Animated.parallel([
        Animated.timing(translateAnim, { toValue: offscreen, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => setShouldRender(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const closeThreshold = isBottom ? 110 : 90;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        isBottom ? g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) : g.dx > 6 && Math.abs(g.dx) > Math.abs(g.dy),
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
    })
  ).current;

  if (!shouldRender) return null;

  const transformStyle = isBottom
    ? { transform: [{ translateY: translateAnim }] }
    : { transform: [{ translateX: translateAnim }] };

  return (
    <RNModal
      transparent
      visible={shouldRender}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFillObject}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: backdropAnim }]}>
          <Pressable style={[StyleSheet.absoluteFillObject, styles.backdrop]} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            isBottom ? styles.sheetBottom : styles.sheetSide,
            isBottom
              ? { maxHeight: '90%', paddingBottom: Math.max(insets.bottom, 16) }
              : { width: Math.min(sideWidth, screenWidth * 0.92), paddingTop: insets.top },
            transformStyle,
          ]}
        >
          <View {...pan.panHandlers}>
            {isBottom && <View style={styles.grabber} />}
            <View style={styles.header}>
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
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },

  sheetBottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: colors.border, borderBottomWidth: 0,
  },
  sheetSide: {
    position: 'absolute', top: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface,
    borderLeftWidth: 1, borderColor: colors.border,
  },

  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, marginRight: 12 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 13, color: colors.muted, fontFamily: fonts.familySemibold },
});
