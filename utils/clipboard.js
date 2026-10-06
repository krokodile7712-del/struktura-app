import * as Clipboard from 'expo-clipboard';

// Копирование текста в буфер обмена. Раньше использовался Clipboard из react-native — в RN 0.85 его нет,
// кнопки «Скопировать» не работали. Возвращает true/false, чтобы показать понятное сообщение.
export async function copyText(text) {
  try {
    await Clipboard.setStringAsync(String(text ?? ''));
    return true;
  } catch (e) {
    console.error('[copyText]', e);
    return false;
  }
}
