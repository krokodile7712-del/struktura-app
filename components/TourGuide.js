import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, Dimensions, StyleSheet } from 'react-native';
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
    const node = steps[stepIndex].ref?.current;
    if (node?.measureInWindow) {
      // Небольшая задержка — даём разметке устояться перед измерением
      const t = setTimeout(() => {
        node.measureInWindow((x, y, width, height) => {
          setRect({ x, y, width, height });
        });
      }, 60);
      return () => clearTimeout(t);
    } else {
      setRect(null);
    }
  }, [visible, stepIndex, steps]);

  if (!visible || steps.length === 0) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const pad = 8;

  const r = rect ? {
    x: Math.max(0, rect.x - pad),
    y: Math.max(0, rect.y - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  } : null;

  const cardBelowFits = r ? (r.y + r.height + 190 < screenH) : true;
  const cardW = Math.min(420, screenW - 32);
  const cardLeft = r
    ? Math.min(Math.max(r.x + r.width / 2 - cardW / 2, 16), screenW - 16 - cardW)
    : (screenW - cardW) / 2;
  const cardStyle = {
    width: cardW,
    left: cardLeft,
    ...(r
      ? (cardBelowFits ? { top: r.y + r.height + 16 } : { top: Math.max(60, r.y - 190) })
      : { top: screenH / 2 - 90 }),
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {r ? (
          <>
            <View style={[styles.dim, { top: 0, left: 0, right: 0, height: r.y }]} />
            <View style={[styles.dim, { top: r.y + r.height, left: 0, right: 0, bottom: 0 }]} />
            <View style={[styles.dim, { top: r.y, left: 0, width: r.x, height: r.height }]} />
            <View style={[styles.dim, { top: r.y, left: r.x + r.width, right: 0, height: r.height }]} />
            <View pointerEvents="none" style={[styles.spotlightBorder, { top: r.y, left: r.x, width: r.width, height: r.height }]} />
          </>
        ) : (
          <View style={[styles.dim, StyleSheet.absoluteFillObject]} />
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
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.72)' },
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
