import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TopBar from '../components/TopBar';
import AppNav from '../components/AppNav';
import { getTerms, pluralizeRu, getLoyaltyConfig, getAllClients, searchClients } from '../db/queries';
import { colors, fonts } from '../constants/theme';

const MODEL_INFO = {
  points: {
    label: 'Бонусные баллы',
    desc: 'За каждую покупку клиент получает баллы. Баллы можно тратить на скидки при следующих заказах.',
    tip: 'Постоянный клиент тратит в среднем в 5 раз больше, чем новый.',
  },
  discount: {
    label: 'Скидочная карта',
    desc: 'Зарегистрированные клиенты получают автоматическую скидку на каждый заказ.',
    tip: 'Скидка стимулирует клиента возвращаться именно к вам.',
  },
  subscription: {
    label: 'Абонемент',
    desc: 'Клиенты покупают фиксированное количество посещений вперёд.',
    tip: 'Абонемент обеспечивает предсказуемую выручку.',
  },
};

export default function LoyaltyScreen({ navigation }) {
  const [terms, setTerms]           = useState({ client: 'Клиент', order: 'Заказ' });
  const [loyaltyModel, setLoyaltyModel] = useState('points');
  const [clients, setClients]       = useState([]);
  const [query, setQuery]           = useState('');

  const load = useCallback(() => {
    try {
      setTerms(getTerms());
      setLoyaltyModel(getLoyaltyConfig().model);
      setClients(getAllClients());
    } catch(e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Анимации
  const fadeAnim    = useState(new Animated.Value(0))[0];
  const slideAnim   = useState(new Animated.Value(-20))[0];
  const searchScale = useState(new Animated.Value(1))[0];
  const btnPulse    = useState(new Animated.Value(1))[0];
  const listFade    = useState(new Animated.Value(0))[0];

  // Запускаем анимацию при загрузке
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
    // Пульсация кнопки
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(btnPulse, { toValue: 1.03, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(btnPulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Анимация списка при изменении запроса
  useEffect(() => {
    listFade.setValue(0);
    Animated.timing(listFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [query, clients.length]);

  const onSearchFocus = () => {
    Animated.spring(searchScale, { toValue: 1.015, useNativeDriver: true, tension: 100, friction: 8 }).start();
  };
  const onSearchBlur = () => {
    Animated.spring(searchScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }).start();
  };

  const filtered = query.trim().length > 0 ? searchClients(query) : clients;
  const info = MODEL_INFO[loyaltyModel] || MODEL_INFO.points;

  return (
    <View style={styles.root}>
      <TopBar title={pluralizeRu(terms.client)} navigation={navigation} activeScreen="Loyalty" />

      <View style={styles.layout}>

        {/* Левая колонка — информация */}
        <View style={styles.left}>
          <Animated.View style={[styles.modelCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.modelLabel}>Модель лояльности</Text>
            <Text style={styles.modelName}>{info.label}</Text>
            <Text style={styles.modelDesc}>{info.desc}</Text>
            <View style={styles.divider} />
            <Text style={styles.modelTip}>{info.tip}</Text>
          </Animated.View>

          <Animated.View style={[styles.statRow, { opacity: fadeAnim }]}>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{clients.length}</Text>
              <Text style={styles.statLbl}>Клиентов</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>
                {clients.reduce((s, c) => s + (c.visits || 0), 0)}
              </Text>
              <Text style={styles.statLbl}>Визитов</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>
                {Math.round(clients.reduce((s, c) => s + (c.balance || 0), 0))}
              </Text>
              <Text style={styles.statLbl}>{loyaltyModel === 'subscription' ? 'Визитов выдано' : 'Баллов выдано'}</Text>
            </View>
          </Animated.View>

          {/* Кнопка регистрации */}
          <Animated.View style={{ transform: [{ scale: btnPulse }] }}>
          <Pressable
            style={({ pressed }) => [styles.regBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
            onPress={() => navigation.navigate('Reg')}
          >
            <Text style={styles.regBtnTxt}>Зарегистрировать клиента</Text>
            <Text style={styles.regBtnSub}>Новая карта лояльности</Text>
          </Pressable>
          </Animated.View>
        </View>

        {/* Правая колонка — список клиентов */}
        <View style={styles.right}>
          {/* Поиск — прилеплен к верху */}
          <Animated.View style={[styles.searchWrap, { transform: [{ scale: searchScale }] }]}>
            <TextInput
              style={styles.searchInput}
              color={colors.text}
              value={query}
              onChangeText={setQuery}
              onFocus={onSearchFocus}
              onBlur={onSearchBlur}
              placeholder="Поиск по имени, телефону или коду..."
              placeholderTextColor={colors.muted}
              clearButtonMode="while-editing"
            />
          </Animated.View>

          {/* Список */}
          <Animated.FlatList
            style={{ opacity: listFade }}
            data={filtered}
            keyExtractor={c => String(c.id)}
            contentContainerStyle={{ paddingBottom: 16 }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTxt}>
                  {query ? 'Ничего не найдено' : 'Нет клиентов'}
                </Text>
                {!query && (
                  <Text style={styles.emptyHint}>
                    Зарегистрируйте первого клиента кнопкой слева
                  </Text>
                )}
              </View>
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => {
              const rowScale = new Animated.Value(1);
              return (
              <Pressable
                style={({ pressed }) => [styles.clientRow, pressed && { backgroundColor: 'rgba(245,240,232,0.04)' }]}
                onPressIn={() => Animated.spring(rowScale, { toValue: 0.98, useNativeDriver: true, tension: 200 }).start()}
                onPressOut={() => Animated.spring(rowScale, { toValue: 1, useNativeDriver: true, tension: 200 }).start()}
                onPress={() => navigation.navigate('ClientCard', { clientId: item.id })}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarTxt}>{(item.fio || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{item.fio}</Text>
                  <Text style={styles.clientSub}>
                    {item.phone ? `${item.phone} · ` : ''}
                    {loyaltyModel === 'points' ? `${item.balance || 0} баллов` :
                     loyaltyModel === 'subscription' ? `${item.balance || 0} визитов` :
                     `скидка ${item.discount_pct || 0}%`}
                  </Text>
                </View>
                <Text style={styles.clientVisits}>{item.visits || 0} визит.</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
              );
            }}
          />
        </View>

      </View>

      <AppNav navigation={navigation} activeScreen="Loyalty" />
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.bg },
  layout:     { flex: 1, flexDirection: 'row' },

  // Левая колонка
  left:       { width: 300, padding: 20, borderRightWidth: 1, borderRightColor: colors.border, gap: 16 },

  modelCard:  { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18 },
  modelLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
  modelName:  { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 10 },
  modelDesc:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.textDim, lineHeight: 20 },
  divider:    { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  modelTip:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, lineHeight: 18, fontStyle: 'italic' },

  statRow:    { flexDirection: 'row', gap: 8 },
  statBox:    { flex: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center' },
  statVal:    { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.text },
  statLbl:    { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.8 },

  regBtn:     { backgroundColor: colors.orange, borderRadius: 14, padding: 18, alignItems: 'center' },
  regBtnTxt:  { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff' },
  regBtnSub:  { fontFamily: fonts.familyRegular, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3 },

  // Правая колонка
  right:      { flex: 1, backgroundColor: colors.bg },

  searchWrap: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput:{ backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontFamily: fonts.familyRegular, fontSize: 16, color: colors.text },

  separator:  { height: 1, backgroundColor: colors.border, marginLeft: 68 },
  clientRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  avatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:  { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.textDim },
  clientName: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },
  clientSub:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  clientVisits:{ fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  chevron:    { fontSize: 18, color: colors.border },

  emptyWrap:  { padding: 40, alignItems: 'center' },
  emptyTxt:   { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.muted },
  emptyHint:  { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8, opacity: 0.7 },
});
