import type { Metadata } from 'next';
import SiteHeader from '@/components/brand/site-header';
import SiteFooter from '@/components/brand/site-footer';
import PhotoCarousel from '@/components/floor-mats/photo-carousel';
import { BRAND_COPY } from '@/lib/brand-copy';
import { FLOOR_MAT_COPY, FLOOR_MAT_SLIDES } from '@/lib/floor-mats/catalog';
import { resolveLang } from '@/lib/showcase-copy';
import '../brand.css';
import './mats.css';

type PageProps = { searchParams: Promise<{ lang?: string }> };
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  return FLOOR_MAT_COPY[resolveLang((await searchParams).lang)].meta;
}

export default async function FloorMatsPage({ searchParams }: PageProps) {
  const lang = resolveLang((await searchParams).lang);
  const copy = FLOOR_MAT_COPY[lang];
  return (
    <div className="dc-site fm-page" lang={lang === 'en' ? 'en' : 'zh-CN'}>
      <a className="dc-skipLink" href="#main-content">{BRAND_COPY[lang].skip}</a>
      <SiteHeader lang={lang} active="mats" />
      <main id="main-content">
        <section className="fm-heading dc-container" aria-labelledby="mats-title">
          <p className="dc-eyebrow">{copy.eyebrow}</p>
          <h1 id="mats-title">{copy.title}</h1><p className="fm-lead">{copy.intro}</p>
        </section>
        <div className="fm-galleryWrap dc-container">
          <PhotoCarousel items={FLOOR_MAT_SLIDES} lang={lang} />
          <p className="fm-imageNote">{copy.imageNote}</p>
        </div>
        <section className="fm-about dc-container" aria-labelledby="mats-about-title">
          <div><p className="dc-eyebrow">{copy.aboutLabel}</p><h2 id="mats-about-title">{copy.aboutTitle}</h2></div>
          <div><p>{copy.aboutBody}</p><p className="fm-availability">{copy.availability}</p></div>
        </section>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
