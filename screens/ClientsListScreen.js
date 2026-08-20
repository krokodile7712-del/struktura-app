import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, FlatList, Animated } from 'react-native';
import TopBar from '../components/TopBar';
import { useResponsive } from '../hooks/useResponsive';
import EmptyState from '../components/EmptyState';
import { useFocusEffect } from '@react-navigation/native';
import { getAllClients, searchClients, getClientOrders, getTerms, pluralizeRu,
         getLoyaltyConfig, updateClientNote, getClientById } from '../db/queries';
import { updateClient } from '../db/queries';
import { getHomeRoute, goBackSmart, getSession } from '../db/session';
import { colors, fonts } from '../constants/theme';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function daysSince(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
}

function ClientCard({ client, onNewOrder, onSaved, loyaltyModel, loyaltyConfig }) {
  const [orders, setOrders]     = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing]   = useState(false);
  const [fio, setFio]           = useState(client.fio || '');
  const [phone, setPhone]       = useState(client.phone || '');
  const [balance, setBalance]   = useState(String(client.balance || 0));
  const [discountPct, setDiscountPct] = useState(String(client.discount_pct || 0));
  const [birthDate, setBirthDate] = useState(client.birth_date || '');
  const [notes, setNotes]       = useState(client.notes || '');
  const [editingNote, setEditingNote] = useState(false);
  const isAdmin = getSession()?.role === 'admin';

  React.useEffect(() => {
    try { setOrders(getClientOrders(client.id)); } catch (_) {}
    setFio(client.fio || '');
    setPhone(client.phone || '');
    setBalance(String(client.balance || 0));
    setDiscountPct(String(client.discount_pct || 0));
    setBirthDate(client.birth_date || '');
    setNotes(client.notes || '');
    setEditing(false);
    setEditingNote(false);
    setExpanded(null);
  }, [client.id]);

  const lastOrder = orders[0];
  const days = daysSince(lastOrder?.created_at);
  const avgCheck = orders.length > 0
    ? Math.round(orders.reduce((s, o) => s + o.total, 0) / orders.length) : 0;

  const handleSave = () => {
    try {
      updateClient(client.id, { fio: fio.trim(), phone: phone.trim(), balance: parseFloat(balance)||0, discount_pct: parseFloat(discountPct)||0, birth_date: birthDate.trim() });
      client.fio = fio.trim(); client.phone = phone.trim();
      client.balance = parseFloat(balance)||0; client.discount_pct = parseFloat(discountPct)||0;
      client.birth_date = birthDate.trim();
      setEditing(false);
      onSaved?.();
    } catch (e) { console.error(e); }
  };

  const handleSaveNote = () => {
    try { updateClientNote(client.id, notes); client.notes = notes; setEditingNote(false); } catch (e) { console.error(e); }
  };

  const isBirthday = (() => {
    if (!client.birth_date) return false;
    const t = new Date(); const mm = String(t.getMonth()+1).padStart(2,'0'); const dd = String(t.getDate()).padStart(2,'0');
    return client.birth_date.includes(`${dd}.${mm}`) || client.birth_date.includes(`-${mm}-${dd}`);
  })();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>

      {/* Шапка */}
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{(client.fio||'?').charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.cardName}>{client.fio}</Text>
        <Text style={styles.cardCode}>{client.code}</Text>
        {isBirthday && <Text style={styles.birthday}>🎂 Сегодня день рождения!</Text>}
      </View>

      {/* Баллы / визиты */}
      <View style={styles.balanceBox}>
        <Text style={styles.balanceNum}>{client.balance || 0}</Text>
        <Text style={styles.balanceLbl}>
          {loyaltyModel === 'subscription' ? 'визитов' : loyaltyModel === 'points' ? 'баллов' : `скидка ${loyaltyConfig?.pct||0}%`}
        </Text>
        {client.discount_pct > 0 && <Text style={styles.personalDiscount}>🏷 Личная скидка {client.discount_pct}%</Text>}
      </View>

      {/* Статистика */}
      <View style={styles.statsRow}>
        {[
          { val: client.visits || 0, lbl: 'визитов' },
          { val: (client.total_sum||0).toLocaleString('ru-RU'), lbl: 'сумма ₽' },
          { val: avgCheck.toLocaleString('ru-RU'), lbl: 'ср. чек ₽' },
        ].map((s, i) => (
          <View key={i} style={styles.statBox}>
            <Text style={styles.statVal}>{s.val}</Text>
            <Text style={styles.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* Последний визит */}
      {lastOrder && (
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>🕐</Text>
          <Text style={styles.infoTxt}>
            Последний визит: {fmtDate(lastOrder.created_at)}
            {days === 0 ? ' (сегодня)' : days === 1 ? ' (вчера)' : ` (${days} дн. назад)`}
          </Text>
        </View>
      )}
      {client.phone ? (
        <Pressable style={styles.infoRow}>
          <Text style={styles.infoIcon}>📞</Text>
          <Text style={[styles.infoTxt, { color: colors.indigo }]}>{client.phone}</Text>
        </Pressable>
      ) : null}
      {client.birth_date ? (
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>🎂</Text>
          <Text style={styles.infoTxt}>{client.birth_date}</Text>
        </View>
      ) : null}

      {/* Заметки */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Заметки</Text>
          {!editingNote && (
            <Pressable onPress={() => setEditingNote(true)} hitSlop={10}>
              <Text style={styles.sectionAction}>{notes ? 'Изменить' : 'Добавить'}</Text>
            </Pressable>
          )}
        </View>
        {editingNote ? (
          <>
            <TextInput
              color={colors.text}
              style={styles.noteInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Предпочтения, аллергии, особые пожелания..." // Подсказка кассиру перед заказом
              placeholderTextColor={colors.muted}
              multiline
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable style={[styles.btn, { flex: 1 }]} onPress={handleSaveNote}>
                <Text style={styles.btnTxt}>Сохранить</Text>
              </Pressable>
              <Pressable style={[styles.btnSec, { flex: 1 }]} onPress={() => setEditingNote(false)}>
                <Text style={styles.btnSecTxt}>Отмена</Text>
              </Pressable>
            </View>
          </>
        ) : notes ? (
          <Text style={styles.noteText}>{notes}</Text>
        ) : (
          <Text style={styles.notePlaceholder}>Нет заметок</Text>
        )}
      </View>

      {/* Действия */}
      <Pressable style={({ pressed }) => [styles.btn, { marginBottom: 8 }, pressed && { opacity: 0.88 }]}
        onPress={() => onNewOrder(client)}>
        <Text style={styles.btnTxt}>＋ Новый заказ</Text>
      </Pressable>
      {isAdmin && (
        <Pressable style={({ pressed }) => [styles.btnSec, pressed && { opacity: 0.88 }]}
          onPress={() => setEditing(e => !e)}>
          <Text style={styles.btnSecTxt}>{editing ? 'Скрыть' : '✎ Редактировать'}</Text>
        </Pressable>
      )}

      {/* Редактирование */}
      {editing && (
        <View style={styles.editBox}>
          {[
            { label: 'ФИО', val: fio, set: setFio, kb: 'default' },
            { label: 'Телефон', val: phone, set: setPhone, kb: 'phone-pad' },
            { label: loyaltyModel === 'subscription' ? 'Визитов' : 'Баллов', val: balance, set: setBalance, kb: 'numeric' },
            { label: 'Личная скидка %', val: discountPct, set: setDiscountPct, kb: 'numeric' },
            { label: 'Дата рождения', val: birthDate, set: setBirthDate, kb: 'numbers-and-punctuation', placeholder: '01.01.1990' },
          ].map(f => (
            <View key={f.label}>
              <Text style={styles.fieldLbl}>{f.label}</Text>
              <TextInput color={colors.text} style={styles.input} value={f.val} onChangeText={f.set}
                keyboardType={f.kb} placeholder={f.placeholder} placeholderTextColor={colors.muted} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable style={[styles.btn, { flex: 1 }]} onPress={handleSave}>
              <Text style={styles.btnTxt}>Сохранить</Text>
            </Pressable>
            <Pressable style={[styles.btnSec, { flex: 1 }]} onPress={() => setEditing(false)}>
              <Text style={styles.btnSecTxt}>Отмена</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* История заказов */}
      <View style={[styles.section, { marginTop: 20 }]}>
        <Text style={styles.sectionTitle}>История заказов ({orders.length})</Text>
        {orders.length === 0 ? (
          <Text style={styles.notePlaceholder}>Нет заказов</Text>
        ) : (
          <View style={styles.ordersCard}>
            {orders.map((order, idx) => (
              <View key={order.id}>
                <Pressable
                  style={[styles.orderRow, idx < orders.length-1 && styles.orderDiv]}
                  onPress={() => setExpanded(expanded === order.id ? null : order.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderDate}>{fmtDate(order.created_at)} · {fmtTime(order.created_at)}</Text>
                    <Text style={styles.orderMethod}>{order.method}</Text>
                  </View>
                  <Text style={styles.orderTotal}>{order.total} ₽</Text>
                  <Text style={[styles.orderChevron, expanded === order.id && styles.orderChevronOpen]}>›</Text>
                </Pressable>
                {expanded === order.id && (
                  <View style={styles.orderItems}>
                    {(order.items || []).map((item, i) => (
                      <View key={i} style={styles.orderItem}>
                        <Text style={styles.orderItemName}>
                          {item.name}{item.size ? ` ${item.size}` : ''}
                        </Text>
                        <Text style={styles.orderItemPrice}>{item.price} ₽</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

    </ScrollView>
  );
}

export default function ClientsListScreen({ navigation, initialClientId }) {
  const [query, setQuery]       = useState('');
  const [clients, setClients]   = useState([]);
  const [selected, setSelected] = useState(null);
  const cardAnim = useState(new Animated.Value(0))[0];
  const cardSlide = useState(new Animated.Value(24))[0];

  const selectClient = (c) => {
    cardAnim.setValue(0);
    cardSlide.setValue(24);
    setSelected(c);
    Animated.parallel([
      Animated.timing(cardAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(cardSlide, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  };
  const [terms, setTerms]       = useState({ client: 'Клиент', order: 'Заказ' });
  const [loyaltyModel, setLoyaltyModel] = useState('points');
  const [loyaltyConfig, setLoyaltyConfig] = useState({});

  const load = useCallback(() => {
    try {
      const all = getAllClients();
      setClients(all);
      if (initialClientId) {
        const found = all.find(c => c.id === Number(initialClientId));
        if (found) {
          setSelected(found);
          // Сразу показываем карточку без анимации при первой загрузке
          cardAnim.setValue(1);
          cardSlide.setValue(0);
        }
      }
      setTerms(getTerms());
      const lc = getLoyaltyConfig();
      setLoyaltyModel(lc.model);
      setLoyaltyConfig(lc.config);
    } catch (_) {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = query.length >= 1 ? searchClients(query) : clients;

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title={pluralizeRu(terms.client)}
        onBack={() => goBackSmart(navigation)}
        navigation={navigation}
        activeScreen="ClientsList"
        rightElement={
          <Pressable style={styles.addBtn} onPress={() => navigation.navigate('Loyalty')} hitSlop={8}>
            <Text style={styles.addBtnTxt}>＋</Text>
          </Pressable>
        }
      />

      <View style={styles.layout}>
        {/* Левая колонка — список */}
        <View style={styles.listCol}>
          <View style={styles.searchWrap}>
            <TextInput
              color={colors.text}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Поиск..."
              placeholderTextColor={colors.muted}
            />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
            {filtered.length === 0 ? (
              <EmptyState icon="👥" title="Нет клиентов"
                text={clients.length === 0 ? 'Зарегистрируйте первого клиента через раздел Лояльность' : 'Ничего не найдено'}
                action={clients.length === 0 ? 'Зарегистрировать клиента' : undefined}
                onAction={clients.length === 0 ? () => navigation.navigate('Loyalty') : undefined} />
            ) : (
              <View style={styles.clientsCard}>
                {filtered.map((c, idx) => {
                  const isActive = selected?.id === c.id;
                  return (
                    <Pressable key={c.id}
                      style={({ pressed }) => [
                        styles.clientRow,
                        idx < filtered.length-1 && styles.clientRowDiv,
                        isActive && styles.clientRowActive,
                        pressed && !isActive && { backgroundColor: 'rgba(255,255,255,0.03)' },
                      ]}
                      onPress={() => selectClient(c)}
                    >
                      <View style={[styles.listAvatar, isActive && styles.listAvatarActive]}>
                        <Text style={[styles.listAvatarTxt, isActive && { color: '#fff' }]}>
                          {(c.fio||'?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.clientName, isActive && { color: colors.greenLight }]}>{c.fio}</Text>
                        <Text style={styles.clientSub}>
                          {loyaltyModel === 'points' ? `★ ${c.balance||0}` : `${c.visits||0} визит.`} · {c.visits||0} поз.
                        </Text>
                      </View>
                      {isActive && <View style={styles.activeBar} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>

        {/* Правая колонка — карточка */}
        <View style={styles.cardCol}>
          {selected ? (
            <Animated.View style={{ flex: 1, opacity: cardAnim, transform: [{ translateY: cardSlide }] }}>
            <ClientCard
              key={selected.id}
              client={selected}
              loyaltyModel={loyaltyModel}
              loyaltyConfig={loyaltyConfig}
              onNewOrder={(c) => navigation.navigate('Kassa', { forClient: { id: c.id, fio: c.fio, code: c.code } })}
              onSaved={() => load()}
            />
            </Animated.View>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
              <Text style={{ fontSize: 48 }}>👥</Text>
              <Text style={{ fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted, marginTop: 12 }}>
                Выберите клиента
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout:     { flex: 1, flexDirection: 'row' },
  listCol:    { width: 280, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  cardCol:    { flex: 1, backgroundColor: colors.bg },
  searchWrap: { padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(64,60,55,0.2)' },
  searchInput:{ backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, fontFamily: fonts.familyRegular, fontSize: 16, color: colors.text },
  addBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(240,160,80,0.15)', borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)', alignItems: 'center', justifyContent: 'center' },
  addBtnTxt:  { fontSize: 18, color: colors.orange, lineHeight: 24 },

  clientsCard:   { margin: 8, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  clientRow:     { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, position: 'relative' },
  clientRowDiv:  { borderBottomWidth: 1, borderBottomColor: 'rgba(64,60,55,0.15)' },
  clientRowActive:{ backgroundColor: 'rgba(240,160,80,0.07)' },
  clientName:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  clientSub:     { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  listAvatar:    { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  listAvatarActive:{ backgroundColor: colors.orange },
  listAvatarTxt: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  activeBar:     { position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, borderRadius: 2, backgroundColor: colors.orange },

  // Карточка клиента
  cardHead:    { alignItems: 'center', marginBottom: 20 },
  avatar:      { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(139,127,212,0.15)', borderWidth: 2, borderColor: 'rgba(139,127,212,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarTxt:   { fontFamily: fonts.family, fontSize: 28, fontWeight: '800', color: colors.indigo },
  cardName:    { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.text },
  cardCode:    { fontFamily: 'monospace', fontSize: 11, color: colors.muted, marginTop: 4 },
  birthday:    { fontFamily: fonts.familySemibold, fontSize: 13, color: '#f5c842', marginTop: 6 },

  balanceBox:  { alignItems: 'center', marginBottom: 20 },
  balanceNum:  { fontFamily: fonts.family, fontSize: 52, fontWeight: '800', color: colors.text },
  balanceLbl:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  personalDiscount: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange, marginTop: 4 },

  statsRow:    { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox:     { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, alignItems: 'center' },
  statVal:     { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  statLbl:     { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textTransform: 'uppercase', marginTop: 3 },

  infoRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  infoIcon:    { fontSize: 15, width: 22, textAlign: 'center' },
  infoTxt:     { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },

  section:     { marginTop: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle:{ fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  sectionAction:{ fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },
  noteInput:   { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 13, minHeight: 80, textAlignVertical: 'top' },
  noteText:    { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.textDim, lineHeight: 20, backgroundColor: colors.surface2, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  notePlaceholder: { fontFamily: fonts.familyRegular, fontSize: 13, color: 'rgba(64,60,55,0.5)' },

  btn:        { paddingVertical: 14, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  btnTxt:     { fontFamily: fonts.family, fontSize: 14, fontWeight: '700', color: '#fff' },
  btnSec:     { paddingVertical: 14, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  btnSecTxt:  { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },

  editBox:    { marginTop: 16, padding: 16, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, gap: 4 },
  fieldLbl:   { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 10, marginBottom: 4 },
  input:      { padding: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontFamily: fonts.familyRegular, fontSize: 14 },

  ordersCard:    { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  orderRow:      { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  orderDiv:      { borderBottomWidth: 1, borderBottomColor: 'rgba(64,60,55,0.15)' },
  orderDate:     { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  orderMethod:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  orderTotal:    { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  orderChevron:  { fontSize: 18, color: 'rgba(64,60,55,0.4)', transform: [{ rotate: '90deg' }] },
  orderChevronOpen: { transform: [{ rotate: '-90deg' }] },
  orderItems:    { backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 10 },
  orderItem:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  orderItemName: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, flex: 1 },
  orderItemPrice:{ fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
});
