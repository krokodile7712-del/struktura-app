import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, useWindowDimensions, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';

// Интерактивный пошаговый тур по разделу. Затемняет весь экран, кроме
// одного подсвеченного элемента за раз (через measureInWindow на ref
// нужного элемента), рядом показывает карточку с объяснением и кнопками
// Далее/Пропустить.
//
// Использование:
//   const btnRef = useRef(null);
//   <Pressable ref={btnRef}>...</Pressable>
//   <TourGuide
//     visible={tourOpen}
//     onClose={() => setTourOpen(false)}
//     steps={[
//       { ref: btnRef, title: 'Заголовок', text: 'Что делает эта кнопка' },
//     ]}
//   />
export default function TourGuide({ visible, onClose, steps = [] }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  useEffect(() => {
    if (!visible || !steps[stepIndex]) { setRect(null); return; }
    // Сбрасываем сразу — иначе на мгновение видна рамка от прошлого шага,
    // пока не измерен новый элемент (рассинхрон подсветки и текста).
    setRect(null);
    const node = steps[stepIndex].ref?.current;
    if (node?.measureInWindow) {
      const measure = (attempt = 0) => {
        node.measureInWindow((x, y, width, height) => {
          if ((width === 0 || height === 0) && attempt < 3) {
            // Разметка ещё не устоялась — пробуем ещё раз чуть позже
            setTimeout(() => measure(attempt + 1), 120);
          } else {
            setRect({ x, y, width, height });
          }
        });
      };
      const t = setTimeout(() => measure(), 120);
      return () => clearTimeout(t);
    } else {
      setRect(null);
    }
  }, [visible, stepIndex, steps]);

  const { width: screenW, height: screenH } = useWindowDimensions();

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
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.9)' },
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
