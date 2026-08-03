import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Clipboard } from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { getTerms, getLoyaltyConfig } from '../db/queries';
import { colors, fonts, anim } from '../constants/theme';
import { useToast } from '../components/Toast';

function loyaltyBlurb(model, config, terms) {
  const clientWord = (terms.client || 'клиент').toLowerCase();
  if (model === 'points') {
    return {
      icon: '★',
      title: `Баллы за покупки`,
      text: config.allow_spend
        ? `${terms.client} будет получать ${config.earn_pct}% от суммы покупки баллами и сможет списывать их при следующих визитах.`
        : `${terms.client} будет получать ${config.earn_pct}% от суммы покупки баллами.`,
    };
  }
  if (model === 'discount') {
    return {
      icon: '🏷',
      title: 'Постоянная скидка',
      text: `На все покупки этого ${clientWord}а автоматически действует скидка ${config.pct}%.`,
    };
  }
  if (model === 'subscription') {
    return {
      icon: '🎟',
      title: 'Абонемент',
      text: `Каждое посещение будет списывать ${config.deduct_per_visit} ${config.deduct_per_visit === 1 ? 'визит' : 'визита'} с баланса — пополнить его можно в карточке ${clientWord}а.`,
    };
  }
  return null;
}

export default function RegResultScreen({ route, navigation }) {
  const { fio, code, clientId } = route.params || {};
  const toast = useToast();
  const [terms, setTerms] = useState({ item: 'Товар', client: 'Клиент', order: 'Заказ', category: 'Категория' });
  const [loyalty, setLoyalty] = useState(null);

  const fadeAnim  = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(anim.slideFrom))[0];

  useEffect(() => {
    try {
      setTerms(getTerms());
      const { model, config } = getLoyaltyConfig();
      setLoyalty(loyaltyBlurb(model, config, getTerms()));
    } catch (e) { console.error(e); }
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: anim.fadeDuration, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, ...anim.spring, useNativeDriver: true }),
    ]).start();
  }, []);

  const copyCode = () => {
    Clipboard.setString(code || '');
    toast.show(`ID скопирован: ${code}`, 'info');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Карта создана" onBack={() => navigation.navigate('Loyalty')} />
      <ScrollView contentContainerStyle={styles.inner}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Успех */}
          <View style={styles.successWrap}>
            <View style={styles.successCircle}>
              <Text style={styles.successIcon}>✓</Text>
            </View>
            <Text style={styles.fioText}>{fio}</Text>
            <Text style={styles.subText}>{terms.client || 'Клиент'} успешно зарегистрирован</Text>
          </View>

          {/* ID карты */}
          <Pressable style={styles.codeBox} onPress={copyCode}>
            <View style={{ flex: 1 }}>
              <Text style={styles.codeLabel}>ID {terms.client}</Text>
              <Text style={styles.codeValue}>{code}</Text>
            </View>
            <Text style={styles.copyHint}>Скопировать</Text>
          </Pressable>

          {/* Что дальше по лояльности */}
          {loyalty && (
            <View style={styles.loyaltyCard}>
              <Text style={styles.loyaltyIcon}>{loyalty.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.loyaltyTitle}>{loyalty.title}</Text>
                <Text style={styles.loyaltyText}>{loyalty.text}</Text>
              </View>
            </View>
          )}

          {/* Быстрые действия */}
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.88 }]}
            onPress={() => clientId && navigation.navigate('ClientCard', { clientId })}
          >
            <Text style={styles.primaryBtnText}>Открыть карточку {(terms.client || 'клиента').toLowerCase()}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
            onPress={() => {
              navigation.navigate('Kassa', { forClient: { id: clientId, fio, balance: 0, discount_pct: 0 } });
            }}
          >
            <Text style={styles.secondaryBtnText}>Оформить первый {(terms.order || 'заказ').toLowerCase()}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.tertiaryBtn, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate('Loyalty')}
          >
            <Text style={styles.tertiaryBtnText}>В меню лояльности</Text>
          </Pressable>

        </Animated.View>
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Loyalty" />
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 20, paddingBottom: 32, maxWidth: 480, width: '100%', alignSelf: 'center' },

  successWrap:   { alignItems: 'center', marginTop: 12, marginBottom: 24 },
  successCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(123,175,142,0.15)', borderWidth: 1, borderColor: 'rgba(123,175,142,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successIcon:   { fontSize: 28, color: colors.green, fontWeight: '800' },
  fioText:       { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 4 },
  subText:       { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center' },

  codeBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: 16, marginBottom: 14,
  },
  codeLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  codeValue: { fontFamily: fonts.family, fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: 1 },
  copyHint:  { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange },

  loyaltyCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: 'rgba(139,127,212,0.08)', borderWidth: 1, borderColor: 'rgba(139,127,212,0.25)',
    borderRadius: 14, padding: 14, marginBottom: 24,
  },
  loyaltyIcon:  { fontSize: 20, marginTop: 1 },
  loyaltyTitle: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 3 },
  loyaltyText:  { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.textDim, lineHeight: 17 },

  primaryBtn:     { backgroundColor: colors.orange, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  primaryBtnText: { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff' },

  secondaryBtn:     { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  secondaryBtnText: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text },

  tertiaryBtn:     { paddingVertical: 10, alignItems: 'center' },
  tertiaryBtnText: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
});
