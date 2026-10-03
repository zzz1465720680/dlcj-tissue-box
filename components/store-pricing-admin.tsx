'use client';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {parsePriceYuan, priceNumber, validPricing, type PricingAudit, type StorePricing} from '@/lib/pricing';
import {errorMessage, formatYuan, retireOperationKey, stableOperationKey, StoreApiError, storePost, storeRequest} from '@/lib/store-client';
import {StoreLoading, StoreNotice, StoreServiceError} from './store-shared';

export default function StorePricingAdmin() {
  const [pricing, setPricing] = useState<StorePricing | null>(null), [audit, setAudit] = useState<PricingAudit[]>([]);
  const [standard, setStandard] = useState(''), [custom, setCustom] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [loadingError, setLoadingError] = useState<unknown>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false); const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void storeRequest<{pricing: StorePricing; audit: PricingAudit[]}>('/admin/pricing', {signal: controller.signal, cache: 'no-store'}).then(result => {
      if (controller.signal.aborted) return;
      if (!validPricing(result.pricing) || !Array.isArray(result.audit)) throw new Error('商品定价响应异常，请重试。');
      setPricing(result.pricing); setAudit(result.audit); setStandard(priceNumber(result.pricing.standardFen)); setCustom(priceNumber(result.pricing.customFen)); setConfirmed(false); setLoadingError(null);
    }).catch(cause => {if (!controller.signal.aborted) setLoadingError(cause);});
    return () => controller.abort();
  }, [revision]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (lock.current || !pricing || !confirmed) return;
    const standardFen = parsePriceYuan(standard), customFen = parsePriceYuan(custom);
    if (standardFen === null || customFen === null) {setError('单价请填写 0.01–10000 元，最多两位小数。'); return;}
    const payload = {standardFen, customFen, expectedVersion: pricing.version};
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const operationKey = await stableOperationKey('pricing', payload);
      const result = await storePost<{pricing: StorePricing}>('/admin/pricing', {...payload, operationKey});
      if (!validPricing(result.pricing)) throw new Error('保存结果无法确认，请重试核对。');
      setPricing(result.pricing); setConfirmed(false); setNotice('商品价格已保存，修改仅影响之后确认的新订单。');
      setRevision(value => value + 1);
      await retireOperationKey('pricing', payload);
    } catch (cause) {
      if (cause instanceof StoreApiError && cause.code === 'PRICE_CHANGED' && cause.pricing) {setPricing(cause.pricing); setConfirmed(false);}
      setError(errorMessage(cause));
    } finally {lock.current = false; setBusy(false);}
  }
  if (loadingError) return <StoreServiceError error={loadingError} retry={() => setRevision(value => value + 1)}/>;
  if (!pricing) return <StoreLoading text="读取商品定价…"/>;
  return <div className="store-admin-pricing">
    <section className="store-card">
      <div className="store-section-head"><h2>商品定价</h2><button type="button" className="store-button secondary" disabled={busy} onClick={() => setRevision(value => value + 1)}>刷新价格</button></div>
      <p>当前基础款 {formatYuan(pricing.standardFen)} / 件，配色定制 {formatYuan(pricing.customFen)} / 件。</p>
      <p className="store-field-hint">特殊图案与刺绣仍单独报价；脚垫仅展示，支付保持关闭。旧订单金额不会随这里的修改变化。</p>
      <form className="store-form" onSubmit={save}>
        <label htmlFor="pricing-standard">纸巾盒基础款（元 / 件）<input id="pricing-standard" type="text" inputMode="decimal" maxLength={12} value={standard} onChange={event => {setStandard(event.target.value); setConfirmed(false);}} required disabled={busy}/></label>
        <label htmlFor="pricing-custom">纸巾盒配色定制款（元 / 件）<input id="pricing-custom" type="text" inputMode="decimal" maxLength={12} value={custom} onChange={event => {setCustom(event.target.value); setConfirmed(false);}} required disabled={busy}/></label>
        <p>本次调整：基础款 {formatYuan(pricing.standardFen)} → {formatYuan(parsePriceYuan(standard))}；配色定制 {formatYuan(pricing.customFen)} → {formatYuan(parsePriceYuan(custom))}。</p>
        <label className="store-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy}/><span>已核对价格修改，确认仅应用到新的订单</span></label>
        {error && <StoreNotice error>{error}</StoreNotice>}{notice && <StoreNotice>{notice}</StoreNotice>}
        <button className="store-button" disabled={busy || !confirmed}>{busy ? '正在保存价格…' : '保存商品价格'}</button>
      </form>
    </section>
    <section className="store-card"><h2>价格修改记录</h2><p className="store-field-hint">显示最近 100 次修改，记录由服务端保留。</p>
      {audit.length ? <ul className="store-admin-coupon-list">{audit.map(item => <li key={item.id}>
        <p>基础款 {formatYuan(item.before.standardFen)} → {formatYuan(item.after.standardFen)}；配色定制 {formatYuan(item.before.customFen)} → {formatYuan(item.after.customFen)}</p>
        <p className="store-small-note">{new Date(item.at).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}（北京时间） · 操作人 {item.actorLabel}</p><small className="store-selectable">{item.actorId}</small>
      </li>)}</ul> : <p>尚无价格修改记录。</p>}
    </section>
  </div>;
}
