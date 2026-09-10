import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  Pressable, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { updateBusinessProfile, setSetting, addUser, getUserByPin } from '../db/queries';
import { getHomeRoute, setSession, setPermissions } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

// ─── Минимальная регистрация бизнеса ───────────────────────────────────────
//
// Раньше здесь был визард на 7 шагов (бизнес → тип → контакты → термины →
// модули → аккаунт → готово) — вся настройка требовалась ДО первого входа
// в приложение. Теперь обязательны только два поля ниже; тип бизнеса,
// термины, модули, контакты и всё остальное можно настроить в любой момент
// позже — они доступны в Настройках и через чек-лист «Что дальше» на Обзоре
// (components/NextStepsCard.js), который появляется сразу после входа.
//
// По умолчанию при пустом modules ({}) видны ВСЕ разделы приложения —
// это осознанный выбор: лучше показать лишнее и дать выключить в Настройках,
// чем спрятать что-то нужное до того, как человек вообще понял, что оно есть.

export default function OnboardingScreen({ navigation }) {
  const [bizName, setBizName] = useState('');
  const [empName, setEmpName] = useState('');
  const [empPin, setEmpPin]   = useState('');
  const [empPin2, setEmpPin2] = useState('');
  const [errors, setErrors]   = useState({});

  const validate = () => {
    const errs = {};
    if (!bizName.trim()) errs.bizName = 'Введите название бизнеса';
    if (!empName.trim()) errs.empName = 'Введите ваше имя';
    if (empPin.length < 4) errs.empPin = 'PIN — минимум 4 цифры';
    if (empPin !== empPin2) errs.empPin2 = 'PIN-коды не совпадают';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const start = () => {
    if (!validate()) return;
    try {
      // Всё, кроме названия, оставляем пустым/по умолчанию — тип бизнеса,
      // термины, модули, контакты донастраиваются позже в Настройках
      updateBusinessProfile({ businessName: bizName.trim() });

      const res = addUser(empName.trim(), empPin, 'admin');
      if (!res?.ok) {
        Alert.alert('Не удалось создать администратора', res?.error || 'Попробуйте другой PIN');
        return;
      }
      const sessionUser = getUserByPin(empPin);
      setSetting('onboarding_done', '1');

      if (sessionUser) {
        setSession(sessionUser);
        setPermissions(null); // admin — без ограничений
        navigation.reset({ index: 0, routes: [{ name: getHomeRoute() }] });
      } else {
        navigation.replace('Login');
      }
    } catch (e) {
      console.error('[Onboarding start]', e);
      Alert.alert('Ошибка', 'Не удалось сохранить — попробуйте ещё раз');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.emoji}>🏢</Text>
        <Text style={styles.title}>Добро пожаловать в Структуру</Text>
        <Text style={styles.subtitle}>Два поля — и вы внутри. Тип бизнеса, термины, контакты и всё остальное можно настроить позже, когда будет удобно.</Text>

        <Text style={styles.fieldLabel}>Название бизнеса *</Text>
        <TextInput
          style={[styles.input, errors.bizName && styles.inputError]}
          value={bizName}
          onChangeText={v => { setBizName(v); setErrors(e => ({ ...e, bizName: null })); }}
          placeholder="Название вашего бизнеса..."
          placeholderTextColor={colors.muted}
          autoFocus
          returnKeyType="next"
        />
        {errors.bizName && <Text style={styles.fieldErr}>{errors.bizName}</Text>}

        <Text style={styles.fieldLabel}>Ваше имя *</Text>
        <TextInput
          style={[styles.input, errors.empName && styles.inputError]}
          value={empName}
          onChangeText={v => { setEmpName(v); setErrors(e => ({ ...e, empName: null })); }}
          placeholder="Иван Петров"
          placeholderTextColor={colors.muted}
        />
        {errors.empName && <Text style={styles.fieldErr}>{errors.empName}</Text>}

        <Text style={styles.fieldLabel}>PIN-код (4–6 цифр) *</Text>
        <TextInput
          style={[styles.input, styles.pinInput, errors.empPin && styles.inputError]}
          value={empPin}
          onChangeText={v => { setEmpPin(v.replace(/\D/g, '')); setErrors(e => ({ ...e, empPin: null })); }}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          placeholder="• • • •"
          placeholderTextColor={colors.muted}
        />
        {errors.empPin && <Text style={styles.fieldErr}>{errors.empPin}</Text>}

        <Text style={styles.fieldLabel}>Повторите PIN *</Text>
        <TextInput
          style={[styles.input, styles.pinInput, errors.empPin2 && styles.inputError]}
          value={empPin2}
          onChangeText={v => { setEmpPin2(v.replace(/\D/g, '')); setErrors(e => ({ ...e, empPin2: null })); }}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          placeholder="• • • •"
          placeholderTextColor={colors.muted}
        />
        {errors.empPin2 && <Text style={styles.fieldErr}>{errors.empPin2}</Text>}
        <Text style={styles.hint}>Запомните PIN — по нему будете входить каждый раз. Изменить можно позже в разделе «Сотрудники».</Text>

        <Pressable style={styles.nextBtn} onPress={start}>
          <Text style={styles.nextBtnText}>Начать работу →</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 40, maxWidth: 600, width: '100%', alignSelf: 'center' },
  emoji: { fontSize: 42, textAlign: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 8, lineHeight: 30 },
  subtitle: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 16, marginBottom: 6 },
  input: { padding: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, fontFamily: fonts.family, marginBottom: 4 },
  inputError: { borderColor: colors.redLight },
  fieldErr: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.redLight, marginBottom: 4 },
  hint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 4 },
  pinInput: { textAlign: 'center', letterSpacing: 8, fontSize: 20 },
  nextBtn: { marginTop: 28, paddingVertical: 16, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  nextBtnText: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },
});
