import React from 'react';
import { View } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';

// Обёртка для «коробки» модального окна. Окна СТРУКТУРЫ заданы шириной в
// процентах (40–62%), рассчитанной на планшет в альбомной ориентации; на
// телефоне это давало ширину 150–240 px, и поля/кнопки не помещались.
//
// Ширина считается живо (useWindowDimensions внутри useResponsive), поэтому
// поворот экрана подхватывается сразу, без перезапуска.
//   • ширина < 600 (телефон портретно)   — окно на 94% ширины
//   • ширина 600–899 (планшет портретно / телефон альбомно) — 90%, но не шире 640
//   • ширина ≥ 900 (планшет альбомно)    — стили окна не трогаем вообще
// phoneStyle — необязательные добавки только для телефона (например,
// перестроить колонки окна оплаты в одну).
const TIGHT = { width: '90%', minWidth: 0, maxWidth: 640, maxHeight: '92%' };
const PHONE = { width: '94%', minWidth: 0, maxWidth: 640, maxHeight: '92%' };

export default function FitView({ style, phoneStyle, ...rest }) {
  const { width, isNarrow } = useResponsive();
  let merged = style;
  if (width < 900) {
    merged = [style, isNarrow ? PHONE : TIGHT, isNarrow && phoneStyle ? phoneStyle : null];
  }
  return <View {...rest} style={merged} />;
}
