import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  Pressable, KeyboardAvoidingView, Platform, Alert, BackHandler,
} from 'react-native';
import MetalButton from '../components/MetalButton';
import { setSetting, updateBusinessProfile, getBusinessProfile, BUSINESS_PRESETS, addUser } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

const STEPS = ['Добро пожаловать', 'Тип бизнеса', 'Первый сотрудник', 'Готово!'];

const PRESET_LIST = [
  { key: 'coffee',   icon: '☕', label: 'Кофейня / Кафе',   desc: 'Напитки, еда, модификаторы, лояльность' },
  { key: 'retail',   icon: '🛍', label: 'Магазин / Розница', desc: 'Товары, штрихкоды, складской учёт' },
  { key: 'services', icon: '✂️', label: 'Услуги / Салон',    desc: 'Мастера, записи, абонементы' },
  { key: 'custom',   icon: '⚙️', label: 'Другое',            desc: 'Настрою всё вручную' },
];

export default function OnboardingScreen({ navigation }) {
  const [step, setStep]         = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [preset, setPreset]     = useState(null);
  const [empName, setEmpName]   = useState('');
  const [empPin, setEmpPin]     = useState('');
  const [empPin2, setEmpPin2]   = useState('');
  const [errors, setErrors]     = useState({});

  // Предупреждаем если пользователь уходит с онбординга не завершив
  useEffect(() => {
    if (step === 0) return; // на первом шаге не предупреждаем
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0 && step < 3) {
        setStep(s => s - 1); // просто на предыдущий шаг
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);

  const progress = (step + 1) / STEPS.length;

  const validateStep = () => {
    const errs = {};
    if (step === 0 && !businessName.trim()) errs.businessName = 'Введите название вашего бизнеса';
    if (step === 1 && !preset) errs.preset = 'Выберите тип бизнеса';
    if (step === 2) {
      if (!empName.trim()) errs.empName = 'Введите имя';
      if (empPin.length < 4) errs.empPin = 'PIN — минимум 4 цифры';
      if (empPin !== empPin2) errs.empPin2 = 'PIN-коды не совпадают';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };

  const finish = () => {
    try {
      // Применяем пресет и сохраняем название
      if (preset && preset !== 'custom') {
        const p = BUSINESS_PRESETS[preset];
        if (p) {
          updateBusinessProfile({
            businessName: businessName.trim(),
            modules: p.modules,
            terms: p.terms,
            roles: p.roles || {},
            units: p.units,
          });
        }
      } else {
        updateBusinessProfile({ businessName: businessName.trim() });
      }

      // Создаём первого администратора
      if (empName.trim() && empPin.length >= 4) {
        const existing = addUser(empName.trim(), empPin, 'admin');
        if (!existing.ok && existing.error?.includes('уже используется')) {
          // PIN уже занят — ничего, пользователь войдёт с существующим
        }
      }

      // Помечаем онбординг как завершённый
      setSetting('onboarding_done', '1');

      navigation.replace('Login');
    } catch (e) {
      console.error('[Onboarding]', e);
      navigation.replace('Login');
    }
  };

  const skip = () => {
    setSetting('onboarding_done', '1');
    navigation.replace('Login');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView
        contentContainerStyle={styles.outer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Прогресс */}
        <View style={styles.progressWrap}>
          <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
        </View>

        {/* Шаг / Заголовок */}
        <View style={styles.stepRow}>
          {STEPS.map((s, i) => (
            <View key={i} style={[styles.stepDot, i <= step && styles.stepDotActive]} />
          ))}
        </View>

        {/* ─ Шаг 0: Название ─ */}
        {step === 0 && (
          <View style={styles.content}>
            <Text style={styles.emoji}>👋</Text>
            <Text style={styles.title}>Добро пожаловать в СТРУКТУРУ</Text>
            <Text style={styles.subtitle}>
              Это система учёта для вашего бизнеса. Займёт меньше 2 минут чтобы начать.
            </Text>

            <Text style={styles.label}>Как называется ваш бизнес?</Text>
            <TextInput
              style={[styles.input, errors.businessName && styles.inputError]}
              value={businessName}
              onChangeText={v => { setBusinessName(v); setErrors(e => ({...e, businessName: null})); }}
              placeholder="Кофейня «Берёза», Ателье Мода, ..."
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={next}
            />
            {errors.businessName && <Text style={styles.fieldError}>{errors.businessName}</Text>}
            <Text style={styles.hint}>Это название будет отображаться на главном экране приложения.</Text>
          </View>
        )}

        {/* ─ Шаг 1: Пресет ─ */}
        {step === 1 && (
          <View style={styles.content}>
            <Text style={styles.emoji}>🏢</Text>
            <Text style={styles.title}>Чем занимается ваш бизнес?</Text>
            <Text style={styles.subtitle}>
              Выберите ближайший тип — мы настроим нужные функции. Всё можно изменить потом.
            </Text>
            {errors.preset && <Text style={styles.fieldError}>{errors.preset}</Text>}
            {PRESET_LIST.map(p => (
              <Pressable
                key={p.key}
                style={[styles.presetCard, preset === p.key && styles.presetCardActive]}
                onPress={() => { setPreset(p.key); setErrors(e => ({...e, preset: null})); }}
              >
                <Text style={styles.presetIcon}>{p.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.presetLabel, preset === p.key && styles.presetLabelActive]}>{p.label}</Text>
                  <Text style={styles.presetDesc}>{p.desc}</Text>
                </View>
                <Text style={styles.presetCheck}>{preset === p.key ? '◉' : '○'}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ─ Шаг 2: Первый сотрудник ─ */}
        {step === 2 && (
          <View style={styles.content}>
            <Text style={styles.emoji}>👤</Text>
            <Text style={styles.title}>Создайте аккаунт администратора</Text>
            <Text style={styles.subtitle}>
              Вы будете входить по этому PIN-коду. Администратор имеет полный доступ ко всем функциям.
            </Text>

            <Text style={styles.label}>Ваше имя</Text>
            <TextInput
              style={[styles.input, errors.empName && styles.inputError]}
              value={empName}
              onChangeText={v => { setEmpName(v); setErrors(e => ({...e, empName: null})); }}
              placeholder="Иван Петров"
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="next"
            />
            {errors.empName && <Text style={styles.fieldError}>{errors.empName}</Text>}

            <Text style={styles.label}>PIN-код (4–6 цифр)</Text>
            <TextInput
              style={[styles.input, styles.inputPin, errors.empPin && styles.inputError]}
              value={empPin}
              onChangeText={v => { setEmpPin(v.replace(/\D/g, '')); setErrors(e => ({...e, empPin: null})); }}
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              placeholder="• • • •"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />
            {errors.empPin && <Text style={styles.fieldError}>{errors.empPin}</Text>}

            <Text style={styles.label}>Повторите PIN</Text>
            <TextInput
              style={[styles.input, styles.inputPin, errors.empPin2 && styles.inputError]}
              value={empPin2}
              onChangeText={v => { setEmpPin2(v.replace(/\D/g, '')); setErrors(e => ({...e, empPin2: null})); }}
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              placeholder="• • • •"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              onSubmitEditing={next}
            />
            {errors.empPin2 && <Text style={styles.fieldError}>{errors.empPin2}</Text>}
            <Text style={styles.hint}>Запомните PIN — он нужен для входа каждый раз. Его можно изменить в разделе «Сотрудники».</Text>
          </View>
        )}

        {/* ─ Шаг 3: Готово ─ */}
        {step === 3 && (
          <View style={styles.content}>
            <Text style={[styles.emoji, { fontSize: 64 }]}>🎉</Text>
            <Text style={styles.title}>{businessName || 'Всё готово'}!</Text>
            <Text style={styles.subtitle}>
              Приложение настроено. Войдите по PIN-коду чтобы начать работу.
            </Text>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryRow}>🏢 {businessName}</Text>
              {preset && <Text style={styles.summaryRow}>{PRESET_LIST.find(p=>p.key===preset)?.icon} {PRESET_LIST.find(p=>p.key===preset)?.label}</Text>}
              {empName && <Text style={styles.summaryRow}>👤 {empName} — администратор</Text>}
            </View>

            <Text style={styles.hint}>
              Все настройки можно изменить в любое время через раздел «Настройки». Этот мастер доступен там же если понадобится запустить заново.
            </Text>
          </View>
        )}

        {/* Кнопки навигации */}
        <View style={styles.btnRow}>
          {step > 0 && step < 3 && (
            <MetalButton title="← Назад" variant="back" onPress={() => setStep(s => s - 1)} style={styles.btnBack} />
          )}
          {step < 2 && (
            <MetalButton title="Далее →" variant="success" onPress={next} style={styles.btnNext} />
          )}
          {step === 2 && (
            <MetalButton title="Создать и продолжить →" variant="success" onPress={next} style={styles.btnNext} />
          )}
          {step === 3 && (
            <MetalButton title="Начать работу →" variant="action" onPress={finish} style={styles.btnNext} />
          )}
        </View>

        {step < 3 && (
          <Pressable onPress={skip} hitSlop={12} style={styles.skipBtn}>
            <Text style={styles.skipText}>Пропустить настройку</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: 40,
    maxWidth: 580,
    width: '100%',
    alignSelf: 'center',
  },
  progressWrap: {
    height: 3,
    backgroundColor: 'rgba(74,77,84,0.3)',
    borderRadius: 2,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.greenLight,
    borderRadius: 2,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 36,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(74,77,84,0.4)',
  },
  stepDotActive: {
    backgroundColor: colors.greenLight,
  },
  content: { flex: 1 },
  emoji: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.family,
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: fonts.familyRegular,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  label: {
    fontFamily: fonts.familySemibold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    padding: 16,
    backgroundColor: '#07080a',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.family,
  },
  inputPin: { textAlign: 'center', letterSpacing: 8, fontSize: 20 },
  inputError: { borderColor: colors.redLight },
  fieldError: {
    fontFamily: fonts.familyRegular,
    fontSize: 12,
    color: colors.redLight,
    marginTop: 4,
    marginLeft: 4,
  },
  hint: {
    fontFamily: fonts.familyRegular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 8,
  },
  // Пресеты
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#0b0c0f',
    marginBottom: 10,
  },
  presetCardActive: {
    borderColor: 'rgba(61,158,146,0.6)',
    backgroundColor: 'rgba(61,158,146,0.08)',
  },
  presetIcon: { fontSize: 28 },
  presetLabel: {
    fontFamily: fonts.familySemibold,
    fontSize: 15,
    color: colors.text,
    marginBottom: 2,
  },
  presetLabelActive: { color: colors.greenLight },
  presetDesc: {
    fontFamily: fonts.familyRegular,
    fontSize: 12,
    color: colors.muted,
  },
  presetCheck: {
    fontSize: 18,
    color: colors.muted,
  },
  // Итоги
  summaryCard: {
    padding: 18,
    backgroundColor: 'rgba(61,158,146,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(61,158,146,0.3)',
    gap: 8,
    marginBottom: 16,
  },
  summaryRow: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: colors.text,
  },
  // Кнопки
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  btnBack: { flex: 1 },
  btnNext: { flex: 2 },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  skipText: {
    fontFamily: fonts.familyRegular,
    fontSize: 13,
    color: colors.muted,
    textDecorationLine: 'underline',
  },
});
