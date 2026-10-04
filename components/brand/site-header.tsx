'use client';

/* eslint-disable @next/next/no-img-element -- Serve the existing SVG logo directly. */
import type { MouseEventHandler } from 'react';
import { BRAND_COPY, brandHref } from '@/lib/brand-copy';
import type { Lang } from '@/lib/showcase-copy';
import './site-header.css';

type Section = 'home' | 'mats' | 'tissueBox' | 'customize';
export default function SiteHeader({ lang, active, onNavigate }: { lang: Lang; active: Section; onNavigate?: MouseEventHandler<HTMLAnchorElement> }) {
  const copy = BRAND_COPY[lang];
  const routes = { home: '/', mats: '/mats', tissueBox: '/tissue-box' } as const;
  const currentPath = active === 'customize' ? '/customize' : routes[active];
  return (
    <header className="dc-siteHeader">
      <nav className="dc-nav dc-headerContainer" aria-label={copy.navLabel}>
        <a className="dc-logo" href={brandHref('/', lang)} aria-label={copy.brand} onClick={onNavigate}>
          <img src="/brand/dc-logo.svg" width="40" height="36" alt="" />
          <span>{copy.brand}<small>{lang === 'zh' ? 'DINGLI CHEJUAN' : 'EVERYDAY CAR INTERIORS'}</small></span>
        </a>
        <div className="dc-navLinks">
          {Object.entries(routes).map(([key, href]) => (
            <a key={key} href={brandHref(href, lang)} aria-current={active === key ? 'page' : undefined} onClick={onNavigate}>
              {copy[key as Section]}
            </a>
          ))}
        </div>
        <div className="dc-language" role="group" aria-label={copy.language}>
          <a href={currentPath} hrefLang="zh-CN" aria-current={lang === 'zh' ? 'true' : undefined} onClick={onNavigate}>中</a>
          <span aria-hidden="true">/</span>
          <a href={`${currentPath}?lang=en`} hrefLang="en" aria-current={lang === 'en' ? 'true' : undefined} onClick={onNavigate}>EN</a>
        </div>
      </nav>
    </header>
  );
}
