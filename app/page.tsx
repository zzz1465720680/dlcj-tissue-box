/* eslint-disable @next/next/no-img-element -- Optimized local WebP assets supply responsive sizes. */
import type { Metadata } from 'next';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import SiteHeader from '@/components/brand/site-header';
import SiteFooter from '@/components/brand/site-footer';
import ContactOptions from '@/components/contact-options';
import { BRAND_COPY, brandHref } from '@/lib/brand-copy';
import { PRODUCT_LINES } from '@/lib/product-lines';
import { resolveLang } from '@/lib/showcase-copy';
import './brand.css';

type PageProps = { searchParams: Promise<{ lang?: string }> };
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  return BRAND_COPY[resolveLang((await searchParams).lang)].meta;
}

export default async function BrandHome({ searchParams }: PageProps) {
  const lang = resolveLang((await searchParams).lang);
  const copy = BRAND_COPY[lang];
  return (
    <div className="dc-site" lang={lang === 'en' ? 'en' : 'zh-CN'}>
      <a className="dc-skipLink" href="#main-content">{copy.skip}</a>
      <SiteHeader lang={lang} active="home" />
      <main id="main-content">
        <section className="dc-homeHero dc-container" aria-labelledby="home-title">
          <p className="dc-eyebrow">{copy.eyebrow}</p>
          <h1 id="home-title">{copy.title.map(line => <span key={line}>{line}</span>)}</h1>
          <div className="dc-homeIntro"><p>{copy.intro}</p><a href="#collections">{copy.explore}<ArrowDown size={17} aria-hidden="true" /></a></div>
        </section>
        <section id="collections" className="dc-collections dc-container" aria-labelledby="collection-title">
          <div className="dc-sectionHeading"><h2 id="collection-title">{copy.collection}</h2><p>{copy.collectionTitle}</p></div>
          <div className="dc-productGrid">
            {PRODUCT_LINES.map((product, index) => {
              const content = product.copy[lang];
              return (
                <a key={product.id} className={`dc-productCard dc-productCard--${product.id}`} href={brandHref(product.href, lang)}>
                  <div className="dc-productImage">
                    <img src={product.image} srcSet={product.imageSet} sizes="(max-width: 700px) 100vw, 50vw" width={product.width} height={product.height} alt={content.alt} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" />
                  </div>
                  <div className="dc-productCopy">
                    <p className="dc-productLabel">{content.label}</p><h3>{content.title}</h3><p className="dc-productBody">{content.body}</p>
                    <span className="dc-productAction">{content.action}<ArrowUpRight size={20} aria-hidden="true" /></span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
        <section className="dc-philosophy dc-container" aria-labelledby="approach-title">
          <div><p className="dc-eyebrow">{copy.philosophyLabel}</p><h2 id="approach-title">{copy.philosophyTitle.map(line => <span key={line}>{line}</span>)}</h2></div>
          <p className="dc-philosophyBody">{copy.philosophyBody}</p>
        </section>
        <section className="dc-contact dc-container" aria-labelledby="home-contact-title"><div className="dc-sectionHeading"><h2 id="home-contact-title">{lang==='zh'?'联系商家':'Contact the maker'}</h2><p>{lang==='zh'?'喜欢的搭配，直接聊一聊。':'Let’s talk about your combination.'}</p></div><ContactOptions lang={lang} context="brand"/></section>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
