import { getDb } from './database';

// Настройки скидок, которые экран раньше писал в базу напрямую (в профиль бизнеса)
const row = () => getDb().getFirstSync('SELECT id, product_discount_pct, discounts_stackable FROM business_profile ORDER BY id LIMIT 1');
export function getDiscountSettings() { const r = row(); return { productPct: r?.product_discount_pct ?? 0, stackable: r?.discounts_stackable !== 0 }; }
export function setProductDiscountPct(pct) { const r = row(); if (r) getDb().runSync('UPDATE business_profile SET product_discount_pct = ? WHERE id = ?', [pct, r.id]); }
export function setDiscountsStackable(on) { const r = row(); if (r) getDb().runSync('UPDATE business_profile SET discounts_stackable = ? WHERE id = ?', [on ? 1 : 0, r.id]); }
