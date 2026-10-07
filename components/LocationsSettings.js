import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import KeyboardSafe from './KeyboardSafe';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import Toggle from './Toggle';
import { useToast } from './Toast';
import { isLocationsOn } from '../db/queries';
import { emit } from '../db/events';
import {
  getStructure, setLocationsModule, addLocation, updateLocationInfo, restoreLocation, addWarehouse, renameWarehouse,
  saveWorkstation, removeWorkstation, checkRemoveLocation, removeLocation, checkRemoveWarehouse, removeWarehouse,
} from '../db/warehouses';
import { colors, fonts } from '../constants/theme';

const rub = n => Math.round(n || 0).toLocaleString('ru-RU');

// Компоненты на уровне модуля: внутри LocationsSettings они пересоздавались при каждой набранной букве — поле ввода
// «перезагружалось» и курсор сбрасывался.
const Row = ({ title, sub, badge, onPress }) => (
  <Pressable style={st.wr} onPress={onPress}><View style={{ flex: 1, minWidth: 0 }}><Text style={st.wrN} numberOfLines={1}>{title}{!!badge && <Text style={st.bd}>  {badge}</Text>}</Text><Text style={st.wrS}>{sub}</Text></View></Pressable>
);
const Fld = ({ label, value, onChange, ph, onTouch }) => <View style={st.fld}><Text style={st.fl}>{label}</Text><TextInput style={st.in} color={colors.text} value={value} onChangeText={v => { onTouch && onTouch(); onChange(v); }} placeholder={ph} placeholderTextColor="rgba(255,255,255,0.22)" /></View>;
const Win = ({ title, sub, children, foot, err, onClose }) => (
  <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardSafe style={st.ov}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={st.win}><GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={24}>
        <Text style={st.wT}>{title}</Text>{!!sub && <Text style={st.wSub}>{sub}</Text>}
        {children}{!!err && <Text style={st.err}>{err}</Text>}
        <View style={st.foot}>{foot}</View>
      </GlassSurface></View></KeyboardSafe>
  </Modal>
);

/**
 * Настройки → «Локации и склады»: включение модуля, локации со складами и рабочими местами, отключение и удаление.
 * Остатки и перемещения между складами — в разделе «Склад».
 */
export default function LocationsSettings() {
  const toast = useToast();
  const [on, setOn] = useState(false); const [tree, setTree] = useState({ active: [], disabled: [], boundId: null });
  const [win, setWin] = useState(null);   // { kind: 'enable'|'loc'|'wh'|'ws'|'rm', ... }
  const [name, setName] = useState(''); const [addr, setAddr] = useState(''); const [err, setErr] = useState(''); const [pick, setPick] = useState(null); const [me, setMe] = useState(false);
  const load = useCallback(() => { try { setOn(isLocationsOn()); setTree(getStructure()); } catch (e) { console.error(e); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, []);
  const close = () => { setWin(null); setErr(''); };
  const run = (fn, okMsg) => { try { fn(); if (okMsg) toast.show(okMsg, 'info'); close(); load(); emit('structureChanged'); } catch (e) { console.error(e); setErr(e.message || 'Не удалось сохранить'); } };

  const openLoc = (loc) => { setName(loc?.name || ''); setAddr(loc?.address || ''); setWin({ kind: 'loc', loc }); };
  const openWh = (loc, wh) => { setName(wh?.name || ''); setWin({ kind: 'wh', loc, wh }); };
  const openWs = (loc, ws) => { setName(ws?.name || `Рабочее место ${loc.workstations.length + 1}`); setPick(ws?.warehouse_id || loc.warehouses[0]?.id); setMe(ws ? tree.boundId === ws.id : !tree.boundId); setWin({ kind: 'ws', loc, ws }); };
  const openRm = (kind, obj, action) => {
    const chk = kind === 'loc' ? checkRemoveLocation(obj.id) : checkRemoveWarehouse(obj.id);
    const targets = kind === 'loc'
      ? tree.active.filter(l => l.id !== obj.id).flatMap(l => l.warehouses.map(w => ({ id: w.id, label: `${l.name} · ${w.name}` })))
      : (tree.active.find(l => l.id === obj.location_id)?.warehouses || []).filter(w => w.id !== obj.id).map(w => ({ id: w.id, label: w.name }));
    setPick(targets[0]?.id || null); setErr(''); setWin({ kind: 'rm', rk: kind, obj, action, chk, targets });
  };

  const saveLoc = () => run(() => (win.loc ? updateLocationInfo(win.loc.id, { name, address: addr }) : addLocation({ name, address: addr })), win.loc ? 'Сохранено' : 'Локация добавлена: создан склад «Основной склад»');
  const saveWh = () => run(() => (win.wh ? renameWarehouse(win.wh.id, name) : addWarehouse(win.loc.id, name)), win.wh ? 'Сохранено' : 'Склад добавлен');
  const saveWs = () => run(() => saveWorkstation({ id: win.ws?.id || null, locationId: win.loc.id, warehouseId: pick, name, bindThisDevice: me }), 'Рабочее место сохранено');
  const confirmRm = () => run(() => (win.rk === 'loc' ? removeLocation({ id: win.obj.id, action: win.action, moveToWarehouseId: pick }) : removeWarehouse({ id: win.obj.id, action: win.action, moveToWarehouseId: pick })), win.action === 'delete' ? 'Удалено' : 'Отключено');

  return (
    <View>
      <View style={st.mod}>
        <View style={{ flex: 1 }}><Text style={st.modT}>Несколько локаций</Text><Text style={st.modS}>{on ? 'У каждой локации свои склады, рабочие места, смены и выручка.' : 'Включите, если у вас несколько точек или складов. Сейчас всё считается одним складом.'}</Text></View>
        <Toggle value={on} onValueChange={v => { if (v) setWin({ kind: 'enable' }); else run(() => setLocationsModule(false), 'Модуль выключен: остатки сохранены'); }} />
      </View>

      {on && tree.active.map(loc => (
        <View key={loc.id} style={st.lb}>
          <View style={st.lh}><View style={{ flex: 1 }}><Text style={st.lN}>{loc.name}</Text>{!!loc.address && <Text style={st.lS}>{loc.address}</Text>}</View><Pressable onPress={() => openLoc(loc)} hitSlop={8}><Text style={st.link}>Изменить</Text></Pressable></View>
          <View style={st.sh}><Text style={st.shT}>Склады</Text><Pressable onPress={() => openWh(loc, null)} hitSlop={8}><Text style={st.link}>+ Склад</Text></Pressable></View>
          {loc.warehouses.map(w => <Row key={w.id} title={w.name} badge={w.is_main ? 'основной' : ''} sub={`${w.positions} позиций · ${rub(w.value)} ₽`} onPress={() => openWh(loc, w)} />)}
          <View style={st.sh}><Text style={st.shT}>Рабочие места</Text><Pressable onPress={() => openWs(loc, null)} hitSlop={8}><Text style={st.link}>+ Рабочее место</Text></Pressable></View>
          {loc.workstations.length === 0 ? <Text style={st.wrS}>Нет рабочих мест — продажи пойдут с основного склада</Text> : loc.workstations.map(z => <Row key={z.id} title={z.name} badge={tree.boundId === z.id ? 'этот планшет' : ''} sub={`списывает со склада «${z.warehouse_name}»`} onPress={() => openWs(loc, z)} />)}
        </View>
      ))}
      {on && <GlassButton icon="plus" label="Локация" height={50} onPress={() => openLoc(null)} style={{ marginBottom: 12 }} />}
      {on && tree.disabled.length > 0 && <>
        <Text style={[st.shT, { marginTop: 4, marginBottom: 8 }]}>Отключённые</Text>
        {tree.disabled.map(d => (
          <View key={d.id} style={st.dsb}><View style={{ flex: 1 }}><Text style={st.dsbN}>{d.name}</Text><Text style={st.lS}>история сохранена</Text></View><Pressable onPress={() => run(() => restoreLocation(d.id), `Локация возвращена: ${d.name}`)} hitSlop={8}><Text style={st.link}>Вернуть</Text></Pressable></View>))}
      </>}
      {on && <Text style={st.hint}>Остатки по складам и перемещение между складами — в разделе «Склад».</Text>}

      {win?.kind === 'enable' && (
        <Win err={err} onClose={close} title="Включить несколько локаций?" sub="У каждой локации будут свои склады, рабочие места, смены и выручка. Склад, который есть сейчас, не пропадёт."
          foot={<><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={close} /><GlassButton style={{ flex: 1 }} tone="accent" label="Включить" height={54} onPress={() => run(() => setLocationsModule(true), 'Модуль включён')} /></>}>
          <Text style={st.p}>Текущий склад станет складом «Основной склад» первой локации. Выключить модуль можно в любой момент: общий остаток всегда равен сумме по складам.</Text>
        </Win>)}
      {win?.kind === 'loc' && (
        <Win err={err} onClose={close} title={win.loc ? 'Редактирование локации' : 'Новая локация'} sub={win.loc ? '' : 'При создании автоматически появится склад «Основной склад» — его можно переименовать и добавить другие.'}
          foot={<><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={close} /><GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={54} disabled={!name.trim()} onPress={saveLoc} /></>}>
          <Fld onTouch={() => setErr('')} label="Название" value={name} onChange={setName} ph="Например, Точка на Лесной" /><Fld onTouch={() => setErr('')} label="Адрес" value={addr} onChange={setAddr} ph="необязательно" />
          {!!win.loc && <View style={{ flexDirection: 'row', gap: 22, marginTop: 6 }}>
            <Pressable onPress={() => openRm('loc', win.loc, 'disable')}><Text style={[st.lnk2, { color: colors.warning }]}>Отключить</Text></Pressable>
            <Pressable onPress={() => openRm('loc', win.loc, 'delete')}><Text style={st.lnk2}>Удалить…</Text></Pressable></View>}
        </Win>)}
      {win?.kind === 'wh' && (
        <Win err={err} onClose={close} title={win.wh ? 'Склад' : 'Новый склад'} sub="Склад хранит свои остатки. Позиции между складами переносятся перемещением в разделе «Склад»."
          foot={<><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={close} /><GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={54} disabled={!name.trim()} onPress={saveWh} /></>}>
          <Fld onTouch={() => setErr('')} label="Название" value={name} onChange={setName} ph="Например, Бар или Кладовая" />
          {!!win.wh && <View style={{ flexDirection: 'row', gap: 22, marginTop: 6 }}>
            <Pressable onPress={() => openRm('wh', win.wh, 'disable')}><Text style={[st.lnk2, { color: colors.warning }]}>Отключить</Text></Pressable>
            <Pressable onPress={() => openRm('wh', win.wh, 'delete')}><Text style={st.lnk2}>Удалить…</Text></Pressable></View>}
        </Win>)}
      {win?.kind === 'ws' && (
        <Win err={err} onClose={close} title="Рабочее место" sub="Планшет или касса и склад, с которого он списывает продажи"
          foot={<><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={close} /><GlassButton style={{ flex: 1 }} tone="accent" label="Сохранить" height={54} disabled={!name.trim() || !pick} onPress={saveWs} /></>}>
          <Fld onTouch={() => setErr('')} label="Название" value={name} onChange={setName} ph="Планшет 1" />
          <Text style={st.gl}>Списывает со склада</Text>
          <View style={st.chips}>{win.loc.warehouses.map(w => <Pressable key={w.id} style={[st.chip, pick === w.id && st.chipOn]} onPress={() => setPick(w.id)}><Text style={[st.chipT, pick === w.id && { color: colors.orangeLight }]}>{w.name}</Text></Pressable>)}</View>
          <Text style={st.note}>Продажи уходят только с этого склада. Не хватило — касса предупредит, а взять с другого склада можно перемещением в разделе «Склад».</Text>
          <View style={st.tg}><Text style={st.tgT}>Это рабочее место — этот планшет</Text><Toggle value={me} onValueChange={setMe} /></View>
          {!!win.ws && <Pressable onPress={() => run(() => removeWorkstation(win.ws.id), 'Рабочее место удалено')}><Text style={[st.lnk2, { marginTop: 8 }]}>Удалить рабочее место</Text></Pressable>}
        </Win>)}
      {win?.kind === 'rm' && (() => {
        const { chk, action, rk, obj, targets } = win, isL = rk === 'loc', del = action === 'delete';
        const items = [
          [!(isL ? chk.isLast : chk.isLast), isL ? (chk.isLast ? 'Единственную локацию удалить нельзя — выключите модуль' : 'Это не единственная локация') : (chk.isLast ? 'Единственный склад локации удалить нельзя' : 'Это не единственный склад локации')],
          [!(isL && chk.openShift), isL && chk.openShift ? 'Идёт смена — сначала закройте её' : 'Открытых смен нет'],
          [chk.stock.positions === 0, chk.stock.positions ? `На складе остатки: ${chk.stock.positions} поз. на ${rub(chk.stock.value)} ₽ — перенесите` : 'Остатков нет'],
          ...(isL && !chk.stock.positions ? [] : []),
          [true, del ? (isL ? `Смен ${chk.history.shifts}, заказов ${chk.history.orders}, расходов ${chk.history.expenses} останутся в отчётах как «Без локации»` : 'История продаж сохранится') : 'Смены, заказы и расходы остаются привязанными'],
          ...(!isL && chk.workstations ? [[true, `Рабочих мест на складе: ${chk.workstations} — перейдут на выбранный склад`]] : []),
        ];
        const blocked = chk.isLast || (isL && chk.openShift) || ((chk.stock.positions > 0 || (!isL && chk.workstations > 0)) && !pick);
        return (
          <Win err={err} onClose={close} title={`${del ? 'Удалить' : 'Отключить'} ${isL ? 'локацию' : 'склад'} «${obj.name}»?`} sub={del ? 'Удаление необратимо. История останется в отчётах без привязки.' : 'Скрывается из выбора. Историю и остатки можно вернуть в любой момент.'}
            foot={<><GlassButton style={{ flex: 1 }} label="Отмена" height={54} onPress={close} /><GlassButton style={{ flex: 1 }} tone={del ? 'danger' : 'neutral'} label={`${chk.stock.positions ? 'Перенести и ' : ''}${del ? 'удалить' : 'отключить'}`} height={54} disabled={blocked} onPress={confirmRm} /></>}>
            {items.map(([okk, t], i) => <View key={i} style={st.ck}><View style={[st.ckI, { backgroundColor: okk ? 'rgba(120,183,150,0.2)' : 'rgba(219,129,120,0.2)' }]}><Text style={{ color: okk ? colors.green : colors.red, fontSize: 13, fontFamily: fonts.family }}>{okk ? '✓' : '!'}</Text></View><Text style={st.ckT}>{t}</Text></View>)}
            {(chk.stock.positions > 0 || (!isL && chk.workstations > 0)) && targets.length > 0 && <>
              <Text style={st.gl}>{isL ? 'Перенести остатки в' : 'Перенести остатки и рабочие места на'}</Text>
              <View style={st.chips}>{targets.map(t => <Pressable key={t.id} style={[st.chip, pick === t.id && st.chipOn]} onPress={() => setPick(t.id)}><Text style={[st.chipT, pick === t.id && { color: colors.orangeLight }]}>{t.label}</Text></Pressable>)}</View></>}
          </Win>);
      })()}
    </View>
  );
}
const st = StyleSheet.create({
  mod: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, modT: { fontFamily: fonts.familySemibold, fontSize: 16, color: colors.text }, modS: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 19, marginRight: 12 },
  lb: { padding: 16, borderRadius: 18, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, lh: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 }, lN: { fontFamily: fonts.display, fontSize: 18, color: colors.text }, lS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  link: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orangeLight }, sh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 }, shT: { fontFamily: fonts.familySemibold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted },
  wr: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, wrN: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, wrS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 }, bd: { fontFamily: fonts.familySemibold, fontSize: 11, color: colors.orangeLight },
  dsb: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.025)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }, dsbN: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.textDim }, hint: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, lineHeight: 19, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', marginTop: 4 },
  ov: { flex: 1, backgroundColor: 'rgba(5,8,12,0.62)', alignItems: 'center', justifyContent: 'center' }, win: { width: '46%', minWidth: 500, maxWidth: 580 }, wT: { fontFamily: fonts.display, fontSize: 21, color: colors.text }, wSub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 3, marginBottom: 10, lineHeight: 19 }, foot: { flexDirection: 'row', gap: 10, marginTop: 16 },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 16, paddingHorizontal: 18, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, fl: { width: 100, fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim }, in: { flex: 1, padding: 0, fontFamily: fonts.familySemibold, fontSize: 17, color: colors.text },
  gl: { fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 12, marginBottom: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.16)', borderColor: 'rgba(157,191,230,0.6)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  note: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.warning, lineHeight: 19, padding: 12, borderRadius: 14, backgroundColor: 'rgba(217,172,98,0.07)', borderWidth: 1, borderColor: 'rgba(217,172,98,0.22)', marginTop: 10 }, p: { fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, lineHeight: 21 },
  tg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }, tgT: { fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text }, lnk2: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.red, paddingVertical: 6 }, err: { fontFamily: fonts.familyMedium, fontSize: 13, color: colors.red, marginTop: 10 },
  ck: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, ckI: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, ckT: { flex: 1, fontFamily: fonts.familyRegular, fontSize: 14, color: colors.textDim, lineHeight: 20 },
});
