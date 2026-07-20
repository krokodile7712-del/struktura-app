import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { updateClient, getClientOrders, getTerms, genitivePluralRu, getLoyaltyConfig, addSubscriptionVisits } from '../db/queries';
import { getSession } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function ClientCardScreen({ route, navigation }) {
  const { client } = route.params || {};
  const isAdmin = getSession()?.role === 'admin';

  const [editing, setEditing] = useState(false);
  const [fio, setFio]         = useState(client?.fio || '');
  const [phone, setPhone]     = useState(client?.phone || '');
  const [balance, setBalance] = useState(String(client?.balance || 0));
  const [discountPct, setDiscountPct] = useState(String(client?.discount_pct || 0));
  const [birthDate, setBirthDate] = useState(client?.birth_date || '');
  const [loyaltyModel, setLoyaltyModel] = useState('points');
  const [loyaltyConfig, setLoyaltyConfig] = useState({});
  const [subAdd, setSubAdd] = useState('');
  const [orders, setOrders]   = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [terms, setTerms] = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });

  useEffect(() => {
    if (client?.id) {
      try { setOrders(getClientOrders(client.id)); } catch (e) { console.error(e); }
    }
    try {
      setTerms(getTerms());
      const lc = getLoyaltyConfig();
      setLoyaltyModel(lc.model);
      setLoyaltyConfig(lc.config);
    } catch (e) { console.error(e); }
  }, [client]);

  if (!client) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title={terms.client} onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.text }}>{terms.client} не найден</Text>
        </View>
        <BottomBar navigation={navigation} activeTab="Loyalty" />
      </View>
    );
  }

  const avgCheck = orders.length > 0
    ? Math.round(orders.reduce((s, o) => s + o.total, 0) / orders.length)
    : 0;

  const handleSave = () => {
    try {
      updateClient(client.id, { fio: fio.trim(), phone: phone.trim(), balance: parseFloat(balance) || 0, discount_pct: parseFloat(discountPct) || 0, birth_date: birthDate.trim() });
      client.fio     = fio.trim();
      client.discount_pct = parseFloat(discountPct) || 0;
      client.birth_date = birthDate.trim();
      client.phone   = phone.trim();
      client.balance = parseFloat(balance) || 0;
      setEditing(false);
    } catch (e) { console.error(e); }
  };

  const handleNewOrder = () => {
    navigation.navigate('Kassa', { forClient: { id: client.id, fio: client.fio, code: client.code } });
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title={`Карта: ${terms.client}`}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.inner}>

        {/* Основная карточка */}
        <MetalCard>
          {!editing ? (
            <>
              <Text style={styles.fio}>{client.fio}</Text>
              <Text style={styles.code}>{client.code}</Text>
              <Text style={styles.balance}>{client.balance || 0}</Text>
              <Text style={styles.balanceLabel}>
                {loyaltyModel === 'subscription' ? 'посещений' : loyaltyModel === 'points' ? 'баллов' : ''}
              </Text>
              {loyaltyModel === 'discount' && (
                <Text style={styles.balanceLabel}>Скидка {loyaltyConfig.pct || 0}%</Text>
              )}
              {(client.discount_pct > 0) && (
                <Text style={styles.personalDiscount}>🏷 Личная скидка: {client.discount_pct}%</Text>
              )}
              {client.birth_date ? (() => {
                const today = new Date();
                const mm = String(today.getMonth()+1).padStart(2,'0');
                const dd = String(today.getDate()).padStart(2,'0');
                const isBirthday = client.birth_date.includes(`${dd}.${mm}`) || client.birth_date.includes(`-${mm}-${dd}`) || client.birth_date.startsWith(`${mm}-${dd}`);
                return (
                  <Text style={[styles.personalDiscount, isBirthday && { color: '#f5c842', fontSize: 15 }]}>
                    {isBirthday ? '🎂 Сегодня день рождения!' : `🎂 ${client.birth_date}`}
                  </Text>
                );
              })() : null}

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{client.visits || 0}</Text>
                  <Text style={styles.statLabel}>визитов</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{(client.total_sum || client.totalSum || 0).toLocaleString('ru-RU')}</Text>
                  <Text style={styles.statLabel}>сумма ₽</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{avgCheck.toLocaleString('ru-RU')}</Text>
                  <Text style={styles.statLabel}>ср. чек ₽</Text>
                </View>
              </View>

              <Text style={styles.phone}>📞 {client.phone || '—'}</Text>
              <MetalButton title={`☕ Новый ${terms.order.toLowerCase()}`} variant="success" onPress={handleNewOrder} />
              {isAdmin && loyaltyModel === 'subscription' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={subAdd}
                    onChangeText={setSubAdd}
                    keyboardType="numeric"
                    placeholder="кол-во посещений"
                    placeholderTextColor={colors.muted}
                  />
                  <MetalButton
                    title="+ Пополнить"
                    variant="default"
                    style={{ paddingHorizontal: 12 }}
                    onPress={() => {
                      const n = parseInt(subAdd) || 0;
                      if (n <= 0) return;
                      try { addSubscriptionVisits(client.id, n); client.balance = (client.balance || 0) + n; setSubAdd(''); } catch (e) { console.error(e); }
                    }}
                  />
                </View>
              )}
              {isAdmin && (
                <MetalButton title="✎ Изменить данные" variant="default" onPress={() => setEditing(true)} />
              )}
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>ФИО</Text>
              <TextInput style={styles.input} value={fio} onChangeText={setFio} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Телефон</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>{loyaltyModel === 'subscription' ? 'Посещений' : 'Баллов'}</Text>
              <TextInput style={styles.input} value={balance} onChangeText={setBalance} keyboardType="numeric" placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Индивидуальная скидка клиента, %</Text>
              <TextInput
                style={styles.input}
                value={discountPct}
                onChangeText={setDiscountPct}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.muted}
              />
              <Text style={[styles.hintText, { marginTop: -8, marginBottom: 12 }]}>
                0 — применяется глобальная скидка программы лояльности
              </Text>
              <Text style={styles.fieldLabel}>Дата рождения</Text>
              <TextInput
                style={styles.input}
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder="01.01.1990"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <MetalButton title="Сохранить" variant="success" onPress={handleSave} style={{ flex: 1 }} />
                <MetalButton title="Отмена"    variant="back"    onPress={() => setEditing(false)} style={{ flex: 1 }} />
              </View>
            </>
          )}
        </MetalCard>

        {/* История заказов */}
        <MetalCard style={{ marginTop: 12 }}>
          <Text style={styles.sectionTitle}>История {genitivePluralRu(terms.order).toLowerCase()} ({orders.length})</Text>

          {orders.length === 0 && (
            <Text style={styles.empty}>Нет {genitivePluralRu(terms.order).toLowerCase()} в базе</Text>
          )}

          {orders.map(order => (
            <Pressable key={order.id} onPress={() => setExpanded(expanded === order.id ? null : order.id)}>
              <View style={styles.orderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderDate}>{fmtDate(order.created_at)} · {fmtTime(order.created_at)}</Text>
                  <Text style={styles.orderMethod}>{order.method}</Text>
                </View>
                <Text style={styles.orderTotal}>{order.total} ₽</Text>
              </View>

              {expanded === order.id && (order.items || []).map((item, i) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={styles.itemName}>
                    {item.name}{item.size ? ` ${item.size}` : ''}
                    {item.milk && item.milk !== '' ? ` · ${item.milk}` : ''}
                    {item.syrup && item.syrup !== '' ? ` · ${item.syrup}` : ''}
                  </Text>
                  <Text style={styles.itemPrice}>{item.price} ₽</Text>
                </View>
              ))}
            </Pressable>
          ))}
        </MetalCard>

      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Loyalty" />
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  fio: { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 4 },
  code: { fontFamily: 'monospace', fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: 14 },
  balance: { fontFamily: fonts.family, fontSize: 56, fontWeight: '800', color: colors.greenLight, textAlign: 'center' },
  balanceLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textAlign: 'center', textTransform: 'uppercase', marginBottom: 16 },
  personalDiscount: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.greenLight, textAlign: 'center', marginBottom: 10 },
  hintText: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, lineHeight: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: '#07090f', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text },
  statLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, textTransform: 'uppercase', marginTop: 2 },
  phone: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 16 },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6, marginTop: 14 },
  input: { padding: 14, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, fontFamily: fonts.family, marginBottom: 4 },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 8, marginTop: 4 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: 16 },
  orderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  orderDate: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.text },
  orderMethod: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  orderTotal: { fontFamily: fonts.family, fontSize: 14, fontWeight: '800', color: colors.text },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingLeft: 12, backgroundColor: 'rgba(255,255,255,0.02)' },
  itemName: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
  itemPrice: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim },
});
