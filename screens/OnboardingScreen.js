import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  Pressable, KeyboardAvoidingView, Platform, Alert,
  BackHandler, Image, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import MetalButton from '../components/MetalButton';
import { setSetting, updateBusinessProfile, getBusinessProfile, BUSINESS_PRESETS, addUser } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

// ─── Константы ───────────────────────────────────────────────────────────────

const STEPS = [
  'Бизнес',
  'Тип',
  'Контакты',
  'Термины',
  'Аккаунт',
  'Готово',
];

const PRESET_LIST = [
  {
    key: 'coffee',
    icon: '☕',
    label: 'Кофейня / Кафе',
    desc: 'Напитки, еда и десерты. Модификаторы (молоко, сироп), варианты размера, учёт смен, программа лояльности. Техкарты считают себестоимость каждой чашки.',
    modules: ['Склад', 'Техкарты', 'Лояльность', 'Смены', 'Зоны/столы'],
  },
  {
    key: 'retail',
    icon: '🛍',
    label: 'Магазин / Розница',
    desc: 'Продажа товаров со складским учётом. Штрихкоды, инвентаризация, закупки. Скидки и карты постоянного покупателя.',
    modules: ['Склад', 'Инвентаризация', 'Скидки', 'Смены'],
  },
  {
    key: 'services',
    icon: '✂️',
    label: 'Услуги / Салон',
    desc: 'Стрижки, маникюр, массаж, консультации. Запись клиентов, история услуг, абонементы. Учёт по мастерам.',
    modules: ['Клиенты', 'Лояльность', 'Журнал работ', 'Смены'],
  },
  {
    key: 'custom',
    icon: '⚙️',
    label: 'Другое',
    desc: 'Любой другой вид бизнеса. Настройте модули, терминологию и параметры вручную. Вы сможете включить нужные разделы в Настройках.',
    modules: ['Всё настраивается вручную'],
  },
];

const TERM_CONFIGS = [
  {
    key: 'order',
    icon: '🛒',
    title: 'Как называть заказ?',
    desc: 'Слово видно при создании нового чека в кассе, в истории продаж и отчётах',
    presets: ['Заказ', 'Запись', 'Чек', 'Счёт', 'Бронь', 'Позиция'],
  },
  {
    key: 'client',
    icon: '👤',
    title: 'Как называть клиента?',
    desc: 'Используется в карточках лояльности, поиске и карточке клиента',
    presets: ['Клиент', 'Гость', 'Покупатель', 'Пациент', 'Участник', 'Студент'],
  },
  {
    key: 'item',
    icon: '📦',
    title: 'Как называть товар / услугу?',
    desc: 'Позиция в меню, на складе и в техкартах',
    presets: ['Товар', 'Услуга', 'Блюдо', 'Позиция', 'Продукт', 'Процедура'],
  },
  {
    key: 'category',
    icon: '🗂',
    title: 'Как называть категорию?',
    desc: 'Группировка товаров/услуг в меню кассы',
    presets: ['Категория', 'Раздел', 'Группа', 'Тип', 'Вид', 'Секция'],
  },
];

const NEXT_STEPS = [
  { icon: '☕', label: 'Добавить первый товар или услугу', screen: 'Settings', sub: 'Настройки → Меню и цены' },
  { icon: '💳', label: 'Настроить способы оплаты', screen: 'Settings', sub: 'Настройки → Оплата и скидки' },
  { icon: '👥', label: 'Добавить сотрудников', screen: 'Employees', sub: 'Имена и PIN-коды' },
  { icon: '🏢', label: 'Внести накладные расходы', screen: 'Overheads', sub: 'Аренда, коммунальные, интернет' },
  { icon: '⭐', label: 'Настроить программу лояльности', screen: 'Loyalty', sub: 'Баллы или скидки для клиентов' },
  { icon: '📦', label: 'Добавить склад и закупки', screen: 'Stock', sub: 'Остатки, пороги, движение' },
];

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function OnboardingScreen({ navigation }) {
  const [step, setStep]               = useState(0);
  // Шаг 1
  const [bizName, setBizName]         = useState('');
  const [city, setCity]               = useState('');
  const [logoUri, setLogoUri]         = useState(null);
  const [logoBase64, setLogoBase64]   = useState('');
  const [logoLoading, setLogoLoading] = useState(false);
  // Шаг 2
  const [preset, setPreset]           = useState(null);
  // Шаг 3
  const [phone, setPhone]             = useState('');
  const [address, setAddress]         = useState('');
  const [hoursFrom, setHoursFrom]     = useState('09:00');
  const [hoursTo, setHoursTo]         = useState('21:00');
  const [inn, setInn]                 = useState('');
  // Шаг 4
  const [terms, setTerms]             = useState({ order: 'Заказ', client: 'Клиент', item: 'Товар', category: 'Категория' });
  // Шаг 5
  const [empName, setEmpName]         = useState('');
  const [empPin, setEmpPin]           = useState('');
  const [empPin2, setEmpPin2]         = useState('');
  // Общее
  const [errors, setErrors]           = useState({});

  // Back handler — возврат на предыдущий шаг
  useEffect(() => {
    if (step === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep(s => Math.max(0, s - 1));
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const progress = (step + 1) / STEPS.length;

  // Валидация
  const validate = () => {
    const errs = {};
    if (step === 0 && !bizName.trim()) errs.bizName = 'Введите название бизнеса';
    if (step === 1 && !preset) errs.preset = 'Выберите тип бизнеса';
    if (step === 4) {
      if (!empName.trim()) errs.empName = 'Введите имя';
      if (empPin.length < 4) errs.empPin = 'PIN — минимум 4 цифры';
      if (empPin !== empPin2) errs.empPin2 = 'PIN-коды не совпадают';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep(s => Math.max(0, s - 1));

  // Выбор лого из галереи
  const pickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Нет доступа', 'Разрешите доступ к галерее в настройках устройства.');
        return;
      }
      setLogoLoading(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setLogoUri(asset.uri);
        setLogoBase64(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLogoLoading(false);
    }
  };

  // Финальное сохранение
  const finish = (navTo = null) => {
    try {
      const p = BUSINESS_PRESETS[preset];
      updateBusinessProfile({
        businessName: bizName.trim(),
        city: city.trim(),
        phone: phone.trim(),
        address: address.trim(),
        workHoursFrom: hoursFrom,
        workHoursTo: hoursTo,
        inn: inn.trim(),
        preset: preset || 'custom',
        logoBase64: logoBase64,
        modules: p?.modules || {},
        terms: {
          order:    terms.order,
          client:   terms.client,
          item:     terms.item,
          category: terms.category,
        },
        roles: p?.roles || {},
        units: p?.units || [],
      });
      if (empName.trim() && empPin.length >= 4) {
        try { addUser(empName.trim(), empPin, 'admin'); } catch (_) {}
      }
      setSetting('onboarding_done', '1');
      if (navTo) {
        navigation.replace('Login');
        setTimeout(() => navigation.navigate(navTo), 300);
      } else {
        navigation.replace('Login');
      }
    } catch (e) {
      console.error('[Onboarding finish]', e);
      navigation.replace('Login');
    }
  };

  const skip = () => {
    setSetting('onboarding_done', '1');
    navigation.replace('Login');
  };

  // ── Рендер шагов ──────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
    >
      {/* Прогресс-бар */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Точки шагов */}
      <View style={styles.dotsRow}>
        {STEPS.map((s, i) => (
          <View key={i} style={[styles.dot, i <= step && styles.dotActive]}>
            {i < step && <Text style={styles.dotCheck}>✓</Text>}
          </View>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── ШАГ 1: Бизнес ── */}
        {step === 0 && (
          <View style={styles.content}>
            <Text style={styles.emoji}>🏢</Text>
            <Text style={styles.title}>Расскажите о вашем бизнесе</Text>
            <Text style={styles.subtitle}>Эта информация появится на главном экране и в отчётах</Text>

            {/* Логотип */}
            <View style={styles.logoSection}>
              <Pressable style={styles.logoPicker} onPress={pickLogo} disabled={logoLoading}>
                {logoLoading ? (
                  <ActivityIndicator color={colors.greenLight} />
                ) : logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.logoPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Text style={styles.logoPlaceholderIcon}>🖼</Text>
                    <Text style={styles.logoPlaceholderText}>Добавить логотип</Text>
                    <Text style={styles.logoPlaceholderSub}>JPEG · PNG · квадратный</Text>
                  </View>
                )}
              </Pressable>
              {logoUri && (
                <Pressable onPress={() => { setLogoUri(null); setLogoBase64(''); }} style={styles.logoRemove}>
                  <Text style={styles.logoRemoveText}>Удалить</Text>
                </Pressable>
              )}
            </View>

            <FieldLabel>Название бизнеса *</FieldLabel>
            <TextInput
              style={[styles.input, errors.bizName && styles.inputError]}
              value={bizName}
              onChangeText={v => { setBizName(v); setErrors(e => ({ ...e, bizName: null })); }}
              placeholder="Кофейня «Берёза», Ателье Мода..."
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="next"
            />
            {errors.bizName && <Text style={styles.fieldErr}>{errors.bizName}</Text>}

            <FieldLabel>Город</FieldLabel>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="Москва, Казань, Сочи..."
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.hint}>Необязательно. Используется в чеках и отчётах.</Text>
          </View>
        )}

        {/* ── ШАГ 2: Тип бизнеса ── */}
        {step === 1 && (
          <View style={styles.content}>
            <Text style={styles.emoji}>🎯</Text>
            <Text style={styles.title}>Чем занимается бизнес?</Text>
            <Text style={styles.subtitle}>Выберите ближайший тип — настроим нужные модули. Всё можно изменить позже.</Text>
            {errors.preset && <Text style={styles.fieldErr}>{errors.preset}</Text>}
            {PRESET_LIST.map(p => (
              <Pressable
                key={p.key}
                style={[styles.presetCard, preset === p.key && styles.presetCardActive]}
                onPress={() => { setPreset(p.key); setErrors(e => ({ ...e, preset: null })); }}
              >
                <View style={styles.presetHeader}>
                  <Text style={styles.presetIcon}>{p.icon}</Text>
                  <Text style={[styles.presetLabel, preset === p.key && styles.presetLabelActive]}>{p.label}</Text>
                  <Text style={styles.presetCheck}>{preset === p.key ? '◉' : '○'}</Text>
                </View>
                <Text style={styles.presetDesc}>{p.desc}</Text>
                <View style={styles.presetTags}>
                  {p.modules.map((m, i) => (
                    <View key={i} style={[styles.presetTag, preset === p.key && styles.presetTagActive]}>
                      <Text style={[styles.presetTagText, preset === p.key && styles.presetTagTextActive]}>{m}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── ШАГ 3: Контакты ── */}
        {step === 2 && (
          <View style={styles.content}>
            <Text style={styles.emoji}>📋</Text>
            <Text style={styles.title}>Контакты и реквизиты</Text>
            <Text style={styles.subtitle}>Появятся в чеках и отчётах. Все поля необязательны.</Text>

            <FieldLabel>Телефон</FieldLabel>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone}
              placeholder="+7 (999) 123-45-67" placeholderTextColor={colors.muted}
              keyboardType="phone-pad" />

            <FieldLabel>Адрес</FieldLabel>
            <TextInput style={styles.input} value={address} onChangeText={setAddress}
              placeholder="ул. Ленина, 1, Москва" placeholderTextColor={colors.muted} />

            <FieldLabel>Рабочие часы</FieldLabel>
            <View style={styles.hoursRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={hoursFrom} onChangeText={setHoursFrom}
                placeholder="09:00" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
              <Text style={styles.hoursDash}>—</Text>
              <TextInput style={[styles.input, { flex: 1 }]} value={hoursTo} onChangeText={setHoursTo}
                placeholder="21:00" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
            </View>
            <Text style={styles.hint}>Используется для расчёта накладных расходов на час работы.</Text>

            <FieldLabel>ИНН / название ИП или ООО</FieldLabel>
            <TextInput style={styles.input} value={inn} onChangeText={setInn}
              placeholder="ИП Иванов Иван Иванович" placeholderTextColor={colors.muted} />
            <Text style={styles.hint}>Необязательно. Для отображения в чеках.</Text>
          </View>
        )}

        {/* ── ШАГ 4: Терминология ── */}
        {step === 3 && (
          <View style={styles.content}>
            <Text style={styles.emoji}>💬</Text>
            <Text style={styles.title}>Как вы говорите?</Text>
            <Text style={styles.subtitle}>Настройте язык интерфейса под ваш бизнес. Кнопки, заголовки и отчёты будут использовать ваши слова.</Text>

            {TERM_CONFIGS.map(tc => (
              <View key={tc.key} style={styles.termBlock}>
                <View style={styles.termHeader}>
                  <Text style={styles.termIcon}>{tc.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.termTitle}>{tc.title}</Text>
                    <Text style={styles.termDesc}>{tc.desc}</Text>
                  </View>
                </View>
                <View style={styles.termPresets}>
                  {tc.presets.map(p => (
                    <Pressable
                      key={p}
                      style={[styles.termChip, terms[tc.key] === p && styles.termChipActive]}
                      onPress={() => setTerms(t => ({ ...t, [tc.key]: p }))}
                    >
                      <Text style={[styles.termChipText, terms[tc.key] === p && styles.termChipTextActive]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={[styles.input, styles.termInput]}
                  value={terms[tc.key]}
                  onChangeText={v => setTerms(t => ({ ...t, [tc.key]: v }))}
                  placeholder="Или введите своё слово..."
                  placeholderTextColor={colors.muted}
                />
              </View>
            ))}
          </View>
        )}

        {/* ── ШАГ 5: Аккаунт администратора ── */}
        {step === 4 && (
          <View style={styles.content}>
            <Text style={styles.emoji}>👤</Text>
            <Text style={styles.title}>Аккаунт администратора</Text>
            <Text style={styles.subtitle}>Вы будете входить по PIN-коду. Администратор имеет полный доступ к настройкам, отчётам и сотрудникам.</Text>

            <FieldLabel>Ваше имя *</FieldLabel>
            <TextInput
              style={[styles.input, errors.empName && styles.inputError]}
              value={empName}
              onChangeText={v => { setEmpName(v); setErrors(e => ({ ...e, empName: null })); }}
              placeholder="Иван Петров"
              placeholderTextColor={colors.muted}
              autoFocus
            />
            {errors.empName && <Text style={styles.fieldErr}>{errors.empName}</Text>}

            <FieldLabel>PIN-код (4–6 цифр) *</FieldLabel>
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

            <FieldLabel>Повторите PIN *</FieldLabel>
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
            <Text style={styles.hint}>Запомните PIN. Его можно изменить позже в разделе «Сотрудники».</Text>
          </View>
        )}

        {/* ── ШАГ 6: Готово ── */}
        {step === 5 && (
          <View style={styles.content}>
            <View style={styles.doneHeader}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.doneLogo} resizeMode="contain" />
              ) : (
                <View style={styles.doneLogoPlaceholder}>
                  <Text style={{ fontSize: 36 }}>{PRESET_LIST.find(p => p.key === preset)?.icon || '🏢'}</Text>
                </View>
              )}
              <Text style={styles.doneTitle}>{bizName || 'Всё готово'}!</Text>
              {city ? <Text style={styles.doneCity}>{city}</Text> : null}
            </View>

            <View style={styles.doneSummary}>
              <SummaryRow icon="🎯" label="Тип" value={PRESET_LIST.find(p => p.key === preset)?.label || 'Настраиваемый'} />
              {phone ? <SummaryRow icon="📞" label="Телефон" value={phone} /> : null}
              {address ? <SummaryRow icon="📍" label="Адрес" value={address} /> : null}
              <SummaryRow icon="⏰" label="Часы" value={`${hoursFrom} — ${hoursTo}`} />
              {empName ? <SummaryRow icon="👤" label="Администратор" value={empName} /> : null}
              <SummaryRow icon="💬" label="Термины" value={`${terms.order} · ${terms.client} · ${terms.item}`} />
            </View>

            <Text style={styles.nextStepsTitle}>Что сделать дальше:</Text>
            {NEXT_STEPS.map((ns, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.nextStepRow, pressed && { opacity: 0.7 }]}
                onPress={() => finish(ns.screen)}
              >
                <Text style={styles.nextStepIcon}>{ns.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nextStepLabel}>{ns.label}</Text>
                  <Text style={styles.nextStepSub}>{ns.sub}</Text>
                </View>
                <Text style={styles.nextStepArrow}>›</Text>
              </Pressable>
            ))}

            <MetalButton
              title="Начать работу →"
              variant="action"
              onPress={() => finish()}
              style={{ marginTop: 16 }}
            />
          </View>
        )}

        {/* ── Навигация ── */}
        {step < 5 && (
          <View style={styles.navRow}>
            {step > 0 && (
              <Pressable style={styles.backBtn} onPress={back}>
                <Text style={styles.backBtnText}>← Назад</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.nextBtn, step === 0 && { flex: 1 }]}
              onPress={step === 4 ? next : next}
            >
              <Text style={styles.nextBtnText}>
                {step === 4 ? 'Создать аккаунт →' : 'Далее →'}
              </Text>
            </Pressable>
          </View>
        )}

        {step < 5 && (
          <Pressable onPress={skip} style={styles.skipBtn}>
            <Text style={styles.skipText}>Пропустить настройку</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Вспомогательные компоненты ─────────────────────────────────────────────

function FieldLabel({ children }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function SummaryRow({ icon, label, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryIcon}>{icon}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  progressTrack: { height: 3, backgroundColor: 'rgba(74,77,84,0.3)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.greenLight, borderRadius: 2 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  dot: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(74,77,84,0.3)', alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: colors.greenLight },
  dotCheck: { fontSize: 10, color: '#fff', fontWeight: '800' },

  scroll: { padding: spacing.lg, paddingBottom: 40, maxWidth: 600, width: '100%', alignSelf: 'center' },
  content: { gap: 0 },

  emoji: { fontSize: 42, textAlign: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 8, lineHeight: 30 },
  subtitle: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21, marginBottom: 24 },

  // Лого
  logoSection: { alignItems: 'center', marginBottom: 20 },
  logoPicker: {
    width: 120, height: 120, borderRadius: 20, borderWidth: 1.5,
    borderColor: 'rgba(61,158,146,0.4)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(61,158,146,0.05)',
  },
  logoPreview: { width: 120, height: 120, borderRadius: 20 },
  logoPlaceholder: { alignItems: 'center', gap: 6 },
  logoPlaceholderIcon: { fontSize: 28 },
  logoPlaceholderText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  logoPlaceholderSub: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted },
  logoRemove: { marginTop: 8 },
  logoRemoveText: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.redLight },

  // Поля
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 16, marginBottom: 6 },
  input: { padding: 14, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, fontFamily: fonts.family, marginBottom: 4 },
  inputError: { borderColor: colors.redLight },
  fieldErr: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.redLight, marginBottom: 4 },
  hint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 4 },
  pinInput: { textAlign: 'center', letterSpacing: 8, fontSize: 20 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hoursDash: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },

  // Пресеты типа бизнеса
  presetCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0f', padding: 16, marginBottom: 10, gap: 8 },
  presetCardActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.06)' },
  presetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  presetIcon: { fontSize: 26 },
  presetLabel: { flex: 1, fontFamily: fonts.family, fontSize: 16, fontWeight: '700', color: colors.text },
  presetLabelActive: { color: colors.greenLight },
  presetCheck: { fontSize: 18, color: colors.muted },
  presetDesc: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 19 },
  presetTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetTag: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#07080a' },
  presetTagActive: { borderColor: 'rgba(61,158,146,0.4)', backgroundColor: 'rgba(61,158,146,0.08)' },
  presetTagText: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  presetTagTextActive: { color: colors.greenLight },

  // Терминология
  termBlock: { marginBottom: 20, padding: 16, backgroundColor: '#0b0c0f', borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  termHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  termIcon: { fontSize: 22, marginTop: 2 },
  termTitle: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, marginBottom: 3 },
  termDesc: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 17 },
  termPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  termChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#07080a' },
  termChipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.1)' },
  termChipText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  termChipTextActive: { color: colors.greenLight },
  termInput: { marginTop: 4, marginBottom: 0, fontSize: 14 },

  // Финальный экран
  doneHeader: { alignItems: 'center', marginBottom: 20 },
  doneLogo: { width: 100, height: 100, borderRadius: 20, marginBottom: 14 },
  doneLogoPlaceholder: { width: 100, height: 100, borderRadius: 20, backgroundColor: '#0e0f11', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  doneTitle: { fontFamily: fonts.family, fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center' },
  doneCity: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 4 },
  doneSummary: { padding: 16, backgroundColor: '#0b0c0f', borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20, gap: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  summaryLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, width: 100 },
  summaryValue: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text, flex: 1 },

  // Следующие шаги
  nextStepsTitle: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 },
  nextStepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: '#0b0c0f', borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  nextStepIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  nextStepLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 2 },
  nextStepSub: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted },
  nextStepArrow: { fontFamily: fonts.family, fontSize: 20, color: colors.greenLight },

  // Навигация
  navRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  backBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  backBtnText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  nextBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center' },
  nextBtnText: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },
  skipBtn: { alignItems: 'center', paddingVertical: 16, marginTop: 6 },
  skipText: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textDecorationLine: 'underline' },
});
