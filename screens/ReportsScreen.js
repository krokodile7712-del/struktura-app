import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Modal, TextInput, Share, useWindowDimensions,
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
import { colors, fonts, spacing } from '../constants/theme';

// ─── Утилиты дат ─────────────────────────────────────────────────────────────
const todayStr  = () => new Date().toISOString().slice(0, 10);
const nDaysAgo  = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0, 10); };
const startOfMonth = () => `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`;
const startOfYear = () => `${new Date().getFullYear()}-01-01`;
const fmt = n => (n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDelta = (cur, prev) => {
  if (!prev || prev === 0) return null;
  const d = Math.round((cur - prev) / Math.abs(prev) * 100);
  return { value: d, label: `${d >= 0 ? '+' : ''}${d}%` };
};
const prevPeriod = (from, to) => {
  const f = new Date(from), t = new Date(to);
  const diff = t - f;
  const pTo = new Date(f - 1);
  const pFrom = new Date(pTo - diff);
  return { from: pFrom.toISOString().slice(0,10), to: pTo.toISOString().slice(0,10) };
};

const PRESETS = [
  { key: 'today',     label: 'Сегодня',   from: todayStr,     to: todayStr },
  { key: 'week',      label: 'Неделя',    from: startOfWeek,  to: todayStr },
  { key: 'month',     label: 'Месяц',     from: startOfMonth, to: todayStr },
  { key: 'month30',   label: '30 дней',   from: () => nDaysAgo(29), to: todayStr },
  { key: 'quarter',   label: 'Квартал',   from: () => nDaysAgo(89), to: todayStr },
  { key: 'year',      label: 'Год',       from: startOfYear,  to: todayStr },
  { key: 'custom',    label: 'Свой',      from: () => nDaysAgo(29), to: todayStr },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

// ─── Компоненты ──────────────────────────────────────────────────────────────
function SummaryBar({ pnl }) {
  if (!pnl) return null;
  return (
    <View style={styles.summaryBar}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryVal}>{fmt(pnl.revenue)} ₽</Text>
        <Text style={styles.summaryLbl}>Выручка</Text>
      </View>
      <View style={styles.summarySep} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryVal}>{pnl.orderCount}</Text>
        <Text style={styles.summaryLbl}>Заказов</Text>
      </View>
      <View style={styles.summarySep} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryVal}>{fmt(pnl.avgCheck)} ₽</Text>
        <Text style={styles.summaryLbl}>Ср. чек</Text>
      </View>
      <View style={styles.summarySep} />
      <View style={styles.summaryItem}>
        <Text style={[styles.summaryVal, { color: pnl.netProfit >= 0 ? colors.greenLight : colors.redLight }]}>
          {pnl.netProfit >= 0 ? '+' : ''}{fmt(pnl.netProfit)} ₽
        </Text>
        <Text style={styles.summaryLbl}>Прибыль</Text>
      </View>
    </View>
  );
}

function MetricRow({ label, value, sub, color, delta, tip, isLast }) {
  return (
    <View style={[styles.metricRow, !isLast && styles.menuRowDiv]}>
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
          <Text style={[styles.deltaText, { color: delta.value >= 0 ? colors.greenLight : colors.redLight }]}>
            {delta.label}
          </Text>
        )}
      </View>
    </View>
  );
}

function HeatMap({ data }) {
  if (!data || data.length === 0) {
    return <Text style={styles.emptyHint}>Нет данных за выбранный период</Text>;
  }
  const maxCount = Math.max(...data.map(d => d.count || 0), 1);
  const byHour = {};
  data.forEach(d => { byHour[d.hour] = d; });
  return (
    <View style={styles.heatMapWrap}>
      {HOURS.map(h => {
        const d = byHour[h];
        const pct = d ? (d.count / maxCount) : 0;
        const opacity = 0.1 + pct * 0.85;
        return (
          <View key={h} style={styles.heatCell}>
            <View style={[styles.heatBar, { opacity, backgroundColor: colors.greenLight }]} />
            {parseInt(h) % 3 === 0 && <Text style={styles.heatLabel}>{h}</Text>}
          </View>
        );
      })}
    </View>
  );
}

function BarChart({ data, valueKey = 'total', labelKey = 'label', color = colors.greenLight, unit = '₽' }) {
  if (!data || data.length === 0) return <Text style={styles.emptyHint}>Нет данных</Text>;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <View style={{ gap: 8 }}>
      {data.map((item, i) => {
        const val = item[valueKey] || 0;
        return (
          <View key={i} style={styles.barRow}>
            <Text style={styles.barLabel} numberOfLines={1}>{item[labelKey]}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(val / max) * 100}%`, backgroundColor: color }]} />
            </View>
            <Text style={styles.barValue}>{fmt(val)}{unit ? ' ' + unit : ''}</Text>
          </View>
        );
      })}
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

  const [pnl, setPnl]               = useState(null);
  const [pnlFull, setPnlFull]       = useState(null);
  const [metrics, setMetrics]       = useState([]);
  const [pnlPrev, setPnlPrev]       = useState(null);
  const [revenueByDay, setRevenueByDay]   = useState([]);
  const [topProducts, setTopProducts]     = useState([]);
  const [ordersByHour, setOrdersByHour]   = useState([]);
  const [byEmployee, setByEmployee]       = useState([]);
  const [payBreakdown, setPayBreakdown]   = useState([]);

  const getRange = useCallback(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo };
    const p = PRESETS.find(p => p.key === preset);
    return { from: p.from(), to: p.to() };
  }, [preset, customFrom, customTo]);

  const currentPreset = PRESETS.find(p => p.key === preset);
  const rangeLabel = preset === 'custom'
    ? `${customFrom.slice(5).replace('-', '.')} — ${customTo.slice(5).replace('-', '.')}`
    : currentPreset?.label || '';

  const load = useCallback(() => {
    const { from, to } = getRange();
    try {
      const profile = getBusinessProfile();
      const bPreset = profile?.preset || 'custom';
      const cur = getPnL(from, to);
      setPnl(cur);
      setRevenueByDay(getRevenueByDay(from, to).map(r => ({ label: r.day.slice(5).replace('-', '.'), total: Math.round(r.total) })));
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
    } catch (e) { console.error(e); }
  }, [getRange, compare]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!can('view_reports')) return (
    <View style={{ flex: 1 }}>
      <TopBar title="Отчётность" onBack={() => navigation.navigate(getHomeRoute())} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 32, marginBottom: 16 }}>🔒</Text>
        <Text style={{ fontFamily: fonts.family, fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Нет доступа</Text>
        <Text style={{ fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 }}>Обратитесь к администратору.</Text>
      </View>
    </View>
  );

  const totalPayBreakdown = payBreakdown.reduce((s, p) => s + (p.total || 0), 0);

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Отчётность"
        onBack={() => navigation.navigate(getHomeRoute())}
        rightElement={
          <Pressable
            style={styles.exportBtn}
            onPress={async () => {
              try { const d = exportAllData(); await Share.share({ message: d, title: 'Отчёт СТРУКТУРА' }); }
              catch (_) {}
            }}
          >
            <Text style={styles.exportBtnText}>↑ Экспорт</Text>
          </Pressable>
        }
      />

      {/* Сводка */}
      <SummaryBar pnl={pnl} />

      {/* Периоды */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.periodBar} contentContainerStyle={styles.periodInner}>
        {PRESETS.map(p => (
          <Pressable
            key={p.key}
            style={[styles.periodChip, preset === p.key && styles.periodChipActive]}
            onPress={() => {
              if (p.key === 'custom') setShowCustom(true);
              else setPreset(p.key);
            }}
          >
            <Text style={[styles.periodChipText, preset === p.key && styles.periodChipTextActive]}>
              {p.key === 'custom' && preset === 'custom' ? rangeLabel : p.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Табы */}
      <View style={styles.tabSection}>
        <View style={styles.tabBar}>
          {[
            { key: 'pnl',     label: 'P&L'      },
            { key: 'full',    label: 'Полный'    },
            { key: 'metrics', label: 'KPI'       },
            { key: 'charts',  label: 'Графики'   },
          ].map(t => (
            <Pressable key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}>
              <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.compareRow}>
          <Text style={styles.compareLabel}>Сравнить с предыдущим периодом</Text>
          <Toggle value={compare} onValueChange={v => setCompare(v)} size="sm" />
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">

        {/* ── P&L ── */}
        {tab === 'pnl' && pnl && (<>
          {/* Основные метрики */}
          <View style={styles.card}>
            <MetricRow label="Выручка" value={`${fmt(pnl.revenue)} ₽`}
              sub={`${pnl.orderCount} заказов · ср. чек ${fmt(pnl.avgCheck)} ₽`}
              color={colors.greenLight}
              delta={compare && pnlPrev ? fmtDelta(pnl.revenue, pnlPrev.revenue) : null}
              tip="Сумма всех оплаченных заказов за период." />
            <MetricRow label="Себестоимость" value={`${fmt(pnl.cogs)} ₽`}
              sub={pnl.revenue > 0 ? `${Math.round(pnl.cogs / pnl.revenue * 100)}% от выручки` : ''}
              delta={compare && pnlPrev ? fmtDelta(pnl.cogs, pnlPrev.cogs) : null}
              tip="Затраты на ингредиенты по техкартам." />
            <MetricRow label="Валовая прибыль" value={`${fmt(pnl.grossProfit)} ₽`}
              sub={`Маржа ${pnl.grossMarginPct}%`}
              color={pnl.grossProfit >= 0 ? colors.greenLight : colors.redLight}
              delta={compare && pnlPrev ? fmtDelta(pnl.grossProfit, pnlPrev.grossProfit) : null}
              tip="Выручка − Себестоимость. До учёта расходов." />
            <MetricRow label="Расходы" value={`${fmt(pnl.expenses)} ₽`}
              sub="Из раздела Расходы"
              delta={compare && pnlPrev ? fmtDelta(pnl.expenses, pnlPrev.expenses) : null}
              tip="Аренда, зарплата и другие записи из Расходов."
              isLast />
          </View>

          {/* Чистая прибыль */}
          <View style={[styles.card, { marginTop: 10 }]}>
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>Чистая прибыль</Text>
              <InfoTip title="Чистая прибыль" text="Выручка − Себестоимость − Расходы." />
            </View>
            <Text style={[styles.netValue, { color: pnl.netProfit >= 0 ? colors.greenLight : colors.redLight }]}>
              {pnl.netProfit >= 0 ? '+' : ''}{fmt(pnl.netProfit)} ₽
            </Text>
            <Text style={styles.netSub}>Чистая маржа: {pnl.netMarginPct}%</Text>
            {compare && pnlPrev && (
              <View style={[styles.menuRowDiv, { marginTop: 12, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between' }]}>
                <Text style={styles.compareLabel}>Предыдущий период</Text>
                <Text style={[styles.metricValue, { color: pnlPrev.netProfit >= 0 ? colors.greenLight : colors.redLight }]}>
                  {pnlPrev.netProfit >= 0 ? '+' : ''}{fmt(pnlPrev.netProfit)} ₽
                </Text>
              </View>
            )}
          </View>

          {/* Способы оплаты */}
          {payBreakdown.length > 0 && (
            <View style={[styles.card, { marginTop: 10 }]}>
              <Text style={styles.cardTitle}>Способы оплаты</Text>
              {payBreakdown.map((p, idx) => {
                const pct = totalPayBreakdown > 0 ? Math.round(p.total / totalPayBreakdown * 100) : 0;
                return (
                  <View key={idx} style={[styles.metricRow, idx < payBreakdown.length - 1 && styles.menuRowDiv]}>
                    <Text style={styles.metricLabel}>{p.pay_method || 'Другое'}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.metricValue}>{fmt(p.total)} ₽</Text>
                      <Text style={styles.deltaText}>{pct}% · {p.count} зак.</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {pnl.cogs === 0 && (
            <View style={[styles.card, { marginTop: 10 }]}>
              <Text style={styles.hintText}>💡 Себестоимость = 0. Заполните техкарты в Настройках → Меню и цены чтобы видеть реальную маржу.</Text>
            </View>
          )}
        </>)}

        {/* ── Полный P&L ── */}
        {tab === 'full' && pnlFull && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Управленческий P&L</Text>
            {[
              { label: 'Выручка',               val: pnlFull.revenue,          color: colors.greenLight },
              { label: '− Себестоимость',        val: -pnlFull.cogs,            color: colors.redLight },
              { label: '= Валовая прибыль',      val: pnlFull.grossProfit,      bold: true, color: pnlFull.grossProfit >= 0 ? colors.greenLight : colors.redLight },
              { label: '− Прямые расходы',       val: -pnlFull.expenses,        color: '#e0a040' },
              { label: '− Накладные расходы',    val: -pnlFull.overheadTotal,   color: '#e0a040' },
              { label: '− Зарплата',             val: -pnlFull.salaryTotal,     color: '#e0a040' },
              { label: '− Амортизация',          val: -pnlFull.deprTotal,       color: '#e0a040' },
              { label: '= Чистая прибыль',       val: pnlFull.fullNetProfit,    bold: true, color: pnlFull.fullNetProfit >= 0 ? colors.greenLight : colors.redLight },
            ].map((row, i, arr) => (
              <View key={i} style={[styles.metricRow, i < arr.length - 1 && styles.menuRowDiv]}>
                <Text style={[styles.metricLabel, row.bold && { fontFamily: fonts.familySemibold, color: colors.text }]}>{row.label}</Text>
                <Text style={[styles.metricValue, { color: row.color }, row.bold && { fontSize: 17 }]}>
                  {row.val >= 0 ? '+' : ''}{fmt(Math.round(row.val))} ₽
                </Text>
              </View>
            ))}
            <View style={[styles.netSummaryBox, { backgroundColor: pnlFull.fullNetProfit >= 0 ? 'rgba(61,158,146,0.08)' : 'rgba(160,16,32,0.08)' }]}>
              <Text style={[styles.netValue, { color: pnlFull.fullNetProfit >= 0 ? colors.greenLight : colors.redLight }]}>
                {pnlFull.fullNetProfit >= 0 ? '+' : ''}{fmt(pnlFull.fullNetProfit)} ₽
              </Text>
              <Text style={styles.netSub}>Полная чистая маржа: {pnlFull.fullNetMarginPct}%</Text>
            </View>
          </View>
        )}

        {/* ── KPI ── */}
        {tab === 'metrics' && (<>
          {metrics.length > 0 ? (
            <View style={styles.card}>
              {metrics.map((m, idx) => (
                <View key={m.key} style={[styles.metricRow, idx < metrics.length - 1 && styles.menuRowDiv]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.metricLabel}>{m.label}</Text>
                      {m.tip && <InfoTip title={m.label} text={m.tip} />}
                    </View>
                    {m.benchmark && <Text style={styles.metricSub}>Норма: {m.benchmark}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 8 }}>
                    <Text style={[styles.metricValue, { color: m.ok ? colors.greenLight : m.warn ? colors.redLight : colors.text }]}>{m.value}</Text>
                    {m.ok   && <Text style={{ fontFamily: fonts.familySemibold, fontSize: 11, color: colors.greenLight }}>✓</Text>}
                    {m.warn && <Text style={{ fontFamily: fonts.familySemibold, fontSize: 11, color: colors.redLight }}>⚠️</Text>}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.hintText}>🎯 Метрики появятся когда будут данные за выбранный период. Для расширенных KPI заполните техкарты, ставки сотрудников и накладные расходы.</Text>
            </View>
          )}

          {/* Эффективность сотрудников */}
          {byEmployee.length > 0 && (
            <View style={[styles.card, { marginTop: 10 }]}>
              <Text style={styles.cardTitle}>Сотрудники</Text>
              {byEmployee.map((e, idx) => (
                <View key={idx} style={[styles.metricRow, idx < byEmployee.length - 1 && styles.menuRowDiv]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metricLabel}>{e.name}</Text>
                    <Text style={styles.metricSub}>{e.orders} заказов</Text>
                  </View>
                  <Text style={styles.metricValue}>{fmt(e.revenue)} ₽</Text>
                </View>
              ))}
            </View>
          )}
        </>)}

        {/* ── Графики ── */}
        {tab === 'charts' && (<>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Выручка по дням</Text>
            <BarChart data={revenueByDay} valueKey="total" labelKey="label" color={colors.greenLight} unit="₽" />
          </View>

          <View style={[styles.card, { marginTop: 10 }]}>
            <Text style={styles.cardTitle}>Пиковые часы</Text>
            <Text style={styles.hintText}>Количество заказов по часам — видно когда наплыв</Text>
            <HeatMap data={ordersByHour} />
          </View>

          <View style={[styles.card, { marginTop: 10 }]}>
            <Text style={styles.cardTitle}>Топ товаров</Text>
            <BarChart data={topProducts} valueKey="total" labelKey="label" color="#7a9be8" unit="шт" />
          </View>
        </>)}

      </ScrollView>

      <BottomBar navigation={navigation} activeTab="Kassa" />

      {/* Модалка своего периода */}
      <Modal visible={showCustom} transparent animationType="fade" onRequestClose={() => setShowCustom(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowCustom(false)} />
          <View style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Свой период</Text>
              <Pressable onPress={() => setShowCustom(false)} hitSlop={14} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>С (ГГГГ-ММ-ДД)</Text>
            <TextInput color={colors.text} style={styles.input} value={customFrom} onChangeText={setCustomFrom} placeholder="2024-01-01" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
            <Text style={styles.fieldLabel}>По (ГГГГ-ММ-ДД)</Text>
            <TextInput color={colors.text} style={styles.input} value={customTo} onChangeText={setCustomTo} placeholder="2024-01-31" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
            <Pressable style={({ pressed }) => [styles.confirmBtn, { marginTop: 16 }, pressed && { opacity: 0.88 }]}
              onPress={() => { setPreset('custom'); setShowCustom(false); }}>
              <Text style={styles.confirmBtnText}>Применить</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 16, paddingBottom: 24 },

  // Сводка
  summaryBar: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#07080a' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal:  { fontFamily: fonts.family, fontSize: 15, fontWeight: '800', color: colors.text },
  summaryLbl:  { fontFamily: fonts.familyRegular, fontSize: 10, color: colors.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.8 },
  summarySep:  { width: 1, backgroundColor: 'rgba(74,77,84,0.3)', marginVertical: 4 },

  // Период
  periodBar:   { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  periodInner: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  periodChip:  { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.4)', backgroundColor: '#07080a' },
  periodChipActive: { borderColor: 'rgba(61,158,146,0.6)', backgroundColor: 'rgba(61,158,146,0.12)' },
  periodChipText:   { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.muted },
  periodChipTextActive: { color: colors.greenLight },

  // Табы
  tabSection: { borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBar:     { flexDirection: 'row' },
  tabBtn:     { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.greenLight },
  tabBtnText:   { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.muted },
  tabBtnTextActive: { color: colors.greenLight },
  compareRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  compareLabel: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted },

  // Карточки
  card:        { backgroundColor: '#0b0c0f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(74,77,84,0.3)', overflow: 'hidden' },
  cardTitle:   { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, padding: 14, paddingBottom: 10 },
  menuRowDiv:  { borderTopWidth: 1, borderTopColor: 'rgba(74,77,84,0.2)' },

  // Метрики
  metricRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  metricLabel: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.text },
  metricValue: { fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: colors.text },
  metricSub:   { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, marginTop: 2 },
  deltaText:   { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted },

  // Чистая прибыль
  netRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 14, paddingBottom: 4 },
  netLabel:    { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  netValue:    { fontFamily: fonts.family, fontSize: 32, fontWeight: '800', paddingHorizontal: 14 },
  netSub:      { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, paddingHorizontal: 14, paddingBottom: 14 },
  netSummaryBox: { margin: 14, marginTop: 4, padding: 14, borderRadius: 12 },

  // Тепловая карта
  heatMapWrap: { flexDirection: 'row', gap: 3, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 8 },
  heatCell:    { flex: 1, alignItems: 'center', gap: 4 },
  heatBar:     { width: '100%', height: 32, borderRadius: 4 },
  heatLabel:   { fontFamily: fonts.familyRegular, fontSize: 8, color: colors.muted },

  // Бар-чарт
  barRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8, marginBottom: 6 },
  barLabel: { fontFamily: fonts.familyRegular, fontSize: 11, color: colors.muted, width: 70, textAlign: 'right' },
  barTrack: { flex: 1, height: 16, backgroundColor: '#07080a', borderRadius: 8, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 8 },
  barValue: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.text, width: 65, textAlign: 'right' },

  hintText: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 20, padding: 14 },
  emptyHint:{ fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, textAlign: 'center', padding: 20 },

  // Экспорт
  exportBtn:     { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(61,158,146,0.4)', backgroundColor: 'rgba(61,158,146,0.08)' },
  exportBtnText: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.greenLight },

  // Модалка
  modalRoot:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalInner:    { width: '42%', maxWidth: 380, backgroundColor: '#0e0f11', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(74,77,84,0.5)' },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:    { fontFamily: fonts.family, fontSize: 17, fontWeight: '800', color: colors.text },
  modalCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(74,77,84,0.25)', alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { fontSize: 13, color: colors.text, fontFamily: fonts.familySemibold },
  fieldLabel:    { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6, marginTop: 12 },
  input:         { padding: 13, backgroundColor: '#07080a', borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 15, fontFamily: fonts.family },
  confirmBtn:    { paddingVertical: 15, borderRadius: 14, backgroundColor: 'rgba(61,158,146,0.85)', alignItems: 'center' },
  confirmBtnText:{ fontFamily: fonts.family, fontSize: 15, fontWeight: '700', color: '#fff' },
});
