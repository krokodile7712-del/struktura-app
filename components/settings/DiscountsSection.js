import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Group, Row, SwitchRow, NumField, Sentence, Note } from './ui';
import ModalSheet from '../ModalSheet';
import GlassButton from '../GlassButton';
import Toggle from '../Toggle';
import Icon from '../Icon';
import { getDiscounts, getDiscountEligibleProducts, getDiscountIneligibleProducts, setProductDiscountEligible, getClientsWithPersonalDiscount, getClientsWithoutDiscount, setClientDiscountPct, setSetting, getLoyaltyConfig, updateLoyaltyConfig } from '../../db/queries';
import { getDiscountSettings, setProductDiscountPct, setDiscountsStackable } from '../../db/settings';
import { parseNum, rangeError } from '../../utils/num';
import { colors, fonts } from '../../constants/theme';

const rub = n => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
// Поля листов — на уровне модуля, чтобы не пересоздаваться при вводе (курсор не сбрасывался)
const Field = ({ label, value, onChange, multiline, keyboardType, error }) => (
  <View style={s.fl}><Text style={s.fll}>{label}</Text><TextInput style={[s.fi, multiline && { minHeight: 64 }, !!error && { borderColor: colors.red }]} color={colors.text} value={value} onChangeText={onChange} multiline={multiline} keyboardType={keyboardType} placeholderTextColor="rgba(255,255,255,0.25)" />{!!error && <Text style={s.fe}>{error}</Text>}</View>
);

/** «Скидки»: порядок применения, скидка на товар, ручные скидки кассира, личные скидки клиентов, ограничение. Всё сохраняется сразу. */
export default function DiscountsSection({ onSaved }) {
  const load = () => ({ list: getDiscounts() || [], eligible: getDiscountEligibleProducts() || [], inelig: getDiscountIneligibleProducts() || [], clients: getClientsWithPersonalDiscount() || [], without: getClientsWithoutDiscount() || [], ...getDiscountSettings(), maxPct: getLoyaltyConfig().config.max_discount_pct ?? 100 });
  const [d, setD] = useState(load);
  const [sheet, setSheet] = useState(null);      // 'products' | 'clients' | { edit: index } | { client }
  const [form, setForm] = useState({}); const [pick, setPick] = useState('');
  const refresh = useCallback(() => setD(load()), []);
  const saved = () => onSaved && onSaved();

  const saveList = list => { try { setSetting('discounts', JSON.stringify(list)); refresh(); saved(); } catch (e) { console.error(e); } };
  const saveMax = v => { try { const lc = getLoyaltyConfig(); updateLoyaltyConfig(lc.model, { ...lc.config, max_discount_pct: v }); setD(x => ({ ...x, maxPct: v })); saved(); } catch (e) { console.error(e); } };
  const openEdit = i => { const x = i >= 0 ? d.list[i] : { name: '', pct: '', desc: '' }; setForm({ index: i, name: x.name, pct: String(x.pct ?? '').replace('.', ','), desc: x.desc || '' }); setSheet('edit'); };
  const pctErr = rangeError(parseNum(form.pct), { gt: 0, max: 100 });
  const saveEdit = () => {
    if (!form.name.trim() || pctErr) return;
    const e = { name: form.name.trim(), pct: parseNum(form.pct), desc: (form.desc || '').trim() }, list = [...d.list];
    if (form.index < 0) list.push(e); else list[form.index] = e;
    saveList(list); setSheet(null);
  };
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= d.list.length) return; const l = [...d.list]; [l[i], l[j]] = [l[j], l[i]]; saveList(l); };
  const toggleProduct = (p, on) => { try { setProductDiscountEligible(p.id, on); refresh(); saved(); } catch (e) { console.error(e); } };
  const setClientPct = () => { if (rangeError(parseNum(form.pct), { gt: 0, max: 100 }) || !form.client) return; try { setClientDiscountPct(form.client.id, parseNum(form.pct)); refresh(); saved(); setSheet('clients'); } catch (e) { console.error(e); } };
  const dropClient = c => { try { setClientDiscountPct(c.id, 0); refresh(); saved(); } catch (e) { console.error(e); } };

  // Пример по настоящему расчёту Кассы: скидка на заказ считается от суммы позиций; при выключенном суммировании позиции со скидкой на товар в неё не входят
  const A = 1000 * (1 - d.productPct / 100), B = 1000, clientPct = 5, base = d.stackable ? A + B : B;
  const disc = Math.round(base * Math.min(clientPct, d.maxPct) / 100);

  return (
    <>
      <Group title="В каком порядке применяются скидки">
        <Row title="1. Скидка на товар" sub="процент для товаров-участников; у каждого товара участие можно выключить" />
        <Row title="2. Скидка на заказ: личная скидка клиента" sub="из карточки клиента; если её нет, действует процент модели лояльности" />
        <Row title="3. Ручная скидка кассира" sub="из списка ниже; недоступна, если у клиента уже есть личная скидка или процент лояльности" />
      </Group>

      <Group title="Скидка на товар" delay={60}>
        <Sentence>{['Общий процент', <NumField key="p" value={d.productPct} onChange={v => { setProductDiscountPct(v); setD(x => ({ ...x, productPct: v })); saved(); }} min={0} max={100} step={1} unit="%" />]}</Sentence>
        <Row title="Товаров-участников" sub="остальные в скидке на заказ не участвуют вообще" value={`${d.eligible.length} из ${d.eligible.length + d.inelig.length}`} onPress={() => setSheet('products')} />
        <SwitchRow title="Скидки суммируются" sub="выключено: позиции со скидкой на товар не получают ещё и скидку на заказ" value={d.stackable} onChange={v => { setDiscountsStackable(v); setD(x => ({ ...x, stackable: v })); saved(); }} />
      </Group>

      <Group title="Ручные скидки кассира" delay={120}>
        {d.list.map((x, i) => <Row key={i} title={x.name} sub={x.desc} value={`${x.pct}%`} onPress={() => openEdit(i)} />)}
        <Row title="Добавить скидку" onPress={() => openEdit(-1)} />
      </Group>

      <Group title="Личные скидки клиентов" delay={180}>
        <Row title="Клиентов с личной скидкой" sub="процент задаётся в карточке клиента или здесь" value={String(d.clients.length)} onPress={() => setSheet('clients')} />
      </Group>

      <Group title="Ограничение" delay={240}>
        <Sentence>{['Сумма всех скидок на заказ не больше', <NumField key="m" value={d.maxPct} onChange={saveMax} gt={0} max={100} step={5} unit="%" />]}</Sentence>
      </Group>
      <View style={s.ex}><Text style={s.exT}>{`Пример: товар А 1 000 ₽ со скидкой ${String(d.productPct).replace('.', ',')}%, товар Б 1 000 ₽, скидка клиента ${clientPct}%`}</Text>
        <Text style={s.exB}>{d.stackable ? `Суммируются: скидка на заказ ${rub(disc)} от ${rub(base)}, к оплате ${rub(A + B - disc)}` : `Не суммируются: скидка на заказ ${rub(disc)} только от товара Б, к оплате ${rub(A + B - disc)}`}</Text></View>
      <Note>Раньше скидки были разбросаны по двум вкладкам; теперь всё в одном порядке, как их применяет Касса.</Note>

      {/* Ручная скидка: добавить, изменить, удалить, сдвинуть */}
      <ModalSheet visible={sheet === 'edit'} onClose={() => setSheet(null)} title={form.index < 0 ? 'Новая скидка' : 'Скидка'} footer={<View style={s.fb}>
        <GlassButton tone="accent" label="Сохранить" height={50} disabled={!form.name?.trim() || !!pctErr} onPress={saveEdit} style={{ flex: 1 }} />
        {form.index >= 0 && <GlassButton label="Удалить" height={50} onPress={() => { saveList(d.list.filter((_, i) => i !== form.index)); setSheet(null); }} style={{ marginLeft: 8 }} />}</View>}>
        <Field label="Название" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
        <Field label="Процент" value={form.pct} onChange={v => setForm(f => ({ ...f, pct: v }))} keyboardType="decimal-pad" error={form.pct ? pctErr : ''} />
        <Field label="Описание (необязательно)" value={form.desc} onChange={v => setForm(f => ({ ...f, desc: v }))} multiline />
        {form.index >= 0 && <View style={s.mv}><Pressable style={s.mvb} onPress={() => { move(form.index, -1); setSheet(null); }}><Icon name="chevron-up" size={18} color={colors.textDim} /><Text style={s.mvt}>Выше в списке</Text></Pressable>
          <Pressable style={s.mvb} onPress={() => { move(form.index, 1); setSheet(null); }}><Icon name="chevron-down" size={18} color={colors.textDim} /><Text style={s.mvt}>Ниже в списке</Text></Pressable></View>}
      </ModalSheet>

      {/* Товары-участники скидки на товар */}
      <ModalSheet visible={sheet === 'products'} onClose={() => setSheet(null)} title="Товары-участники скидки">
        {[...d.eligible.map(p => ({ ...p, on: true })), ...d.inelig.map(p => ({ ...p, on: false }))].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru')).map(p => (
          <View key={p.id} style={s.pr}><View style={{ flex: 1 }}><Text style={s.prn}>{p.name}</Text>{!!p.category && <Text style={s.prc}>{p.category}</Text>}</View><Toggle value={p.on} onValueChange={v => toggleProduct(p, v)} size="sm" /></View>))}
        {!d.eligible.length && !d.inelig.length && <Text style={s.empty}>В каталоге пока нет товаров.</Text>}
      </ModalSheet>

      {/* Личные скидки клиентов */}
      <ModalSheet visible={sheet === 'clients'} onClose={() => setSheet(null)} title="Личные скидки клиентов" footer={<GlassButton tone="accent" label="Добавить клиенту скидку" height={50} onPress={() => { setPick(''); setSheet('pick'); }} />}>
        {d.clients.map(c => <View key={c.id} style={s.pr}><View style={{ flex: 1 }}><Text style={s.prn}>{c.fio}</Text><Text style={s.prc}>{c.phone}</Text></View><Text style={s.pv}>{c.discount_pct}%</Text><Pressable onPress={() => dropClient(c)} hitSlop={10} style={s.px}><Icon name="x" size={16} color={colors.red} /></Pressable></View>)}
        {!d.clients.length && <Text style={s.empty}>Пока ни у кого нет личной скидки.</Text>}
      </ModalSheet>
      <ModalSheet visible={sheet === 'pick'} onClose={() => setSheet('clients')} title="Кому дать скидку">
        <Field label="Поиск по имени или телефону" value={pick} onChange={setPick} />
        {d.without.filter(c => !pick || `${c.fio} ${c.phone}`.toLowerCase().includes(pick.toLowerCase())).slice(0, 40).map(c => (
          <Pressable key={c.id} style={s.pr} onPress={() => { setForm({ client: c, pct: '' }); setSheet('clientPct'); }}><View style={{ flex: 1 }}><Text style={s.prn}>{c.fio}</Text><Text style={s.prc}>{c.phone}</Text></View></Pressable>))}
      </ModalSheet>
      <ModalSheet visible={sheet === 'clientPct'} onClose={() => setSheet('pick')} title={form.client ? form.client.fio : ''} footer={<GlassButton tone="accent" label="Сохранить" height={50} disabled={!!rangeError(parseNum(form.pct), { gt: 0, max: 100 })} onPress={setClientPct} />}>
        <Field label="Процент скидки" value={form.pct} onChange={v => setForm(f => ({ ...f, pct: v }))} keyboardType="decimal-pad" error={form.pct ? rangeError(parseNum(form.pct), { gt: 0, max: 100 }) : ''} />
      </ModalSheet>
    </>
  );
}
const s = StyleSheet.create({
  fl: { marginBottom: 12 }, fll: { fontFamily: fonts.familySemibold, fontSize: 12.5, color: colors.textDim, marginBottom: 6 }, fe: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.red, marginTop: 4 },
  fi: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.familySemibold, fontSize: 15.5, color: colors.text, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  fb: { flexDirection: 'row' }, mv: { flexDirection: 'row', gap: 8, marginTop: 4 }, mvb: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, mvt: { fontFamily: fonts.familySemibold, fontSize: 13.5, color: colors.textDim },
  pr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }, prn: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, prc: { fontFamily: fonts.familyRegular, fontSize: 12.5, color: colors.muted, marginTop: 2 }, pv: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.textDim, marginHorizontal: 10 }, px: { padding: 6 },
  empty: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.muted, paddingVertical: 16 },
  ex: { marginTop: 14, padding: 16, borderRadius: 18, backgroundColor: 'rgba(127,168,217,0.08)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.22)' }, exT: { fontFamily: fonts.familySemibold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted, marginBottom: 6 }, exB: { fontFamily: fonts.familyRegular, fontSize: 14.5, color: colors.textDim, lineHeight: 21 },
});
