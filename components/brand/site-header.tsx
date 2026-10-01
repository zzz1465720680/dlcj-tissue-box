/* eslint-disable @next/next/no-img-element -- Serve the existing SVG logo directly. */
import { BRAND_COPY, brandHref } from '@/lib/brand-copy';
import type { Lang } from '@/lib/showcase-copy';

type Section = 'home' | 'mats' | 'tissueBox';
export default function SiteHeader({ lang, active }: { lang: Lang; active: Section }) {
  const copy = BRAND_COPY[lang];
  const routes = { home: '/', mats: '/mats', tissueBox: '/tissue-box' } as const;
  return (
    <header className="dc-siteHeader">
      <nav className="dc-nav dc-container" aria-label={copy.navLabel}>
        <a className="dc-logo" href={brandHref('/', lang)} aria-label={copy.brand}>
          <img src="/brand/dc-logo.svg" width="40" height="36" alt="" />
          <span>{copy.brand}<small>{lang === 'zh' ? 'DINGLI CHEJUAN' : 'EVERYDAY CAR INTERIORS'}</small></span>
        </a>
        <div className="dc-navLinks">
          {Object.entries(routes).map(([key, href]) => (
            <a key={key} href={brandHref(href, lang)} aria-current={active === key ? 'page' : undefined}>
              {copy[key as Section]}
            </a>
          ))}
        </div>
        <div className="dc-language" role="group" aria-label={copy.language}>
          <a href={routes[active]} hrefLang="zh-CN" aria-current={lang === 'zh' ? 'true' : undefined}>中</a>
          <span aria-hidden="true">/</span>
          <a href={`${routes[active]}?lang=en`} hrefLang="en" aria-current={lang === 'en' ? 'true' : undefined}>EN</a>
        </div>
      </nav>
    </header>
  );
}
