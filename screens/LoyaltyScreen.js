import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import Hint from '../components/Hint';
import BottomBar from '../components/BottomBar';
import { getTerms, pluralizeRu, getLoyaltyConfig } from '../db/queries';
import { colors, fonts, spacing } from '../constants/theme';

export default function LoyaltyScreen({ navigation }) {
  const [terms, setTerms] = useState({ client: 'Клиент', order: 'Заказ' });
  const [loyaltyModel, setLoyaltyModel] = useState('points');

  useEffect(() => {
    try {
      setTerms(getTerms());
      const lc = getLoyaltyConfig();
      setLoyaltyModel(lc.model);
    } catch (e) { console.error(e); }
  }, []);

  const modelDesc = {
    points: 'За каждую покупку клиент получает баллы, которые можно тратить на скидки.',
    discount: 'Зарегистрированные клиенты получают автоматическую скидку на каждый заказ.',
    subscription: 'Клиенты покупают абонементы — фиксированное количество посещений вперёд.',
  }[loyaltyModel] || '';

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Программа лояльности" />
      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>

        <MetalCard style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Зачем это нужно?</Text>
          <Text style={styles.sectionText}>
            Программа лояльности помогает удерживать клиентов и мотивировать их возвращаться снова. Исследования показывают: постоянный клиент тратит в среднем в 5 раз больше, чем новый.
          </Text>
          {modelDesc ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Ваша модель</Text>
              <Text style={styles.sectionText}>{modelDesc}</Text>
            </>
          ) : null}
        </MetalCard>

        <MetalCard>
          <MetalButton
            title={`👤 Зарегистрировать нового ${terms.client.toLowerCase()}`}
            variant="default"
            onPress={() => navigation.navigate('Reg')}
          />
          <Hint>Создайте карту для нового клиента — имя, телефон, и система автоматически начнёт накапливать историю.</Hint>

          <MetalButton
            title={`🔍 Найти ${terms.client.toLowerCase()} по имени или коду`}
            variant="default"
            onPress={() => navigation.navigate('Search')}
          />
          <Hint>Быстрый поиск перед оформлением заказа, чтобы привязать покупку к клиенту.</Hint>

          <MetalButton
            title={`👥 Все ${pluralizeRu(terms.client).toLowerCase()}`}
            variant="default"
            onPress={() => navigation.navigate('ClientsList')}
          />
          <Hint>Список всех клиентов с историей покупок и накопленными баллами.</Hint>
        </MetalCard>

      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Loyalty" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  sectionTitle: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 6 },
  sectionText: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 20 },
});
