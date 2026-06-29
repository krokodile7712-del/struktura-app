import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllStock } from '../db/queries';
import { getDb } from '../db/database';
import { colors, fonts, spacing } from '../constants/theme';

function updateStockLocal(itemId, newValue) {
  const db = getDb();
  db.runSync(`UPDATE stock SET остаток = ? WHERE id = ?`, [newValue, itemId]);
}

export default function StockScreen({ navigation }) {
  const [stock, setStock] = useState([]);
  const [modalItem, setModalItem] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [editMode, setEditMode] = useState(null); // 'add' | 'subtract' | 'set'

  useEffect(() => { loadStock(); }, []);

  const loadStock = () => {
    try { setStock(getAllStock()); } catch (e) { console.error(e); }
  };

  const openModal = (item) => {
    setModalItem(item);
    setInputValue('');
    setEditMode(null);
  };

  const closeModal = () => {
    setModalItem(null);
    setEditMode(null);
    setInputValue('');
  };

  const handleConfirm = () => {
    if (!modalItem || !inputValue) return;
    const val = parseFloat(inputValue);
    if (isNaN(val)) return;
    let newVal;
    if (editMode === 'add')      newVal = (modalItem['остаток'] || 0) + val;
    else if (editMode === 'subtract') newVal = Math.max(0, (modalItem['остаток'] || 0) - val);
    else if (editMode === 'set') newVal = val;
    try {
      updateStockLocal(modalItem.id, newVal);
      loadStock();
    } catch (e) { console.error(e); }
    closeModal();
  };

  const categories = [...new Set(stock.map(i => i.category))];

  const modeLabel = {
    add: 'Добавить',
    subtract: 'Списать',
    set: 'Установить точное значение',
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Склад" onBack={() => navigation.navigate('Dashboard')} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          {stock.length === 0 && (
            <Text style={styles.empty}>Нет данных. Выполните импорт из Sheets.</Text>
          )}
          {categories.map(cat => {
            const items = stock.filter(i => i.category === cat);
            const hasLow = items.some(i => i['остаток'] <= i['порог']);
            return (
              <View key={cat} style={{ marginBottom: 16 }}>
                <Text style={[styles.catHeader, hasLow && styles.catHeaderLow]}>
                  {hasLow ? '⚠️ ' : ''}{cat}
                </Text>
                {items.map(item => {
                  const isLow = item['остаток'] <= item['порог'];
                  return (
                    <Pressable key={item.id} style={styles.row} onPress={() => openModal(item)}>
                      <View>
                        <Text style={[styles.itemName, isLow && styles.itemNameLow]}>
                          {isLow ? '⚠️ ' : ''}{item.name}
                        </Text>
                        <Text style={styles.itemSub}>
                          {item['остаток']} {item.unit} · порог: {item['порог']}
                        </Text>
                      </View>
                      <Text style={[styles.itemStatus, isLow && styles.itemStatusLow]}>
                        {isLow ? 'Мало' : 'ОК'} ›
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Login" />

      {/* Модалка редактирования остатка */}
      <Modal visible={!!modalItem} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeModal} />
          {modalItem && (
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modalItem.name}</Text>
                <Pressable onPress={closeModal} hitSlop={12}>
                  <Text style={styles.modalClose}>✕</Text>
                </Pressable>
              </View>

              <Text style={styles.modalCurrent}>
                Сейчас: <Text style={styles.modalCurrentVal}>{modalItem['остаток']} {modalItem.unit}</Text>
              </Text>

              {!editMode ? (
                <View style={styles.modeRow}>
                  <MetalButton title="+ Добавить"  variant="success" onPress={() => setEditMode('add')}      style={{ flex: 1 }} />
                  <MetalButton title="− Списать"   variant="danger"  onPress={() => setEditMode('subtract')} style={{ flex: 1 }} />
                  <MetalButton title="= Установить" variant="default" onPress={() => setEditMode('set')}      style={{ flex: 1 }} />
                </View>
              ) : (
                <>
                  <Text style={styles.modeLabel}>{modeLabel[editMode]}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Количество"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    value={inputValue}
                    onChangeText={setInputValue}
                    autoFocus
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <MetalButton title="Подтвердить" variant="action"  onPress={handleConfirm} style={{ flex: 1 }} />
                    <MetalButton title="Отмена"      variant="back"    onPress={() => setEditMode(null)} style={{ flex: 1 }} />
                  </View>
                </>
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
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 20 },
  catHeader: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  catHeaderLow: { color: '#c47a5a' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName: { fontFamily: fonts.family, fontSize: 14, color: colors.text },
  itemNameLow: { color: colors.redLight },
  itemSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  itemStatus: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.greenLight },
  itemStatusLow: { color: colors.redLight },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner: { width: '55%', maxWidth: 500, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 },
  modalClose: { fontSize: 18, color: colors.muted, padding: 4 },
  modalCurrent: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginBottom: 16 },
  modalCurrentVal: { fontFamily: fonts.family, fontWeight: '700', color: colors.text },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  input: { padding: 14, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 18, marginBottom: 14, textAlign: 'center', fontFamily: fonts.family },
});
