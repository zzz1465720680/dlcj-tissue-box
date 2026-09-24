import type { Metadata } from 'next';
import { ArrowUpRight, ChevronRight, Check, MessageSquare } from 'lucide-react';
import { SHOWCASE_COPY, resolveLang, type Lang } from '@/lib/showcase-copy';
import { merchantFacts } from '@/lib/merchant-config';
import ContactOptions from '@/components/contact-options';

type PageProps = { searchParams: Promise<{ lang?: string }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const copy = SHOWCASE_COPY[resolveLang((await searchParams).lang)];
  return { title: copy.meta.title, description: copy.meta.description };
}

function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <span key={line}>{index > 0 && <br />}{line}</span>
      ))}
    </>
  );
}

function LangToggle({ lang }: { lang: Lang }) {
  const copy = SHOWCASE_COPY[lang].langToggle;
  return (
    <div className="sc-lang" role="group" aria-label={copy.label}>
      <a href="/" aria-current={lang === 'zh' ? 'true' : undefined} hrefLang="zh-CN">
        {copy.zh}
      </a>
      <a href="/?lang=en" aria-current={lang === 'en' ? 'true' : undefined} hrefLang="en">
        {copy.en}
      </a>
    </div>
  );
}

export default async function Home({ searchParams }: PageProps) {
  const lang = resolveLang((await searchParams).lang);
  const copy = SHOWCASE_COPY[lang];
  const facts = merchantFacts(lang);

  return (
    <div className="sc-showcase" lang={lang === 'en' ? 'en' : 'zh-CN'}>
      <a className="sc-skipLink" href="#collection">{copy.skipLink}</a>
      <header className="sc-header">
        <nav className="sc-nav" aria-label={copy.navLabel}>
          <a href="/" className="sc-logo" aria-label={copy.logoLabel}>
            <img src="/brand/dc-logo.svg" alt="DC 商标" className="sc-dcLogo" width="40" height="36" />
            <span>{copy.brand}</span>
          </a>
          <div className="sc-navLinks">
            <a href="#collection" aria-current="page">{copy.nav.collection}</a>
            <a href="#colorways">{copy.nav.colorways}</a>
            <a href="#details">{copy.nav.details}</a>
            <a href="#how-to-buy">{copy.nav.purchase}</a>
          </div>
          <div className="sc-navEnd">
            <LangToggle lang={lang} />
            <a href="/customize" className="sc-navCta">{copy.nav.cta} <ArrowUpRight size={14} /></a>
          </div>
        </nav>
      </header>
      <main>
        <section id="collection" className="sc-collection" aria-labelledby="collection-title">
          <div className="sc-titleRow">
            <h1 id="collection-title">{copy.collection.title}</h1>
            <p>{copy.collection.tagline}</p>
          </div>
          <div className="sc-collectionLabel">
            <span className="sc-collectionName">{copy.collection.series}</span>
            <span className="sc-colorDots" aria-label={copy.collection.seriesColors}><i /><i /><i /></span>
            <span className="sc-collectionNote">{copy.collection.seriesNote}</span>
          </div>
          <article className="sc-hero">
            <img className="sc-heroImage" src="/showcase/hero-studio-1672.webp" srcSet="/showcase/hero-studio-840.webp 840w, /showcase/hero-studio-1672.webp 1672w" sizes="(max-width: 600px) 115vw, (max-width: 1552px) 92vw, 1440px" alt={copy.collection.heroAlt} width="1672" height="941" fetchPriority="high" />
            <div className="sc-heroTop">
              <div>
                <p className="sc-eyebrow">{copy.collection.eyebrow}</p>
                <h2>{copy.collection.heroTitle}</h2>
                <p className="sc-heroDescription">{copy.collection.heroDescription}</p>
              </div>
              <div className="sc-heroActions">
                <a className="sc-button" href="#colorways">{copy.hero.start} <ChevronRight size={17} /></a>
                <a className="sc-textLink" href="#how-to-buy">{copy.hero.how} <ChevronRight size={16} /></a>
              </div>
            </div>
            <div className="sc-heroCaption"><span>{copy.collection.captionLeft}</span><span>{copy.collection.captionRight}</span></div>
          </article>
        </section>

        <section id="colorways" className="sc-section sc-colorwaySection" aria-labelledby="colorway-title">
          <div className="sc-sectionHeading">
            <h2 id="colorway-title">{copy.colorways.title}</h2>
            <p>{copy.colorways.intro}</p>
          </div>
          <ul className="sc-colorwayGrid">
            {copy.colorways.items.map(item => (
              <li key={item.id}>
                <a className="sc-colorwayCard" href={`/customize?preset=${item.id}`}>
                  <span className="sc-colorwayMedia">
                    <img src={`/presets/${item.id}.webp`} alt={item.alt} width="360" height="270" loading="lazy" decoding="async" />
                  </span>
                  <span className="sc-colorwayCopy">
                    <strong>{item.name}</strong>
                    <span className="sc-colorwayText">{item.description}</span>
                    <span className="sc-colorwayCta">{copy.colorways.choose} <ArrowUpRight size={15} /></span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="sc-colorwayFooter">
            <div className="sc-customEntryLinks"><a className="sc-textLink" href="/customize"><MessageSquare size={16} />{copy.colorways.freeform}</a><a className="sc-textLink" href="/customize?preview=light">{lang === 'zh' ? '手机慢网？轻量选款' : 'Lightweight preview'} <ChevronRight size={16}/></a></div>
            <p>{copy.colorways.freeformNote}</p>
          </div>
          <p className="sc-presetNote">{copy.colorways.presetNote}</p>
        </section>

        <section id="customization" className="sc-section sc-customSection" aria-labelledby="custom-title">
          <a href="/customize" className="sc-customPoster" aria-label={copy.poster.label}>
            <img className="sc-customImage" src="/showcase/customize-collection-1672.webp" srcSet="/showcase/customize-collection-840.webp 840w, /showcase/customize-collection-1672.webp 1672w" sizes="(max-width: 600px) 150vw, (max-width: 1552px) 92vw, 1440px" width="1672" height="941" alt={copy.poster.imageAlt} loading="lazy" decoding="async" />
            <div className="sc-customCopy">
              <p className="sc-eyebrow">{copy.poster.eyebrow}</p>
              <h2 id="custom-title"><Lines lines={copy.poster.title} /></h2>
              <p className="sc-customDescription"><Lines lines={copy.poster.description} /></p>
              <span className="sc-button sc-lightButton">{copy.poster.cta} <ArrowUpRight size={18} /></span>
            </div>
            <div className="sc-customFooter"><span>{copy.poster.footerLeft}</span><span>{copy.poster.footerRight} <ArrowUpRight size={17} /></span></div>
          </a>
          <p className="sc-customNote">{copy.poster.noteColors} <span>{copy.poster.noteText}</span></p>
        </section>

        <section id="product-info" className="sc-infoSection" aria-labelledby="info-title">
          <div className="sc-section sc-infoInner">
            <div className="sc-sectionHeading">
              <h2 id="info-title">{copy.info.title}</h2>
              <p><Lines lines={copy.info.intro} /></p>
            </div>
            <div className="sc-infoGrid">
              <article className="sc-infoCard">
                <h3>{copy.info.rangeTitle}</h3>
                <ul>{copy.info.range.map(item => <li key={item}><Check size={15} />{item}</li>)}</ul>
              </article>
              <article className="sc-infoCard sc-infoConfirmed">
                <h3>{copy.info.confirmedTitle}</h3>
                <ul>{copy.info.confirmed.map(item => <li key={item}><Check size={15} />{item}</li>)}</ul>
              </article>
              <article className="sc-infoCard sc-infoPending">
                <h3>{copy.info.pendingTitle}</h3>
                <ul>{facts.pending.map(item => <li key={item}>{item}</li>)}</ul>
              </article>
              <article className="sc-infoCard">
                <h3>{copy.info.careTitle}</h3>
                <ul>{copy.info.care.map(item => <li key={item}>{item}</li>)}</ul>
              </article>
              {facts.confirmed.length > 0 && <article className="sc-infoCard sc-infoConfirmed">
                <h3>{lang === 'zh' ? '产品规格与服务' : 'Product and service details'}</h3>
                <ul>{facts.confirmed.map(item => <li key={item}><Check size={15}/>{item}</li>)}</ul>
              </article>}
            </div>
          </div>
        </section>

        <section id="details" className="sc-detailsSection" aria-labelledby="details-title">
          <div className="sc-section sc-detailInner">
            <div className="sc-sectionHeading">
              <h2 id="details-title">{copy.details.title}</h2>
              <p><Lines lines={copy.details.intro} /></p>
            </div>
            <div className="sc-detailGrid">
              <article className="sc-detailCard">
                <div className="sc-detailMedia">
                  <img className="sc-craftImage" src="/showcase/craft-detail-1086.webp" srcSet="/showcase/craft-detail-600.webp 600w, /showcase/craft-detail-1086.webp 1086w" sizes="(max-width: 600px) 90vw, 44vw" width="1086" height="1448" loading="lazy" decoding="async" alt={copy.details.craftAlt} />
                </div>
                <div className="sc-detailCopy">
                  <p className="sc-cardLabel">{copy.details.craftLabel}</p>
                  <h3>{copy.details.craftTitle}</h3>
                  <p><Lines lines={copy.details.craftBody} /></p>
                </div>
              </article>
              <article className="sc-detailCard">
                <div className="sc-detailMedia">
                  <img className="sc-sceneImage" src="/showcase/car-scene-941.webp" srcSet="/showcase/car-scene-600.webp 600w, /showcase/car-scene-941.webp 941w" sizes="(max-width: 600px) 90vw, 44vw" width="941" height="1672" loading="lazy" decoding="async" alt={copy.details.sceneAlt} />
                  <span className="sc-sceneNote">{copy.details.sceneNote}</span>
                </div>
                <div className="sc-detailCopy">
                  <p className="sc-cardLabel">{copy.details.sceneLabel}</p>
                  <h3>{copy.details.sceneTitle}</h3>
                  <p><Lines lines={copy.details.sceneBody} /></p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="how-to-buy" className="sc-section sc-stepsSection" aria-labelledby="steps-title">
          <div className="sc-sectionHeading">
            <h2 id="steps-title">{copy.steps.title}</h2>
            <p>{copy.steps.intro}</p>
          </div>
          <ol className="sc-stepGrid">
            {copy.steps.items.map((item, index) => (
              <li key={item.title}>
                <span className="sc-stepNumber">{String(index + 1).padStart(2, '0')}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ol>
          <p className="sc-stepNote">{copy.steps.note}</p>
        </section>

        <section id="faq" className="sc-section sc-faqSection" aria-labelledby="faq-title">
          <div className="sc-sectionHeading">
            <h2 id="faq-title">{copy.faq.title}</h2>
            <p>{copy.faq.intro}</p>
          </div>
          <div className="sc-faqList">
            {copy.faq.items.map(item => (
              <details key={item.q}>
                <summary>{item.q}<ChevronRight size={17} /></summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="contact" className="sc-section sc-contactSection" aria-labelledby="contact-title">
          <div className="sc-sectionHeading">
            <h2 id="contact-title">{lang === 'zh' ? '聊聊你的定制方案。' : 'Discuss your custom design.'}</h2>
            <p>{lang === 'zh' ? '电话或微信联系，确认后制作。' : 'Contact us by phone or WeChat to confirm the details.'}</p>
          </div>
          <ContactOptions lang={lang}/>
        </section>

        <section className="sc-closing" aria-labelledby="closing-title">
          <p className="sc-eyebrow">{copy.closing.eyebrow}</p>
          <h2 id="closing-title">{copy.closing.title}</h2>
          <a className="sc-textLink" href="/customize">{copy.closing.cta} <ArrowUpRight size={18} /></a>
        </section>
      </main>
      <footer className="sc-footer">
        <span>{copy.footer.brand} <span className="sc-wordmark">{copy.footer.wordmark}</span> <a href="#contact">{lang === 'zh' ? '联系定制' : 'Contact'}</a></span>
        <span className="sc-footerNotes"><span>{copy.footer.note}</span><span>{copy.languageNote}</span></span>
      </footer>
    </div>
  );
}
