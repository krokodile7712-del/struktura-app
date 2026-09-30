import React from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

// Корень модального окна с полями ввода: поднимает содержимое над клавиатурой,
// чтобы она не перекрывала поле и кнопку «Готово». Тот же приём
// (padding на iOS / height на Android), что уже проверен на экранах
// «Регистрация клиента» и «Смена».
export default function KeyboardSafe({ style, children, ...rest }) {
  return (
    <KeyboardAvoidingView
      {...rest}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={style}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
