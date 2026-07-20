import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import Hint from '../components/Hint';
import { getUserByPin, getOpenShift, getBusinessProfile } from '../db/queries';
import { setSession } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

export default function LoginScreen({ navigation }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const businessName = (() => {
    try { return getBusinessProfile()?.business_name || 'СТРУКТУРА'; } catch { return 'СТРУКТУРА'; }
  })();

  const handleLogin = () => {
    if (!pin.trim()) { setError('Введите PIN-код'); return; }
    const user = getUserByPin(pin);
    if (!user) {
      setError('Неверный PIN-код. Попробуйте ещё раз или обратитесь к администратору.');
      setPin('');
      return;
    }
    setError('');
    setSession(user);
    const shiftsEnabled = getBusinessProfile()?.modules?.shifts !== false;
    const openShift = shiftsEnabled ? getOpenShift() : true;
    if (shiftsEnabled && !openShift) {
      navigation.navigate('Shift');
    } else if (user.role === 'admin') {
      navigation.navigate('Admin');
    } else {
      navigation.navigate('Dashboard');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <TopBar title={businessName} />
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.welcome}>👋 Добро пожаловать</Text>
        <Text style={styles.welcomeSub}>Введите ваш персональный PIN-код для входа</Text>

        <MetalCard style={{ marginTop: 20 }}>
          <Text style={styles.label}>PIN-код</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            placeholder="• • • •"
            placeholderTextColor={colors.muted}
            value={pin}
            onChangeText={v => { setPin(v); setError(''); }}
            autoFocus
          />
          <Hint>PIN-код назначает администратор. Каждый сотрудник использует свой уникальный код.</Hint>

          {error !== '' && <Text style={styles.error}>⚠️ {error}</Text>}

          <MetalButton title="Войти →" variant="action" onPress={handleLogin} />

          <Text style={styles.footer}>
            Забыли PIN-код? Обратитесь к администратору — он может изменить его в разделе «Сотрудники».
          </Text>
        </MetalCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  inner: { padding: spacing.lg, paddingBottom: 80, maxWidth: 600, width: '100%', alignSelf: 'center' },
  welcome: { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 24, textAlign: 'center' },
  welcomeSub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 4 },
  label: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 },
  input: {
    width: '100%', padding: 18, backgroundColor: '#07080a',
    borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    color: colors.text, fontSize: 28, marginBottom: 4,
    textAlign: 'center', fontFamily: fonts.family, letterSpacing: 8,
  },
  error: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.redLight, textAlign: 'center', marginBottom: 10, lineHeight: 18 },
  footer: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
