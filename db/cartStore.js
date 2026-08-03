// Хранилище корзины Кассы вне экрана — переживает перемонтаж (например,
// при переходе на открытие смены и возврате обратно), и доступно из любого
// экрана приложения (для плавающего бейджа корзины в нижней панели).
// Сбрасывается только явным закрытием слота после оплаты или сменой пользователя.

export const cartStore = {
  slots: [{ id: 1, order: [], orderNote: '', appliedDiscount: null, pointsToSpend: '', zone: null, forClient: null }],
  activeSlotId: 1,
  nextSlotId: 2,
};

// Сбрасывает корзину — вызывается при завершении смены / смене пользователя,
// чтобы следующий кассир не увидел чужой незакрытый заказ.
export function resetKassaCart() {
  cartStore.slots = [{ id: 1, order: [], orderNote: '', appliedDiscount: null, pointsToSpend: '', zone: null, forClient: null }];
  cartStore.activeSlotId = 1;
  cartStore.nextSlotId = 2;
}

// Сводка по всем отложенным чекам сразу — для бейджа корзины на других экранах.
export function getCartSummary() {
  let count = 0, total = 0;
  for (const slot of cartStore.slots) {
    for (const item of slot.order || []) {
      const qty = item.quantity || 1;
      count += qty;
      total += (item.price || 0) * qty;
    }
  }
  return { count, total };
}
