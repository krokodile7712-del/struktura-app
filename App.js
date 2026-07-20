import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text } from 'react-native';
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
import { initDatabase } from './db/database';
import { startAutoSync } from './db/sync';

import LoyaltyScreen from './screens/LoyaltyScreen';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import KassaScreen from './screens/KassaScreen';
import ShiftScreen from './screens/ShiftScreen';
import ShiftCloseScreen from './screens/ShiftCloseScreen';
import SalesScreen from './screens/SalesScreen';
import StockScreen from './screens/StockScreen';
import RegScreen from './screens/RegScreen';
import RegResultScreen from './screens/RegResultScreen';
import SearchScreen from './screens/SearchScreen';
import ClientCardScreen from './screens/ClientCardScreen';
import ClientsListScreen from './screens/ClientsListScreen';
import CostCardsScreen from './screens/CostCardsScreen';
import ExpensesScreen from './screens/ExpensesScreen';
import AdminScreen from './screens/AdminScreen';
import SettingsScreen from './screens/SettingsScreen';
import MigrateScreen from './screens/MigrateScreen';
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
  const [fontsLoaded] = useFonts({
    AnekDevanagari_400Regular,
    AnekDevanagari_600SemiBold,
    AnekDevanagari_700Bold,
    AnekDevanagari_800ExtraBold,
  });

  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    try {
      initDatabase();
      startAutoSync(30 * 1000); // каждые 30 секунд
      setDbReady(true);
    } catch (e) {
      setDbError(e.message);
    }
  }, []);

  if (!fontsLoaded || !dbReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={colors.olive} />
        {dbError && <Text style={{ color: colors.redLight, fontSize: 12 }}>{dbError}</Text>}
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={colors.bg} />
      <NavigationContainer theme={navTheme}>
        <AppBackground>
          <Stack.Navigator
            initialRouteName="Login"
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          >
            <Stack.Screen name="Loyalty"     component={LoyaltyScreen} />
            <Stack.Screen name="Login"       component={LoginScreen} />
            <Stack.Screen name="Dashboard"   component={DashboardScreen} />
            <Stack.Screen name="Admin"       component={AdminScreen} />
            <Stack.Screen name="Settings"    component={SettingsScreen} />
            <Stack.Screen name="Kassa"       component={KassaScreen} />
            <Stack.Screen name="Shift"       component={ShiftScreen} />
            <Stack.Screen name="ShiftClose"  component={ShiftCloseScreen} />
            <Stack.Screen name="Sales"       component={SalesScreen} />
            <Stack.Screen name="Stock"       component={StockScreen} />
            <Stack.Screen name="Reg"         component={RegScreen} />
            <Stack.Screen name="RegResult"   component={RegResultScreen} />
            <Stack.Screen name="Search"      component={SearchScreen} />
            <Stack.Screen name="ClientCard"  component={ClientCardScreen} />
            <Stack.Screen name="ClientsList" component={ClientsListScreen} />
            <Stack.Screen name="CostCards"   component={CostCardsScreen} />
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
        </AppBackground>
      </NavigationContainer>
    </>
  );
}
