import React from 'react';
import { Group, PickRow } from './ui';

/** «Вид и тема»: тема оформления. */
export default function ViewSection({ draft: d, setDraft }) {
  return (
    <Group title="Тема оформления">
      <PickRow title="Тёмная" sub="Чёрный фон, оливковый акцент" selected={d.theme === 'dark' || !d.theme} onPress={() => setDraft(x => ({ ...x, theme: 'dark' }))} />
      <PickRow title="Светлая" sub="Белый фон, тёмный текст" selected={d.theme === 'light'} onPress={() => setDraft(x => ({ ...x, theme: 'light' }))} />
    </Group>
  );
}
