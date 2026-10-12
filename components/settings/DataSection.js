import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Group, Row, SwitchRow, ChipsRow, Note } from './ui';
import ResetSheet from './ResetSheet';
import useDataActions from './useDataActions';
import { useToast } from '../Toast';
import { getAutoLockMinutes, setAutoLockMinutes, AUTO_LOCK_OPTIONS, getSetting, setSetting, resetDatabase, resetAllTours, BACKUP_TABLES_INFO } from '../../db/queries';
import { wipeCloudBeforeReset } from '../../db/loyaltySync';
import { clearSession } from '../../db/session';
import { resetKassaCart } from '../../db/cartStore';
import { VERSION_LABEL } from '../../constants/version';

/** «Данные и безопасность»: резервная копия, автоблокировка, уведомления, подсказки, аккаунт, опасная зона, о приложении. */
export default function DataSection({ navigation, onChanged }) {
  const toast = useToast(); const d = useDataActions(navigation);
  const [lock, setLock] = useState(() => getAutoLockMinutes()); const [low, setLow] = useState(() => getSetting('notify_low_stock') !== '0'); const [reset, setReset] = useState(false);

  const chooseLock = m => { const r = setAutoLockMinutes(m); if (!r?.ok) { toast.show(r?.error || 'Не удалось сохранить', 'warn'); return; } setLock(m); };
  const startOver = () => Alert.alert('Начать заново с чистого листа?',
    `Это ПОЛНОСТЬЮ удалит абсолютно все данные приложения без возможности восстановить — включая вашу учётную запись:\n\n${BACKUP_TABLES_INFO.map(t => '• ' + t.label).join('\n')}\n\nЕсли данные ещё понадобятся — сначала сделайте резервную копию.`,
    [{ text: 'Отмена', style: 'cancel' }, { text: 'Стереть всё и начать заново', style: 'destructive', onPress: () => d.askPin('Стереть всё и начать заново', 'Введите ваш PIN-код администратора, чтобы подтвердить удаление всех данных.', async () => {
      try {
        // Сначала облако: после сброса базы код и секрет бизнеса, нужные для доступа к нему, исчезнут. Не вышло — предупредим и сотрём локально
        const cloud = await wipeCloudBeforeReset();
        const res = resetDatabase(true);
        resetKassaCart(); clearSession();
        if (res && res.ok === false) console.error('[Начать заново] Не все таблицы удалились:', res.errors);
        if (cloud && cloud.ok === false) toast.show('Локальные данные стёрты. Не удалось очистить облако (записи, QR-регистрации) — проверьте связь и повторите позже вручную.', 'warn');
        setTimeout(() => { try { navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] }); } catch (e) { console.error(e); toast.show('Данные стёрты, но не удалось открыть регистрацию — перезапустите приложение', 'warn'); } }, 50);
      } catch (e) { console.error('[Начать заново]', e); toast.show('Не удалось начать заново: ' + (e?.message || 'ошибка'), 'warn'); }
    }) }]);
  const switchAccount = () => Alert.alert('Сменить аккаунт?', 'Вы выйдете из текущего аккаунта и вернётесь на экран входа.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Выйти', style: 'destructive', onPress: () => { resetKassaCart(); clearSession(); navigation.navigate('Login'); } }]);
  const tips = () => Alert.alert('Показать подсказки заново?', 'На каждом разделе при следующем заходе снова откроется вводный тур, а на Обзоре вернётся карточка «Что дальше» — как в первый раз. Ничего из данных не изменится.',
    [{ text: 'Отмена', style: 'cancel' }, { text: 'Показать заново', onPress: () => { resetAllTours(); setSetting('next_steps_dismissed', '0'); setSetting('next_steps_collapsed', '0'); toast.show('Готово — подсказки покажутся заново'); } }]);

  return (
    <>
      <Group title="Резервная копия">
        <Row title="Сохранить копию в файл" sub="Файл защищается паролем: товары, клиенты, продажи, настройки" onPress={() => d.startBackup('save')} />
        <Row title="Поделиться копией" sub="Отправить в мессенджер или облако вместо сохранения на устройство" onPress={() => d.startBackup('share')} />
        <Row title="Восстановить из копии" sub={d.importing ? 'Восстановление…' : 'Заменит все текущие данные файлом копии'} onPress={d.startRestore} disabled={d.importing} />
      </Group>
      <Group title="Безопасность" delay={60}>
        <ChipsRow title="Автоблокировка" sub="Возврат на экран входа, если никто не касался экрана, и при уходе из приложения больше чем на минуту" items={AUTO_LOCK_OPTIONS.map(m => [m, m === 0 ? 'Выкл' : `${m} мин`])} value={lock} onChange={chooseLock} />
        <Row title="PIN при опасных действиях" sub="Сброс данных, восстановление, копия, удаление сотрудников — только администратор" value="всегда" />
      </Group>
      <Group title="Уведомления" delay={120}>
        <SwitchRow title="Низкий остаток на складе" sub="Предупреждение, когда товар заканчивается" value={low} onChange={v => { setSetting('notify_low_stock', v ? '1' : '0'); setLow(v); }} />
      </Group>
      <Group title="Подсказки и аккаунт" delay={180}>
        <Row title="Показать подсказки заново" sub="Вводные туры и карточка «Что дальше» на Обзоре" onPress={tips} />
        <Row title="Сменить аккаунт" sub="Выйти и войти под другим PIN" onPress={switchAccount} />
      </Group>
      <Group title="Опасная зона" danger delay={240}>
        <Row title="Сбросить продажи и клиентов" sub="Начать статистику заново; товары, сотрудники и настройки останутся" danger onPress={() => setReset(true)} />
        <Row title="Начать заново с чистого листа" sub="Сотрёт вообще всё, включая учётную запись, и запустит регистрацию нового бизнеса" danger onPress={startOver} />
      </Group>
      <Group title="О приложении" delay={300}>
        <Row title="СТРУКТУРА" sub="POS/CRM для малого бизнеса" value={VERSION_LABEL} />
      </Group>
      <Note>Поддержка: по вопросам пишите разработчику в Telegram.</Note>
      <ResetSheet visible={reset} onClose={() => setReset(false)} onBackup={() => d.startBackup('save')} askPin={a => d.askPin('Сбросить продажи и клиентов', 'Введите ваш PIN-код администратора, чтобы подтвердить сброс.', a)} onDone={() => onChanged && onChanged()} />
      {d.ui}
    </>
  );
}
