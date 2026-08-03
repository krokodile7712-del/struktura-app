import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Modal, Animated, Share,
} from 'react-native';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import Toggle from '../components/Toggle';
import InfoTip from '../components/InfoTip';
import { useFocusEffect } from '@react-navigation/native';
import {
  getPnL, getPnLFull, getTopProducts, getRevenueByDay,
  getBusinessMetrics, getBusinessProfile,
  getOrdersByHour, getRevenueByEmployee, getPaymentBreakdown,
  exportAllData,
} from '../db/queries';
import { getHomeRoute, can } from '../db/session';
import DatePicker from '../components/DatePicker';
import { colors, fonts } from '../constants/theme';

// ─── Утилиты ─────────────────────────────────────────────────────────────────
const todayStr    = () => new Date().toISOString().slice(0, 10);
const nDaysAgo    = n => { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0,10); };
const startOfMonth= () => `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`;
const startOfYear = () => `${new Date().getFullYear()}-01-01`;
const fmt = n => (n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const prevPeriod  = (from, to) => {
  const f = new Date(from), t = new Date(to);
  const diff = t - f;
  const pTo   = new Date(f - 1);
  const pFrom = new Date(pTo - diff);
  return { from: pFrom.toISOString().slice(0,10), to: pTo.toISOString().slice(0,10) };
};

const PRESETS = [
  { key: 'today',   label: 'Сегодня', from: todayStr,     to: todayStr },
  { key: 'week',    label: 'Неделя',  from: startOfWeek,  to: todayStr },
  { key: 'month',   label: 'Месяц',   from: startOfMonth, to: todayStr },
  { key: 'month30', label: '30 дней', from: () => nDaysAgo(29), to: todayStr },
  { key: 'quarter', label: 'Квартал', from: () => nDaysAgo(89), to: todayStr },
  { key: 'year',    label: 'Год',     from: startOfYear,  to: todayStr },
  { key: 'custom',  label: 'Свой',    from: () => nDaysAgo(29), to: todayStr },
];

const TABS = [
  { key: 'pnl',     label: 'P&L'    },
  { key: 'full',    label: 'Полный' },
  { key: 'metrics', label: 'KPI'    },
  { key: 'charts',  label: 'Графики'},
];

// ─── Компоненты ──────────────────────────────────────────────────────────────

function BarChart({ data, valueKey = 'total', labelKey = 'label', color = colors.orange, unit = '₽' }) {
  if (!data || data.length === 0) return <Text style={styles.emptyHint}>Нет данных за выбранный период</Text>;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <View style={{ paddingVertical: 8 }}>
      {data.map((d, i) => (
        <View key={i} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>{d[labelKey]}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.round((d[valueKey]||0) / max * 100)}%`, backgroundColor: color }]} />
          </View>
          <Text style={styles.barValue}>{fmt(d[valueKey])} {unit}</Text>
        </View>
      ))}
    </View>
  );
}

function HeatMap({ data }) {
  if (!data || data.length === 0) return <Text style={styles.emptyHint}>Нет данных</Text>;
  const max = Math.max(...data.map(d => d.count || 0), 1);
  return (
    <View style={styles.heatMapWrap}>
      {data.map((d, i) => {
        const opacity = 0.1 + (d.count || 0) / max * 0.9;
        return (
          <View key={i} style={styles.heatCell}>
            <View style={[styles.heatBar, { opacity, backgroundColor: colors.orange }]} />
            <Text style={styles.heatLabel}>{d.hour}</Text>
          </View>
        );
      })}
    </View>
  );
}

function MetricRow({ label, value, sub, color, delta, tip, isLast }) {
  return (
    <View style={[styles.metricRow, !isLast && styles.rowDiv]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.metricLabel}>{label}</Text>
          {tip && <InfoTip title={label} text={tip} />}
        </View>
        {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.metricValue, color && { color }]}>{value}</Text>
        {delta && (
          <Text style={[styles.deltaText, { color: delta.value >= 0 ? colors.green : colors.red }]}>
            {delta.label}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Экран ───────────────────────────────────────────────────────────────────
export default function ReportsScreen({ navigation }) {
  const [preset, setPreset]         = useState('week');
  const [customFrom, setCustomFrom] = useState(nDaysAgo(29));
  const [customTo, setCustomTo]     = useState(todayStr());
  const [showCustom, setShowCustom] = useState(false);
  const [tab, setTab]               = useState('pnl');
  const [compare, setCompare]       = useState(false);
  const [picker, setPicker]         = useState(null);

  const [pnl, setPnl]                     = useState(null);
  const [pnlFull, setPnlFull]             = useState(null);
  const [metrics, setMetrics]             = useState([]);
  const [pnlPrev, setPnlPrev]             = useState(null);
  const [revenueByDay, setRevenueByDay]   = useState([]);
  const [topProducts, setTopProducts]     = useState([]);
  const [ordersByHour, setOrdersByHour]   = useState([]);
  const [byEmployee, setByEmployee]       = useState([]);
  const [payBreakdown, setPayBreakdown]   = useState([]);

  // Анимации
  const fadeAnim  = useState(new Animated.Value(0))[0];
  const tabAnim   = useState(new Animated.Value(1))[0];
  const slideAnim = useState(new Animated.Value(16))[0];

  const getRange = useCallback(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo };
    const p = PRESETS.find(p => p.key === preset);
    return { from: p.from(), to: p.to() };
  }, [preset, customFrom, customTo]);

  const load = useCallback(() => {
    const { from, to } = getRange();
    try {
      const profile = getBusinessProfile();
      const bPreset = profile?.preset || 'custom';
      const cur = getPnL(from, to);
      setPnl(cur);
      setRevenueByDay(getRevenueByDay(from, to).map(r => ({ label: r.day.slice(5).replace('-','.'), total: Math.round(r.total) })));
      setTopProducts(getTopProducts(from, to, 8).map(r => ({ label: r.name, total: r.qty })));
      setPnlFull(getPnLFull(from, to));
      setMetrics(getBusinessMetrics(getPnLFull(from, to), bPreset));
      setOrdersByHour(getOrdersByHour(from, to));
      setByEmployee(getRevenueByEmployee(from, to));
      setPayBreakdown(getPaymentBreakdown(from, to));
      if (compare) {
        const prev = prevPeriod(from, to);
        setPnlPrev(getPnL(prev.from, prev.to));
      } else { setPnlPrev(null); }
    } catch(e) { console.error(e); }

    // Анимация появления данных
    fadeAnim.setValue(0);
    slideAnim.setValue(12);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [getRange, compare]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const switchTab = (key) => {
    Animated.timing(tabAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setTab(key);
      Animated.spring(tabAnim, { toValue: 1, tension: 80, friction: 12, useNativeDriver: true }).start();
    });
  };

  if (!can('view_reports')) return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Отчётность" onBack={() => navigation.navigate(getHomeRoute())} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Нет доступа</Text>
        <Text style={{ fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 }}>Обратитесь к администратору.</Text>
      </View>
    </View>
  );

  const totalPay = payBreakdown.reduce((s, p) => s + (p.total || 0), 0);

  const rangeLabel = preset === 'custom'
    ? `${customFrom.slice(5).replace('-','.')} — ${customTo.slice(5).replace('-','.')}`
    : PRESETS.find(p => p.key === preset)?.label || '';

  return (
    <View style={styles.root}>
      <TopBar
        title="Отчётность"
        onBack={() => navigation.navigate(getHomeRoute())}
        rightElement={
          <Pressable style={styles.exportBtn} onPress={async () => {
            try { const d = exportAllData(); await Share.share({ message: d, title: 'Отчёт СТРУКТУРА' }); } catch(_) {}
          }}>
            <Text style={styles.exportBtnTxt}>↑ Экспорт</Text>
          </Pressable>
        }
      />

      <View style={styles.layout}>

        {/* ── Левая панель ── */}
        <View style={styles.left}>
          {/* Период */}
          <Text style={styles.sectionLabel}>Период</Text>
          <View style={styles.presetList}>
            {PRESETS.map(p => (
              <Pressable
                key={p.key}
                style={({ pressed }) => [
                  styles.presetBtn,
                  preset === p.key && styles.presetBtnActive,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={() => p.key === 'custom' ? setShowCustom(true) : setPreset(p.key)}
              >
                {preset === p.key && <View style={styles.presetActiveBar} />}
                <Text style={[styles.presetTxt, preset === p.key && styles.presetTxtActive]}>
                  {p.key === 'custom' && preset === 'custom' ? rangeLabel : p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.divider} />

          {/* Ключевые цифры */}
          {pnl && (
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <Text style={styles.sectionLabel}>Итоги</Text>
              {[
                { label: 'Выручка',  value: `${fmt(pnl.revenue)} ₽`,    color: colors.text },
                { label: 'Заказов',  value: pnl.orderCount,              color: colors.text },
                { label: 'Ср. чек', value: `${fmt(pnl.avgCheck)} ₽`,   color: colors.text },
                { label: 'Прибыль',  value: `${pnl.netProfit >= 0 ? '+' : ''}${fmt(pnl.netProfit)} ₽`, color: pnl.netProfit >= 0 ? colors.green : colors.red },
              ].map((s, i) => (
                <View key={i} style={styles.statRow}>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
                </View>
              ))}

              <View style={styles.divider} />

              {/* Сравнение */}
              <View style={styles.compareRow}>
                <Text style={styles.compareTxt}>Сравнить</Text>
                <Toggle value={compare} onValueChange={v => setCompare(v)} size="sm" />
              </View>
            </Animated.View>
          )}
        </View>

        {/* ── Правая панель ── */}
        <View style={styles.right}>
          {/* Табы */}
          <View style={styles.tabBar}>
            {TABS.map(t => (
              <Pressable
                key={t.key}
                style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
                onPress={() => switchTab(t.key)}
              >
                <Text style={[styles.tabTxt, tab === t.key && styles.tabTxtActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Контент вкладки */}
          <Animated.ScrollView
            style={{ opacity: tabAnim.interpolate ? tabAnim : fadeAnim }}
            contentContainerStyle={styles.tabContent}
            showsVerticalScrollIndicator={false}
          >

            {/* P&L */}
            {tab === 'pnl' && pnl && (
              <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                <View style={styles.card}>
                  <MetricRow label="Выручка" value={`${fmt(pnl.revenue)} ₽`}
                    color={colors.orange}
                    sub={`${pnl.orderCount} заказов · ср. чек ${fmt(pnl.avgCheck)} ₽`}
                    delta={compare && pnlPrev ? { value: Math.round((pnl.revenue - pnlPrev.revenue) / Math.abs(pnlPrev.revenue || 1) * 100), label: `${pnl.revenue >= pnlPrev.revenue ? '+' : ''}${Math.round((pnl.revenue - pnlPrev.revenue) / Math.abs(pnlPrev.revenue || 1) * 100)}%` } : null}
                    tip="Сумма всех оплаченных заказов за период." />
                  <MetricRow label="Себестоимость" value={`${fmt(pnl.cogs)} ₽`}
                    sub={pnl.revenue > 0 ? `${Math.round(pnl.cogs / pnl.revenue * 100)}% от выручки` : ''}
                    tip="Затраты на ингредиенты по техкартам." />
                  <MetricRow label="Валовая прибыль" value={`${fmt(pnl.grossProfit)} ₽`}
                    color={pnl.grossProfit >= 0 ? colors.green : colors.red}
                    sub={`Маржа ${pnl.grossMarginPct}%`}
                    tip="Выручка − Себестоимость. До учёта расходов." />
                  <MetricRow label="Расходы" value={`${fmt(pnl.expenses)} ₽`}
                    sub="Из раздела Расходы"
                    tip="Аренда, зарплата и другие записи из Расходов." isLast />
                </View>

                <View style={[styles.profitCard, { borderColor: pnl.netProfit >= 0 ? 'rgba(123,175,142,0.4)' : 'rgba(217,95,95,0.4)', backgroundColor: pnl.netProfit >= 0 ? 'rgba(123,175,142,0.07)' : 'rgba(217,95,95,0.07)' }]}>
                  <Text style={styles.profitLabel}>Чистая прибыль</Text>
                  <Text style={[styles.profitVal, { color: pnl.netProfit >= 0 ? colors.green : colors.red }]}>
                    {pnl.netProfit >= 0 ? '+' : ''}{fmt(pnl.netProfit)} ₽
                  </Text>
                  <Text style={styles.profitSub}>Чистая маржа: {pnl.netMarginPct}%</Text>
                </View>

                {payBreakdown.length > 0 && (
                  <View style={[styles.card, { marginTop: 10 }]}>
                    <Text style={styles.cardTitle}>Способы оплаты</Text>
                    {payBreakdown.map((p, i) => (
                      <View key={i} style={[styles.metricRow, i < payBreakdown.length-1 && styles.rowDiv]}>
                        <Text style={styles.metricLabel}>{p.pay_method || 'Другое'}</Text>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.metricValue}>{fmt(p.total)} ₽</Text>
                          <Text style={styles.metricSub}>{totalPay > 0 ? Math.round(p.total / totalPay * 100) : 0}% · {p.count} зак.</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {pnl.cogs === 0 && (
                  <View style={styles.hintCard}>
                    <Text style={styles.hintTxt}>Себестоимость = 0. Заполните техкарты в Настройках → Меню и цены чтобы видеть реальную маржу.</Text>
                  </View>
                )}
              </Animated.View>
            )}

            {/* Полный P&L */}
            {tab === 'full' && pnlFull && (
              <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Управленческий P&L</Text>
                  {[
                    { label: 'Выручка',            val: pnlFull.revenue,         color: colors.orange },
                    { label: '− Себестоимость',     val: -pnlFull.cogs,           color: colors.red },
                    { label: '= Валовая прибыль',   val: pnlFull.grossProfit,     bold: true, color: pnlFull.grossProfit >= 0 ? colors.green : colors.red },
                    { label: '− Прямые расходы',    val: -pnlFull.expenses,       color: colors.amber },
                    { label: '− Накладные',         val: -pnlFull.overheadTotal,  color: colors.amber },
                    { label: '− Зарплата',          val: -pnlFull.salaryTotal,    color: colors.amber },
                    { label: '− Амортизация',       val: -pnlFull.deprTotal,      color: colors.amber },
                    { label: '= Чистая прибыль',    val: pnlFull.fullNetProfit,   bold: true, color: pnlFull.fullNetProfit >= 0 ? colors.green : colors.red },
                  ].map((row, i, arr) => (
                    <View key={i} style={[styles.metricRow, i < arr.length-1 && styles.rowDiv]}>
                      <Text style={[styles.metricLabel, row.bold && { fontFamily: fonts.familySemibold, color: colors.text }]}>{row.label}</Text>
                      <Text style={[styles.metricValue, { color: row.color }, row.bold && { fontSize: 17 }]}>
                        {row.val >= 0 ? '+' : ''}{fmt(Math.round(row.val))} ₽
                      </Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* KPI */}
            {tab === 'metrics' && (
              <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                {metrics.length > 0 ? (
                  <View style={styles.card}>
                    {metrics.map((m, i) => (
                      <View key={m.key} style={[styles.metricRow, i < metrics.length-1 && styles.rowDiv]}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.metricLabel}>{m.label}</Text>
                            {m.tip && <InfoTip title={m.label} text={m.tip} />}
                          </View>
                          {m.benchmark && <Text style={styles.metricSub}>Норма: {m.benchmark}</Text>}
                        </View>
                        <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 8 }}>
                          <Text style={[styles.metricValue, { color: m.ok ? colors.green : m.warn ? colors.red : colors.text }]}>{m.value}</Text>
                          {m.ok   && <Text style={{ fontSize: 11, color: colors.green }}>✓</Text>}
                          {m.warn && <Text style={{ fontSize: 11, color: colors.red }}>!</Text>}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.hintCard}>
                    <Text style={styles.hintTxt}>KPI появятся когда будут данные. Для расширенных показателей заполните техкарты, ставки сотрудников и накладные расходы.</Text>
                  </View>
                )}

                {byEmployee.length > 0 && (
                  <View style={[styles.card, { marginTop: 10 }]}>
                    <Text style={styles.cardTitle}>Эффективность сотрудников</Text>
                    {byEmployee.map((e, i) => (
                      <View key={i} style={[styles.metricRow, i < byEmployee.length-1 && styles.rowDiv]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.metricLabel}>{e.name}</Text>
                          <Text style={styles.metricSub}>{e.orders} заказов</Text>
                        </View>
                        <Text style={styles.metricValue}>{fmt(e.revenue)} ₽</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Animated.View>
            )}

            {/* Графики */}
            {tab === 'charts' && (
              <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Выручка по дням</Text>
                  <BarChart data={revenueByDay} color={colors.orange} unit="₽" />
                </View>

                <View style={[styles.card, { marginTop: 10 }]}>
                  <Text style={styles.cardTitle}>Пиковые часы</Text>
                  <Text style={styles.hintTxt}>Количество заказов по часам — видно когда наплыв клиентов</Text>
                  <HeatMap data={ordersByHour} />
                </View>

                <View style={[styles.card, { marginTop: 10 }]}>
                  <Text style={styles.cardTitle}>Топ товаров</Text>
                  <BarChart data={topProducts} color={colors.indigo} unit="шт" />
                </View>
              </Animated.View>
            )}

          </Animated.ScrollView>
        </View>
      </View>

      <BottomBar navigation={navigation} />

      <DatePicker visible={picker === 'from'} value={customFrom}
        onChange={v => { setCustomFrom(v); setPreset('custom'); setPicker(null); }}
        onClose={() => setPicker(null)} title="Начало периода" />
      <DatePicker visible={picker === 'to'} value={customTo}
        onChange={v => { setCustomTo(v); setPreset('custom'); setPicker(null); }}
        onClose={() => setPicker(null)} title="Конец периода" />

      {/* Модалка свой период */}
      <Modal visible={showCustom} transparent animationType="fade" onRequestClose={() => setShowCustom(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={{ ...StyleSheet.absoluteFillObject }} onPress={() => setShowCustom(false)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Свой период</Text>
            <Text style={styles.fieldLabel}>Начало</Text>
            <Pressable style={styles.dateBtn} onPress={() => { setShowCustom(false); setPicker('from'); }}>
              <Text style={styles.dateTxt}>{customFrom.split('-').reverse().join('.')}</Text>
              <Text style={styles.dateIcon}>📅</Text>
            </Pressable>
            <Text style={styles.fieldLabel}>Конец</Text>
            <Pressable style={styles.dateBtn} onPress={() => { setShowCustom(false); setPicker('to'); }}>
              <Text style={styles.dateTxt}>{customTo.split('-').reverse().join('.')}</Text>
              <Text style={styles.dateIcon}>📅</Text>
            </Pressable>
            <Pressable style={styles.applyBtn} onPress={() => { setPreset('custom'); setShowCustom(false); }}>
              <Text style={styles.applyTxt}>Применить</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  layout:  { flex: 1, flexDirection: 'row' },

  // Левая панель
  left:    { width: 220, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, padding: 16 },
  sectionLabel: { fontFamily: fonts.familySemibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },

  presetList:    { gap: 2 },
  presetBtn:     { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, position: 'relative' },
  presetBtnActive: { backgroundColor: 'rgba(240,160,80,0.08)' },
  presetActiveBar: { position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 3, borderRadius: 2, backgroundColor: colors.orange },
  presetTxt:     { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  presetTxtActive: { color: colors.orange },

  statRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  statLabel:{ fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },
  statVal:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },

  compareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compareTxt: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  // Правая панель
  right:   { flex: 1 },
  tabBar:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn:  { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.orange },
  tabTxt:  { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  tabTxtActive: { color: colors.orange },
  tabContent: { padding: 16, paddingBottom: 32 },

  // Карточки
  card:    { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardTitle:{ fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, padding: 14, paddingBottom: 8 },
  rowDiv:  { borderTopWidth: 1, borderTopColor: colors.border },

  metricRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  metricLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  metricValue: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: colors.text },
  metricSub:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  deltaText:   { fontFamily: fonts.familySemibold, fontSize: 11 },

  profitCard:  { borderRadius: 16, borderWidth: 1, padding: 20, marginTop: 10, alignItems: 'center' },
  profitLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  profitVal:   { fontFamily: fonts.family, fontSize: 40, fontWeight: '800', marginBottom: 4 },
  profitSub:   { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  hintCard:  { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 10 },
  hintTxt:   { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 20 },
  emptyHint: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', padding: 20 },

  // Бар-чарт
  barRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8, marginBottom: 8 },
  barLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, width: 70, textAlign: 'right' },
  barTrack: { flex: 1, height: 14, backgroundColor: colors.surface2, borderRadius: 7, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 7 },
  barValue: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.text, width: 65, textAlign: 'right' },

  // Тепловая карта
  heatMapWrap: { flexDirection: 'row', gap: 3, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  heatCell:    { flex: 1, alignItems: 'center', gap: 4 },
  heatBar:     { width: '100%', height: 28, borderRadius: 4 },
  heatLabel:   { fontFamily: fonts.familyRegular, fontSize: 8, color: colors.muted },

  // Экспорт
  exportBtn:    { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(240,160,80,0.4)', backgroundColor: 'rgba(240,160,80,0.08)' },
  exportBtnTxt: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.orange },

  // Модалка
  modalRoot:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:   { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  modalTitle: { fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 16 },
  fieldLabel: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6, marginTop: 14 },
  dateBtn:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 13 },
  dateTxt:    { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  dateIcon:   { fontSize: 16 },
  applyBtn:   { marginTop: 20, paddingVertical: 15, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center' },
  applyTxt:   { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: '#fff' },
});
