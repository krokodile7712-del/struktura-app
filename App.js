import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import {
  useFonts,
  AnekDevanagari_400Regular,
  AnekDevanagari_600SemiBold,
  AnekDevanagari_700Bold,
  AnekDevanagari_800ExtraBold,
} from '@expo-google-fonts/anek-devanagari';

import AppBackground from './components/AppBackground';
import LoyaltyScreen from './screens/LoyaltyScreen';
import { colors } from './constants/theme';

export default function App() {
  const [fontsLoaded] = useFonts({
    AnekDevanagari_400Regular,
    AnekDevanagari_600SemiBold,
    AnekDevanagari_700Bold,
    AnekDevanagari_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.olive} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={colors.bg} />
      <AppBackground>
        <LoyaltyScreen />
      </AppBackground>
    </>
  );
}
