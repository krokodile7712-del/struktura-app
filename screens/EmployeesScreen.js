import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Alert, Animated } from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllUsers, addUser, updateUser, toggleUserActive, getRoleNames, deleteUser } from '../db/queries';
import { useToast } from '../components/Toast';
import { getHomeRoute } from '../db/session';
import { colors, fonts } from '../constants/theme';

const SALARY_TYPES = [
  { key: 'shift',       label: 'За смену',      hint: 'Фиксированная сумма за каждую смену' },
  { key: 'hourly',      label: '₽ / час',        hint: 'Ставка × количество часов в смене' },
  { key: 'revenue_pct', label: '% выручки',      hint: 'Процент от всей выручки за смену' },
  { key: 'monthly',     label: 'Оклад',          hint: 'Месячный оклад ÷ 22 дня = смена' },
  { key: 'profit_pct',  label: '% прибыли',      hint: 'Процент от чистой прибыли за смену' },
];

const empty = { id: null, name: '', pin: '', pinConfirm: '', role: 'barista', active: 1, salary_type: 'shift', salary_amount: '' };

export default function EmployeesScreen({ navigation }) {
  const [users, setUsers]         = useState([]);
  const [roleNames, setRoleNames] = useState({ barista: 'Сотрудник', admin: 'Администратор' });
  const [selected, setSelected]   = useState(null); // редактируемый юзер
  const [draft, setDraft]         = useState(empty);
  const [showPin, setShowPin]     = useState(false);
  const [error, setError]         = useState('');
  const [isNew, setIsNew]         = useState(false);
  const toast = useToast();

  const cardAnim  = useState(new Animated.Value(0))[0];
  const cardSlide = useState(new Animated.Value(20))[0];

  useEffect(() => { load(); }, []);

  const load = () => {
    try { setUsers(getAllUsers()); setRoleNames(getRoleNames()); } catch(e) { console.error(e); }
  };

  const selectUser = (u) => {
    setSelected(u);
    setDraft({ ...empty, ...u, pin: '', pinConfirm: '' });
    setError('');
    setIsNew(false);
    cardAnim.setValue(0); cardSlide.setValue(20);
    Animated.parallel([
      Animated.timing(cardAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(cardSlide, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  };

  const openNew = () => {
    setSelected({ id: null });
    setDraft(empty);
    setError('');
    setIsNew(true);
    cardAnim.setValue(0); cardSlide.setValue(20);
    Animated.parallel([
      Animated.timing(cardAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(cardSlide, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  };

  const handleSave = () => {
    setError('');
    if (!draft.name.trim()) { setError('Введите имя сотрудника'); return; }
    if (isNew && draft.pin.length < 4) { setError('PIN — минимум 4 цифры'); return; }
    if (isNew && draft.pin !== draft.pinConfirm) { setError('PIN-коды не совпадают'); return; }
    if (draft.pin && draft.pin.length > 0 && draft.pin.length < 4) { setError('PIN — минимум 4 цифры'); return; }
    if (draft.pin && draft.pin !== draft.pinConfirm) { setError('PIN-коды не совпадают'); return; }
    try {
      const data = {
        name: draft.name.trim(),
        role: draft.role,
        salary_type: draft.salary_type,
        salary_amount: parseFloat(draft.salary_amount) || 0,
        active: draft.active,
      };
      if (isNew) {
        addUser(draft.name.trim(), draft.pin, draft.role, data.salary_type, data.salary_amount);
        toast.show('Сотрудник добавлен');
      } else {
        updateUser(selected.id, { ...data, ...(draft.pin ? { pin: draft.pin } : {}) });
        toast.show('Сохранено');
      }
      load();
      setSelected(null);
    } catch(e) { setError(e.message || 'Ошибка сохранения'); }
  };

  const handleDelete = (u) => {
    Alert.alert(
      'Удалить сотрудника?',
      `${u.name} будет удалён навсегда. Это действие нельзя отменить.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            try {
              deleteUser(u.id);
              load();
              setSelected(null);
              toast.show('Сотрудник удалён');
            } catch(e) { Alert.alert('Ошибка', e.message); }
          }
        }
      ]
    );
  };

  const handleToggle = (u) => {
    Alert.alert(
      u.active ? 'Деактивировать?' : 'Активировать?',
      u.active ? `${u.name} не сможет войти в систему` : `${u.name} снова сможет входить`,
      [
        { text: 'Отмена' },
        { text: 'Да', onPress: () => { toggleUserActive(u.id); load(); if (selected?.id === u.id) setSelected(null); } }
      ]
    );
  };

  return (
    <View style={styles.root}>
      <TopBar
        title="Сотрудники"
        onBack={() => navigation.navigate(getHomeRoute())}
        rightElement={
          <Pressable style={styles.addBtn} onPress={openNew}>
            <Text style={styles.addBtnTxt}>+ Добавить</Text>
          </Pressable>
        }
      />

      <View style={styles.layout}>
        {/* Список */}
        <View style={styles.left}>
          <Text style={styles.listHint}>Нажмите на сотрудника чтобы редактировать</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {users.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTxt}>Нет сотрудников</Text>
                <Text style={styles.emptyHint}>Нажмите "+ Добавить" чтобы создать первого</Text>
              </View>
            ) : (
              <View style={styles.listCard}>
                {users.map((u, idx) => {
                  const isActive = selected?.id === u.id;
                  return (
                    <Pressable
                      key={u.id}
                      style={({ pressed }) => [
                        styles.userRow,
                        idx < users.length - 1 && styles.userRowDiv,
                        isActive && styles.userRowActive,
                        !u.active && { opacity: 0.45 },
                        pressed && { backgroundColor: 'rgba(245,240,232,0.03)' },
                      ]}
                      onPress={() => selectUser(u)}
                    >
                      {isActive && <View style={styles.activeBar} />}
                      <View style={styles.userAvatar}>
                        <Text style={styles.userAvatarTxt}>{(u.name || '?').charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.userName, isActive && { color: colors.orange }]}>{u.name}</Text>
                        <Text style={styles.userRole}>{u.role === 'admin' ? roleNames.admin : roleNames.barista}</Text>
                      </View>
                      {!u.active && <Text style={styles.inactiveBadge}>Неактивен</Text>}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>

        {/* Правая панель — редактирование */}
        <View style={styles.right}>
          {selected ? (
            <Animated.View style={[{ flex: 1 }, { opacity: cardAnim, transform: [{ translateY: cardSlide }] }]}>
              <ScrollView contentContainerStyle={styles.editContent}>
                <Text style={styles.editTitle}>{isNew ? 'Новый сотрудник' : draft.name}</Text>
                {!isNew && (
                  <Text style={styles.editHint}>
                    Оставьте поля PIN пустыми если не хотите менять пароль
                  </Text>
                )}

                {/* Имя */}
                <Text style={styles.fieldLabel}>Имя <Text style={{ color: colors.orange }}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  color={colors.text}
                  value={draft.name}
                  onChangeText={v => setDraft(d => ({ ...d, name: v }))}
                  placeholder="Иван Петров"
                  placeholderTextColor={colors.muted}
                  autoFocus={isNew}
                />

                {/* Роль */}
                <Text style={styles.fieldLabel}>Роль</Text>
                <View style={styles.chips}>
                  {['barista', 'admin'].map(role => (
                    <Pressable
                      key={role}
                      style={[styles.chip, draft.role === role && styles.chipActive]}
                      onPress={() => setDraft(d => ({ ...d, role }))}
                    >
                      <Text style={[styles.chipTxt, draft.role === role && styles.chipTxtActive]}>
                        {role === 'admin' ? roleNames.admin : roleNames.barista}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.roleHint}>
                  {draft.role === 'admin'
                    ? 'Администратор видит все разделы, отчёты и настройки'
                    : 'Сотрудник работает только с кассой и лояльностью'}
                </Text>

                {/* PIN */}
                <Text style={styles.fieldLabel}>{isNew ? 'PIN-код *' : 'Новый PIN (необязательно)'}</Text>
                <View style={styles.pinRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, textAlign: 'center', letterSpacing: 6, fontSize: 20 }]}
                    color={colors.text}
                    value={draft.pin}
                    onChangeText={v => setDraft(d => ({ ...d, pin: v.replace(/\D/g,'') }))}
                    keyboardType="number-pad"
                    maxLength={6}
                    secureTextEntry={!showPin}
                    placeholder="• • • •"
                    placeholderTextColor={colors.muted}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, textAlign: 'center', letterSpacing: 6, fontSize: 20 }]}
                    color={colors.text}
                    value={draft.pinConfirm}
                    onChangeText={v => setDraft(d => ({ ...d, pinConfirm: v.replace(/\D/g,'') }))}
                    keyboardType="number-pad"
                    maxLength={6}
                    secureTextEntry={!showPin}
                    placeholder="Повтор"
                    placeholderTextColor={colors.muted}
                  />
                  <Pressable style={styles.showPinBtn} onPress={() => setShowPin(v => !v)}>
                    <Text style={styles.showPinTxt}>{showPin ? 'Скрыть' : 'Показать'}</Text>
                  </Pressable>
                </View>
                <Text style={styles.pinHint}>PIN используется для входа в приложение. Минимум 4 цифры.</Text>

                {/* Зарплата */}
                <Text style={styles.fieldLabel}>Тип зарплаты</Text>
                <View style={styles.chips}>
                  {SALARY_TYPES.map(st => (
                    <Pressable
                      key={st.key}
                      style={[styles.chip, draft.salary_type === st.key && styles.chipActive]}
                      onPress={() => setDraft(d => ({ ...d, salary_type: st.key }))}
                    >
                      <Text style={[styles.chipTxt, draft.salary_type === st.key && styles.chipTxtActive]}>{st.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.roleHint}>
                  {SALARY_TYPES.find(s => s.key === draft.salary_type)?.hint}
                </Text>

                <Text style={styles.fieldLabel}>Размер</Text>
                <TextInput
                  style={styles.input}
                  color={colors.text}
                  value={draft.salary_amount}
                  onChangeText={v => setDraft(d => ({ ...d, salary_amount: v }))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                />

                {error ? <Text style={styles.errorTxt}>{error}</Text> : null}

                {/* Кнопки */}
                <View style={styles.btnRow}>
                  {!isNew && (
                    <>
                    <Pressable
                      style={[styles.toggleBtn, { borderColor: selected?.active ? 'rgba(217,95,95,0.4)' : 'rgba(123,175,142,0.4)' }]}
                      onPress={() => handleToggle(selected)}
                    >
                      <Text style={[styles.toggleTxt, { color: selected?.active ? colors.red : colors.green }]}>
                        {selected?.active ? 'Деактивировать' : 'Активировать'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.toggleBtn, { borderColor: 'rgba(217,95,95,0.5)', backgroundColor: 'rgba(217,95,95,0.07)' }]}
                      onPress={() => handleDelete(selected)}
                    >
                      <Text style={[styles.toggleTxt, { color: colors.red }]}>Удалить</Text>
                    </Pressable>
                    </>
                  )}
                  <Pressable style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveTxt}>{isNew ? 'Создать' : 'Сохранить'}</Text>
                  </Pressable>
                </View>

              </ScrollView>
            </Animated.View>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
              <Text style={{ fontSize: 40 }}>👥</Text>
              <Text style={{ fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, marginTop: 12 }}>
                Выберите сотрудника
              </Text>
            </View>
          )}
        </View>
      </View>

      <BottomBar navigation={navigation} activeTab="Kassa" />
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.bg },
  layout:     { flex: 1, flexDirection: 'row' },

  left:       { width: 280, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  listHint:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, padding: 12, paddingBottom: 6 },
  listCard:   { margin: 8, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  userRow:    { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, position: 'relative' },
  userRowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  userRowActive: { backgroundColor: 'rgba(240,160,80,0.06)' },
  activeBar:  { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  userAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  userAvatarTxt: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  userName:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  userRole:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  inactiveBadge: { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.red, backgroundColor: 'rgba(217,95,95,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  emptyWrap:  { padding: 32, alignItems: 'center' },
  emptyTxt:   { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  emptyHint:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 6, textAlign: 'center', opacity: 0.7 },

  right:      { flex: 1, backgroundColor: colors.bg },
  editContent:{ padding: 24, paddingBottom: 40 },
  editTitle:  { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 4 },
  editHint:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 16, lineHeight: 18 },

  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 18 },
  input:      { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 15 },
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  chipTxt:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  chipTxtActive: { color: colors.orange },
  roleHint:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },
  pinHint:    { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 17 },
  pinRow:     { flexDirection: 'row', gap: 8, alignItems: 'center' },
  showPinBtn: { paddingVertical: 10, paddingHorizontal: 12 },
  showPinTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },

  errorTxt:   { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.red, marginTop: 12 },
  btnRow:     { flexDirection: 'row', gap: 10, marginTop: 24 },
  toggleBtn:  { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', backgroundColor: colors.surface },
  toggleTxt:  { fontFamily: fonts.familySemibold, fontSize: 14 },
  saveBtn:    { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  saveTxt:    { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#fff' },

  addBtn:     { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(240,160,80,0.15)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)' },
  addBtnTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orange },
});
