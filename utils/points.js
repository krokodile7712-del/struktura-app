// Списание баллов при оплате: сколько можно списать и как это показывать.
// Формулы согласованы с расчётом скидки в Кассе (pointsDiscount): списанные
// баллы никогда не дают скидку больше лимита и больше суммы к оплате.

// Сколько баллов можно списать в этом заказе: не больше баланса, не больше
// лимита (max_spend_pct от суммы позиций) и не больше суммы, которая остаётся
// после скидки на заказ.
export function maxSpendablePoints({ balance, rawTotal, discountAmount, maxSpendPct, pointValue }) {
  const pv = pointValue > 0 ? pointValue : 1;
  const raw = rawTotal || 0;
  const limitRub = Math.round(raw * (maxSpendPct ?? 100) / 100);
  const leftRub = Math.max(0, raw - (discountAmount || 0));
  const byOrder = Math.floor(Math.min(limitRub, leftRub) / pv);
  return Math.max(0, Math.min(Math.floor(balance || 0), byOrder));
}

// Состояние панели по введённому значению.
// mode: none — не списывать, half — половина, max — максимум, custom — своё число
export function pointsView({ value, maxPoints, balance }) {
  const typed = Math.max(0, Math.floor(Number(value) || 0));
  const applied = Math.min(typed, maxPoints);
  const half = Math.floor(maxPoints / 2);
  return {
    typed,
    applied,
    half,
    exceeded: typed > maxPoints,
    remaining: Math.max(0, Math.floor(balance || 0) - applied),
    mode: applied === 0 ? 'none' : applied === maxPoints ? 'max' : applied === half ? 'half' : 'custom',
  };
}
