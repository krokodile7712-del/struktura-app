import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Alert } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllUsers, addUser, updateUser, toggleUserActive } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

const ROLES = [
  { key: 'barista', label: 'Бариста' },
  { key: 'admin',   label: 'Администратор' },
];

const emptyModal = { id: null, name: '', pin: '', pinConfirm: '', role: 'barista', active: 1 };

export default function EmployeesScreen({ navigation }) {
  const [users, setUsers]     = useState([]);
  const [modal, setModal]     = useState(null);
  const [error, setError]     = useState('');
  const [showPin, setShowPin] = useState(false);

  useEffect(() => { load(); }, []);

  const load = () => {
    try { setUsers(getAllUsers()); } catch (e) { console.error(e); }
  };

  const openAdd = () => {
    setError('');
    setShowPin(false);
    setModal({ ...emptyModal });
  };

  const openEdit = (user) => {
    setError('');
    setShowPin(false);
    setModal({ id: user.id, name: user.name, pin: user.pin, pinConfirm: user.pin, role: user.role, active: user.active ?? 1 });
  };

  const closeModal = () => { setModal(null); setError(''); };

  const save = () => {
    if (!modal) return;
    if (!modal.name.trim()) { setError('Укажите имя сотрудника'); return; }
    if (modal.pin.trim().length < 4) { setError('PIN — минимум 4 цифры'); return; }
    if (modal.pin !== modal.pinConfirm) { setError('PIN-коды не совпадают'); return; }

    try {
      let result;
      if (modal.id) {
        result = updateUser(modal.id, modal.name, modal.pin, modal.role);
      } else {
        result = addUser(modal.name, modal.pin, modal.role);
      }
      if (!result.ok) { setError(result.error); return; }
      load();
      closeModal();
    } catch (e) { setError(e.message || 'Ошибка сохранения'); }
  };

  const toggleActive = () => {
    if (!modal?.id) return;
    try {
      const result = toggleUserActive(modal.id);
      if (!result.ok) { setError(result.error); return; }
      load();
      closeModal();
    } catch (e) { setError(e.message || 'Ошибка'); }
  };

  const active   = users.filter(u => u.active !== 0);
  const inactive = users.filter(u => u.active === 0);

  const renderUser = (user) => {
    const isAdmin = user.role === 'admin';
    const isInactive = user.active === 0;
    return (
      <Pressable key={user.id} style={styles.userRow} onPress={() => openEdit(user)}>
        <View style={styles.userLeft}>
          <Text style={[styles.userName, isInactive && styles.userNameInactive]}>{user.name}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, isAdmin ? styles.badgeAdmin : styles.badgeBarista]}>
              <Text style={[styles.badgeText, isAdmin ? styles.badgeTextAdmin : styles.badgeTextBarista]}>
                {isAdmin ? 'Администратор' : 'Бариста'}
              </Text>
            </View>
            {isInactive && (
              <View style={styles.badgeInactive}>
                <Text style={styles.badgeTextInactive}>Неактивен</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.pinMask}>{'●'.repeat(Math.min(user.pin?.length || 4, 6))}</Text>
        <Text style={styles.editArrow}>›</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Сотрудники" onBack={() => navigation.navigate('Settings')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

        <MetalCard>
          {active.length === 0 && (
            <Text style={styles.empty}>Нет активных сотрудников</Text>
          )}
          {active.map(renderUser)}
          <MetalButton title="+ Добавить сотрудника" variant="default" onPress={openAdd} style={{ marginTop: 12 }} />
        </MetalCard>

        {inactive.length > 0 && (
          <MetalCard style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>Неактивные</Text>
            {inactive.map(renderUser)}
          </MetalCard>
        )}
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeModal} />
          {modal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modal.id ? 'Редактировать сотрудника' : 'Новый сотрудник'}</Text>
                <Pressable onPress={closeModal} hitSlop={12}>
                  <Text style={styles.modalClose}>✕</Text>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Имя</Text>
                <TextInput
                  style={styles.input}
                  value={modal.name}
                  onChangeText={v => { setModal(m => ({ ...m, name: v })); setError(''); }}
                  placeholder="Имя сотрудника"
                  placeholderTextColor={colors.muted}
                  autoFocus
                />

                <Text style={styles.fieldLabel}>Роль</Text>
                <View style={styles.chipsRow}>
                  {ROLES.map(r => (
                    <Pressable
                      key={r.key}
                      style={[styles.chip, modal.role === r.key && styles.chipActive]}
                      onPress={() => setModal(m => ({ ...m, role: r.key }))}
                    >
                      <Text style={[styles.chipText, modal.role === r.key && styles.chipTextActive]}>
                        {r.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.pinLabelRow}>
                  <Text style={styles.fieldLabel}>PIN-код</Text>
                  <Pressable onPress={() => setShowPin(s => !s)} hitSlop={8}>
                    <Text style={styles.showPinBtn}>{showPin ? 'Скрыть' : 'Показать'}</Text>
                  </Pressable>
                </View>
                <TextInput
                  style={styles.input}
                  value={modal.pin}
                  onChangeText={v => { setModal(m => ({ ...m, pin: v })); setError(''); }}
                  secureTextEntry={!showPin}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="4–6 цифр"
                  placeholderTextColor={colors.muted}
                />

                <Text style={styles.fieldLabel}>Повторите PIN</Text>
                <TextInput
                  style={styles.input}
                  value={modal.pinConfirm}
                  onChangeText={v => { setModal(m => ({ ...m, pinConfirm: v })); setError(''); }}
                  secureTextEntry={!showPin}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="Повторите PIN"
                  placeholderTextColor={colors.muted}
                />

                {error !== '' && <Text style={styles.errorText}>{error}</Text>}

                <MetalButton title="Сохранить" variant="success" onPress={save} style={{ marginTop: 8 }} />

                {modal.id && (
                  <MetalButton
                    title={modal.active !== 0 ? '🚫 Деактивировать' : '✓ Активировать'}
                    variant={modal.active !== 0 ? 'danger' : 'default'}
                    onPress={toggleActive}
                    style={{ marginTop: 8 }}
                  />
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  userLeft: { flex: 1 },
  userName: { fontFamily: fonts.family, fontSize: 15, color: colors.text, marginBottom: 4 },
  userNameInactive: { color: colors.muted },
  badgeRow: { flexDirection: 'row', gap: 6 },
  badge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 },
  badgeAdmin:   { backgroundColor: 'rgba(61,95,168,0.2)',  borderWidth: 1, borderColor: 'rgba(61,95,168,0.4)' },
  badgeBarista: { backgroundColor: 'rgba(122,158,82,0.15)', borderWidth: 1, borderColor: 'rgba(122,158,82,0.35)' },
  badgeInactive: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, backgroundColor: 'rgba(74,77,84,0.2)', borderWidth: 1, borderColor: colors.border },
  badgeText: { fontFamily: fonts.familySemibold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  badgeTextAdmin: { color: '#7a9be8' },
  badgeTextBarista: { color: colors.greenLight },
  badgeTextInactive: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  pinMask: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginRight: 8 },
  editArrow: { fontSize: 18, color: colors.muted },
  // Модалка
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '52%', maxWidth: 460, maxHeight: '88%', backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  modalClose: { fontSize: 18, color: colors.muted, padding: 4 },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, marginBottom: 4, fontFamily: fonts.family },
  chipsRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e', alignItems: 'center' },
  chipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.15)' },
  chipText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  chipTextActive: { color: colors.greenLight },
  pinLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 6 },
  showPinBtn: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  errorText: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.redLight, marginBottom: 8, textAlign: 'center' },
});
