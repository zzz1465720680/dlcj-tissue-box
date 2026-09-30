export const STOCK_PRICE = 99;
export const CUSTOM_PRICE = 159;

export const SPECIAL_WORK_NOTE = {
  zh: '专属图案、刺绣等特殊需求，请私聊确认工艺与报价。',
  en: 'Personal artwork, embroidery and other special work are quoted privately.',
};

export const customPriceLine = (lang: 'zh' | 'en' = 'zh') => lang === 'en'
  ? `Custom colour combinations · CNY ${CUSTOM_PRICE} / piece`
  : `自由定制 ¥${CUSTOM_PRICE} / 件`;

export const CUSTOM_INQUIRY_PRICE_NOTE = `${customPriceLine()}。${SPECIAL_WORK_NOTE.zh}图案与特殊工艺费用不计入固定总价，购买前确认。`;
