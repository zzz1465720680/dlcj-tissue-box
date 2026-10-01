import { BRAND_COPY, brandHref } from '@/lib/brand-copy';
import type { Lang } from '@/lib/showcase-copy';

export default function SiteFooter({ lang }: { lang: Lang }) {
  const copy = BRAND_COPY[lang];
  return (
    <footer className="dc-footer dc-container">
      <div><strong>{copy.brand}</strong><p>{copy.footer}</p></div>
      <nav aria-label={lang === 'zh' ? '页尾导航' : 'Footer navigation'}>
        <a href={brandHref('/', lang)}>{copy.home}</a>
        <a href={brandHref('/mats', lang)}>{copy.mats}</a>
        <a href={brandHref('/tissue-box', lang)}>{copy.tissueBox}</a>
      </nav>
    </footer>
  );
}
