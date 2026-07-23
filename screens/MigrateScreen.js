import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import TopBar from '../components/TopBar';
import { getHomeRoute } from '../db/session';
import { colors, fonts } from '../constants/theme';

export default function MigrateScreen({ navigation }) {
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Импорт" onBack={() => navigation.navigate(getHomeRoute())} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 32, marginBottom: 16 }}>📥</Text>
        <Text style={{ fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' }}>
          Импорт недоступен
        </Text>
        <Text style={{ fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 }}>
          Функция импорта из Google Sheets удалена. Используйте резервные копии из раздела Настройки → Система.
        </Text>
      </View>
    </View>
  );
}
