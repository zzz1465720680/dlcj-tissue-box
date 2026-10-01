/* eslint-disable @next/next/no-html-link-for-pages -- Language changes intentionally use full-page navigation in Vinext. */
import type { Metadata } from 'next';
import { ArrowUpRight, ArrowRight, Plus } from 'lucide-react';
import { SHOWCASE_COPY, resolveLang } from '@/lib/showcase-copy';
import { merchantFacts } from '@/lib/merchant-config';
import ContactOptions from '@/components/contact-options';
import StockGallery from '@/components/stock-gallery';
import { CUSTOM_PRICE, STOCK_PRICE, SPECIAL_WORK_NOTE } from '@/lib/pricing';

type PageProps = { searchParams: Promise<{ lang?: string }> };
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  return SHOWCASE_COPY[resolveLang((await searchParams).lang)].meta;
}
export default async function TissueBoxPage({ searchParams }: PageProps) {
  const lang = resolveLang((await searchParams).lang);
  const copy = SHOWCASE_COPY[lang];
  const facts = merchantFacts(lang);
  const anchors = ['colorways', 'details', 'how-to-buy'];
  return (
    <div className="sc-showcase" lang={lang === 'en' ? 'en' : 'zh-CN'}>
      <a className="sc-skipLink" href="#colorways">{copy.skip}</a>
      <header className="sc-header">
        <nav className="sc-nav sc-container" aria-label={copy.navLabel}>
          <a href={lang === 'en' ? '/?lang=en' : '/'} className="sc-logo" aria-label={copy.brand}>
            <img src="/brand/dc-logo.svg" alt="" width="38" height="34" /><span>{copy.brand}</span>
          </a>
          <div className="sc-navLinks">{copy.nav.map((label, i) => <a key={label} href={'#' + anchors[i]}>{label}</a>)}</div>
          <div className="sc-navEnd">
            <div className="sc-lang" role="group" aria-label={copy.language}>
              <a href="/tissue-box" hrefLang="zh-CN" aria-current={lang === 'zh' ? 'true' : undefined}>中</a><span aria-hidden="true">/</span>
              <a href="/tissue-box?lang=en" hrefLang="en" aria-current={lang === 'en' ? 'true' : undefined}>EN</a>
            </div>
            <a href="/customize" className="sc-navCta">{copy.customize}<ArrowUpRight size={15} /></a>
          </div>
        </nav>
      </header>
      <main>
        <section className="sc-hero sc-container" aria-labelledby="hero-title">
          <div className="sc-heroCopy">
            <p className="sc-eyebrow">{copy.hero.eyebrow}</p>
            <h1 id="hero-title">{copy.hero.title.map(line => <span key={line}>{line}</span>)}</h1>
            <p className="sc-heroBody">{copy.hero.body}</p>
            <p className="sc-heroPrice">{lang === 'en' ? `Existing styles ¥${STOCK_PRICE} · Custom ¥${CUSTOM_PRICE}` : `现有款式 ¥${STOCK_PRICE} / 件 · 自由定制 ¥${CUSTOM_PRICE} / 件`}</p>
            <div className="sc-heroActions">
              <a className="sc-button" href="#colorways">{copy.hero.choose}<ArrowRight size={17} /></a>
              <a className="sc-textLink" href="#how-to-buy">{copy.hero.custom}<ArrowUpRight size={16} /></a>
            </div>
          </div>
          <figure className="sc-heroMedia">
            <img src="/products/white-lime-1536.webp" srcSet="/products/white-lime-800.webp 800w, /products/white-lime-1536.webp 1536w" sizes="(max-width: 700px) 100vw, 62vw" alt={copy.hero.alt} width="1536" height="1024" fetchPriority="high" />
            <figcaption><span>{copy.hero.caption}</span><span>{lang === 'en' ? 'THE COLLECTION' : '日常，自有心意'}</span></figcaption>
          </figure>
        </section>
        <section id="colorways" className="sc-section sc-container" aria-labelledby="colorways-title">
          <div className="sc-sectionHeading">
            <div><p className="sc-eyebrow">{copy.colorways.label}</p><h2 id="colorways-title">{copy.colorways.title}</h2></div>
            <div className="sc-stockPrice"><strong>¥{STOCK_PRICE}</strong><span>/ {lang === 'en' ? 'piece' : '件'}</span><p>{copy.colorways.intro}</p></div>
          </div>
          <StockGallery items={copy.colorways.items} lang={lang} />
          <p className="sc-imageNote">{copy.colorways.note}</p>
        </section>
        <section id="details" className="sc-details sc-container" aria-labelledby="details-title">
          <figure className="sc-detailPhoto">
            <img src="/products/black-coral-in-car.webp" alt={copy.details.alt} width="1200" height="900" loading="lazy" decoding="async" />
            <figcaption>{copy.details.caption}</figcaption>
          </figure>
          <div className="sc-detailCopy">
            <p className="sc-eyebrow">{copy.details.label}</p>
            <h2 id="details-title">{copy.details.title.map(line => <span key={line}>{line}</span>)}</h2>
            <dl>{copy.details.items.map(item => <div key={item.title}><dt>{item.title}</dt><dd>{item.body}</dd></div>)}</dl>
          </div>
        </section>
        <section id="how-to-buy" className="sc-start" aria-labelledby="start-title">
          <div className="sc-container">
            <div className="sc-startHeading">
              <div><p className="sc-eyebrow">{copy.start.label}</p><h2 id="start-title">{copy.start.title}<span className="sc-customPrice">¥{CUSTOM_PRICE}<small> / {lang === 'en' ? 'piece' : '件'}</small></span></h2><p className="sc-startBody">{copy.start.body}</p><p className="sc-specialWork">{SPECIAL_WORK_NOTE[lang]}</p></div>
              <a className="sc-button" href="/customize">{copy.start.custom}<ArrowUpRight size={17} /></a>
            </div>
            <ol className="sc-steps">{copy.start.steps.map((step, i) => <li key={step.title}><span className="sc-stepNumber">0{i + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div>{i < 2 && <ArrowRight className="sc-stepArrow" size={18} aria-hidden="true" />}</li>)}</ol>
            <details className="sc-contact" id="contact"><summary>{copy.start.contact}<Plus size={18} /></summary><ContactOptions lang={lang} /></details>
            <div className="sc-faq"><h3>{copy.start.questions}</h3><div className="sc-faqList">
              {copy.faq.map(item => <details key={item.q}><summary>{item.q}<Plus size={17} /></summary><p>{item.a}</p></details>)}
              <details><summary>{copy.start.purchase}<Plus size={17} /></summary><p>{copy.start.purchaseNote}</p><ul>{[...facts.confirmed, ...facts.pending].map(fact => <li key={fact}>{fact}</li>)}</ul></details>
            </div></div>
          </div>
        </section>
      </main>
      <footer className="sc-footer sc-container">
        <div><strong>{copy.brand}</strong><span>DINGLI CHEJUAN</span></div>
        <p>{copy.footer}{copy.languageNote && <><br />{copy.languageNote}</>}</p>
      </footer>
    </div>
  );
}
