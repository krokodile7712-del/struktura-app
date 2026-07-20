import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import {
  getLocations, addLocation, updateLocation, deleteLocation, initDefaultLocation,
} from '../db/queries';
import { useToast } from '../components/Toast';
import { getCurrentLocationId, setCurrentLocationId } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

export default function LocationsScreen({ navigation }) {
  const [locations, setLocations]   = useState([]);
  const [modal, setModal]           = useState(null); // null | { id?, name, description }
  const toast = useToast();
  const [currentLocId, setCurrentLocId] = useState(getCurrentLocationId());

  useEffect(() => { load(); }, []);

  const load = () => {
    try {
      let locs = getLocations();
      if (locs.length === 0) {
        initDefaultLocation();
        locs = getLocations();
      }
      setLocations(locs);
    } catch (e) { console.error(e); }
  };

  const openAdd = () => setModal({ name: '', description: '' });
  const openEdit = (loc) => setModal({ id: loc.id, name: loc.name, description: loc.description || '' });
  const closeModal = () => setModal(null);

  const save = () => {
    if (!modal || !modal.name.trim()) return;
    try {
      if (modal.id) {
        updateLocation(modal.id, modal.name.trim(), modal.description.trim());
      } else {
        addLocation(modal.name.trim(), modal.description.trim());
      }
      toast.show(modal.id ? 'Локация обновлена ✓' : 'Локация добавлена ✓');
      load();
    } catch (e) { console.error(e); }
    closeModal();
  };

  const remove = () => {
    if (!modal?.id) return;
    try {
      // Нельзя удалить последнюю локацию
      if (locations.length <= 1) return;
      deleteLocation(modal.id);
      // Если удалили текущую — сбрасываем на первую доступную
      if (currentLocId === modal.id) {
        const remaining = getLocations().filter(l => l.id !== modal.id);
        const next = remaining[0]?.id || null;
        setCurrentLocationId(next);
        setCurrentLocId(next);
      }
      toast.show(modal.id ? 'Локация обновлена ✓' : 'Локация добавлена ✓');
      load();
    } catch (e) { console.error(e); }
    closeModal();
  };

  const selectLocation = (id) => {
    setCurrentLocationId(id);
    setCurrentLocId(id);
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Локации" onBack={() => navigation.navigate('Admin')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <MetalCard>
          <Text style={styles.hint}>
            Если у вас несколько мест хранения — например основной склад и барная стойка — добавьте их здесь. Выбранная точка хранения используется в кассе при списании ингредиентов и в разделе Склад при просмотре остатков.
          </Text>

          {locations.map(loc => {
            const isActive = currentLocId === loc.id;
            return (
              <Pressable key={loc.id} style={styles.row} onPress={() => selectLocation(loc.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.locName, isActive && styles.locNameActive]}>
                    {isActive ? '📍 ' : ''}{loc.name}
                  </Text>
                  {!!loc.description && (
                    <Text style={styles.locDesc}>{loc.description}</Text>
                  )}
                </View>
                <Pressable onPress={() => openEdit(loc)} hitSlop={10} style={styles.editBtn}>
                  <Text style={styles.editBtnText}>✎</Text>
                </Pressable>
              </Pressable>
            );
          })}

          <MetalButton
            title="+ Добавить локацию"
            variant="default"
            onPress={openAdd}
            style={{ marginTop: 12 }}
          />
        </MetalCard>

        <MetalCard style={{ marginTop: 12 }}>
          <Text style={styles.hint}>
            💡 Совет: выбирайте нужную точку в начале смены — иконка 📍 рядом с названием покажет что выбрано. При перезапуске приложения выбор сбрасывается.
          </Text>
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeModal} />
          {modal && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modal.id ? 'Редактировать локацию' : 'Новая локация'}</Text>
                <Pressable onPress={closeModal} hitSlop={12}>
                  <Text style={styles.modalClose}>✕</Text>
                </Pressable>
              </View>

              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput
                style={styles.input}
                value={modal.name}
                onChangeText={v => setModal(m => ({ ...m, name: v }))}
                placeholder="напр. Основной склад, Бар"
                placeholderTextColor={colors.muted}
                autoFocus
              />

              <Text style={styles.fieldLabel}>Описание (необязательно)</Text>
              <TextInput
                style={styles.input}
                value={modal.description}
                onChangeText={v => setModal(m => ({ ...m, description: v }))}
                placeholder="Дополнительная информация"
                placeholderTextColor={colors.muted}
              />

              <MetalButton
                title="Сохранить"
                variant="success"
                onPress={save}
                style={{ marginTop: 10 }}
              />

              {modal.id && locations.length > 1 && (
                <MetalButton
                  title="Удалить локацию"
                  variant="danger"
                  onPress={remove}
                  style={{ marginTop: 8 }}
                />
              )}
              {modal.id && locations.length <= 1 && (
                <Text style={styles.hint}>Нельзя удалить единственную локацию.</Text>
              )}
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
  hint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  locName: { fontFamily: fonts.family, fontSize: 15, color: colors.text },
  locNameActive: { color: colors.greenLight, fontFamily: fonts.familySemibold },
  locDesc: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  editBtn: { padding: 8 },
  editBtnText: { fontSize: 16, color: colors.muted },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalInner: { width: '55%', maxWidth: 480, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text, flex: 1, marginRight: 12 },
  modalClose: { fontSize: 18, color: colors.muted },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6, marginTop: 14 },
  input: { padding: 14, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, fontFamily: fonts.family, marginBottom: 4 },
});
