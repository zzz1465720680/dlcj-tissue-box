// 商家经营信息与客服渠道的唯一配置入口。
// 电话及微信由商家于2026-09-24提供；价格、交期等未确认资料继续留待沟通。
// 首页与咨询面板共用这些渠道。

export type ContactKind = 'wechat' | 'phone' | 'link' | 'email';

export type ContactChannel = {
  id: string;
  kind: ContactKind;
  /** 按钮文字，例如“微信咨询：dingli-kehu” */
  label: string;
  /** 实际值：手机号、微信号、网址或邮箱。留空表示尚未配置。 */
  value: string;
  /** 可选提示，例如“添加时请备注：纸巾盒定制” */
  hint?: string;
};

type Fact = {zh: string; en: string};
type MerchantConfig = {
  brand: string;
  /** 第一阶段确定为“联系客服确认购买”。改为在线交易前必须接入并验证真实支付服务。 */
  purchaseMode: 'contact' | 'online';
  contact: {
    /** 留空 = 尚未配置客服渠道。示例（商家补充后填写，勿填样例号码）：
     * {id:'wechat',kind:'wechat',label:'微信咨询',value:'',hint:'添加时请备注：纸巾盒定制'} */
    channels: ContactChannel[];
    /** 未配置客服时对外显示的诚实说明。 */
    pendingNote: string;
  };
  facts: {
    /** 已由商家确认、可以对外陈述的信息。 */
    confirmed: Fact[];
    /** 尚未确认、必须由商家补充后才能对外陈述的信息。 */
    pending: Fact[];
  };
};

export const MERCHANT_CONFIG: MerchantConfig = {
  brand: '鼎立车眷',
  purchaseMode: 'contact',
  contact: {
    channels: [
      {id: 'phone', kind: 'phone', label: '电话咨询', value: '13859235588'},
      {id: 'wechat', kind: 'wechat', label: '微信咨询', value: 'Zjw123098', hint: '添加时请备注：纸巾盒定制；可将需求文字或方案文件发给我。'},
    ],
    pendingNote:
      '请将需求文字或方案文件发回此前联系的商家账号。本站暂未提供直接联系入口，方案不会自动发送。',
  },
  facts: {
    confirmed: [],
    pending: [
      {zh: '成品尺寸与抽纸适配：请提供放置位置和抽纸包装尺寸，供商家核对。', en: 'Fit: share the available space and tissue-pack dimensions for confirmation.'},
      {zh: '材料与图案：按实物色卡、可用材料和实际工艺确认。', en: 'Materials and artwork: confirm physical swatches, available materials and production methods.'},
      {zh: '报价与交付：确认数量、总价、制作时间、运费和付款方式。', en: 'Quote and delivery: confirm quantity, total price, lead time, shipping and payment method.'},
      {zh: '定制约定：确认修改、交付及售后规则后再购买。', en: 'Custom-order terms: agree on changes, delivery and after-sales support before purchasing.'},
    ],
  },
};

export function merchantFacts(lang: 'zh' | 'en') {
  return {confirmed: MERCHANT_CONFIG.facts.confirmed.map(item => item[lang]), pending: MERCHANT_CONFIG.facts.pending.map(item => item[lang])};
}

export const activeContactChannels = (): ContactChannel[] =>
  MERCHANT_CONFIG.contact.channels.map(channel => ({...channel, value: channel.value.trim()})).filter(channel => {
    if (!channel.value || !channel.label.trim()) return false;
    if (channel.kind === 'link') {
      try { const url = new URL(channel.value); return url.protocol === 'https:' && !url.username && !url.password; }
      catch { return false; }
    }
    if (channel.kind === 'phone') return /^\+?[\d ()-]{5,24}$/.test(channel.value);
    if (channel.kind === 'email') return /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(channel.value);
    return channel.kind === 'wechat';
  });

export const hasContactChannel = (): boolean => activeContactChannels().length > 0;

/** 建模参考尺寸：仅用于 3D 预览，不是成品销售规格。 */
export const REFERENCE_SIZE = { length: 16, width: 10.5, height: 6, unit: 'cm' };

export const contactKindLabel: Record<ContactKind, string> = {
  wechat: '微信',
  phone: '电话',
  link: '链接',
  email: '邮箱',
};
