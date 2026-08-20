import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNav from './components/AppNav';
import { useResponsive } from './hooks/useResponsive';
import {
  useFonts,
  AnekDevanagari_400Regular,
  AnekDevanagari_600SemiBold,
  AnekDevanagari_700Bold,
  AnekDevanagari_800ExtraBold,
} from '@expo-google-fonts/anek-devanagari';

import AppBackground from './components/AppBackground';
import { ToastProvider } from './components/Toast';
import OnboardingScreen from './screens/OnboardingScreen';
import { getSetting } from './db/queries';
import { initDatabase } from './db/database';
import { startAutoSync } from './db/sync';

import LoyaltyScreen from './screens/LoyaltyScreen';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import KassaScreen from './screens/KassaScreen';
import ShiftScreen from './screens/ShiftScreen';
import ShiftCloseScreen from './screens/ShiftCloseScreen';
import SalesScreen from './screens/SalesScreen';
import BookingsScreen from './screens/BookingsScreen';
import RegScreen from './screens/RegScreen';
import RegResultScreen from './screens/RegResultScreen';
import SearchScreen from './screens/SearchScreen';
import ClientCardScreen from './screens/ClientCardScreen';
import ClientsListScreen from './screens/ClientsListScreen';
import ExpensesScreen from './screens/ExpensesScreen';
import AdminScreen from './screens/AdminScreen';
import SettingsScreen from './screens/SettingsScreen';
import MigrateScreen from './screens/MigrateScreen';
import ProductsScreen from './screens/ProductsScreen';
import LocationsScreen from './screens/LocationsScreen';
import EmployeesScreen from './screens/EmployeesScreen';
import InventoryScreen from './screens/InventoryScreen';
import InventoryCountScreen from './screens/InventoryCountScreen';
import ReportsScreen from './screens/ReportsScreen';
import EquipmentScreen from './screens/EquipmentScreen';
import OverheadsScreen from './screens/OverheadsScreen';
import InvestmentsScreen from './screens/InvestmentsScreen';
import WorkJournalScreen from './screens/WorkJournalScreen';
import { colors, fonts } from './constants/theme';

const Stack = createNativeStackNavigator();

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
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium:  { fontFamily: 'System', fontWeight: '500' },
    bold:    { fontFamily: 'System', fontWeight: '700' },
    heavy:   { fontFamily: 'System', fontWeight: '800' },
  },
};

export default function App() {
  const navigationRef = useNavigationContainerRef();
  const [currentRoute, setCurrentRoute] = useState(null);
  const { isLandscape } = useResponsive();
  // Проба: встроенная (не пересоздаваемая при переходах) AppNav — пока
  // только на экране Товаров, чтобы проверить подход прежде чем менять
  // остальные 17 экранов.
  const PILOT_SCREENS = ['Products', 'Admin', 'Dashboard', 'Sales', 'ClientsList', 'Reports', 'Expenses', 'Locations', 'Inventory', 'Kassa', 'Equipment', 'Investments'];

  const [fontsLoaded] = useFonts({
    AnekDevanagari_400Regular,
    AnekDevanagari_600SemiBold,
    AnekDevanagari_700Bold,
    AnekDevanagari_800ExtraBold,
  });

  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [initialRoute, setInitialRoute] = useState(null); // null = ещё не определён

  useEffect(() => {
    try {
      initDatabase();
      startAutoSync(30 * 1000);
      // Показываем онбординг только если: флаг не установлен И нет ни одного пользователя
      const done = getSetting('onboarding_done');
      const hasUsers = (() => {
        try { const { getAllUsers } = require('./db/queries'); return getAllUsers().length > 0; }
        catch { return false; }
      })();
      setInitialRoute(done || hasUsers ? 'Login' : 'Onboarding');
      setDbReady(true);
    } catch (e) {
      setDbError(e.message);
      setInitialRoute('Login');
      setDbReady(true);
    }
  }, []);

  if (!fontsLoaded || !dbReady || !initialRoute) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={colors.olive} />
        {dbError && <Text style={{ color: colors.redLight, fontSize: 12 }}>{dbError}</Text>}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={colors.bg} />
      <ToastProvider>
      <NavigationContainer
        theme={navTheme}
        ref={navigationRef}
        onReady={() => setCurrentRoute(navigationRef.getCurrentRoute()?.name)}
        onStateChange={() => setCurrentRoute(navigationRef.getCurrentRoute()?.name)}
      >
        <AppBackground>
          <View style={{ flex: 1, flexDirection: isLandscape ? 'row' : 'column' }}>
            {isLandscape && PILOT_SCREENS.includes(currentRoute) && (
              <AppNav navigation={navigationRef} activeScreen={currentRoute} />
            )}
            <View style={{ flex: 1 }}>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              animationDuration: 220,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          >
            <Stack.Screen name="Onboarding"  component={OnboardingScreen} />
            <Stack.Screen name="Loyalty"     component={LoyaltyScreen} />
            <Stack.Screen name="Login"       component={LoginScreen} />
            <Stack.Screen name="Dashboard"   component={DashboardScreen} />
            <Stack.Screen name="Admin"       component={AdminScreen} />
            <Stack.Screen name="Settings"    component={SettingsScreen} />
            <Stack.Screen name="Kassa"       component={KassaScreen} />
            <Stack.Screen name="Shift"       component={ShiftScreen} />
            <Stack.Screen name="ShiftClose"  component={ShiftCloseScreen} />
            <Stack.Screen name="Sales"       component={SalesScreen} />
            <Stack.Screen name="Bookings"    component={BookingsScreen} />
            <Stack.Screen name="Reg"         component={RegScreen} />
            <Stack.Screen name="RegResult"   component={RegResultScreen} />
            <Stack.Screen name="Search"      component={SearchScreen} />
            <Stack.Screen name="ClientCard"  component={ClientCardScreen} />
            <Stack.Screen name="ClientsList" component={ClientsListScreen} />
            <Stack.Screen name="Products"    component={ProductsScreen} />
            <Stack.Screen name="Expenses"    component={ExpensesScreen} />
            <Stack.Screen name="Migrate"     component={MigrateScreen} />
            <Stack.Screen name="Locations"      component={LocationsScreen} />
            <Stack.Screen name="Employees"      component={EmployeesScreen} />
            <Stack.Screen name="Inventory"      component={InventoryScreen} />
            <Stack.Screen name="InventoryCount" component={InventoryCountScreen} />
            <Stack.Screen name="Reports"        component={ReportsScreen} />
            <Stack.Screen name="Equipment"      component={EquipmentScreen} />
            <Stack.Screen name="Overheads"      component={OverheadsScreen} />
            <Stack.Screen name="Investments"    component={InvestmentsScreen} />
            <Stack.Screen name="WorkJournal"    component={WorkJournalScreen} />
          </Stack.Navigator>
            </View>
            {!isLandscape && PILOT_SCREENS.includes(currentRoute) && (
              <AppNav navigation={navigationRef} activeScreen={currentRoute} />
            )}
          </View>
        </AppBackground>
      </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
