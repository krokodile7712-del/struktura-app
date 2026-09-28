import React from 'react';
import { TextInput } from 'react-native';
import { maskPhone, nationalDigits, PHONE_PLACEHOLDER } from '../utils/phone';

// Поле телефона с маской +7 (9XX) XXX-XX-XX. Набираются только цифры,
// знаки подставляются сами; вставка «8 999…», «+7 999…» приводится к тому
// же виду; цифр больше десяти и коды не на 9 отбрасываются.
// onChangeText получает уже готовую строку (или '' для пустого поля).
const PhoneInput = React.forwardRef(function PhoneInput({ value, onChangeText, placeholder, ...rest }, ref) {
  const handle = (text) => {
    const before = String(value || '');
    let next = maskPhone(text);
    // Стёрли знак маски (скобку, пробел, дефис) — цифр не убавилось, а
    // маска вернула бы всё обратно и поле «не стиралось» бы. Тогда убираем
    // последнюю цифру, как ожидает пользователь.
    if (text.length < before.length && nationalDigits(text).length === nationalDigits(before).length) {
      next = maskPhone(nationalDigits(before).slice(0, -1));
    }
    onChangeText(next);
  };
  return (
    <TextInput
      ref={ref}
      {...rest}
      value={value || ''}
      onChangeText={handle}
      keyboardType="phone-pad"
      placeholder={placeholder || PHONE_PLACEHOLDER}
    />
  );
});

export default PhoneInput;
