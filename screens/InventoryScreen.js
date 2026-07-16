import React, { useState, useEffect, useCallback } from 'react';
import EmptyState from '../components/EmptyState';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import {
  getInventoryActs, createInventoryAct, deleteInventoryAct,
  getLocations, initDefaultLocation, getAllStock, getBusinessProfile,
} from '../db/queries';
import { getCurrentLocationId } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const SCOPE_OPTIONS = [
  { key: 'all',      label: 'Весь склад' },
  { key: 'category', label: 'По категории' },
  { key: 'manual',   label: 'Выборочно' },
];

export default function InventoryScreen({ navigation }) {
  const [acts, setActs]               = useState([]);
  const [setupModal, setSetupModal]   = useState(false);
  const [scope, setScope]             = useState('all');
  const [scopeCategory, setScopeCategory] = useState('');
  const [scopeItems, setScopeItems]   = useState([]); // [{id, name, selected}]
  const [locationId, setLocationId]   = useState(null);
  const [locations, setLocations]     = useState([]);
  const [categories, setCategories]   = useState([]);
  const [locEnabled, setLocEnabled]   = useState(false);

  useEffect(() => { load(); }, []);

  const load = () => {
    try {
      setActs(getInventoryActs(30));
      const profile = getBusinessProfile();
      const enabled = profile?.modules?.locations === true;
      setLocEnabled(enabled);
      if (enabled) {
        let locs = getLocations();
        if (locs.length === 0) { initDefaultLocation(); locs = getLocations(); }
        setLocations(locs);
        setLocationId(getCurrentLocationId() || locs[0]?.id || null);
      }
      const stock = getAllStock();
      const cats = [...new Set(stock.map(s => s.category))].filter(Boolean);
      setCategories(cats);
      setScopeCategory(cats[0] || '');
      setScopeItems(stock.map(s => ({ id: s.id, name: s.name, category: s.category, selected: true })));
    } catch (e) { console.error(e); }
  };

  const openSetup = () => {
    setScope('all');
    setSetupModal(true);
  };

  const startInventory = () => {
    try {
      let scopeValue = '';
      if (scope === 'category') scopeValue = scopeCategory;
      if (scope === 'manual') scopeValue = scopeItems.filter(i => i.selected).map(i => i.id).join(',');

      const locName = locations.find(l => l.id === locationId)?.name || '';
      const actId = createInventoryAct({
        scope, scopeValue,
        locationId: locEnabled ? locationId : null,
        locationName: locEnabled ? locName : '',
      });
      setSetupModal(false);
      navigation.navigate('InventoryCount', { actId });
    } catch (e) { console.error(e); }
  };

  const openAct = (act) => {
    if (act.status === 'draft') {
      navigation.navigate('InventoryCount', { actId: act.id });
    } else {
      navigation.navigate('InventoryCount', { actId: act.id, readOnly: true });
    }
  };

  const removeDraft = (actId) => {
    try { deleteInventoryAct(actId); load(); } catch (e) { console.error(e); }
  };

  const toggleScopeItem = (id) => {
    setScopeItems(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i));
  };

  const drafts    = acts.filter(a => a.status === 'draft');
  const confirmed = acts.filter(a => a.status === 'confirmed');

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Инвентаризация" onBack={() => navigation.navigate('Admin')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

        {drafts.length > 0 && (
          <MetalCard style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>⚠️ Незавершённый акт</Text>
            {drafts.map(act => (
              <View key={act.id} style={styles.actRow}>
                <Pressable style={{ flex: 1 }} onPress={() => openAct(act)}>
                  <Text style={styles.actDate}>{fmtDate(act.created_at)}</Text>
                  <Text style={styles.actMeta}>
                    {act.location_name ? `📍 ${act.location_name} · ` : ''}
                    {SCOPE_OPTIONS.find(s => s.key === act.scope)?.label || act.scope}
                  </Text>
                </Pressable>
                <Pressable onPress={() => removeDraft(act.id)} hitSlop={10} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </MetalCard>
        )}

        <MetalButton title="+ Начать инвентаризацию" variant="success" onPress={openSetup} />

        {confirmed.length > 0 && (
          <MetalCard style={{ marginTop: 16 }}>
            <Text style={styles.sectionTitle}>История актов</Text>
            {confirmed.map(act => (
              <Pressable key={act.id} style={styles.actRow} onPress={() => openAct(act)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actDate}>{fmtDate(act.created_at)}</Text>
                  <Text style={styles.actMeta}>
                    {act.location_name ? `📍 ${act.location_name} · ` : ''}
                    {SCOPE_OPTIONS.find(s => s.key === act.scope)?.label || act.scope}
                    {act.scope_value ? `: ${act.scope_value}` : ''}
                  </Text>
                </View>
                <Text style={styles.actConfirmed}>✓ Подтверждён</Text>
              </Pressable>
            ))}
          </MetalCard>
        )}

        {acts.length === 0 && (
          <EmptyState
            icon="📋"
            title="Инвентаризаций пока не проводилось"
            text="Инвентаризация — это сверка фактических остатков на складе с тем что записано в системе. Помогает найти недостачи или излишки. Проводите раз в неделю или месяц."
            action="Начать первую инвентаризацию"
            onAction={openSetup}
          />
        )}
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка настройки новой инвентаризации */}
      <Modal visible={setupModal} transparent animationType="fade" onRequestClose={() => setSetupModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSetupModal(false)} />
          <View style={[styles.modalInner, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Настройка инвентаризации</Text>
              <Pressable onPress={() => setSetupModal(false)} hitSlop={12}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Локация */}
              {locEnabled && locations.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Локация</Text>
                  <View style={styles.chipsRow}>
                    {locations.map(loc => (
                      <Pressable
                        key={loc.id}
                        style={[styles.chip, locationId === loc.id && styles.chipActive]}
                        onPress={() => setLocationId(loc.id)}
                      >
                        <Text style={[styles.chipText, locationId === loc.id && styles.chipTextActive]}>
                          {loc.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Охват */}
              <Text style={styles.fieldLabel}>Охват</Text>
              <View style={styles.chipsRow}>
                {SCOPE_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.key}
                    style={[styles.chip, scope === opt.key && styles.chipActive]}
                    onPress={() => setScope(opt.key)}
                  >
                    <Text style={[styles.chipText, scope === opt.key && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Категория */}
              {scope === 'category' && (
                <>
                  <Text style={styles.fieldLabel}>Категория</Text>
                  <View style={styles.chipsRow}>
                    {categories.map(cat => (
                      <Pressable
                        key={cat}
                        style={[styles.chip, scopeCategory === cat && styles.chipActive]}
                        onPress={() => setScopeCategory(cat)}
                      >
                        <Text style={[styles.chipText, scopeCategory === cat && styles.chipTextActive]}>
                          {cat}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Выборочно */}
              {scope === 'manual' && (
                <>
                  <Text style={styles.fieldLabel}>Выбрать позиции</Text>
                  {scopeItems.map(item => (
                    <Pressable key={item.id} style={styles.checkRow} onPress={() => toggleScopeItem(item.id)}>
                      <Text style={styles.checkBox}>{item.selected ? '☑' : '☐'}</Text>
                      <Text style={styles.checkLabel}>{item.name}</Text>
                      <Text style={styles.checkCat}>{item.category}</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>

            <MetalButton
              title="Начать подсчёт →"
              variant="success"
              onPress={startInventory}
              style={{ marginTop: 16 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.text, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  actRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  actDate: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  actMeta: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  actConfirmed: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 15, color: colors.redLight },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 30 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '60%', maxWidth: 560, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  modalClose: { fontSize: 18, color: colors.muted, padding: 4 },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 14 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e' },
  chipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.15)' },
  chipText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  chipTextActive: { color: colors.greenLight },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  checkBox: { fontSize: 18, color: colors.greenLight, width: 22 },
  checkLabel: { flex: 1, fontFamily: fonts.family, fontSize: 14, color: colors.text },
  checkCat: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
});
