import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { colors } from '../constants/theme';

// Набор одноцветных значков (контурные, 24×24, форма — по набору Lucide, лицензия ISC).
// Вместо цветных эмодзи (👤 🏷 ✏️ ⏸ 🛒): эмодзи выглядят по-разному на разных устройствах и
// выбиваются из сдержанного стиля. Цвет задаётся color — значок всегда в цвет текста рядом.
const ICONS = {
  user:    { paths: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'], circles: [[12, 7, 4]] },
  tag:     { paths: ['M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z'], circles: [[7.5, 7.5, 1]] },
  pencil:  { paths: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', 'm15 5 4 4'] },
  note:    { paths: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M8 13h8', 'M8 17h5'] },
  pause:   { rects: [[14, 4, 4, 16, 1], [6, 4, 4, 16, 1]] },
  x:       { paths: ['M18 6 6 18', 'm6 6 12 12'] },
  cart:    { paths: ['M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12'], circles: [[8, 21, 1], [19, 21, 1]] },
  message: { paths: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'] },
  list:    { paths: ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M12 11h4', 'M12 16h4', 'M8 11h.01', 'M8 16h.01'], rects: [[8, 2, 8, 4, 1]] },
  zap:     { paths: ['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'] },
};

export default function Icon({ name, size = 20, color = colors.textDim, strokeWidth = 1.8 }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {(d.paths || []).map((p, i) => <Path key={'p' + i} d={p} />)}
      {(d.circles || []).map(([cx, cy, r], i) => <Circle key={'c' + i} cx={cx} cy={cy} r={r} />)}
      {(d.rects || []).map(([x, y, w, h, rx], i) => <Rect key={'r' + i} x={x} y={y} width={w} height={h} rx={rx} />)}
    </Svg>
  );
}
