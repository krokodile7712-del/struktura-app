import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet } from 'react-native';
import { Group, Row, NumField, Note } from './ui';
import ModalSheet from '../ModalSheet';
import GlassButton from '../GlassButton';
import GlassSurface from '../GlassSurface';
import Icon from '../Icon';
import { getZones, addZone, updateZone, deleteZone, addZoneTable, deleteZoneTable, bulkAddZoneTables } from '../../db/queries';
import { plural } from './nav';
import { colors, fonts } from '../../constants/theme';

const Field = ({ label, value, onChange, placeholder }) => (
  <View style={s.fl}><Text style={s.fll}>{label}</Text><TextInput style={s.fi} color={colors.text} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="rgba(255,255,255,0.25)" /></View>
);

/** «Зоны и столы»: зоны зала, у каждой столы (по одному или сразу диапазоном). Всё сохраняется сразу. */
export default function ZonesSection({ onSaved }) {
  const [zones, setZones] = useState(() => getZones() || []); const [z, setZ] = useState(null);       // { id, name }
  const [tbl, setTbl] = useState(''); const [bulk, setBulk] = useState({ prefix: 'Стол', from: 1, to: 10 });
  const reload = () => { const u = getZones() || []; setZones(u); onSaved && onSaved(); return u; };
  const cur = z?.id ? zones.find(x => x.id === z.id) : null;
  const saveName = () => {
    if (!z.name.trim()) return;
    try { if (z.id) { updateZone(z.id, z.name.trim()); reload(); } else { const id = addZone(z.name.trim()); reload(); setZ({ id, name: z.name.trim() }); } } catch (e) { console.error('[Зоны]', e); }
  };
  const addOne = () => { if (!z?.id || !tbl.trim()) return; try { addZoneTable(z.id, tbl.trim()); setTbl(''); reload(); } catch (e) { console.error(e); } };
  const addRange = () => { if (!z?.id || bulk.from > bulk.to || bulk.to - bulk.from > 99) return; try { bulkAddZoneTables(z.id, (bulk.prefix || '').trim() || 'Место', bulk.from, bulk.to); reload(); } catch (e) { console.error(e); } };
  const dropTable = id => { try { deleteZoneTable(id); reload(); } catch (e) { console.error(e); } };
  const dropZone = () => Alert.alert('Удалить зону?', `«${z.name}» и все её столы будут удалены. Прошлые продажи останутся.`, [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => { try { deleteZone(z.id); reload(); setZ(null); } catch (e) { console.error(e); } } }]);
  const rangeBad = bulk.from > bulk.to || bulk.to - bulk.from > 99;
  return (
    <>
      <Group title="Зоны">
        {zones.map(x => <Row key={x.id} title={x.name} sub={`${(x.tables || []).length} ${plural((x.tables || []).length, 'стол', 'стола', 'столов')}`} onPress={() => { setTbl(''); setZ({ id: x.id, name: x.name }); }} />)}
        <Row title="Добавить зону" onPress={() => { setTbl(''); setZ({ id: null, name: '' }); }} />
      </Group>
      {zones.length === 0 && <Note>Зон пока нет. Добавьте первую, например «Зал» или «Терраса».</Note>}

      <ModalSheet visible={!!z} onClose={() => setZ(null)} title={z?.id ? z.name : 'Новая зона'} width="70%" maxWidth={640}
        footer={<View style={s.fb}><GlassButton tone="accent" label={z?.id ? 'Сохранить название' : 'Создать зону'} height={50} disabled={!z?.name?.trim()} onPress={saveName} style={{ flex: 1 }} />{z?.id && <GlassButton label="Удалить зону" height={50} onPress={dropZone} style={{ marginLeft: 8 }} />}</View>}>
        {z && (<>
          <Field label="Название зоны" value={z.name} onChange={v => setZ(x => ({ ...x, name: v }))} placeholder="Зал" />
          {z.id ? (<>
            <Group title={`Столы: ${(cur?.tables || []).length}`}>
              <View style={s.chips}>{(cur?.tables || []).map(t => (
                <View key={t.id} style={s.chip}><GlassSurface radius={16} style={StyleSheet.absoluteFill} /><Text style={s.chipT}>{t.name}</Text><Pressable onPress={() => dropTable(t.id)} hitSlop={8}><Icon name="x" size={13} color={colors.red} /></Pressable></View>))}
                {!(cur?.tables || []).length && <Text style={s.none}>Столов пока нет.</Text>}</View>
            </Group>
            <Field label="Добавить один стол" value={tbl} onChange={setTbl} placeholder="Стол 1" />
            <GlassButton label="Добавить стол" height={44} disabled={!tbl.trim()} onPress={addOne} style={{ marginBottom: 14 }} />
            <Group title="Сразу несколько столов">
              <View style={s.rng}><Text style={s.rngT}>Название</Text><TextInput style={[s.fi, { flex: 1, marginLeft: 12 }]} color={colors.text} value={bulk.prefix} onChangeText={v => setBulk(b => ({ ...b, prefix: v }))} placeholder="Стол" placeholderTextColor="rgba(255,255,255,0.25)" /></View>
              <View style={s.rng}><Text style={s.rngT}>С номера</Text><NumField value={bulk.from} onChange={v => setBulk(b => ({ ...b, from: v }))} min={1} max={999} int /></View>
              <View style={s.rng}><Text style={s.rngT}>По номер</Text><NumField value={bulk.to} onChange={v => setBulk(b => ({ ...b, to: v }))} min={1} max={999} int /></View>
            </Group>
            {rangeBad && <Note warn>Номера заданы неверно: начало больше конца или больше 100 столов за раз.</Note>}
            <GlassButton label="Добавить столы" height={44} disabled={rangeBad} onPress={addRange} style={{ marginTop: 10 }} />
          </>) : <Note>Сначала создайте зону, затем добавьте в неё столы.</Note>}
        </>)}
      </ModalSheet>
    </>
  );
}
const s = StyleSheet.create({
  fl: { marginBottom: 12 }, fll: { fontFamily: fonts.familySemibold, fontSize: 12.5, color: colors.textDim, marginBottom: 6 }, fb: { flexDirection: 'row' },
  fi: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.familySemibold, fontSize: 15.5, color: colors.text, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14 }, chip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingHorizontal: 14, borderRadius: 16, overflow: 'hidden' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text }, none: { fontFamily: fonts.familyRegular, fontSize: 13.5, color: colors.muted },
  rng: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 }, rngT: { fontFamily: fonts.familySemibold, fontSize: 14.5, color: colors.textDim },
});
