import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import TopBar from '../components/TopBar';
import AppNav from '../components/AppNav';
import { insertClient, getClientByCode, getTerms } from '../db/queries';
import { useToast } from '../components/Toast';
import { colors, fonts } from '../constants/theme';

export default function RegScreen({ navigation }) {
  const toast    = useToast();
  const [fio, setFio]           = useState('');
  const [phone, setPhone]       = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError]       = useState('');

  const btnScale = useState(new Animated.Value(1))[0];

  const terms = (() => { try { return getTerms(); } catch { return {}; } })();

  const phoneRef     = useRef(null);
  const birthRef     = useRef(null);

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
    let clientId;
    try {
      clientId = insertClient({ fio: fio.trim(), phone: phone.trim(), code, birth_date: bd });
    } catch (e) {
      setError('Не удалось создать карту. Попробуйте ещё раз.');
      return;
    }
    toast.show(`${terms.client || 'Клиент'} зарегистрирован`);
    navigation.navigate('RegResult', { fio: fio.trim(), code, clientId });
  };

  const animBtn = (toVal) => Animated.spring(btnScale, { toValue: toVal, useNativeDriver: true, tension: 200 }).start();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title={`Новый ${(terms.client || 'клиент').toLowerCase()}`}
        onBack={() => navigation.navigate('Loyalty')}
      />

      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">

        {/* Описание */}
        <Text style={styles.intro}>
          Заполните данные — система создаст уникальную карту и начнёт автоматически накапливать историю покупок.
        </Text>

        {/* Форма */}
        <View style={styles.form}>

          {/* Имя */}
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Имя и фамилия <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              color={colors.text}
              placeholder="Анна Смирнова"
              placeholderTextColor={colors.muted}
              value={fio}
              onChangeText={v => { setFio(v); setError(''); }}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
            <Text style={styles.hint}>Обязательное поле — как обращаться к клиенту</Text>
          </View>

          <View style={styles.divider} />

          {/* Телефон */}
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Телефон</Text>
            <TextInput
              ref={phoneRef}
              style={styles.input}
              color={colors.text}
              placeholder="+7 900 000-00-00"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              returnKeyType="next"
              onSubmitEditing={() => birthRef.current?.focus()}
            />
            <Text style={styles.hint}>Для поиска и уведомлений — необязательно</Text>
          </View>

          <View style={styles.divider} />

          {/* Дата рождения */}
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Дата рождения</Text>
            <TextInput
              ref={birthRef}
              style={styles.input}
              color={colors.text}
              placeholder="01.01.1990"
              placeholderTextColor={colors.muted}
              value={birthDate}
              onChangeText={setBirthDate}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              onSubmitEditing={handleReg}
            />
            <Text style={styles.hint}>Укажите чтобы делать скидку в день рождения</Text>
          </View>

        </View>

        {/* Ошибка */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTxt}>{error}</Text>
          </View>
        ) : null}

        {/* Кнопка */}
        <Animated.View style={{ transform: [{ scale: btnScale }], marginTop: 24 }}>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
            onPressIn={() => animBtn(0.97)}
            onPressOut={() => animBtn(1)}
            onPress={handleReg}
          >
            <Text style={styles.btnTxt}>Создать карту клиента</Text>
            <Text style={styles.btnSub}>Карта будет создана мгновенно</Text>
          </Pressable>
        </Animated.View>

      </ScrollView>

      <AppNav navigation={navigation} activeScreen="Reg" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  inner:     { padding: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' },

  intro:     { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, lineHeight: 22, marginBottom: 24 },

  form:      { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  fieldWrap: { padding: 18 },
  divider:   { height: 1, backgroundColor: colors.border },

  label:     { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },
  required:  { color: colors.orange },
  input:     { padding: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 16, fontFamily: fonts.familyRegular },
  hint:      { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },

  errorBox:  { marginTop: 12, padding: 14, backgroundColor: 'rgba(217,95,95,0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(217,95,95,0.3)' },
  errorTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.red },

  btn:       { backgroundColor: colors.orange, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  btnTxt:    { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: '#fff' },
  btnSub:    { fontFamily: fonts.familyRegular, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
});
