import React from 'react';
import { TextInput } from 'react-native';
import { maskPhone, nationalDigits, PHONE_PREFIX } from '../utils/phone';

// Поле телефона с маской +7 (9XX) XXX-XX-XX. Префикс «+7 (» стоит в поле
// всегда — сразу видно, что набирать нужно с 9. Набираются только цифры,
// знаки подставляются сами; вставка «8 999…», «+7 999…» приводится к тому
// же виду; цифр больше десяти и коды не на 9 отбрасываются.
// onChangeText получает готовую строку, а для пустого поля — '' (сам
// префикс значением не считается, поэтому необязательное поле остаётся пустым).
const PhoneInput = React.forwardRef(function PhoneInput({ value, onChangeText, ...rest }, ref) {
  const shown = value || PHONE_PREFIX;
  const handle = (text) => {
    const before = shown;
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
      value={shown}
      onChangeText={handle}
      keyboardType="phone-pad"
    />
  );
});

export default PhoneInput;
