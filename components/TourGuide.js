import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, useWindowDimensions, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';
import { useTourRect } from './TourRegistry';

// Интерактивный пошаговый тур по разделу. Затемняет весь экран, кроме
// одного подсвеченного элемента за раз, рядом показывает карточку с
// объяснением и кнопками Далее/Пропустить.
//
// Координаты подсвечиваемого элемента берутся из общего реестра
// (TourRegistry) — сам элемент сообщает о себе через onLayout, когда его
// раскладка действительно готова (и повторно, если она позже сдвинется).
// Это надёжнее измерения снаружи по таймеру, которое приходится гадать.
//
// Использование:
//   const client = useTourTarget('kassa.client');
//   <View ref={client.ref} onLayout={client.onLayout}>...</View>
//   <TourGuide
//     visible={tourOpen}
//     onClose={() => setTourOpen(false)}
//     steps={[
//       { key: 'kassa.client', title: 'Заголовок', text: 'Что это' },
//     ]}
//   />
export default function TourGuide({ visible, onClose, steps = [] }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  const { width: screenW, height: screenH } = useWindowDimensions();
  const rect = useTourRect(visible ? steps[stepIndex]?.key : null);

  if (!visible || steps.length === 0) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const pad = 8;
  const overshoot = 60; // запас за пределы вычисленных границ экрана

  const r = rect ? {
    x: Math.max(0, rect.x - pad),
    y: Math.max(0, rect.y - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  } : null;

  const cardW = Math.min(420, screenW - 32);
  const cardH = 200; // приблизительная высота карточки, с запасом
  const gap = 16;

  const clampX = x => Math.min(Math.max(x, 16), screenW - 16 - cardW);
  const clampY = y => Math.min(Math.max(y, 16), screenH - 16 - cardH);

  let cardStyle;
  if (!r) {
    cardStyle = { width: cardW, top: screenH / 2 - cardH / 2, left: (screenW - cardW) / 2 };
  } else {
    const spaceBelow = screenH - (r.y + r.height);
    const spaceAbove = r.y;
    const spaceRight = screenW - (r.x + r.width);
    const spaceLeft  = r.x;

    // Приоритет: снизу → сверху → справа → слева → по центру поверх всего,
    // если подсвеченный элемент занимает практически весь экран.
    if (spaceBelow >= cardH + gap) {
      cardStyle = { width: cardW, top: r.y + r.height + gap, left: clampX(r.x + r.width / 2 - cardW / 2) };
    } else if (spaceAbove >= cardH + gap) {
      cardStyle = { width: cardW, top: r.y - cardH - gap, left: clampX(r.x + r.width / 2 - cardW / 2) };
    } else if (spaceRight >= cardW + gap) {
      cardStyle = { width: cardW, left: r.x + r.width + gap, top: clampY(r.y + r.height / 2 - cardH / 2) };
    } else if (spaceLeft >= cardW + gap) {
      cardStyle = { width: cardW, left: r.x - cardW - gap, top: clampY(r.y + r.height / 2 - cardH / 2) };
    } else {
      cardStyle = { width: cardW, top: screenH / 2 - cardH / 2, left: (screenW - cardW) / 2 };
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {r ? (
          <>
            {/* Каждый прямоугольник затемнения выходит за пределы вычисленных
                границ экрана на overshoot px — подстраховка на случай, если
                реальная область отрисовки Modal чуть больше, чем сообщают
                размеры окна (частый случай на Android с жестовой навигацией). */}
            <View style={[styles.dim, { top: -overshoot, left: -overshoot, right: -overshoot, height: r.y + overshoot }]} />
            <View style={[styles.dim, { top: r.y + r.height, left: -overshoot, right: -overshoot, height: screenH - (r.y + r.height) + overshoot }]} />
            <View style={[styles.dim, { top: r.y, left: -overshoot, width: r.x + overshoot, height: r.height }]} />
            <View style={[styles.dim, { top: r.y, left: r.x + r.width, width: screenW - (r.x + r.width) + overshoot, height: r.height }]} />
            <View pointerEvents="none" style={[styles.spotlightBorder, { top: r.y, left: r.x, width: r.width, height: r.height }]} />
          </>
        ) : (
          <View style={[styles.dim, { top: -overshoot, left: -overshoot, right: -overshoot, bottom: -overshoot }]} />
        )}

        <View style={[styles.card, cardStyle]}>
          <Text style={styles.stepCounter}>{stepIndex + 1} из {steps.length}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.text}>{step.text}</Text>
          <View style={styles.btnRow}>
            <Pressable onPress={onClose} style={styles.skipBtn} hitSlop={8}>
              <Text style={styles.skipTxt}>Пропустить</Text>
            </Pressable>
            <Pressable
              onPress={() => isLast ? onClose() : setStepIndex(i => i + 1)}
              style={styles.nextBtn}
              hitSlop={8}
            >
              <Text style={styles.nextTxt}>{isLast ? 'Готово' : 'Далее'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.78)' },
  spotlightBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.orange,
    borderRadius: 12,
  },
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
