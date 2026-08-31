import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Animated, FlatList, Alert, Image, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import TopBar from '../components/TopBar';
import Sheet from '../components/Sheet';
import SwipeableRow from '../components/SwipeableRow';
import { useResponsive } from '../hooks/useResponsive';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAllExpenses, insertExpense, deleteExpense, updateExpense,
  getRecurringExpenses, insertRecurringExpense, deactivateRecurringExpense, ensureRecurringExpenses,
} from '../db/queries';
import { goBackSmart, can } from '../db/session';
import { colors, fonts } from '../constants/theme';

const CATEGORIES = ['Аренда', 'Зарплата', 'Закупка', 'Коммуналка', 'Расходники', 'Реклама', 'Амортизация', 'Накладные', 'Прочее'];
const todayStr    = () => new Date().toISOString().slice(0, 10);
const weekAgoStr  = () => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().slice(0,10); };
const monthAgoStr = () => { const d = new Date(); d.setDate(d.getDate()-29); return d.toISOString().slice(0,10); };
const fmt = n => (n || 0).toLocaleString('ru-RU');
const fmtDate = s => { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}.${m}.${y.slice(2)}`; };

const PERIODS = [
  { key: 'today', label: 'Сегодня', from: todayStr,    to: todayStr },
  { key: 'week',  label: 'Неделя',  from: weekAgoStr,  to: todayStr },
  { key: 'month', label: 'Месяц',   from: monthAgoStr, to: todayStr },
];

// Экран Расходов — список↔сводка. В альбомной ориентации список сужается
// до колонки, сводка постоянно видна справа. В портрете сводка — компактная
// сворачиваемая полоска сверху (по умолчанию свёрнута — только итог), список
// на всю ширину ниже неё. Строки списка — тонкие, без карточек-рамок, суммы
// выровнены по правому краю в колонку.
export default function ExpensesScreen({ navigation }) {
  const { isLandscape } = useResponsive();
  const [period, setPeriod]         = useState('week');
  const [expenses, setExpenses]     = useState([]);
  const [addModal, setAddModal]     = useState(false);
  const [editingId, setEditingId]   = useState(null); // id редактируемого расхода, null = добавление нового
  const [selectedExpense, setSelectedExpense] = useState(null); // альбомная — null | 'new' | сам расход
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringModal, setRecurringModal] = useState(false);
  const [recurringList, setRecurringList] = useState([]);
  const [photoUri, setPhotoUri]     = useState('');
  const [photoViewUri, setPhotoViewUri] = useState(''); // полноэкранный просмотр — отдельно от формы
  const [category, setCategory]     = useState(CATEGORIES[0]);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [amount, setAmount]         = useState('');
  const [comment, setComment]       = useState('');
  const amountRef = useRef(null);

  // Анимации
  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(16))[0];
  const numAnim   = useState(new Animated.Value(1))[0];
  const modalAnim = useState(new Animated.Value(0))[0];

  const getRange = () => {
    const p = PERIODS.find(p => p.key === period);
    return { from: p.from(), to: p.to() };
  };

  const load = useCallback(() => {
    try {
      ensureRecurringExpenses();
      setRecurringList(getRecurringExpenses());
      const { from, to } = getRange();
      const all = getAllExpenses();
      const filtered = all.filter(e => {
        const d = e.date?.slice(0,10) || '';
        return d >= from && d <= to;
      });
      setExpenses(filtered.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
    } catch(e) { console.error(e); }
  }, [period]);

  useFocusEffect(useCallback(() => {
    load();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [load]));

  // Плавная перерисовка сводки при смене периода — короткое притухание/зажигание
  const changePeriod = (key) => {
    if (key === period) return;
    Animated.sequence([
      Animated.timing(numAnim, { toValue: 0, duration: 90, useNativeDriver: true }),
    ]).start(() => {
      setPeriod(key);
      Animated.timing(numAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    });
  };

  const openModal = () => {
    setEditingId(null);
    setCategory(CATEGORIES[0]);
    setAmount('');
    setComment('');
    setIsRecurring(false);
    setPhotoUri('');
    if (isLandscape) {
      setSelectedExpense('new');
    } else {
      setAddModal(true);
      modalAnim.setValue(0);
      Animated.spring(modalAnim, { toValue: 1, tension: 60, friction: 12, useNativeDriver: true }).start(
        () => setTimeout(() => amountRef.current?.focus(), 100)
      );
    }
  };

  const openEditModal = (item) => {
    setEditingId(item.id);
    setCategory(item.category);
    setAmount(String(item.amount));
    setComment(item.comment || '');
    setIsRecurring(false); // повтор настраивается только при создании нового
    setPhotoUri(item.photo_uri || '');
    if (isLandscape) {
      setSelectedExpense(item);
    } else {
      setAddModal(true);
      modalAnim.setValue(0);
      Animated.spring(modalAnim, { toValue: 1, tension: 60, friction: 12, useNativeDriver: true }).start();
    }
  };

  // Закрытие формы — в альбомной возвращает правую панель к сводке,
  // в портрете закрывает всплывающее окно
  const closeForm = () => {
    setEditingId(null);
    setSelectedExpense(null);
    setAddModal(false);
  };

  const pickPhoto = () => {
    Alert.alert('Фото чека', 'Откуда взять фото?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Камера', onPress: () => pickPhotoFrom('camera') },
      { text: 'Галерея', onPress: () => pickPhotoFrom('library') },
    ]);
  };

  const pickPhotoFrom = async (source) => {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Нет доступа', source === 'camera' ? 'Разрешите доступ к камере в настройках устройства' : 'Разрешите доступ к галерее в настройках устройства');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Ошибка', 'Не удалось получить фото');
    }
  };

  const handleAdd = () => {
    if (!amount || parseFloat(amount) <= 0) return;
    try {
      if (editingId) {
        updateExpense(editingId, {
          category,
          amount: parseFloat(amount),
          comment: comment.trim(),
          photo_uri: photoUri,
        });
      } else {
        insertExpense({
          category,
          amount: parseFloat(amount),
          comment: comment.trim(),
          date: todayStr(),
          photo_uri: photoUri,
        });
        if (isRecurring) {
          insertRecurringExpense({
            category,
            amount: parseFloat(amount),
            comment: comment.trim(),
            day_of_month: new Date().getDate(),
          });
        }
      }
      setEditingId(null);
      setSelectedExpense(null);
      setAmount('');
      setComment('');
      setPhotoUri('');
      setIsRecurring(false);
      setAddModal(false);
      load();
    } catch(e) { console.error(e); }
  };

  // Статистика
  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const byCategory = CATEGORIES.map(cat => ({
    cat,
    sum: expenses.filter(e => e.category === cat).reduce((s,e) => s + (e.amount||0), 0),
  })).filter(c => c.sum > 0).sort((a,b) => b.sum - a.sum);

  const periodChips = (
    <View style={styles.periodRow}>
      {PERIODS.map(p => (
        <Pressable
          key={p.key}
          style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
          onPress={() => changePeriod(p.key)}
        >
          <Text style={[styles.periodTxt, period === p.key && styles.periodTxtActive]}>
            {p.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const addBtn = can('add_expense') !== false && (
    <Pressable style={styles.addBtn} onPress={openModal}>
      <Text style={styles.addBtnTxt}>+ Добавить расход</Text>
    </Pressable>
  );

  const list = (
    <FlatList
      style={{ flex: 1 }}
      data={expenses}
      keyExtractor={e => String(e.id)}
      contentContainerStyle={{ paddingBottom: 40 }}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTxt}>Расходов за период нет</Text>
          <Text style={styles.emptyHint}>Нажмите «+ Добавить расход» чтобы начать</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <SwipeableRow
          onAction={() => {
            Alert.alert('Удалить расход?', `${item.category} · ${fmt(item.amount)} ₽`, [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Удалить', style: 'destructive', onPress: () => {
                deleteExpense(item.id);
                if (selectedExpense?.id === item.id) closeForm();
                load();
              } },
            ]);
          }}
          label="Удалить"
          onLeftAction={item.photo_uri ? () => setPhotoViewUri(item.photo_uri) : undefined}
          leftLabel="📎 Фото"
          leftColor={colors.indigo}
        >
          <Pressable
            style={({ pressed }) => [styles.expenseRow, index < expenses.length - 1 && styles.expenseRowDiv, pressed && { opacity: 0.7 }]}
            onPress={() => openEditModal(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.expenseCat} numberOfLines={1}>
                {item.recurring_id ? '🔁 ' : ''}{item.category}{item.comment ? ` · ${item.comment}` : ''}
              </Text>
              <Text style={styles.expenseDate}>{fmtDate(item.date?.slice(0,10) || '')}</Text>
            </View>
            {item.photo_uri ? <Text style={{ fontSize: 15, marginRight: 8 }}>📎</Text> : null}
            <Text style={styles.expenseAmt}>{fmt(item.amount)} ₽</Text>
          </Pressable>
        </SwipeableRow>
      )}
    />
  );

  // ── Содержимое сводки — общее и для боковой панели (альбомная), и для
  // раскрытой полоски сверху (портрет) ──
  const summaryBody = (
    <>
      {byCategory.length > 0 ? (
        <View style={{ marginTop: 4 }}>
          {byCategory.map((c, i) => (
            <View key={c.cat} style={[styles.catRow, i < byCategory.length - 1 && styles.catRowDiv]}>
              <Text style={styles.catName} numberOfLines={1}>{c.cat}</Text>
              <Text style={styles.catVal}>{fmt(c.sum)} ₽</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.hintText}>
          Фиксируйте все затраты бизнеса — аренду, зарплаты, закупки. Это позволит видеть реальную прибыль в разделе Отчётность.
        </Text>
      )}
    </>
  );

  const formBody = (
    <>
              <Text style={styles.modalHint}>Укажите категорию, сумму и при необходимости комментарий</Text>

              {/* Категории */}
              <Text style={styles.fieldLabel}>Категория</Text>
              <View style={styles.catChips}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat}
                    style={[styles.catChip, category === cat && styles.catChipActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.catChipTxt, category === cat && styles.catChipTxtActive]}>{cat}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Сумма */}
              <Text style={styles.fieldLabel}>Сумма <Text style={{ color: colors.orange }}>*</Text></Text>
              <View style={styles.amountWrap}>
                <TextInput
                  ref={amountRef}
                  style={styles.amountInput}
                  color={colors.text}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                  returnKeyType="next"
                />
                <Text style={styles.amountCurrency}>₽</Text>
              </View>

              {/* Комментарий */}
              <Text style={styles.fieldLabel}>Комментарий</Text>
              <TextInput
                style={styles.commentInput}
                color={colors.text}
                placeholder="Необязательно — например, номер счёта или поставщик"
                placeholderTextColor={colors.muted}
                value={comment}
                onChangeText={setComment}
                returnKeyType="done"
                onSubmitEditing={handleAdd}
              />

              {/* Повторять каждый месяц — только при создании нового расхода */}
              {!editingId && (
                <Pressable
                  style={styles.recurringRow}
                  onPress={() => setIsRecurring(v => !v)}
                >
                  <View style={[styles.recurringCheckbox, isRecurring && styles.recurringCheckboxActive]}>
                    {isRecurring && <Text style={styles.recurringCheckMark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recurringLabel}>Повторять каждый месяц</Text>
                    <Text style={styles.recurringHint}>
                      {new Date().getDate()} числа каждого месяца будет создаваться такой же расход автоматически
                    </Text>
                  </View>
                </Pressable>
              )}

              {/* Фото чека */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Фото чека</Text>
              {photoUri ? (
                <View style={styles.photoPreviewWrap}>
                  <Pressable onPress={() => setPhotoViewUri(photoUri)}>
                    <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                  </Pressable>
                  <Pressable style={styles.photoRemoveBtn} onPress={() => setPhotoUri('')}>
                    <Text style={styles.photoRemoveTxt}>✕ Убрать</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.photoPickBtn} onPress={pickPhoto}>
                  <Text style={styles.photoPickTxt}>📷 Прикрепить фото чека</Text>
                </Pressable>
              )}

              {/* Кнопки */}
              <View style={styles.modalBtns}>
                <Pressable style={styles.cancelBtn} onPress={closeForm}>
                  <Text style={styles.cancelTxt}>Отмена</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, (!amount || parseFloat(amount) <= 0) && { opacity: 0.5 }]}
                  onPress={handleAdd}
                >
                  <Text style={styles.saveTxt}>Сохранить</Text>
                </Pressable>
              </View>
    </>
  );

  return (
    <View style={styles.root}>
      <TopBar
        title="Расходы"
        onBack={() => goBackSmart(navigation)}
        navigation={navigation}
        activeScreen="Expenses"
      />

      <View style={{ flex: 1, flexDirection: isLandscape ? 'row' : 'column' }}>

        {!isLandscape && (
          /* Портрет — компактная сводка сверху, по умолчанию свёрнута */
          <Pressable style={styles.stripWrap} onPress={() => setSummaryExpanded(v => !v)}>
            <View style={styles.stripRow}>
              <View>
                <Text style={styles.stripLabel}>Расходы за период</Text>
                <Animated.Text style={[styles.stripVal, { opacity: numAnim }]}>{fmt(total)} ₽</Animated.Text>
              </View>
              <Text style={styles.stripChevron}>{summaryExpanded ? '▲' : '▼'}</Text>
            </View>
            {summaryExpanded && <View style={styles.stripBody}>{summaryBody}</View>}
          </Pressable>
        )}

        <Animated.View
          style={[
            { flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            isLandscape && styles.listColLandscape,
          ]}
        >
          {periodChips}
          <View style={{ paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{addBtn}</View>
            <Pressable style={styles.recurringBtn} onPress={() => setRecurringModal(true)}>
              <Text style={styles.recurringBtnTxt}>🔁</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 16 }}>{list}</View>
        </Animated.View>

        {isLandscape && (
          /* Альбомная — справа: сводка за период, либо форма (выбрана позиция/добавление) */
          <View style={styles.sidePanel}>
            {selectedExpense ? (
              <>
                <View style={styles.editorHeader}>
                  <Text style={styles.editorHeaderTxt} numberOfLines={1}>
                    {editingId ? 'Изменить расход' : 'Новый расход'}
                  </Text>
                  <Pressable onPress={closeForm} hitSlop={12} style={styles.editorCloseBtn}>
                    <Text style={styles.editorCloseTxt}>✕</Text>
                  </Pressable>
                </View>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
                  {formBody}
                </ScrollView>
              </>
            ) : (
              <View style={styles.sidePanelPad}>
                <Text style={styles.sideLabel}>За период</Text>
                <Animated.Text style={[styles.sideVal, { opacity: numAnim }]}>{fmt(total)} ₽</Animated.Text>
                <Text style={styles.sideSub}>{expenses.length} расходов</Text>
                <View style={styles.sideDivider} />
                <ScrollView showsVerticalScrollIndicator={false}>{summaryBody}</ScrollView>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Модалка добавления */}
      <Sheet visible={addModal} onClose={closeForm} title={editingId ? 'Изменить расход' : 'Новый расход'}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          {formBody}
        </ScrollView>
      </Sheet>

      {/* Управление повторяющимися расходами */}
      <Sheet visible={recurringModal} onClose={() => setRecurringModal(false)} title="Повторяющиеся расходы">
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {recurringList.length === 0 ? (
            <Text style={styles.modalHint}>
              Пока нет ни одного повторяющегося расхода. Чтобы добавить — при создании нового расхода включите «Повторять каждый месяц».
            </Text>
          ) : (
            recurringList.map(t => (
              <View key={t.id} style={styles.recurringItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recurringItemCat}>{t.category}{t.comment ? ` · ${t.comment}` : ''}</Text>
                  <Text style={styles.recurringItemHint}>{t.day_of_month} числа каждого месяца</Text>
                </View>
                <Text style={styles.recurringItemAmt}>{fmt(t.amount)} ₽</Text>
                <Pressable
                  style={styles.recurringItemDelete}
                  onPress={() => {
                    Alert.alert('Отключить повтор?', `${t.category} — новые расходы больше не будут создаваться автоматически. Уже созданные останутся.`, [
                      { text: 'Отмена', style: 'cancel' },
                      { text: 'Отключить', style: 'destructive', onPress: () => { deactivateRecurringExpense(t.id); load(); } },
                    ]);
                  }}
                >
                  <Text style={styles.recurringItemDeleteTxt}>✕</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </Sheet>

      {/* Полноэкранный просмотр фото чека */}
      <Modal visible={!!photoViewUri} transparent animationType="fade" onRequestClose={() => setPhotoViewUri('')}>
        <Pressable style={styles.photoViewerOverlay} onPress={() => setPhotoViewUri('')}>
          <Image source={{ uri: photoViewUri }} style={styles.photoViewerImg} resizeMode="contain" />
          <Pressable style={styles.photoViewerClose} onPress={() => setPhotoViewUri('')}>
            <Text style={styles.photoViewerCloseTxt}>✕ Закрыть</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.bg },

  periodRow:  { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  periodBtn:  { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  periodBtnActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.08)' },
  periodTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  periodTxtActive: { color: colors.orange },

  addBtn:     { paddingVertical: 12, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center', marginBottom: 12 },
  addBtnTxt:  { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#fff' },
  recurringBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  recurringBtnTxt: { fontSize: 18 },

  // ── Список — тонкие строки, без карточек-рамок ──
  emptyWrap:  { padding: 40, alignItems: 'center' },
  emptyTxt:   { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  emptyHint:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 6, opacity: 0.7 },

  expenseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  expenseRowDiv: { borderBottomWidth: 1, borderBottomColor: colors.border },
  expenseCat: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  expenseDate:{ fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  expenseAmt: { fontFamily: fonts.family, fontSize: 16, fontWeight: '800', color: colors.red, textAlign: 'right', minWidth: 90 },

  // ── Сводка — общие строки категорий (переиспользуются в обоих режимах) ──
  catRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  catRowDiv:  { borderBottomWidth: 1, borderBottomColor: colors.border },
  catName:    { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, flex: 1 },
  catVal:     { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  hintText:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 4 },

  // ── Портрет — сворачиваемая полоска сверху ──
  stripWrap:  { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 },
  stripRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stripLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  stripVal:   { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.red, marginTop: 2 },
  stripChevron: { fontSize: 11, color: colors.muted, opacity: 0.6 },
  stripBody:  { marginTop: 10 },

  // ── Альбомная — постоянная боковая панель сводки ──
  sidePanel:  { flex: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, margin: 12, marginLeft: 12, overflow: 'hidden' },
  sidePanelPad: { flex: 1, padding: 20 },
  listColLandscape: { flex: 0, width: '38%', maxWidth: 480, margin: 12, marginRight: 0, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface2 },
  editorHeaderTxt: { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text, flex: 1 },
  editorCloseBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  editorCloseTxt: { fontSize: 18, color: colors.muted },
  sideLabel:  { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  sideVal:    { fontFamily: fonts.family, fontSize: 34, fontWeight: '800', color: colors.red, marginTop: 6 },
  sideSub:    { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  sideDivider:{ height: 1, backgroundColor: colors.border, marginVertical: 16 },

  // ── Модалка добавления ──
  modalHint:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginBottom: 20, lineHeight: 19 },
  recurringItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  recurringItemCat: { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: colors.text },
  recurringItemHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  recurringItemAmt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  recurringItemDelete: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(217,95,95,0.12)', alignItems: 'center', justifyContent: 'center' },
  recurringItemDeleteTxt: { fontSize: 13, color: colors.red, fontWeight: '800' },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  catChips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip:    { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  catChipActive: { borderColor: 'rgba(240,160,80,0.5)', backgroundColor: 'rgba(240,160,80,0.1)' },
  catChipTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  catChipTxtActive: { color: colors.orange },

  amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  amountInput:{ flex: 1, paddingVertical: 16, fontSize: 28, fontFamily: fonts.family, fontWeight: '800', color: colors.text, textAlign: 'center' },
  amountCurrency: { fontFamily: fonts.familySemibold, fontSize: 20, color: colors.muted },

  commentInput: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },

  recurringRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 12, backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  recurringCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  recurringCheckboxActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  recurringCheckMark: { fontSize: 13, color: '#fff', fontWeight: '800' },
  recurringLabel: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  recurringHint: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },

  photoPickBtn: { paddingVertical: 13, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  photoPickTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  photoPreviewWrap: { position: 'relative' },
  photoPreview: { width: '100%', height: 160, borderRadius: 12, backgroundColor: colors.surface2 },
  photoRemoveBtn: { position: 'absolute', top: 8, right: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)' },
  photoRemoveTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: '#fff' },

  photoViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  photoViewerImg: { width: '100%', height: '80%' },
  photoViewerClose: { position: 'absolute', top: 50, right: 20, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)' },
  photoViewerCloseTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: '#fff' },

  modalBtns:  { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn:  { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  saveBtn:    { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  saveTxt:    { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: '#fff' },
});
