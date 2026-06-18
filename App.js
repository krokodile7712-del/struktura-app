import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  useFonts,
  AnekDevanagari_400Regular,
  AnekDevanagari_600SemiBold,
  AnekDevanagari_700Bold,
  AnekDevanagari_800ExtraBold,
} from '@expo-google-fonts/anek-devanagari';

import AppBackground from './components/AppBackground';
import LoyaltyScreen from './screens/LoyaltyScreen';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import { colors } from './constants/theme';

const Stack = createNativeStackNavigator();

// Тема навигации — фон навигатора тоже тёмный, чтобы не было белых вспышек при переходах
const navTheme = {
  dark: true,
  colors: {
    primary: colors.olive,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    notification: colors.red,
  },
};

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
      <NavigationContainer theme={navTheme}>
        <AppBackground>
          <Stack.Navigator
            initialRouteName="Loyalty"
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          >
            <Stack.Screen name="Loyalty" component={LoyaltyScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
          </Stack.Navigator>
        </AppBackground>
      </NavigationContainer>
    </>
  );
}
