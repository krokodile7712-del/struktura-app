import React from 'react';
import { View, Image, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Group, Row, InputRow } from './ui';
import GlassButton from '../GlassButton';
import HoursRow from './HoursRow';

const set = (setDraft, patch) => setDraft(d => ({ ...d, ...patch }));

// Логотип загружается прямо из приложения (файл PNG с прозрачным фоном) и хранится в самом профиле
// как картинка-строка — внешний хостинг и ссылка не нужны. Лимит размера — как у логотипа страниц для клиентов.
async function pickLogo(setDraft) {
  try {
    const r = await DocumentPicker.getDocumentAsync({ type: 'image/png', copyToCacheDirectory: true });
    if (r.canceled || !r.assets || !r.assets[0]) return;
    const b64 = await FileSystem.readAsStringAsync(r.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
    if (b64.length > 260000) { Alert.alert('Файл слишком большой', 'Нужен PNG до 190 КБ: логотип на прозрачном фоне, ширина около 900 пикселей.'); return; }
    set(setDraft, { logoUrl: 'data:image/png;base64,' + b64 });
  } catch (e) { console.error(e); Alert.alert('Не удалось загрузить логотип', e.message); }
}

/** «Профиль бизнеса»: заведение, рабочие часы, контакты для клиентов, соцсети. Сохраняется само. Онлайн-запись — на своей странице. */
export default function ProfileSection({ draft: d, setDraft, navigation }) {
  return (
    <>
      <Group title="Заведение">
        <InputRow title="Название бизнеса" value={d.businessName} onChange={v => set(setDraft, { businessName: v })} placeholder="Название вашего бизнеса" />
        <Row title="Логотип" sub={d.logoUrl && !String(d.logoUrl).startsWith('data:') ? 'Сейчас задан ссылкой — выберите файл, чтобы загрузить логотип в приложение' : 'Файл PNG на прозрачном фоне, до 190 КБ, ширина около 900 пикселей'}
          right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!!d.logoUrl && <Image source={{ uri: d.logoUrl }} style={{ width: 64, height: 32 }} resizeMode="contain" />}
            <GlassButton label={d.logoUrl ? 'Заменить' : 'Выбрать файл'} height={38} onPress={() => pickLogo(setDraft)} />
            {!!d.logoUrl && <GlassButton label="Убрать" height={38} onPress={() => set(setDraft, { logoUrl: '' })} />}
          </View>} />
        <InputRow title="Город" value={d.city} onChange={v => set(setDraft, { city: v })} placeholder="Москва" />
        <InputRow title="Телефон" value={d.phone} onChange={v => set(setDraft, { phone: v })} placeholder="+7 999 123-45-67" keyboardType="phone-pad" />
        <InputRow title="Адрес" value={d.address} onChange={v => set(setDraft, { address: v })} placeholder="ул. Ленина, 1" />
        <InputRow title="ИНН / ИП" value={d.inn} onChange={v => set(setDraft, { inn: v })} placeholder="ИП Иванов И.И." />
      </Group>
      <Group title="Рабочие часы" delay={60}><HoursRow from={d.hoursFrom} to={d.hoursTo} onChange={h => set(setDraft, { hoursFrom: h.from, hoursTo: h.to })} /></Group>
      <Group title="Контакты для клиентов" delay={180}>
        <InputRow title="Email" value={d.email} onChange={v => set(setDraft, { email: v })} placeholder="hello@business.ru" keyboardType="email-address" />
        <InputRow title="WhatsApp" value={d.whatsapp} onChange={v => set(setDraft, { whatsapp: v })} placeholder="+7 999 123-45-67" keyboardType="phone-pad" />
        <InputRow title="Telegram" value={d.telegram} onChange={v => set(setDraft, { telegram: v })} placeholder="@username" />
      </Group>
      <Group title="Социальные сети" delay={240}>
        <InputRow title="Instagram" value={d.instagram} onChange={v => set(setDraft, { instagram: v })} placeholder="@mybusiness" />
        <InputRow title="ВКонтакте" value={d.vk} onChange={v => set(setDraft, { vk: v })} placeholder="vk.com/mybusiness" />
        <InputRow title="Сайт" value={d.website} onChange={v => set(setDraft, { website: v })} placeholder="mysite.ru" />
      </Group>
    </>
  );
}
