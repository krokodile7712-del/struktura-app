import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { updateClient } from '../db/queries';
import { getSession } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';

export default function ClientCardScreen({ route, navigation }) {
  const { client } = route.params || {};
  const user = getSession();
  const isAdmin = user?.role === 'admin';

  const [editing, setEditing] = useState(false);
  const [fio, setFio] = useState(client?.fio || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [balance, setBalance] = useState(String(client?.balance || 0));

  if (!client) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Клиент" onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.text }}>Клиент не найден</Text>
        </View>
        <BottomBar navigation={navigation} activeTab="Loyalty" />
      </View>
    );
  }

  const handleSave = () => {
    try {
      updateClient(client.id, { fio: fio.trim(), phone: phone.trim(), balance: parseFloat(balance) || 0 });
      client.fio = fio.trim();
      client.phone = phone.trim();
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
        title="Карта клиента"
        onBack={() => navigation.goBack()}
        rightElement={
          isAdmin && !editing ? (
            <Text style={styles.editLink} onPress={() => setEditing(true)}>✎ Изменить</Text>
          ) : null
        }
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        <MetalCard>
          {!editing ? (
            <>
              <Text style={styles.fio}>{client.fio}</Text>
              <Text style={styles.code}>{client.code}</Text>
              <Text style={styles.balance}>{client.balance}</Text>
              <Text style={styles.balanceLabel}>баллов</Text>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{client.visits || 0}</Text>
                  <Text style={styles.statLabel}>визитов</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{client.totalSum || 0}</Text>
                  <Text style={styles.statLabel}>сумма ₽</Text>
                </View>
              </View>

              <Text style={styles.phone}>📞 {client.phone || '—'}</Text>
              <MetalButton title="☕ Новый заказ" variant="success" onPress={handleNewOrder} />
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>ФИО</Text>
              <TextInput style={styles.input} value={fio} onChangeText={setFio} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Телефон</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholderTextColor={colors.muted} />
              <Text style={styles.fieldLabel}>Баллы</Text>
              <TextInput style={styles.input} value={balance} onChangeText={setBalance} keyboardType="numeric" placeholderTextColor={colors.muted} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <MetalButton title="Сохранить" variant="success" onPress={handleSave} style={{ flex: 1 }} />
                <MetalButton title="Отмена" variant="back" onPress={() => setEditing(false)} style={{ flex: 1 }} />
              </View>
            </>
          )}
        </MetalCard>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Loyalty" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  editLink: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.greenLight },
  fio: { fontFamily: fonts.family, fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 4 },
  code: { fontFamily: 'monospace', fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: 14 },
  balance: { fontFamily: fonts.family, fontSize: 56, fontWeight: '800', color: colors.greenLight, textAlign: 'center' },
  balanceLabel: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted, textAlign: 'center', textTransform: 'uppercase', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: '#07090f', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text },
  statLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, textTransform: 'uppercase', marginTop: 2 },
  phone: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 16 },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  input: { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 14, fontFamily: fonts.familyRegular },
});
