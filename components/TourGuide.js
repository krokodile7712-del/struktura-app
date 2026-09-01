import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal, useWindowDimensions, StyleSheet, Animated } from 'react-native';
import { colors, fonts } from '../constants/theme';
import { useTourActiveSetter } from './TourRegistry';

// Интерактивный пошаговый тур по разделу.
//
// Раньше TourGuide сам вычислял координаты подсвечиваемого элемента и
// рисовал вокруг него вырезку в затемнении — оказалось ненадёжно в сложных
// случаях (вложенные анимированные родители, flex gap). Теперь TourGuide
// вообще не занимается измерением и подсветкой — он просто показывает
// карточку с объяснением и транслирует наружу, какой шаг сейчас активен
// (через useTourActiveSetter). Каждый подсвечиваемый участок экрана сам
// решает, как ему выглядеть — см. useTourHighlight в TourRegistry.js —
// рисует вокруг СЕБЯ рамку, когда активен именно он, и притухает, когда
// активен кто-то другой. Это надёжнее любых внешних измерений.
//
// Использование:
//   const highlight = useTourHighlight('kassa.client');
//   <View style={[styles.x, highlight.style]}>...</View>
//   <TourGuide
//     visible={tourOpen}
//     onClose={() => setTourOpen(false)}
//     steps={[{ key: 'kassa.client', title: 'Заголовок', text: 'Что это' }]}
//   />
export default function TourGuide({ visible, onClose, steps = [] }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [cardH, setCardH] = useState(260); // измеряется реально, это лишь стартовое приближение
  const setActiveKey = useTourActiveSetter();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const posAnim = useRef(new Animated.Value(0)).current; // 0 = снизу, 1 = сверху

  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  useEffect(() => {
    setActiveKey(visible ? (steps[stepIndex]?.key || null) : null);
    return () => setActiveKey(null);
  }, [visible, stepIndex, steps, setActiveKey]);

  const step = steps[stepIndex];
  const cardPosition = step?.cardPosition || 'bottom'; // 'top' | 'bottom'

  // Плавный переход между позициями при смене шага — не резкий прыжок
  useEffect(() => {
    Animated.spring(posAnim, {
      toValue: cardPosition === 'top' ? 1 : 0,
      useNativeDriver: false, // анимируем top, не transform — под текст переменной высоты
      tension: 60,
      friction: 12,
    }).start();
  }, [cardPosition, stepIndex]);

  if (!visible || steps.length === 0) return null;

  const isLast = stepIndex === steps.length - 1;
  const cardW = Math.min(420, screenW - 32);
  const topWhenTop = 24;
  const topWhenBottom = screenH - 24 - cardH;

  const handleClose = () => { setActiveKey(null); onClose(); };
  const handleNext = () => isLast ? handleClose() : setStepIndex(i => i + 1);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View
          onLayout={e => setCardH(e.nativeEvent.layout.height)}
          style={[
            styles.card,
            {
              width: cardW,
              left: (screenW - cardW) / 2,
              top: posAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [topWhenBottom, topWhenTop],
              }),
            },
          ]}
        >
          <Text style={styles.stepCounter}>{stepIndex + 1} из {steps.length}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.text}>{step.text}</Text>
          <View style={styles.btnRow}>
            <Pressable onPress={handleClose} style={styles.skipBtn} hitSlop={8}>
              <Text style={styles.skipTxt}>Пропустить</Text>
            </Pressable>
            <Pressable onPress={handleNext} style={styles.nextBtn} hitSlop={8}>
              <Text style={styles.nextTxt}>{isLast ? 'Готово' : 'Далее'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  card: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  stepCounter: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.family,
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  text: {
    fontFamily: fonts.familyRegular,
    fontSize: 14,
    color: colors.textDim,
    lineHeight: 21,
    marginBottom: 18,
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  skipBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  skipTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  nextBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.orange,
    alignItems: 'center',
  },
  nextTxt: { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#fff' },
});
