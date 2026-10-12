import { getDb } from './database';

// Настройки скидок, которые экран раньше писал в базу напрямую (в профиль бизнеса)
const row = () => getDb().getFirstSync('SELECT id, product_discount_pct, discounts_stackable FROM business_profile ORDER BY id LIMIT 1');
export function getDiscountSettings() { const r = row(); return { productPct: r?.product_discount_pct ?? 0, stackable: r?.discounts_stackable !== 0 }; }
export function setProductDiscountPct(pct) { const r = row(); if (r) getDb().runSync('UPDATE business_profile SET product_discount_pct = ? WHERE id = ?', [pct, r.id]); }
export function setDiscountsStackable(on) { const r = row(); if (r) getDb().runSync('UPDATE business_profile SET discounts_stackable = ? WHERE id = ?', [on ? 1 : 0, r.id]); }

// Модули бизнеса (флаги в business_profile.modules): включить или выключить один, не трогая остальные
export function setModuleFlag(key, on) {
  const db = getDb(); const r = db.getFirstSync('SELECT id, modules FROM business_profile ORDER BY id LIMIT 1');
  if (!r) return;
  let mods = {}; try { mods = typeof r.modules === 'string' ? JSON.parse(r.modules || '{}') : (r.modules || {}); } catch (_) { mods = {}; }
  db.runSync('UPDATE business_profile SET modules = ? WHERE id = ?', [JSON.stringify({ ...mods, [key]: on }), r.id]);
}
