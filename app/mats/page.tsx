import type { Metadata } from 'next';
import SiteHeader from '@/components/brand/site-header';
import FloorMatShowcase from '@/components/floor-mats/showcase';
import { BRAND_COPY, brandHref } from '@/lib/brand-copy';
import { FLOOR_MAT_COPY } from '@/lib/floor-mats/catalog';
import { resolveLang } from '@/lib/showcase-copy';
import '../brand.css';
import '../store-home.css';
import './mats.css';

type PageProps = { searchParams: Promise<{ lang?: string }> };
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  return FLOOR_MAT_COPY[resolveLang((await searchParams).lang)].meta;
}

export default async function FloorMatsPage({ searchParams }: PageProps) {
  const lang = resolveLang((await searchParams).lang);
  const copy = FLOOR_MAT_COPY[lang];
  return (
    <>
      <SiteHeader lang={lang} active="mats" />
      <div className="sh-home fm-page" lang={lang === 'en' ? 'en' : 'zh-CN'}>
        <a className="sh-skip" href="#main-content">{BRAND_COPY[lang].skip}</a>
        <div className="sh-sheet">
          <main id="main-content">
            <div className="sh-intro"><h1 id="mats-title">{copy.title}</h1><p>{lang === 'zh' ? '九款配色展示' : 'Nine colour references'}</p></div>
            <FloorMatShowcase lang={lang}/>
            <section className="fm-about" aria-labelledby="mats-about-title">
              <div><p className="sh-eyebrow">{copy.aboutLabel}</p><h2 id="mats-about-title">{copy.aboutTitle}</h2></div>
              <div><p>{copy.aboutBody}</p><p className="fm-availability">{copy.availability}</p></div>
            </section>
          </main>
          <footer className="sh-footer"><div className="sh-footerRow"><p>{copy.imageNote}</p><nav aria-label={lang === 'zh' ? '更多信息' : 'More information'}><a href={brandHref('/',lang)}>{BRAND_COPY[lang].home}</a><a href={brandHref('/tissue-box',lang)}>{BRAND_COPY[lang].tissueBox}</a><a href="/my">{lang === 'zh' ? '我的' : 'My designs'}</a><a href="/admin/login">{lang === 'zh' ? '商家管理' : 'Merchant login'}</a><a className="sh-language" href={lang === 'zh' ? '/mats?lang=en' : '/mats'}>{lang === 'zh' ? 'English' : '中文'}</a></nav></div></footer>
        </div>
      </div>
    </>
  );
}
