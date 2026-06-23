import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { colors, fonts, spacing } from '../constants/theme';

export default function RegScreen({ navigation }) {
  const [fio, setFio] = useState('');
  const [phone, setPhone] = useState('');

  const handleReg = () => {
    if (!fio.trim()) return;
    const code = 'CLI-' + String(Math.floor(Math.random() * 900) + 100);
    navigation.navigate('RegResult', { fio, code });
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Регистрация" onBack={() => navigation.navigate('Loyalty')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.label}>Имя и фамилия</Text>
          <TextInput
            style={styles.input}
            placeholder="Анна Смирнова"
            placeholderTextColor={colors.muted}
            value={fio}
            onChangeText={setFio}
          />
          <Text style={styles.label}>Телефон</Text>
          <TextInput
            style={styles.input}
            placeholder="+7 900 000-00-00"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <MetalButton title="Создать карту" variant="action" onPress={handleReg} />
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Loyalty" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  label: {
    fontFamily: fonts.familySemibold, fontSize: 11,
    color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 2, marginBottom: 8, marginTop: 8,
  },
  input: {
    padding: 13, backgroundColor: '#07080a',
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    color: colors.text, fontSize: 14, marginBottom: 14,
    fontFamily: fonts.familyRegular,
  },
});
