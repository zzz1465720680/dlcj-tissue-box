'use client';
import {StoreShell} from './store-shared';
import ContactOptions from './contact-options';
import {activeContactChannels} from '@/lib/merchant-config';
import {SHOWCASE_COPY} from '@/lib/showcase-copy';

/** Netlify build: online checkout is not enabled. Orders are placed by adding the merchant on WeChat. */
export default function WechatOrder() {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const styleId = params.get('style');
  const style = (SHOWCASE_COPY.zh.colorways.items as readonly {id: string; name: string}[]).find(item => item.id === styleId) ?? (styleId && /^[a-z0-9-]{2,40}$/.test(styleId) ? {id: styleId, name: styleId} : undefined);
  const fen = Number(params.get('unitPriceFen'));
  const price = Number.isSafeInteger(fen) && fen > 0 ? '¥' + (fen / 100).toFixed(fen % 100 ? 2 : 0) : null;
  const designId = params.get('design');
  const hasWechat = activeContactChannels().some(channel => channel.kind === 'wechat');
  return <StoreShell title="请加微信下单" eyebrow="下单方式" description="网站暂不在线下单或收款。请添加商家微信，发送款式或方案，确认材料、价格、运费与交期后再付款。">
    {(style || designId) && <p className="store-lead">你选择的：<strong>{style ? style.name : '自由定制方案'}</strong>{price && <> · 单价 <strong>{price}</strong>（以商家确认为准）</>}{designId && <> · 方案编号 <code>{designId}</code></>}</p>}
    {hasWechat ? <ContactOptions/> : <p className="store-lead">商家微信尚未配置，请通过此前联系的商家账号下单。</p>}
  </StoreShell>;
}
