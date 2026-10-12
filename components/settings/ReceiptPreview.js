import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import ModalSheet from '../ModalSheet';
import GlassButton from '../GlassButton';
import { TAX, VAT } from './bizData';
import { fonts } from '../../constants/theme';

const two = n => String(n).padStart(2, '0');
function fmtDate(d, f) {
  const dd = two(d.getDate()), mm = two(d.getMonth() + 1), yy = d.getFullYear();
  return f === 'MM/DD/YYYY' ? `${mm}/${dd}/${yy}` : f === 'YYYY-MM-DD' ? `${yy}-${mm}-${dd}` : `${dd}.${mm}.${yy}`;
}
const money = (n, cur) => `${n.toLocaleString('ru-RU', { minimumFractionDigits: n % 1 ? 2 : 0 })} ${cur || '₽'}`;
const Line = ({ l, r, bold }) => <View style={s.row}><Text style={[s.t, bold && s.b]}>{l}</Text>{r != null && <Text style={[s.t, bold && s.b]}>{r}</Text>}</View>;
const Dash = () => <View style={s.dash} />;

/** Предпросмотр чека по данным «Профиля бизнеса» и «Чека и налогов»: заголовок, адрес и контакты, ИНН, дата, позиции, итог, оплата, налоги, подвал. */
export default function ReceiptPreview({ visible, onClose, draft: d }) {
  if (!d) return null;
  const cur = d.currency || '₽', items = [['Позиция 1', 1, 250], ['Позиция 2', 2, 90]], total = items.reduce((a, [, q, p]) => a + q * p, 0), now = new Date();
  const vatPct = ({ vat0: 0, vat5: 5, vat7: 7, vat10: 10, vat20: 20 })[d.vatRate], vat = vatPct > 0 ? Math.round(total * vatPct / (100 + vatPct) * 100) / 100 : 0;
  const tax = (TAX.find(x => x[0] === d.taxSystem) || [])[1], vatName = (VAT.find(x => x[0] === d.vatRate) || [])[1];
  const place = [d.city, d.address].filter(Boolean).join(', ');
  return (
    <ModalSheet visible={visible} onClose={onClose} title="Предпросмотр чека" width="46%" maxWidth={440} scrollable={false} footer={<GlassButton tone="accent" label="Закрыть" height={50} onPress={onClose} />}>
      <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
        <View style={s.paper}>
          <Text style={s.title}>{d.receiptName || d.businessName || 'Название бизнеса'}</Text>
          {!!place && <Text style={s.c}>{place}</Text>}
          {!!d.phone && <Text style={s.c}>Тел.: {d.phone}</Text>}
          {!!d.inn && <Text style={s.c}>ИНН / ИП: {d.inn}</Text>}
          {!!d.website && <Text style={s.c}>{d.website}</Text>}
          <Dash />
          <Line l="Кассовый чек · приход" />
          <Line l="Чек № 0001" r={`${fmtDate(now, d.dateFormat)} ${two(now.getHours())}:${two(now.getMinutes())}`} />
          <Line l="Кассир: Анна" />
          <Dash />
          {items.map(([n, q, p]) => <View key={n}><Text style={s.t}>{n}</Text><Line l={`${q} × ${money(p, cur)}`} r={money(q * p, cur)} /></View>)}
          <Dash />
          <Line l="ИТОГО" r={money(total, cur)} bold />
          <Line l="Оплата: Наличные" r={money(total, cur)} />
          <Dash />
          {!!tax && <Line l="Система налогообложения" r={tax} />}
          {vatPct > 0 ? <Line l={`в т. ч. НДС ${vatPct}%`} r={money(vat, cur)} /> : d.vatRate ? <Line l="НДС" r={vatName || 'Без НДС'} /> : null}
          {!!d.receiptFooter && <Text style={[s.c, { marginTop: 12 }]}>{d.receiptFooter}</Text>}
          {!!d.email && <Text style={s.c}>{d.email}</Text>}
        </View>
        <Text style={s.note}>Номер фискального документа, фискальный признак и QR-код на чеке появятся после подключения онлайн-кассы.</Text>
      </ScrollView>
    </ModalSheet>
  );
}
const s = StyleSheet.create({
  paper: { backgroundColor: '#f3f0e8', borderRadius: 6, padding: 18 }, title: { fontFamily: fonts.family, fontSize: 18, color: '#16181c', textAlign: 'center', marginBottom: 4 },
  c: { fontFamily: fonts.familyRegular, fontSize: 12.5, color: '#4a4d54', textAlign: 'center', marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 }, t: { fontFamily: fonts.familyRegular, fontSize: 13.5, color: '#16181c' }, b: { fontFamily: fonts.familySemibold, fontSize: 15 },
  dash: { borderTopWidth: 1, borderTopColor: '#9a9a96', borderStyle: 'dashed', marginVertical: 10 },
  note: { fontFamily: fonts.familyRegular, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 17, marginTop: 12, textAlign: 'center' },
});
