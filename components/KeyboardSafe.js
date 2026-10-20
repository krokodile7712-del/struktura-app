import React from 'react';
import { KeyboardAvoidingView } from 'react-native';

// Корень модального окна с полями ввода: поднимает содержимое над клавиатурой,
// чтобы она не перекрывала поле и кнопку «Готово».
// Режим везде 'padding'. Раньше на Android был 'height': он задаёт окну фиксированную высоту по
// запомненной «начальной», и после скрытия клавиатуры окно возвращалось рывком / не до конца
// (известная особенность режима). 'padding' лишь добавляет нижний отступ на величину перекрытия
// клавиатурой и плавно убирает его при скрытии; если система сама уменьшает окно под клавиатуру,
// перекрытия нет и отступ равен нулю — двойного сдвига не бывает.
export default function KeyboardSafe({ style, children, ...rest }) {
  return (
    <KeyboardAvoidingView
      {...rest}
      behavior="padding"
      style={style}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
