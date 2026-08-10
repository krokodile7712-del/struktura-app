import React from 'react';
import { View } from 'react-native';
import TopBar from '../components/TopBar';
import AppNav from '../components/AppNav';
import StockPanel from '../components/panels/StockPanel';
import { getHomeRoute, goBackSmart } from '../db/session';
import { colors } from '../constants/theme';

// Отдельный полноэкранный маршрут Склада — вся реальная логика (список,
// закупка/списание, история, категории) живёт в components/panels/StockPanel.js
// и используется одинаково и здесь, и во встроенной панели Admin/Dashboard.
export default function StockScreen({ navigation }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Склад" onBack={() => goBackSmart(navigation)} />
      <StockPanel navigation={navigation} />
      <AppNav navigation={navigation} activeScreen="Stock" />
    </View>
  );
}
