import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import { colors, fonts } from '../constants/theme';
import DateTimeField from './DateTimeField';
import { useToast } from './Toast';
import {
  updateShiftHours, setShiftAdjustment, getTransferableOrders, transferOrdersToShift,
  getShiftEditLog, getShiftOrdersInfo, deleteShift,
} from '../db/queries';

const fmt = (n) => Math.round(n || 0).toLocaleString('ru-RU');
const fmtDT = (iso) => {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (_) { return iso || ''; }
};
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
const hoursBetween = (a, b) => Math.round((b - a) / 3600000 * 10) / 10;

const TABS = [
  { key: 'time',    label: 'Время' },
  { key: 'adjust',  label: 'Доплата' },
  { key: 'orders',  label: 'Заказы' },
  { key: 'history', label: 'История' },
];

// Понятная подпись строки журнала
function describeLog(l) {
  const val = (v) => (v && /^\d{4}-\d{2}-\d{2}T/.test(v) ? fmtDT(v) : (v || '—'));
  switch (l.field) {
    case 'created':             return 'Смена создана задним числом';
    case 'opened_at':           return `Время открытия: ${val(l.old_value)} → ${val(l.new_value)}`;
    case 'closed_at':           return `Время закрытия: ${val(l.old_value)} → ${val(l.new_value)}`;
    case 'orders_transferred':  return `Перенесено заказов в эту смену: ${l.new_value}`;
    case 'adjustment_amount':   return `Доплата / удержание: ${fmt(Number(l.old_value))} ₽ → ${fmt(Number(l.new_value))} ₽`;
    default:                    return l.field;
  }
}

// Раскрывается под строкой смены в детализации сотрудника. Вкладки: время открытия и
// закрытия, доплата или удержание, перенос заказов из чужих смен, история изменений;
// внизу — удаление смены. Каждое изменение пишется в журнал смены (кто, когда, причина).
//   shift    — элемент shiftBreakdown из calcEmployeeSalary
//   employee — { id, name }
//   onChanged — что-то поменялось, экран должен обновить расчёт
//   onDeleted — смена удалена, панель закрыть
export default function ShiftEditBox({ shift, employee, initialTab = 'time', onChanged, onDeleted }) {
  const toast = useToast();
  const [tab, setTab] = useState(initialTab);

  // ── Время ──
  const [opened, setOpened] = useState(new Date(shift.opened_at));
  const [closed, setClosed] = useState(shift.closed_at ? new Date(shift.closed_at) : new Date());
  const [stillOpen, setStillOpen] = useState(!shift.closed_at);
  const [reason, setReason] = useState('');

  const previewHours = stillOpen ? null : hoursBetween(opened, closed);
  const saveTime = () => {
    if (!stillOpen && closed <= opened) { Alert.alert('Проверьте время', 'Смена не может закончиться раньше, чем началась.'); return; }
    if (!stillOpen && closed > new Date()) { Alert.alert('Проверьте время', 'Время закрытия ещё не наступило.'); return; }
    const openedIso = opened.toISOString();
    const closedIso = closed.toISOString();
    const openedChanged = openedIso !== shift.opened_at;
    const closedChanged = !stillOpen && closedIso !== shift.closed_at;
    if (!openedChanged && !closedChanged) { toast.show('Ничего не изменилось'); return; }
    const doSave = () => {
      try {
        updateShiftHours(shift.id, { openedAt: openedChanged ? openedIso : undefined, closedAt: closedChanged ? closedIso : undefined, reason: reason.trim() });
        toast.show('Время смены сохранено');
        setReason('');
        onChanged?.();
      } catch (e) { console.error(e); toast.show('Не удалось сохранить', 'warn'); }
    };
    if (!stillOpen && previewHours > 24) {
      Alert.alert('Очень длинная смена', `Получается ${previewHours} ч. Всё верно?`, [{ text: 'Проверить', style: 'cancel' }, { text: 'Сохранить', onPress: doSave }]);
    } else doSave();
  };

  // ── Доплата / удержание ──
  const cur = shift.adjustmentAmount || 0;
  const [sign, setSign] = useState(cur < 0 ? -1 : 1);
  const [amountTxt, setAmountTxt] = useState(cur ? String(Math.abs(cur)) : '');
  const [adjReason, setAdjReason] = useState(shift.adjustmentReason || '');
  const saveAdjust = (clear = false) => {
    const amount = clear ? 0 : sign * (parseFloat(amountTxt.replace(',', '.')) || 0);
    if (!clear && !amount && !cur) { toast.show('Введите сумму'); return; }
    if (!clear && amount && !adjReason.trim()) { Alert.alert('Укажите причину', 'Напишите, за что доплата или удержание — это попадёт в историю.'); return; }
    try {
      setShiftAdjustment(shift.id, amount, clear ? '' : adjReason.trim());
      toast.show(amount === 0 ? 'Доплата убрана' : amount > 0 ? 'Доплата сохранена' : 'Удержание сохранено');
      if (clear) { setAmountTxt(''); setAdjReason(''); }
      onChanged?.();
    } catch (e) { console.error(e); toast.show('Не удалось сохранить', 'warn'); }
  };

  // ── Заказы из других смен ──
  const [orders, setOrders] = useState(null);       // null — ещё не загружали
  const [picked, setPicked] = useState({});         // id → true
  const loadOrders = useCallback(() => {
    try { setOrders(getTransferableOrders(shift.id)); setPicked({}); } catch (e) { console.error(e); setOrders([]); }
  }, [shift.id]);
  const openTab = (key) => {
    setTab(key);
    if (key === 'orders' && orders === null) loadOrders();
  };
  // Открыли сразу на «Заказы» (после создания смены) — загрузить список
  React.useEffect(() => { if (initialTab === 'orders') loadOrders(); }, []); // eslint-disable-line

  const pickedIds = (orders || []).filter(o => picked[o.id]).map(o => o.id);
  const pickedSum = (orders || []).filter(o => picked[o.id]).reduce((s, o) => s + o.total, 0);
  const allPicked = orders && orders.length > 0 && pickedIds.length === orders.length;
  const doTransfer = () => {
    if (!pickedIds.length) return;
    Alert.alert(
      'Перенести заказы?',
      `${pickedIds.length} шт. на ${fmt(pickedSum)} ₽ перейдут в смену сотрудника ${employee.name}. Итоги обеих смен пересчитаются, продажи будут записаны на него.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Перенести', onPress: () => {
          try {
            transferOrdersToShift(pickedIds, shift.id);
            toast.show(`Перенесено заказов: ${pickedIds.length}`);
            loadOrders();
            onChanged?.();
          } catch (e) { console.error(e); toast.show('Не удалось перенести', 'warn'); }
        } },
      ]
    );
  };

  // ── История ──
  const [log, setLog] = useState(null);
  const loadLog = () => { try { setLog(getShiftEditLog(shift.id)); } catch (e) { console.error(e); setLog([]); } };
  const openHistory = () => { setTab('history'); loadLog(); };

  // ── Удаление ──
  const askDelete = () => {
    let info = { count: 0, total: 0 };
    try { info = getShiftOrdersInfo(shift.id); } catch (_) {}
    const head = `${employee.name} · ${fmtDT(shift.opened_at)}`;
    const body = info.count > 0
      ? `${head}\n\nВ смене ${info.count} заказ(ов) на ${fmt(info.total)} ₽. Заказы останутся в продажах, но перестанут относиться к какой-либо смене. Сначала можно перенести их в другую смену.`
      : head;
    Alert.alert('Удалить смену?', body, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => {
        try { deleteShift(shift.id); toast.show('Смена удалена'); onDeleted?.(); }
        catch (e) { console.error(e); toast.show('Не удалось удалить', 'warn'); }
      } },
    ]);
  };

  return (
    <View style={styles.box}>
      <View style={styles.tabs}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabOn]}
            onPress={() => (t.key === 'history' ? openHistory() : openTab(t.key))}
          >
            <Text style={[styles.tabTxt, tab === t.key && styles.tabTxtOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'time' && (
        <View>
          <DateTimeField label="Открыта" value={opened} onChange={setOpened} />
          <DateTimeField label="Закрыта" value={closed} onChange={setClosed} disabled={stillOpen} />
          {!shift.closed_at && (
            <Pressable style={styles.checkRow} onPress={() => setStillOpen(v => !v)}>
              <View style={[styles.check, stillOpen && styles.checkOn]}>{stillOpen && <Text style={styles.checkMark}>✓</Text>}</View>
              <Text style={styles.checkTxt}>Смена ещё идёт (не закрывать)</Text>
            </Pressable>
          )}
          {previewHours !== null && <Text style={styles.preview}>Получается {previewHours} ч</Text>}
          <Text style={styles.label}>Причина правки</Text>
          <TextInput
            style={[styles.input, { minHeight: 44 }]} color={colors.text} multiline
            value={reason} onChangeText={setReason}
            placeholder="Например: забыла закрыть, ушла в 18:00" placeholderTextColor={colors.muted}
          />
          <Pressable style={styles.primary} onPress={saveTime}><Text style={styles.primaryTxt}>Сохранить время</Text></Pressable>
        </View>
      )}

      {tab === 'adjust' && (
        <View>
          <Text style={styles.hint}>Добавляется к начислению сотрудника за эту смену. Заменяет прежнюю сумму, а не суммируется с ней.</Text>
          <View style={styles.signRow}>
            <Pressable style={[styles.signBtn, sign === 1 && styles.signPlus]} onPress={() => setSign(1)}>
              <Text style={[styles.signTxt, sign === 1 && { color: colors.green }]}>＋ Доплата</Text>
            </Pressable>
            <Pressable style={[styles.signBtn, sign === -1 && styles.signMinus]} onPress={() => setSign(-1)}>
              <Text style={[styles.signTxt, sign === -1 && { color: colors.red }]}>− Удержание</Text>
            </Pressable>
          </View>
          <Text style={styles.label}>Сумма, ₽</Text>
          <TextInput
            style={styles.input} color={colors.text} keyboardType="numeric"
            value={amountTxt} onChangeText={(t) => setAmountTxt(t.replace(/[^\d.,]/g, ''))}
            placeholder="0" placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Причина</Text>
          <TextInput
            style={[styles.input, { minHeight: 44 }]} color={colors.text} multiline
            value={adjReason} onChangeText={setAdjReason}
            placeholder="Например: работала в выходной / недостача" placeholderTextColor={colors.muted}
          />
          <Pressable style={styles.primary} onPress={() => saveAdjust(false)}><Text style={styles.primaryTxt}>Сохранить</Text></Pressable>
          {!!cur && (
            <Pressable style={styles.secondary} onPress={() => saveAdjust(true)}><Text style={styles.secondaryTxt}>Убрать доплату / удержание</Text></Pressable>
          )}
        </View>
      )}

      {tab === 'orders' && (
        <View>
          <Text style={styles.hint}>
            Заказы за время этой смены, которые записаны на другие смены. Например, если весь день продавали под чужим входом.
          </Text>
          {orders === null ? null : orders.length === 0 ? (
            <Text style={styles.empty}>В это время заказов из других смен нет</Text>
          ) : (
            <View>
              <Pressable style={styles.linkRow} onPress={() => setPicked(allPicked ? {} : Object.fromEntries(orders.map(o => [o.id, true])))}>
                <Text style={styles.link}>{allPicked ? 'Снять выбор' : 'Выбрать все'}</Text>
              </Pressable>
              {orders.map(o => (
                <Pressable key={o.id} style={styles.orderRow} onPress={() => setPicked(p => ({ ...p, [o.id]: !p[o.id] }))}>
                  <View style={[styles.check, picked[o.id] && styles.checkOn]}>{picked[o.id] && <Text style={styles.checkMark}>✓</Text>}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderMain}>{fmtTime(o.created_at)} · {fmt(o.total)} ₽ · {o.method || '—'}</Text>
                    <Text style={styles.orderSub}>{o.current_shift_employee ? `сейчас в смене: ${o.current_shift_employee}` : 'не относится ни к одной смене'}</Text>
                  </View>
                </Pressable>
              ))}
              <Pressable style={[styles.primary, !pickedIds.length && { opacity: 0.4 }]} disabled={!pickedIds.length} onPress={doTransfer}>
                <Text style={styles.primaryTxt}>
                  {pickedIds.length ? `Перенести выбранные (${pickedIds.length} · ${fmt(pickedSum)} ₽)` : 'Выберите заказы'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {tab === 'history' && (
        <View>
          {log === null ? null : log.length === 0 ? (
            <Text style={styles.empty}>Изменений не было</Text>
          ) : log.map(l => (
            <View key={l.id} style={styles.logRow}>
              <Text style={styles.logMain}>{describeLog(l)}</Text>
              {!!l.reason && l.field !== 'created' && <Text style={styles.logSub}>Причина: {l.reason}</Text>}
              <Text style={styles.logSub}>{fmtDT(l.edited_at)}{l.edited_by ? ` · ${l.edited_by}` : ''}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable style={styles.del} onPress={askDelete}><Text style={styles.delTxt}>Удалить смену</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface3, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  tabOn: { borderColor: 'rgba(127,168,217,0.6)', backgroundColor: 'rgba(127,168,217,0.10)' },
  tabTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },
  tabTxtOn: { color: colors.orange },

  label: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted, marginTop: 14, marginBottom: 6 },
  hint: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 12 },
  preview: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange, marginTop: 10 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 14 },
  input: { backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 14, fontFamily: fonts.familyRegular, fontSize: 16, color: colors.text },

  primary: { marginTop: 16, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center' },
  primaryTxt: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.onAccent },
  secondary: { marginTop: 10, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  secondaryTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.muted },

  signRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  signBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  signPlus: { borderColor: 'rgba(120,183,150,0.6)', backgroundColor: 'rgba(120,183,150,0.10)' },
  signMinus: { borderColor: 'rgba(219,129,120,0.6)', backgroundColor: 'rgba(219,129,120,0.10)' },
  signTxt: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.muted },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  checkMark: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.familySemibold },
  checkTxt: { fontFamily: fonts.familyRegular, fontSize: 16, color: colors.text },

  linkRow: { marginTop: 12, marginBottom: 4 },
  link: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.orange },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  orderMain: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text },
  orderSub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },

  logRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  logMain: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, lineHeight: 20 },
  logSub: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, marginTop: 2 },

  del: { marginTop: 18, paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border },
  delTxt: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red },
});
