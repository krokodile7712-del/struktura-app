import React from 'react';
import { View } from 'react-native';
import { colors } from '../constants/theme';

// Нарисованный замок (без цветного эмодзи 🔒): корпус и дужка из обычных View.
export default function LockIcon({ size = 20, color = colors.textDim }) {
  const bodyW = size * 0.7;
  const bodyH = size * 0.5;
  const bw = Math.max(1.6, size * 0.09);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View
        style={{
          position: 'absolute', top: size * 0.02,
          width: bodyW * 0.62, height: size * 0.5,
          borderWidth: bw, borderBottomWidth: 0, borderColor: color,
          borderTopLeftRadius: bodyW, borderTopRightRadius: bodyW,
        }}
      />
      <View style={{ width: bodyW, height: bodyH, borderRadius: size * 0.12, backgroundColor: color }} />
    </View>
  );
}
