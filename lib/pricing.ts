import type {Design} from './design';

export type StorePricing = {
  currency: 'CNY'; version: number; standardFen: number; customFen: number; updatedAt: string | null;
};
export type PricingAudit = {
  id: string; actorId: string; actorLabel: string; at: string;
  before: StorePricing; after: StorePricing;
};
// Seed a new database once; preview mode labels these as reference prices.
export const INITIAL_PRICING: Readonly<StorePricing> = Object.freeze({
  currency: 'CNY', version: 1, standardFen: 9900, customFen: 15900, updatedAt: null,
});
export const MAX_UNIT_PRICE_FEN = 1_000_000;
export function validPricing(value: unknown): value is StorePricing {
  if (!value || typeof value !== 'object') return false;
  const p = value as StorePricing;
  return p.currency === 'CNY' && Number.isSafeInteger(p.version) && p.version >= 1 &&
    [p.standardFen, p.customFen].every(fen => Number.isSafeInteger(fen) && fen >= 1 && fen <= MAX_UNIT_PRICE_FEN) &&
    (p.updatedAt === null || (typeof p.updatedAt === 'string' && Number.isFinite(Date.parse(p.updatedAt))));
}
export const priceNumber = (fen?: number | null) => typeof fen === 'number'
  ? (fen / 100).toFixed(fen % 100 ? 2 : 0) : '待确认';
export function parsePriceYuan(value: string): number | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return null;
  const [yuan, fraction = ''] = value.split('.');
  const fen = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(fen) && fen >= 1 && fen <= MAX_UNIT_PRICE_FEN ? fen : null;
}
export function priceConfirmation(pricing: StorePricing, kind: 'standard' | 'custom') {
  return {expectedPricingVersion: pricing.version, expectedUnitPriceFen: kind === 'standard' ? pricing.standardFen : pricing.customFen};
}
export function checkoutPriceQuery(pricing: StorePricing | null, kind: 'standard' | 'custom') {
  if (!pricing) return '';
  return '&' + new URLSearchParams({pricingVersion: String(pricing.version), unitPriceFen: String(kind === 'standard' ? pricing.standardFen : pricing.customFen)}).toString();
}

export const SPECIAL_WORK_NOTE = {
  zh: '专属图案、刺绣等特殊需求，请私聊确认工艺与报价。',
  en: 'Personal artwork, embroidery and other special work are quoted privately.',
};

export const customPriceLine = (lang: 'zh' | 'en' = 'zh', pricing: StorePricing | null = null) => lang === 'en'
  ? pricing ? `Custom colour combinations · CNY ${priceNumber(pricing.customFen)} / piece` : 'Custom colour combinations · price to be confirmed'
  : pricing ? `自由定制 ¥${priceNumber(pricing.customFen)} / 件` : '自由定制价格待确认';
export const pricingLine = (lang: 'zh' | 'en', pricing: StorePricing | null) => lang === 'en'
  ? pricing ? `Existing styles: CNY ${priceNumber(pricing.standardFen)} per piece. Custom combinations: CNY ${priceNumber(pricing.customFen)} per piece.` : 'Prices are awaiting confirmation from the store.'
  : pricing ? `现有款式 ¥${priceNumber(pricing.standardFen)} / 件；配色定制 ¥${priceNumber(pricing.customFen)} / 件。` : '商品价格待服务端确认。';

export const customInquiryPriceNote = (pricing: StorePricing | null) => `${customPriceLine('zh', pricing)}。${SPECIAL_WORK_NOTE.zh}图案与特殊工艺费用不计入配色定制金额，购买前确认。`;
export function needsSpecialWork(design: Design) {
  return Object.values(design.parts).some(part => part.art.length > 0) ||
    Boolean(design.label.enabled && (design.label.image || design.label.text.trim() !== 'DLCJ'));
}
