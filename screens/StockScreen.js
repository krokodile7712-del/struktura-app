import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getAllStock, addPurchase, getPurchaseHistory, initPurchasesTable } from '../db/queries';
import { getDb } from '../db/database';
import { colors, fonts, spacing } from '../constants/theme';

function updateStockLocal(itemId, newValue) {
  const db = getDb();
  db.runSync(`UPDATE stock SET остаток = ? WHERE id = ?`, [newValue, itemId]);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

const MODES = ['Закупка', 'Добавить', 'Списать', 'Установить'];

export default function StockScreen({ navigation }) {
  const [stock, setStock]         = useState([]);
  const [modalItem, setModalItem] = useState(null);
  const [mode, setMode]           = useState(null);
  const [inputQty, setInputQty]   = useState('');
  const [inputPrice, setInputPrice] = useState('');
  const [history, setHistory]     = useState([]);

  useEffect(() => {
    initPurchasesTable();
    loadStock();
  }, []);

  const loadStock = () => {
    try { setStock(getAllStock()); } catch (e) { console.error(e); }
  };

  const openModal = (item) => {
    setModalItem(item);
    setMode(null);
    setInputQty('');
    setInputPrice('');
    setHistory([]);
  };

  const closeModal = () => {
    setModalItem(null);
    setMode(null);
  };

  const selectMode = (m) => {
    setMode(m);
    setInputQty('');
    setInputPrice('');
    if (m === 'Закупка') {
      try { setHistory(getPurchaseHistory(modalItem.name)); } catch (_) {}
    }
  };

  const handleConfirm = () => {
    if (!modalItem) return;
    const qty = parseFloat(inputQty);
    if (!qty || isNaN(qty)) return;

    try {
      if (mode === 'Закупка') {
        const price = parseFloat(inputPrice);
        if (!price || isNaN(price)) return;
        addPurchase(modalItem.name, qty, price);
      } else if (mode === 'Добавить') {
        updateStockLocal(modalItem.id, (modalItem['остаток'] || 0) + qty);
      } else if (mode === 'Списать') {
        updateStockLocal(modalItem.id, Math.max(0, (modalItem['остаток'] || 0) - qty));
      } else if (mode === 'Установить') {
        updateStockLocal(modalItem.id, qty);
      }
      loadStock();
    } catch (e) { console.error(e); }

    closeModal();
  };

  const categories = [...new Set(stock.map(i => i.category))];

  const modeLabel = {
    'Закупка':   '💰 Закупка (обновит среднюю цену и себестоимость)',
    'Добавить':  '+ Добавить к остатку',
    'Списать':   '− Списать из остатка',
    'Установить':'= Установить точное значение',
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
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemName, isLow && styles.itemNameLow]}>
                          {isLow ? '⚠️ ' : ''}{item.name}
                        </Text>
                        <Text style={styles.itemSub}>
                          {item['остаток']} {item.unit} · порог: {item['порог']}
                          {item.avg_price > 0 ? ` · ср. цена: ${item.avg_price} ₽` : ''}
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
                Остаток: <Text style={styles.modalCurrentVal}>{modalItem['остаток']} {modalItem.unit}</Text>
                {modalItem.avg_price > 0 && (
                  <Text style={styles.modalAvgPrice}> · ср. цена: {modalItem.avg_price} ₽</Text>
                )}
              </Text>

              {!mode ? (
                <View style={styles.modeGrid}>
                  {MODES.map(m => (
                    <Pressable
                      key={m}
                      style={[styles.modeBtn, m === 'Закупка' && styles.modeBtnPrimary]}
                      onPress={() => selectMode(m)}
                    >
                      <Text style={[styles.modeBtnText, m === 'Закупка' && styles.modeBtnTextPrimary]}>
                        {m === 'Закупка' ? '💰' : m === 'Добавить' ? '+' : m === 'Списать' ? '−' : '='} {m}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <>
                  <Text style={styles.modeHint}>{modeLabel[mode]}</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="Количество"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    value={inputQty}
                    onChangeText={setInputQty}
                    autoFocus
                  />

                  {mode === 'Закупка' && (
                    <TextInput
                      style={styles.input}
                      placeholder="Цена за единицу (₽)"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                      value={inputPrice}
                      onChangeText={setInputPrice}
                    />
                  )}

                  {mode === 'Закупка' && inputQty && inputPrice && (
                    <Text style={styles.calcHint}>
                      Итого: {(parseFloat(inputQty) * parseFloat(inputPrice)).toFixed(2)} ₽
                    </Text>
                  )}

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <MetalButton title="Подтвердить" variant="action" onPress={handleConfirm} style={{ flex: 1 }} />
                    <MetalButton title="Назад"       variant="back"   onPress={() => setMode(null)} style={{ flex: 1 }} />
                  </View>

                  {/* История закупок */}
                  {mode === 'Закупка' && history.length > 0 && (
                    <>
                      <Text style={[styles.modeHint, { marginTop: 14 }]}>История закупок</Text>
                      {history.map((h, i) => (
                        <View key={i} style={styles.histRow}>
                          <Text style={styles.histDate}>{fmtDate(h.created_at)}</Text>
                          <Text style={styles.histQty}>{h.qty} {modalItem.unit}</Text>
                          <Text style={styles.histPrice}>{h.price_per_unit} ₽/ед.</Text>
                          <Text style={styles.histTotal}>{h.total.toFixed(0)} ₽</Text>
                        </View>
                      ))}
                    </>
                  )}
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
  modalInner: { width: '60%', maxWidth: 560, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.borderHi },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 },
  modalClose: { fontSize: 18, color: colors.muted, padding: 4 },
  modalCurrent: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 16 },
  modalCurrentVal: { fontFamily: fonts.family, fontWeight: '700', color: colors.text },
  modalAvgPrice: { fontFamily: fonts.familyRegular, color: colors.greenLight },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modeBtn: { flex: 1, minWidth: '45%', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#0b0c0e', alignItems: 'center' },
  modeBtnPrimary: { borderColor: 'rgba(122,158,82,0.5)', backgroundColor: 'rgba(122,158,82,0.12)' },
  modeBtnText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  modeBtnTextPrimary: { color: colors.greenLight },
  modeHint: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginBottom: 10 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 16, marginBottom: 10, textAlign: 'center', fontFamily: fonts.family },
  calcHint: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.greenLight, textAlign: 'center', marginBottom: 4 },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  histDate: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, flex: 1 },
  histQty: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.text, flex: 1, textAlign: 'center' },
  histPrice: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.text, flex: 1, textAlign: 'center' },
  histTotal: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.greenLight, flex: 1, textAlign: 'right' },
});
