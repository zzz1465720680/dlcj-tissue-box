'use client';
import { customPriceLine, SPECIAL_WORK_NOTE } from '@/lib/pricing';
import {useStorePricing} from '@/hooks/use-store-pricing';
import StorePricingNote from './store-pricing-note';

export default function CustomizationPriceNote({prices: provided}: {prices?: ReturnType<typeof useStorePricing>} = {}) {
  const own = useStorePricing(!provided);
  const prices = provided ?? own;
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const seenVersion = params.get('pricingVersion'), seenUnit = params.get('unitPriceFen');
  const changedOnArrival = prices.pricing && seenVersion !== null && (seenVersion !== String(prices.pricing.version) || seenUnit !== String(prices.pricing.customFen));
  return <><p className="customization-price-note">
    <strong>{customPriceLine('zh', prices.pricing)}</strong>
    <span>{SPECIAL_WORK_NOTE.zh}</span>
  </p>{changedOnArrival && <p className="store-small-note" role="alert">选款时的定制价格已变化，请核对当前价格，并在下单前重新确认。</p>}<StorePricingNote {...prices}/></>;
}
