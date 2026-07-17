import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import MetalCard from '../components/MetalCard';
import MetalButton from '../components/MetalButton';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import InfoTip from '../components/InfoTip';
import { getPnL, getRevenueByDay, getTopProducts } from '../db/queries';
import { getHomeRoute } from '../db/session';
import { colors, fonts, spacing } from '../constants/theme';
import { useFocusEffect } from '@react-navigation/native';

function todayStr() { return new Date().toISOString().slice(0,10); }
function nDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0,10);
}
function fmt(n) { return (n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtPct(n) { return `${n >= 0 ? '+' : ''}${n}%`; }

const PERIODS = [
  { key: 'day',   label: 'Сегодня',   from: () => todayStr(),   to: () => todayStr() },
  { key: 'week',  label: '7 дней',    from: () => nDaysAgo(6),  to: () => todayStr() },
  { key: 'month', label: '30 дней',   from: () => nDaysAgo(29), to: () => todayStr() },
];

// Простой горизонтальный бар-чарт на View
function BarChart({ data, valueKey = 'total', labelKey = 'label', color = colors.greenLight, unit = '₽' }) {
  if (!data || data.length === 0) return <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 20 }}>Нет данных за выбранный период</Text>;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const screenW = Dimensions.get('window').width;
  const barAreaW = Math.min(screenW * 0.5, 380);

  return (
    <View>
      {data.map((item, i) => {
        const val = item[valueKey] || 0;
        const pct = max > 0 ? (val / max) : 0;
        return (
          <View key={i} style={styles.barRow}>
            <Text style={styles.barLabel} numberOfLines={1}>{item[labelKey]}</Text>
            <View style={[styles.barTrack, { width: barAreaW }]}>
              <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
            </View>
            <Text style={styles.barValue}>{fmt(val)}{unit ? ' ' + unit : ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

// Карточка метрики
function MetricCard({ label, value, sub, color: col, tip }) {
  return (
    <View style={styles.metricCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.metricLabel}>{label}</Text>
        {tip && <InfoTip title={tip.title} text={tip.text} />}
      </View>
      <Text style={[styles.metricValue, col && { color: col }]}>{value}</Text>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  );
}

export default function ReportsScreen({ navigation }) {
  const [period, setPeriod]   = useState('week');
  const [tab, setTab]         = useState('pnl'); // 'pnl' | 'charts'
  const [pnl, setPnl]         = useState(null);
  const [revenueByDay, setRevenueByDay] = useState([]);
  const [topProducts, setTopProducts]   = useState([]);

  const load = useCallback(() => {
    const p = PERIODS.find(p => p.key === period);
    if (!p) return;
    const from = p.from();
    const to   = p.to();
    try {
      setPnl(getPnL(from, to));
      setRevenueByDay(getRevenueByDay(from, to).map(r => ({
        label: r.day.slice(5).replace('-', '.'), // MM.DD
        total: Math.round(r.total),
        orders: r.orders,
      })));
      setTopProducts(getTopProducts(from, to, 8).map(r => ({
        label: r.name,
        total: r.qty,
        revenue: Math.round(r.revenue),
      })));
    } catch (e) { console.error(e); }
  }, [period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Отчётность" onBack={() => navigation.navigate(getHomeRoute())} />

      {/* Период */}
      <View style={styles.periodBar}>
        {PERIODS.map(p => (
          <Pressable key={p.key} style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => setPeriod(p.key)}>
            <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Вкладки */}
      <View style={styles.tabBar}>
        <Pressable style={[styles.tabBtn, tab === 'pnl' && styles.tabBtnActive]} onPress={() => setTab('pnl')}>
          <Text style={[styles.tabBtnText, tab === 'pnl' && styles.tabBtnTextActive]}>📊 P&L</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === 'charts' && styles.tabBtnActive]} onPress={() => setTab('charts')}>
          <Text style={[styles.tabBtnText, tab === 'charts' && styles.tabBtnTextActive]}>📈 Графики</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={styles.inner}>
        {tab === 'pnl' && pnl && (<>
          {/* Ключевые метрики */}
          <View style={styles.metricsGrid}>
            <MetricCard label="Выручка" value={`${fmt(pnl.revenue)} ₽`}
              sub={`${pnl.orderCount} заказов · ср. чек ${fmt(pnl.avgCheck)} ₽`}
              color={colors.greenLight}
              tip={{ title: 'Выручка', text: 'Общая сумма всех оплаченных заказов за период (без возвратов).' }} />
            <MetricCard label="Себестоимость (COGS)" value={`${fmt(pnl.cogs)} ₽`}
              sub={pnl.revenue > 0 ? `${Math.round(pnl.cogs/pnl.revenue*100)}% от выручки` : ''}
              tip={{ title: 'Себестоимость (COGS)', text: 'Сумма затрат на ингредиенты по техкартам для всех проданных товаров. Если техкарты не заполнены — показывает 0.' }} />
            <MetricCard label="Валовая прибыль" value={`${fmt(pnl.grossProfit)} ₽`}
              sub={`Маржа ${pnl.grossMarginPct}%`}
              color={pnl.grossProfit >= 0 ? colors.greenLight : colors.redLight}
              tip={{ title: 'Валовая прибыль', text: 'Выручка минус себестоимость. Показывает сколько остаётся до учёта постоянных расходов (аренда, зарплата). Цель: >60%.' }} />
            <MetricCard label="Расходы" value={`${fmt(pnl.expenses)} ₽`}
              sub="из раздела Расходы"
              tip={{ title: 'Расходы', text: 'Сумма всех записей из раздела «Расходы» за выбранный период: аренда, коммунальные, зарплата и т.д.' }} />
          </View>

          {/* Чистая прибыль — отдельная большая карточка */}
          <MetalCard style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.netLabel}>Чистая прибыль</Text>
              <InfoTip title="Чистая прибыль" text="Выручка − Себестоимость − Расходы. Это то, что реально осталось у вас после всех затрат. Если отрицательная — бизнес работает в убыток." />
            </View>
            <Text style={[styles.netValue, { color: pnl.netProfit >= 0 ? colors.greenLight : colors.redLight }]}>
              {pnl.netProfit >= 0 ? '+' : ''}{fmt(pnl.netProfit)} ₽
            </Text>
            <Text style={styles.netSub}>Чистая маржа: {pnl.netMarginPct}%</Text>

            {/* Визуальная декомпозиция */}
            {pnl.revenue > 0 && (
              <View style={{ marginTop: 16, gap: 6 }}>
                {[
                  { label: 'Выручка',        val: pnl.revenue,      color: colors.greenLight },
                  { label: '− Себест.',       val: -pnl.cogs,        color: colors.redLight },
                  { label: '− Расходы',       val: -pnl.expenses,    color: '#e0a040' },
                  { label: '= Прибыль',       val: pnl.netProfit,    color: pnl.netProfit >= 0 ? colors.greenLight : colors.redLight, bold: true },
                ].map((row, i) => (
                  <View key={i} style={styles.waterfallRow}>
                    <Text style={[styles.waterfallLabel, row.bold && { fontFamily: fonts.familySemibold }]}>{row.label}</Text>
                    <Text style={[styles.waterfallVal, { color: row.color }, row.bold && { fontFamily: fonts.familySemibold }]}>
                      {row.val >= 0 ? '+' : ''}{fmt(row.val)} ₽
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </MetalCard>

          {pnl.cogs === 0 && (
            <MetalCard style={{ marginTop: 12 }}>
              <Text style={styles.hintCard}>
                💡 Себестоимость показывает 0 — заполните техкарты в Настройках → Меню и цены → карточка товара, чтобы видеть реальную маржу.
              </Text>
            </MetalCard>
          )}
        </>)}

        {tab === 'charts' && (<>
          <MetalCard>
            <Text style={styles.chartTitle}>Выручка по дням</Text>
            <BarChart data={revenueByDay} valueKey="total" labelKey="label" color={colors.greenLight} unit="₽" />
          </MetalCard>

          <MetalCard style={{ marginTop: 12 }}>
            <Text style={styles.chartTitle}>Топ товаров по количеству</Text>
            <BarChart data={topProducts} valueKey="total" labelKey="label" color="#7a9be8" unit="шт" />
          </MetalCard>
        </>)}
      </ScrollView>
      <BottomBar navigation={navigation} activeTab="Kassa" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: spacing.lg, paddingBottom: 20, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  periodBar: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  periodBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  periodBtnActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.15)' },
  periodBtnText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  periodBtnTextActive: { color: colors.greenLight },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.greenLight },
  tabBtnText: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  tabBtnTextActive: { color: colors.greenLight },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flex: 1, minWidth: 180, padding: 14, backgroundColor: '#0b0c0f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.35)' },
  metricLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  metricValue: { fontFamily: fonts.family, fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 6 },
  metricSub: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 4 },
  netLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  netValue: { fontFamily: fonts.family, fontSize: 32, fontWeight: '800', marginTop: 6 },
  netSub: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 4 },
  waterfallRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(74,77,84,0.2)' },
  waterfallLabel: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted },
  waterfallVal: { fontFamily: fonts.familyRegular, fontSize: 13 },
  hintCard: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 20 },
  chartTitle: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text, marginBottom: 14 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  barLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, width: 60, textAlign: 'right' },
  barTrack: { height: 18, backgroundColor: '#07080a', borderRadius: 9, overflow: 'hidden', flex: 1 },
  barFill: { height: '100%', borderRadius: 9 },
  barValue: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.text, width: 70, textAlign: 'right' },
});
