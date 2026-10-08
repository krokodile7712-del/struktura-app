import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, Image, Share, Alert, StyleSheet, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import GlassSurface from './GlassSurface';
import GlassButton from './GlassButton';
import Toggle from './Toggle';
import KeyboardSafe from './KeyboardSafe';
import { useToast } from './Toast';
import { copyText } from '../utils/clipboard';
import { REGISTER_HTML, BOOKING_HTML } from '../assets/pages/pages';
import {
  ACCENTS, ROUTE_ICONS, getClientPages, saveClientPages, getMenuProducts, setMenuVisible, setAllMenuVisible, previewConfig, getPublishState, getPageLinks, publishClientPages,
} from '../db/clientPages';
import { getBookingServices, getBookingStaff } from '../db/bookings';
import { getBusinessProfile } from '../db/queries';
import { colors, fonts } from '../constants/theme';

const SWATCH = { platinum: ['#ffffff', '#8fb3e0'], gold: ['#f7e9bd', '#a87a3a'], emerald: ['#e2fff3', '#2a9d7a'], rose: ['#fff0f4', '#b9547a'], graphite: ['#f4f4f4', '#808080'] };
const ICON_GLYPH = { door: '▯', lift: '⇅', stairs: '⌐', walk: '♟', pin: '⌖', bus: '▤', park: 'P', cafe: '☕' };
const STAGES = { reg: [['Главная', 1], ['Форма', 2], ['Карта', 3], ['Меню', 4], ['Путь', 5]], book: [['Старт', 0], ['Услуга', 1], ['Время', 2], ['Контакты', 3], ['Готово', 4], ['Путь', 5]] };
const when = iso => { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} в ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch (_) { return ''; } };

// Всё ниже — на уровне модуля: описанные внутри компонента, они пересоздавались бы при каждой букве и сбрасывали курсор
const Card = ({ title, right, onRight, children }) => (
  <View style={st.card}><View style={st.cardH}><Text style={st.cardT}>{title}</Text>{!!right && <Pressable onPress={onRight} hitSlop={8}><Text style={st.cardR}>{right}</Text></Pressable>}</View>{children}</View>
);
const Fld = ({ label, value, onChange, placeholder, multiline, keyboardType }) => (
  <View style={[st.fld, multiline && { paddingVertical: 8 }]}><Text style={st.fl}>{label}</Text>
    <TextInput style={[st.in, multiline && { minHeight: 44 }]} color={colors.text} value={value == null ? '' : String(value)} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="rgba(255,255,255,0.25)" multiline={multiline} keyboardType={keyboardType} /></View>
);
const Sw = ({ label, sub, value, onChange }) => (
  <View style={st.sw}><View style={{ flex: 1, paddingRight: 12 }}><Text style={st.swT}>{label}</Text>{!!sub && <Text style={st.swS}>{sub}</Text>}</View><Toggle value={!!value} onValueChange={onChange} /></View>
);
const Chips = ({ items, value, onChange }) => (
  <View style={st.chips}>{items.map(([k, t]) => <Pressable key={String(k)} style={[st.chip, value === k && st.chipOn]} onPress={() => onChange(k)}><Text style={[st.chipT, value === k && { color: colors.orangeLight }]}>{t}</Text></Pressable>)}</View>
);

function LinkQr({ visible, link, title, onClose }) {
  const toast = useToast();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.ov}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.win, { maxWidth: 420 }]}><GlassSurface radius={26} tint="32,40,55" alpha={0.985} floating padding={22}>
          <Text style={st.title}>{title}</Text>
          {link ? <>
            <View style={st.qr}><Image source={{ uri: `https://quickchart.io/qr?text=${encodeURIComponent(link)}&size=300&margin=1` }} style={{ width: 220, height: 220 }} /></View>
            <Text style={st.link} numberOfLines={3}>{link}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <GlassButton style={{ flex: 1 }} label="Скопировать" height={46} onPress={() => copyText(link).then(ok => toast.show(ok ? 'Ссылка скопирована' : 'Не удалось скопировать', ok ? 'info' : 'warn'))} />
              <GlassButton style={{ flex: 1 }} label="Поделиться" height={46} onPress={() => Share.share({ message: link, url: link }).catch(() => {})} /></View></>
            : <Text style={st.sub}>Страница не подключена: «Записи» → «⋯» → «Ссылка и QR».</Text>}
          <GlassButton tone="accent" label="Закрыть" height={50} style={{ marginTop: 14 }} onPress={onClose} />
        </GlassSurface></View></View>
    </Modal>
  );
}

/**
 * Настройщик страницы для клиентов. page: 'reg' — регистрация по QR (скрытое меню в «Лояльности»), 'book' — онлайн-запись (скрытое меню в «Записях»).
 * Слева настройки, справа живой предпросмотр настоящей страницы (WebView): цвет, тексты, меню и схема проезда меняются на глазах.
 * «Опубликовать» отправляет всё в облако — страницы читают настройки оттуда.
 */
export default function ClientPageEditor({ visible, page, onClose }) {
  const toast = useToast(), { width } = useWindowDimensions(), wide = width >= 900;
  const [pg, setPg] = useState(getClientPages()); const [menu, setMenu] = useState([]); const [pub, setPub] = useState({ dirty: true });
  const [stage, setStage] = useState(page === 'reg' ? 1 : 0); const [tab, setTab] = useState('set'); const [busy, setBusy] = useState(false); const [qr, setQr] = useState(false);
  const web = useRef(null), ready = useRef(false), timer = useRef(null);
  const isReg = page === 'reg', sh = pg.shared, own = isReg ? pg.reg : pg.book;

  const refresh = useCallback(() => { try { setPg(getClientPages()); setPub(getPublishState()); } catch (e) { console.error(e); } }, []);
  useEffect(() => { if (visible) { refresh(); setStage(isReg ? 1 : 0); setTab('set'); try { setMenu(getMenuProducts()); } catch (_) {} } }, [visible, page]);
  const inject = useCallback(() => {
    if (!ready.current || !web.current) return;
    try { web.current.injectJavaScript(`applyCfg(${JSON.stringify(previewConfig(page))});true;`); } catch (e) { console.error(e); }
  }, [page]);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(inject, 160); return () => clearTimeout(timer.current); }, [pg, menu, inject, visible]);
  const show = n => { setStage(n); try { web.current && web.current.injectJavaScript(`PREVIEW.show(${n});true;`); } catch (_) {} };
  const upd = (section, patch) => { try { saveClientPages(section, patch); refresh(); } catch (e) { console.error(e); toast.show('Не удалось сохранить', 'warn'); } };
  const setRoute = r => upd('shared', { route: r });
  const route = sh.route || [];

  const pickLogo = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'image/png', copyToCacheDirectory: true });
      if (r.canceled || !r.assets || !r.assets[0]) return;
      const b64 = await FileSystem.readAsStringAsync(r.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      if (b64.length > 260000) { Alert.alert('Файл слишком большой', 'Нужен PNG до 190 КБ: белый логотип на прозрачном фоне, ширина около 900 пикселей.'); return; }
      upd('shared', { logo: 'data:image/png;base64,' + b64 }); toast.show('Логотип обновлён', 'info');
    } catch (e) { console.error(e); Alert.alert('Не удалось загрузить логотип', e.message); }
  };
  const doPublish = async () => {
    setBusy(true);
    try { await publishClientPages(); toast.show('Страницы опубликованы', 'info'); } catch (e) { console.error(e); Alert.alert('Не опубликовано', e.message); }
    refresh(); setBusy(false);
  };
  const toggleMenu = (p, on) => { try { setMenuVisible(p.id, on); setMenu(getMenuProducts()); refresh(); } catch (e) { console.error(e); } };
  const allMenu = on => { try { setAllMenuVisible(on); setMenu(getMenuProducts()); refresh(); } catch (e) { console.error(e); } };
  const links = getPageLinks();
  const prof = getBusinessProfile() || {}, services = visible && !isReg ? getBookingServices() : [], staffN = visible && !isReg ? getBookingStaff().length : 0;
  const nMenu = menu.filter(p => p.on).length;

  const settings = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Card title="Логотип и вид">
        <View style={st.lgRow}><View style={st.lgTh}>{sh.logo ? <Image source={{ uri: sh.logo }} style={{ width: 130, height: 40 }} resizeMode="contain" /> : <Text style={st.lgDef}>СТРУКТУРА</Text>}</View>
          <View style={{ flex: 1 }}><Text style={st.swT}>{sh.logo ? 'Свой логотип' : 'Логотип по умолчанию'}</Text><Text style={st.swS}>белый PNG с прозрачным фоном</Text></View>
          <GlassButton label="Заменить" height={38} onPress={pickLogo} />{!!sh.logo && <GlassButton label="Убрать" height={38} style={{ marginLeft: 8 }} onPress={() => upd('shared', { logo: '' })} />}</View>
        <Text style={st.hint}>Цвет страниц</Text>
        <View style={st.sw5}>{ACCENTS.map(([k, t]) => <Pressable key={k} style={[st.sw5i, sh.accent === k && st.sw5on]} onPress={() => upd('shared', { accent: k })}><View style={[st.dot, { backgroundColor: SWATCH[k][1], borderColor: SWATCH[k][0] }]} /><Text style={st.sw5t}>{t}</Text></Pressable>)}</View>
        <Sw label="Спокойный режим" sub="меньше движения: для слабых телефонов и тех, кто не любит анимации" value={sh.calm} onChange={v => upd('shared', { calm: v })} />
      </Card>

      {isReg ? (<>
        <Card title="Бонус и включение">
          <Sw label="Регистрация по QR включена" sub="выключено — гость увидит «Регистрация недоступна»" value={pg.bonus.enabled} onChange={v => upd('bonus', { enabled: v })} />
          <Fld label="Бонус, ₽" value={pg.bonus.amount} onChange={v => upd('bonus', { amount: Math.max(0, parseInt(String(v).replace(/\D/g, ''), 10) || 0) })} keyboardType="number-pad" />
          <Fld label="Срок, дней" value={pg.bonus.days} onChange={v => upd('bonus', { days: Math.max(0, parseInt(String(v).replace(/\D/g, ''), 10) || 0) })} keyboardType="number-pad" />
          <Text style={st.hint}>Бонус активирует кассир при первой покупке клиента. Настройка уходит в облако при публикации.</Text>
        </Card>
        <Card title="Тексты регистрации">
          <Fld label="Над заголовком" value={own.eyebrow} onChange={v => upd('reg', { eyebrow: v })} /><Fld label="Заголовок" value={own.title} onChange={v => upd('reg', { title: v })} />
          <Fld label="Подзаголовок" value={own.lead} onChange={v => upd('reg', { lead: v })} multiline /><Fld label="Кнопка" value={own.cta} onChange={v => upd('reg', { cta: v })} />
          <Fld label="Подпись бонуса" value={own.bonusLabel} onChange={v => upd('reg', { bonusLabel: v })} /><Fld label="После регистрации" value={own.doneText} onChange={v => upd('reg', { doneText: v })} multiline />
        </Card>
      </>) : (<>
        <Card title="Тексты записи">
          <Fld label="Над заголовком" value={own.eyebrow} onChange={v => upd('book', { eyebrow: v })} /><Fld label="Заголовок" value={own.title} onChange={v => upd('book', { title: v })} />
          <Fld label="Подзаголовок" value={own.lead} onChange={v => upd('book', { lead: v })} multiline /><Fld label="Кнопка" value={own.cta} onChange={v => upd('book', { cta: v })} />
          <Fld label="Если всё занято" value={own.busyText} onChange={v => upd('book', { busyText: v })} multiline /><Text style={st.hint}>Показывается вместе с кнопками контактов, когда на выбранный день нет свободного времени.</Text>
        </Card>
        <Card title="Время и услуги">
          <Text style={st.swT}>Шаг начала записи</Text><Chips items={[[15, '15 мин'], [30, '30 мин'], [60, '1 час']]} value={own.step} onChange={v => upd('book', { step: v })} />
          <Fld label="Закрывать за, мин" value={own.lead_min} onChange={v => upd('book', { lead_min: Math.max(0, parseInt(String(v).replace(/\D/g, ''), 10) || 0) })} keyboardType="number-pad" />
          <View style={st.sw}><View style={{ flex: 1 }}><Text style={st.swT}>Рабочие часы</Text><Text style={st.swS}>из «Настроек» → «Бизнес» → «Онлайн запись»</Text></View><Text style={st.val}>{prof.work_hours_from || '09:00'}–{prof.work_hours_to || '21:00'}</Text></View>
          <View style={st.sw}><View style={{ flex: 1 }}><Text style={st.swT}>Одновременно записей</Text><Text style={st.swS}>по числу мастеров, принимающих записи</Text></View><Text style={st.val}>{Math.max(1, staffN)}</Text></View>
          <Text style={st.hint}>Занятое время (записи по телефону и онлайн) скрывается по длительности услуги. Услуги: {services.length ? services.map(s => s.name).join(', ') : 'пока нет — добавьте в «Услуги для записи»'}.</Text>
        </Card>
      </>)}

      <Card title="Как добраться" right="+ Шаг" onRight={() => { const r = route.slice(); r.splice(Math.max(0, r.length - 1), 0, { icon: 'walk', t: 'Новый шаг', h: '' }); setRoute(r.length === 1 ? [r[0], { icon: 'pin', t: 'Мы здесь', h: '' }] : r); }}>
        <Sw label="Показывать схему «Как нас найти»" value={sh.routeShow} onChange={v => upd('shared', { routeShow: v })} />
        {isReg ? <><Text style={st.hint}>Размер схемы на странице регистрации</Text><Chips items={[['full', 'Крупная'], ['compact', 'Компактная']]} value={own.routeSize} onChange={v => upd('reg', { routeSize: v })} /></>
          : <Text style={st.hint}>На странице записи схема всегда компактная: одна строка значков с подписью шага.</Text>}
        <Fld label="Ссылка на карту" value={sh.mapUrl} onChange={v => upd('shared', { mapUrl: v })} placeholder="2ГИС или Яндекс Карты" />
        {route.map((r, i) => (
          <View key={i} style={st.rt}>
            <Pressable style={st.rtI} onPress={() => { const n = route.slice(); n[i] = { ...r, icon: ROUTE_ICONS[(ROUTE_ICONS.indexOf(r.icon) + 1) % ROUTE_ICONS.length] }; setRoute(n); }}><Text style={st.rtIT}>{ICON_GLYPH[r.icon] || '•'}</Text></Pressable>
            <View style={{ flex: 1 }}>
              <TextInput style={st.rtIn} color={colors.text} value={r.t} placeholder="Название шага" placeholderTextColor="rgba(255,255,255,0.25)" onChangeText={v => { const n = route.slice(); n[i] = { ...r, t: v }; setRoute(n); }} />
              <TextInput style={[st.rtIn, st.rtH]} color={colors.textDim} value={r.h} placeholder="Подсказка (необязательно)" placeholderTextColor="rgba(255,255,255,0.25)" onChangeText={v => { const n = route.slice(); n[i] = { ...r, h: v }; setRoute(n); }} /></View>
            <View style={{ gap: 4 }}>
              <Pressable style={st.mini} onPress={() => { if (i > 0) { const n = route.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; setRoute(n); } }}><Text style={st.miniT}>▲</Text></Pressable>
              <Pressable style={st.mini} onPress={() => { if (i < route.length - 1) { const n = route.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; setRoute(n); } }}><Text style={st.miniT}>▼</Text></Pressable>
              <Pressable style={st.mini} onPress={() => setRoute(route.filter((_, j) => j !== i))}><Text style={[st.miniT, { color: colors.red }]}>✕</Text></Pressable></View>
          </View>))}
        {route.length === 0 && <Text style={st.hint}>Шагов пока нет. Нажмите «+ Шаг»: например «Вход со двора», «Лифт на 4 этаж», «Мы здесь». Последний шаг — ваша точка.</Text>}
      </Card>

      <Card title="Контакты и адрес">
        <Fld label="Адрес" value={sh.address} onChange={v => upd('shared', { address: v })} multiline placeholder="можно в две строки" /><Fld label="Часы работы" value={sh.hours} onChange={v => upd('shared', { hours: v })} />
        <Fld label="Телефон" value={sh.phone} onChange={v => upd('shared', { phone: v })} placeholder="+7 …" keyboardType="phone-pad" />
        <Fld label="WhatsApp" value={sh.whatsapp} onChange={v => upd('shared', { whatsapp: v })} placeholder="ссылка или номер" /><Fld label="Telegram" value={sh.telegram} onChange={v => upd('shared', { telegram: v })} placeholder="ссылка или @имя" />
        <Text style={st.hint}>Контакты видны на обеих страницах; на странице записи — ещё и когда всё время занято.</Text>
      </Card>

      {isReg && (
        <Card title="Меню на странице" right="Выбрать все" onRight={() => allMenu(true)}>
          <Sw label="Показывать меню после регистрации" value={own.showMenu} onChange={v => upd('reg', { showMenu: v })} />
          {menu.map(p => <View key={p.id} style={st.mrow}><View style={{ flex: 1, minWidth: 0 }}><Text style={st.swT} numberOfLines={1}>{p.name}</Text><Text style={st.swS}>{p.category}</Text></View><Text style={[st.val, { marginRight: 12 }]}>{p.price} ₽</Text><Toggle value={p.on} onValueChange={v => toggleMenu(p, v)} /></View>)}
          {menu.length === 0 && <Text style={st.hint}>В каталоге пока нет товаров.</Text>}
          <Text style={st.hint}>В меню: {nMenu} из {menu.length}. Группы — категории товаров, цены общие с Кассой. <Text style={{ color: colors.orangeLight }} onPress={() => allMenu(false)}>Снять все</Text></Text>
        </Card>)}
    </ScrollView>
  );

  const preview = (
    <View style={st.pv}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
        {STAGES[page].map(([t, n]) => <Pressable key={n} style={[st.stg, stage === n && st.stgOn]} onPress={() => show(n)}><Text style={[st.stgT, stage === n && { color: colors.text }]}>{t}</Text></Pressable>)}
      </ScrollView>
      <View style={st.ph}>
        <WebView ref={web} originWhitelist={['*']} source={{ html: isReg ? REGISTER_HTML : BOOKING_HTML, baseUrl: 'https://struktura-crm.github.io/struktura-booking/' }} javaScriptEnabled
          injectedJavaScriptBeforeContentLoaded="window.__PREVIEW=true;true;" style={{ flex: 1, backgroundColor: '#090a0f' }} setSupportMultipleWindows={false}
          onLoadEnd={() => { ready.current = true; inject(); setTimeout(() => show(stage), 600); }} onMessage={() => {}} />
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafe style={st.ov}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={st.big}><GlassSurface radius={26} tint="26,32,46" alpha={0.99} floating padding={0}>
          <View style={st.head}>
            <View style={{ flex: 1, minWidth: 0 }}><Text style={st.title} numberOfLines={1}>{isReg ? 'Страница регистрации по QR' : 'Страница онлайн-записи'}</Text>
              <Text style={st.sub} numberOfLines={1}>{pub.dirty ? 'Есть неопубликованные изменения' : `Опубликовано ${when(pub.at)}`}</Text></View>
            <GlassButton label="QR и ссылка" height={44} onPress={() => setQr(true)} style={{ marginRight: 8 }} />
            <GlassButton tone="solid" label={busy ? 'Публикую…' : 'Опубликовать'} height={44} disabled={busy} onPress={doPublish} />
            <Pressable onPress={onClose} hitSlop={10} style={st.x}><Text style={st.xT}>✕</Text></Pressable>
          </View>
          {!wide && <View style={st.tabs}>{[['set', 'Настройки'], ['prev', 'Предпросмотр']].map(([k, t]) => <Pressable key={k} style={[st.tab, tab === k && st.tabOn]} onPress={() => setTab(k)}><Text style={[st.tabT, tab === k && { color: colors.text }]}>{t}</Text></Pressable>)}</View>}
          <View style={{ flexDirection: 'row', flex: 1, paddingHorizontal: 16, paddingBottom: 14, gap: 14 }}>
            <View style={{ flex: 1, display: wide || tab === 'set' ? 'flex' : 'none' }}>{settings}</View>
            <View style={{ width: wide ? 330 : undefined, flex: wide ? 0 : 1, display: wide || tab === 'prev' ? 'flex' : 'none' }}>{preview}</View>
          </View>
        </GlassSurface></View>
        <LinkQr visible={qr} link={isReg ? links.reg : links.book} title={isReg ? 'Регистрация по QR' : 'Онлайн-запись'} onClose={() => setQr(false)} />
      </KeyboardSafe>
    </Modal>
  );
}

const st = StyleSheet.create({
  ov: { flex: 1, backgroundColor: 'rgba(5,8,12,0.66)', alignItems: 'center', justifyContent: 'center' }, big: { width: '97%', height: '93%', maxWidth: 1240 },
  win: { width: '92%' }, head: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 10 }, title: { fontFamily: fonts.display, fontSize: 20, color: colors.text }, sub: { fontFamily: fonts.familyRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  x: { marginLeft: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, xT: { fontSize: 15, color: colors.textDim },
  tabs: { flexDirection: 'row', gap: 4, marginHorizontal: 16, marginBottom: 8, padding: 4, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)' }, tab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' }, tabOn: { backgroundColor: 'rgba(150,172,204,0.28)' }, tabT: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.textDim },
  card: { borderRadius: 18, padding: 14, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, cardH: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 }, cardT: { flex: 1, fontFamily: fonts.familySemibold, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted }, cardR: { fontFamily: fonts.familySemibold, fontSize: 13, color: colors.orangeLight },
  fld: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: 14, paddingHorizontal: 14, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, fl: { width: 118, fontFamily: fonts.familySemibold, fontSize: 12.5, color: colors.textDim }, in: { flex: 1, minWidth: 0, padding: 0, fontFamily: fonts.familySemibold, fontSize: 15, color: colors.text },
  sw: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }, swT: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim }, swS: { fontFamily: fonts.familyRegular, fontSize: 12, color: colors.muted, marginTop: 2 }, val: { fontFamily: fonts.familySemibold, fontSize: 14, color: colors.textDim },
  hint: { fontFamily: fonts.familyRegular, fontSize: 12.5, color: colors.muted, lineHeight: 18, marginTop: 6, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 6 }, chip: { height: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, chipOn: { backgroundColor: 'rgba(127,168,217,0.2)', borderColor: 'rgba(157,191,230,0.5)' }, chipT: { fontFamily: fonts.familySemibold, fontSize: 13.5, color: colors.textDim },
  lgRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, lgTh: { width: 150, height: 56, borderRadius: 14, backgroundColor: '#0b0c12', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }, lgDef: { fontFamily: fonts.family, fontSize: 14, letterSpacing: 2, color: '#fff' },
  sw5: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }, sw5i: { width: 84, paddingVertical: 8, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: 'rgba(255,255,255,0.03)' }, sw5on: { borderColor: colors.orangeLight, backgroundColor: 'rgba(127,168,217,0.1)' }, dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, marginBottom: 5 }, sw5t: { fontFamily: fonts.familySemibold, fontSize: 12, color: colors.textDim },
  rt: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }, rtI: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127,168,217,0.1)', borderWidth: 1, borderColor: 'rgba(157,191,230,0.45)' }, rtIT: { fontSize: 18, color: colors.orangeLight },
  rtIn: { height: 36, borderRadius: 10, paddingHorizontal: 12, marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', fontFamily: fonts.familySemibold, fontSize: 14, color: colors.text, padding: 0 }, rtH: { height: 32, fontFamily: fonts.familyRegular, fontSize: 13 },
  mini: { width: 30, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }, miniT: { fontSize: 11, color: colors.textDim },
  mrow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  pv: { flex: 1, alignItems: 'center' }, stg: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10 }, stgOn: { backgroundColor: 'rgba(150,172,204,0.28)' }, stgT: { fontFamily: fonts.familySemibold, fontSize: 12.5, color: colors.textDim },
  ph: { width: 300, flex: 1, maxHeight: 640, borderRadius: 34, padding: 8, backgroundColor: '#05060a', borderWidth: 2, borderColor: '#2a2e3a', overflow: 'hidden' },
  qr: { alignSelf: 'center', width: 244, height: 244, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginVertical: 12 }, link: { fontFamily: fonts.familyMedium, fontSize: 12.5, color: colors.orangeLight, textAlign: 'center' },
});
