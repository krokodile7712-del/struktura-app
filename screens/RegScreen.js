import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import Hint from '../components/Hint';
import BottomBar from '../components/BottomBar';
import { insertClient, getClientByCode, getTerms } from '../db/queries';
import { useToast } from '../components/Toast';
import { colors, fonts, spacing } from '../constants/theme';

export default function RegScreen({ navigation }) {
  const toast = useToast();
  const [fio, setFio] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const terms = (() => { try { return getTerms(); } catch { return {}; } })();

  const generateUniqueCode = () => {
    let code;
    do { code = 'CLI-' + String(Math.floor(Math.random() * 9000) + 1000); }
    while (getClientByCode(code));
    return code;
  };

  const handleReg = () => {
    if (!fio.trim()) { setError('Введите имя клиента'); return; }
    const code = generateUniqueCode();
    const bd = birthDate.trim().replace(/[^0-9.\-]/g, '');
    try {
      insertClient({ fio: fio.trim(), phone: phone.trim(), code, birth_date: bd });
    } catch (e) {
      setError('Не удалось создать карту. Попробуйте ещё раз.');
      return;
    }
    toast.show(`${terms.client || 'Клиент'} зарегистрирован ✓`);
    navigation.navigate('RegResult', { fio: fio.trim(), code });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <TopBar title={`Новый ${(terms.client || 'клиент').toLowerCase()}`} onBack={() => navigation.navigate('Loyalty')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          <Text style={styles.intro}>
            Заполните данные — система создаст уникальную карту клиента и начнёт автоматически накапливать историю покупок.
          </Text>

          <Text style={styles.label}>Имя и фамилия *</Text>
          <TextInput
            style={styles.input}
            placeholder="Анна Смирнова"
            placeholderTextColor={colors.muted}
            value={fio}
            onChangeText={v => { setFio(v); setError(''); }}
            autoFocus
          />
          <Hint>Обязательное поле. Как обращаться к клиенту.</Hint>

          <Text style={styles.label}>Номер телефона</Text>
          <TextInput
            style={styles.input}
            placeholder="+7 900 000-00-00"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Hint>Необязательно. Может пригодиться для уведомлений или поиска клиента.</Hint>

          {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}

          <Text style={styles.label}>Дата рождения</Text>
          <TextInput
            style={styles.input}
            placeholder="01.01.1990 (необязательно)"
            placeholderTextColor={colors.muted}
            value={birthDate}
            onChangeText={setBirthDate}
            keyboardType="numbers-and-punctuation"
          />
          <Hint>Укажите чтобы поздравлять клиента и делать скидку в день рождения.</Hint>
          <MetalButton title="Создать карту клиента →" variant="action" onPress={handleReg} />
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Loyalty" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 700, width: '100%', alignSelf: 'center' },
  intro: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 20, marginBottom: 16 },
  label: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 },
  input: { padding: 14, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 16, fontFamily: fonts.family, marginBottom: 4 },
  error: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.redLight, marginBottom: 10 },
});
