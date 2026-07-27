// Карточка клиента теперь встроена в ClientsListScreen (горизонтальный layout)
// Этот файл остаётся для навигации из кассы по clientId
import React from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ClientsListScreen from './ClientsListScreen';

// При переходе navigate('ClientCard', { clientId }) — открываем список и выбираем нужного
export default function ClientCardScreen({ route, navigation }) {
  return <ClientsListScreen navigation={navigation} initialClientId={route?.params?.clientId} />;
}
