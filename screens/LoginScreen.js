import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import { colors, fonts, spacing } from '../constants/theme';

// Моковые PIN-коды — позже заменим на SQLite
const PINS = {
  '1234': 'barista',
  '0000': 'admin',
};

export default function LoginScreen({ navigation }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    const role = PINS[pin];
    if (role === 'barista') {
      setError('');
      navigation.navigate('Dashboard');
    } else if (role === 'admin') {
      setError('');
      navigation.navigate('Admin');
    } else {
      setError('Неверный PIN-код');
      setPin('');
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
      <View style={styles.brandHeader}>
        <Image
          source={{ uri: 'https://i.ibb.co/hRZxPz8b/19-20260514150523.png' }}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.subLogo}>Система кассы</Text>
      </View>

      <MetalCard>
        <Text style={styles.cardTitle}>Введите ПИН-код</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          placeholder="• • • •"
          placeholderTextColor={colors.muted}
          value={pin}
          onChangeText={(v) => { setPin(v); setError(''); }}
        />
        {error !== '' && <Text style={styles.error}>{error}</Text>}
        <MetalButton title="Войти" variant="action" onPress={handleLogin} />
        <MetalButton title="← Назад" variant="back" onPress={() => navigation.navigate('Loyalty')} />
      </MetalCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: {
    padding: spacing.lg,
    paddingBottom: 80,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  brandHeader: { alignItems: 'center', paddingVertical: 24 },
  logo: { width: 280, height: 160, borderRadius: 14, marginBottom: 10 },
  subLogo: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    letterSpacing: 5,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontFamily: fonts.family,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.textDim,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  input: {
    width: '100%',
    padding: 15,
    backgroundColor: '#07080a',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 18,
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: fonts.family,
  },
  error: {
    fontFamily: fonts.familyRegular,
    fontSize: 13,
    color: colors.red,
    textAlign: 'center',
    marginBottom: 10,
  },
});
