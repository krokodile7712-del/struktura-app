import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import Sheet from '../components/Sheet';
import InfoTip from '../components/InfoTip';
import TourGuide from '../components/TourGuide';
import { useTourHighlight } from '../components/TourRegistry';
import {
  getLocations, addLocation, updateLocation, deleteLocation, initDefaultLocation,
  getBusinessProfile, markTourSeen,
} from '../db/queries';
import { useToast } from '../components/Toast';
import { getCurrentLocationId, setCurrentLocationId } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

export default function LocationsScreen({ navigation }) {
  const [locations, setLocations]   = useState([]);
  const [modal, setModal]           = useState(null); // null | { id?, name, description }
  const toast = useToast();
  const [currentLocId, setCurrentLocId] = useState(getCurrentLocationId());
  const [tourOpen, setTourOpen] = useState(false);
  const listHighlight   = useTourHighlight('locations.list');
  const addBtnHighlight = useTourHighlight('locations.addBtn');
  const editHighlight   = useTourHighlight('locations.list.edit');

  const tourSteps = [
    { key: 'locations.list',   title: 'Список точек', text: 'Тап по карточке выбирает активную точку — она используется в кассе при списании ингредиентов и на Складе при просмотре остатков. Выбор сбрасывается при перезапуске приложения, так что выбирайте нужную в начале смены.' },
    { key: 'locations.addBtn', title: '+ Добавить локацию', text: 'Если у вас несколько мест хранения — например основной склад и барная стойка — заведите каждую отдельно.' },
    { key: 'locations.list.edit', title: 'Изменить или удалить', text: 'Значок ✎ открывает редактирование названия и описания. Удалить можно любую, кроме последней — хотя бы одна точка должна остаться всегда.' },
  ];

  useEffect(() => {
    load();
    try {
      const p = getBusinessProfile();
      if (!p?.tours_seen?.Locations) {
        const t = setTimeout(() => setTourOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch (_) {}
  }, []);

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
      toast.show('Локация удалена');
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
      <TopBar
        title="Локации"
        onBack={() => navigation.navigate('Admin')}
        navigation={navigation}
        activeScreen="Locations"
        rightElement={
          <Pressable style={styles.tourBtn} onPress={() => setTourOpen(true)} hitSlop={10} accessibilityLabel="Подсказка" accessibilityRole="button">
            <Text style={styles.tourBtnTxt}>?</Text>
          </Pressable>
        }
      />

      <ScrollView style={styles.screen} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.labelRow}>
          <Text style={styles.sectionLabel}>Ваши локации</Text>
          <InfoTip title="Локации" text="Если у вас несколько мест хранения — например основной склад и барная стойка — добавьте их здесь. Выбранная точка используется в кассе при списании ингредиентов и на Складе при просмотре остатков." />
        </View>

        <Pressable style={[styles.addBtnBig, { position: 'relative' }, addBtnHighlight.style]} onPress={openAdd}>
          <Text style={styles.addBtnBigTxt}>+ Добавить локацию</Text>
          {addBtnHighlight.overlay}
        </Pressable>

        <View style={[{ position: 'relative' }, listHighlight.style]}>
          {locations.map((loc, idx) => {
            const isActive = currentLocId === loc.id;
            return (
              <Pressable
                key={loc.id}
                style={[styles.card, idx > 0 && { marginTop: 10 }, isActive && styles.cardActive]}
                onPress={() => selectLocation(loc.id)}
              >
                <View style={[styles.statusDot, { backgroundColor: isActive ? colors.green : colors.border }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.locName, isActive && styles.locNameActive]}>{loc.name}</Text>
                  {!!loc.description && (
                    <Text style={styles.locDesc}>{loc.description}</Text>
                  )}
                </View>
                {isActive && <Text style={styles.activeBadge}>Активна</Text>}
                <Pressable onPress={() => openEdit(loc)} hitSlop={10} style={[styles.editBtn, { position: 'relative' }, editHighlight.style]}>
                  <Text style={styles.editBtnText}>✎</Text>
                  {editHighlight.overlay}
                </Pressable>
              </Pressable>
            );
          })}
          {listHighlight.overlay}
        </View>
      </ScrollView>

      <Sheet visible={!!modal} onClose={closeModal} title={modal?.id ? 'Редактировать локацию' : 'Новая локация'}>
        {modal && (
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput
                style={styles.input}
                color={colors.text}
                value={modal.name}
                onChangeText={v => setModal(m => ({ ...m, name: v }))}
                placeholder="напр. Основной склад, Бар"
                placeholderTextColor={colors.muted}
                autoFocus
              />

              <Text style={styles.fieldLabel}>Описание (необязательно)</Text>
              <TextInput
                style={styles.input}
                color={colors.text}
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
            </ScrollView>
        )}
      </Sheet>

      <TourGuide
        visible={tourOpen}
        onClose={() => { setTourOpen(false); markTourSeen('Locations'); }}
        steps={tourSteps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 760, width: '100%', alignSelf: 'center' },

  tourBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(240,160,80,0.1)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center', justifyContent: 'center' },
  tourBtnTxt: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.orange },

  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },

  addBtnBig:  { paddingVertical: 16, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', marginBottom: 16 },
  addBtnBigTxt: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: '#fff' },

  hint: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 10, lineHeight: 20 },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface2, borderRadius: 16, borderWidth: 1, borderColor: colors.borderHi, padding: 16 },
  cardActive: { borderColor: 'rgba(123,175,142,0.5)', backgroundColor: 'rgba(123,175,142,0.06)' },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  locName: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  locNameActive: { color: colors.greenLight },
  locDesc: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },
  activeBadge: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.greenLight },
  editBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border },
  editBtnText: { fontSize: 16, color: colors.muted },

  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6, marginTop: 14 },
  input: { padding: 14, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.borderHi, borderRadius: 12, color: colors.text, fontSize: 15, fontFamily: fonts.family, marginBottom: 4 },
});
