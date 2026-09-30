import { customPriceLine, SPECIAL_WORK_NOTE } from '@/lib/pricing';

export default function CustomizationPriceNote() {
  return <p className="customization-price-note">
    <strong>{customPriceLine()}</strong>
    <span>{SPECIAL_WORK_NOTE.zh}</span>
  </p>;
}
