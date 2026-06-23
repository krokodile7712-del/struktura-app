import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

export default function ShiftScreen({ navigation }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const handleStart = () => {
    navigation.navigate('Dashboard');
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Открытие смены" onBack={() => navigation.navigate('Dashboard')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="ГГГГ-ММ-ДД"
            placeholderTextColor={colors.muted}
          />
          <MetalButton title="Начать работу" variant="action" onPress={handleStart} />
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Login" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  input: {
    width: '100%', padding: 15, backgroundColor: '#07080a',
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    color: colors.text, fontSize: 16, marginBottom: 12,
    textAlign: 'center', fontFamily: fonts.family,
  },
});
