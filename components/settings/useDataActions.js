import React, { useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import PinConfirmModal from '../PinConfirmModal';
import BackupPasswordModal from '../BackupPasswordModal';
import { useToast } from '../Toast';
import { exportAllData, importAllData, BACKUP_TABLES_INFO, localDateStr } from '../../db/queries';
import { encryptBackup, decryptBackup, isEncryptedBackup } from '../../db/backupCrypto';
import { getSession, clearSession } from '../../db/session';
import { resetKassaCart } from '../../db/cartStore';

/**
 * Действия с данными: копия (сохранить / поделиться), восстановление, подтверждение PIN администратора.
 * Возвращает действия и готовые окна (ui) — раздел только вставляет их в разметку.
 */
export default function useDataActions(navigation) {
  const toast = useToast();
  const [pinAsk, setPinAsk] = useState(null);       // { title, message, action }
  const [backupAsk, setBackupAsk] = useState(null); // { mode: 'set'|'enter', purpose?, file? }
  const [importing, setImporting] = useState(false);
  const isAdmin = () => getSession()?.role === 'admin';
  const fileName = () => `struktura-backup-${localDateStr()}.json`;

  const askPin = (title, message, action) => {
    if (!isAdmin()) { toast.show('Это действие доступно только администратору', 'warn'); return; }
    setPinAsk({ title, message, action });
  };

  const save = async json => {
    try {
      if (Platform.OS === 'android') {
        const p = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!p.granted) return;
        const uri = await FileSystem.StorageAccessFramework.createFileAsync(p.directoryUri, fileName(), 'application/json');
        await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
        toast.show('Резервная копия сохранена', 'info');
      } else { await share(json, 'Сохранить резервную копию'); }
    } catch (e) { console.error('[копия] сохранить', e); toast.show('Не удалось сохранить копию: ' + (e?.message || ''), 'warn'); }
  };
  // Настоящий файл, которым делится expo-sharing (а не текст JSON в сообщении)
  const share = async (json, title = 'Резервная копия СТРУКТУРА') => {
    try {
      const uri = FileSystem.documentDirectory + fileName();
      await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: title });
      else toast.show('На этом устройстве не поддерживается', 'warn');
    } catch (e) { console.error('[копия] поделиться', e); toast.show('Не удалось создать копию', 'warn'); }
  };

  // Копия: только администратор — сначала его PIN, затем пароль, которым защищается файл
  const startBackup = purpose => askPin('Резервная копия', 'Введите ваш PIN-код администратора. Затем вы зададите пароль, которым будет защищён файл.', () => setBackupAsk({ mode: 'set', purpose }));

  const submitBackup = async password => {
    const res = encryptBackup(exportAllData(), password);
    if (!res.ok) return res;
    const json = JSON.stringify(res.file), purpose = backupAsk?.purpose;
    setBackupAsk(null);
    await (purpose === 'share' ? share(json) : save(json));
    return { ok: true };
  };
  const submitRestore = async password => {
    const res = decryptBackup(backupAsk?.file, password);
    if (!res.ok) return res;
    setBackupAsk(null); confirmRestore(res.data, true);
    return { ok: true };
  };

  const doImport = data => {
    setImporting(true);
    try {
      const res = importAllData(data); setImporting(false);
      if (!res.ok) { Alert.alert('Ошибка', res.error || 'Не удалось восстановить данные'); return; }
      let msg = `Восстановлено разделов: ${res.restored.length} из ${BACKUP_TABLES_INFO.length}.`;
      if (res.skipped.length) msg += `\n\nПропущено (отсутствовали в файле):\n${res.skipped.map(l => '• ' + l).join('\n')}`;
      Alert.alert('Восстановление завершено', msg, [{ text: 'Ок', onPress: () => { resetKassaCart(); clearSession(); navigation.navigate('Login'); } }]);
    } catch (e) { setImporting(false); console.error('[копия] восстановить', e); toast.show('Ошибка восстановления: ' + (e?.message || ''), 'warn'); }
  };
  const confirmRestore = (data, protectedFile) => Alert.alert('Восстановить из резервной копии?',
    `Это ПОЛНОСТЬЮ заменит все текущие данные приложения на данные из файла:\n\n${BACKUP_TABLES_INFO.map(t => '• ' + t.label).join('\n')}\n\nОтменить это действие нельзя.` +
    (protectedFile ? '' : '\n\nВнимание: файл не защищён паролем — он создан старой версией приложения. После восстановления сохраните новую копию: она будет защищена паролем.') + '\n\nПродолжить?',
    [{ text: 'Отмена', style: 'cancel' }, { text: 'Восстановить', style: 'destructive', onPress: () => askPin('Восстановить из копии', 'Введите ваш PIN-код администратора, чтобы заменить все данные файлом копии.', () => doImport(data)) }]);

  const startRestore = async () => {
    if (!isAdmin()) { toast.show('Это действие доступно только администратору', 'warn'); return; }
    try {
      // type '*/*': копии, пришедшие через мессенджер или облако, часто имеют тип не application/json,
      // и выбор по такому типу их не показывает. Что это именно копия, проверяет разбор JSON ниже.
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      const file = !r.canceled && r.assets?.[0]; if (!file) return;
      setImporting(true);
      // Файл читаем штатным чтением expo-file-system: fetch по адресу файла на части телефонов падает
      // («You must pass a valid uri and observer»). fetch оставлен запасным вариантом.
      let content;
      try { content = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 }); }
      catch (_) { content = await (await fetch(file.uri)).text(); }
      let data; try { data = JSON.parse(content); } catch (_) { throw new Error('Файл повреждён или это не резервная копия (не JSON)'); }
      setImporting(false);
      if (isEncryptedBackup(data)) setBackupAsk({ mode: 'enter', file: data }); else confirmRestore(data, false);
    } catch (e) { setImporting(false); console.error('[копия] прочитать файл', e); toast.show('Не удалось прочитать файл: ' + (e?.message || 'ошибка'), 'warn'); }
  };

  const ui = (
    <>
      <BackupPasswordModal visible={!!backupAsk} mode={backupAsk?.mode || 'set'} title={backupAsk?.mode === 'enter' ? 'Пароль копии' : 'Защитите копию паролем'}
        message={backupAsk?.mode === 'enter' ? 'Эта копия защищена паролем. Введите пароль, который вы задавали при сохранении.' : 'В копии все данные вашего бизнеса. Без пароля её не откроет никто, включая вас.'}
        onSubmit={backupAsk?.mode === 'enter' ? submitRestore : submitBackup} onCancel={() => setBackupAsk(null)} />
      <PinConfirmModal visible={!!pinAsk} title={pinAsk?.title} message={pinAsk?.message} onCancel={() => setPinAsk(null)} onConfirm={() => { const a = pinAsk?.action; setPinAsk(null); a?.(); }} />
    </>
  );
  return { ui, askPin, startBackup, startRestore, importing };
}
