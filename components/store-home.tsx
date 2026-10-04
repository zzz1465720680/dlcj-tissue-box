'use client';

/* eslint-disable @next/next/no-img-element -- Responsive local WebP photographs also support the static build. */
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type TouchEvent } from 'react';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, Plus, X } from 'lucide-react';
import ContactOptions from '@/components/contact-options';
import SiteHeader from '@/components/brand/site-header';
import {frontendPreview, netlifyPricing} from '@/lib/frontend-preview';
import './tissue-designer.css';
import {checkoutPriceQuery, priceNumber, pricingLine, SPECIAL_WORK_NOTE} from '@/lib/pricing';
import {useStorePricing} from '@/hooks/use-store-pricing';
import StorePricingNote from './store-pricing-note';
import { SHOWCASE_COPY, type Lang } from '@/lib/showcase-copy';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const InlineStudio = lazy(()=>import('./store-studio'));
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}
function subscribeVisibility(callback: () => void) {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
}
const getMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const getVisibility = () => document.visibilityState === 'visible';
const serverMotion = () => true;
const serverVisibility = () => false;

const HOME_COPY = {
  zh: {
    home: '首页', tissueBox: '纸巾盒', mats: '脚垫', design: '开始设计', mine: '我的', gallery: '设计广场',
    heading: '一件小物，随你心意。', collection: '七款常规设计', select: '选择这款', unit: '件',
    previous: '上一款', next: '下一款', pause: '暂停自动轮播', play: '播放自动轮播',
    reducedMotion: '已按系统设置关闭自动轮播', carousel: '七款常规设计', slide: '款式',
    help: '使用左右方向键切换款式，Home 跳到第一款，End 跳到最后一款。触控屏可左右滑动。',
    custom: '自由定制', customTitle: '喜欢的颜色，自己搭配。',
    customBody: '从主体、包角到封边与缝线，搭配属于你的纸巾盒。',
    photoLabel: '实物照片 · AI 精修', palette: '从一抹喜欢的颜色开始',
    paletteNote: '配色为接近现货的示意，以实物色卡确认为准', body: '主体', corners: '包角', trim: '封边与缝线',
    dark: '曜石黑', coral: '珊瑚红', imageNote: '产品图经 AI 精修，颜色与细节以实物为准',
    contact: '联系我们', terms: '购买须知', close: '收起',
    termsIntro: '选款或整理方案后，与商家核对实际皮料、需求与交付信息。',
    facts: [
      ['材质与颜色', '第一阶段提供细纹皮。屏幕配色用于接近现货的效果示意，实际颜色、皮料及工艺以实物确认结果为准。'],
      ['制作时间', '常规款在核实付款后 1–2 个自然日制作；自由定制在实际皮料与设计确认后 5–7 个自然日制作，均包含周末。运输时间另计。'],
      ['费用与配送', '专属图案、刺绣等特殊工艺另行报价。运费按地址另行确认，最终总价由商家核对。'],
      ['尺寸与售后', '购买前核对放置位置、抽纸包装及成品尺寸，并确认修改、交付与售后约定。工坊尺寸仅作建模参考。'],
    ],
    language: 'English', languageNote: '',
  },
  en: {
    home: 'Home', tissueBox: 'Tissue boxes', mats: 'Floor mats', design: 'Start designing', mine: 'My designs', gallery: 'Design gallery',
    heading: 'A little detail. Entirely you.', collection: 'Seven everyday styles', select: 'Choose this style', unit: 'piece',
    previous: 'Previous style', next: 'Next style', pause: 'Pause automatic slideshow', play: 'Start automatic slideshow',
    reducedMotion: 'Automatic slideshow is off to respect reduced motion', carousel: 'Seven everyday styles', slide: 'slide',
    help: 'Use the left and right arrows to change styles, Home for the first and End for the last. Swipe on touch screens.',
    custom: 'CUSTOM COMBINATIONS', customTitle: 'Your colours. Your combination.',
    customBody: 'Choose colours for the body, corners, edging and stitching. Make it your own.',
    photoLabel: 'Product photograph · AI-retouched', palette: 'Start with a colour you love',
    paletteNote: 'Approximate available colours. Confirm physical swatches.', body: 'Body', corners: 'Corners', trim: 'Edging & stitching',
    dark: 'Obsidian', coral: 'Coral', imageNote: 'AI-retouched product photographs. Physical colours and details may vary.',
    contact: 'Contact us', terms: 'Before you buy', close: 'Close',
    termsIntro: 'Choose a style or prepare your design, then confirm the physical leather, requirements and delivery with the maker.',
    facts: [
      ['Materials & colours', 'Fine-grain leather is offered in the first phase. Screen colours illustrate a close match to available stock. Confirm physical swatches, materials and production methods.'],
      ['Production time', 'Existing styles: 1–2 calendar days after payment is verified. Custom combinations: 5–7 calendar days after the actual leather and design are confirmed. Weekends are included; transit is additional.'],
      ['Price & delivery', 'Personal artwork, embroidery and special work are quoted separately. Shipping depends on the destination; confirm the final total with the maker.'],
      ['Size & after-sales', 'Confirm your available space, tissue-pack dimensions, finished size, changes, delivery and after-sales terms before purchasing. Studio dimensions are for modelling reference only.'],
    ],
    language: '中文', languageNote: 'The design studio is currently in Chinese.',
  },
};

export default function StoreHome({ lang = 'zh', initialDesignOpen=false, lightPreview=false, localOnly=false, initialDesignId }: { lang?: Lang; initialDesignOpen?: boolean; lightPreview?: boolean; localOnly?: boolean; initialDesignId?: string }) {
  const prices = useStorePricing();
  const copy = HOME_COPY[lang];
  const styles = SHOWCASE_COPY[lang].colorways.items;
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [information, setInformation] = useState<'contact' | 'terms' | null>(null);
  const [designing, setDesigning] = useState(initialDesignOpen);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, getMotion, serverMotion);
  const visible = useSyncExternalStore(subscribeVisibility, getVisibility, serverVisibility);
  const playing = !stopped && !hovered && !focused && !reducedMotion && visible;
  const item = styles[index];

  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(() => setIndex(current => (current + 1) % styles.length), 4500);
    return () => window.clearInterval(interval);
  }, [playing, styles.length]);

  function select(next: number) {
    setStopped(true);
    setIndex((next + styles.length) % styles.length);
  }
  function step(direction: number) {
    setStopped(true);
    setIndex(current => (current + direction + styles.length) % styles.length);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') select(0);
    else if (event.key === 'End') select(styles.length - 1);
    else step(event.key === 'ArrowLeft' ? -1 : 1);
  }
  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    touch.current = null;
    if (event.touches.length !== 1 || (event.target as HTMLElement).closest('button')) return;
    touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    setStopped(true);
  }
  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touch.current;
    touch.current = null;
    if (!start || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }

  return <><SiteHeader lang={lang} active="tissueBox" /><div className="sh-home" lang={lang === 'en' ? 'en' : 'zh-CN'}>
    <a className="sh-skip" href="#choose-style">{SHOWCASE_COPY[lang].skip}</a>
    <div className="sh-sheet">
      <main className="sh-main">
        <div className="sh-intro"><h1>{copy.heading}</h1><p>{copy.collection}</p></div>
        <section id="choose-style" className="sh-carousel" aria-roledescription="carousel" aria-label={copy.carousel}
          onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
          onPointerLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
          <div className="sh-stage" tabIndex={0} role="group" aria-label={copy.carousel} aria-describedby="sh-carousel-help"
            onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touch.current = null; }}>
            <p className="sh-srOnly" id="sh-carousel-help">{copy.help}</p>
            <div id="sh-slides" className="sh-slides">
              {styles.map((style, i) => <div className="sh-slide" key={style.id} data-active={i === index} aria-hidden={i !== index}
                role="group" aria-roledescription={copy.slide} aria-label={`${i + 1} / ${styles.length} · ${style.name}`}>
                <img src={`/products/${style.id}-800.webp`} srcSet={`/products/${style.id}-800.webp 800w, /products/${style.id}-1536.webp 1536w`}
                  sizes="(max-width: 700px) 100vw, (max-width: 1488px) 75vw, 1000px" alt={style.alt}
                  width={1536} height={1024} fetchPriority={i === 0 ? 'high' : 'low'} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" draggable={false} />
              </div>)}
            </div>
            <button className="sh-arrow sh-arrowPrevious" type="button" onClick={() => step(-1)} aria-label={copy.previous} aria-controls="sh-slides"><ChevronLeft aria-hidden="true" size={22} /></button>
            <button className="sh-arrow sh-arrowNext" type="button" onClick={() => step(1)} aria-label={copy.next} aria-controls="sh-slides"><ChevronRight aria-hidden="true" size={22} /></button>
            <div className="sh-dots" role="group" aria-label={lang === 'en' ? 'Choose a style' : '选择款式'}>
              {styles.map((style, i) => <button type="button" key={style.id} aria-label={`${i + 1} · ${style.name}`} aria-current={i === index ? 'true' : undefined}
                aria-controls="sh-slides" onClick={() => select(i)}><span /></button>)}
            </div>
            <button type="button" className="sh-play" aria-controls="sh-slides" disabled={reducedMotion}
              title={reducedMotion ? copy.reducedMotion : stopped ? copy.play : copy.pause}
              aria-label={reducedMotion ? copy.reducedMotion : stopped ? copy.play : copy.pause}
              onClick={() => setStopped(current => !current)}>
              {stopped || reducedMotion ? <Play aria-hidden="true" size={13} /> : <Pause aria-hidden="true" size={13} />}
            </button>
          </div>
          <div className="sh-productBar">
            <div className="sh-productCopy" aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
              <h2>{item.name}</h2><p>{item.description}</p>
            </div>
            <div className="sh-buy">
              <p className="sh-price"><strong>{prices.pricing && <span>¥</span>}{priceNumber(prices.pricing?.standardFen)}</strong><small>/ {copy.unit}</small></p>
              <a className="sh-button" href={`/checkout?style=${item.id}${checkoutPriceQuery(prices.pricing, 'standard')}`} aria-label={`${copy.select} · ${item.name}`}>{copy.select}<ArrowRight size={23} aria-hidden="true" /></a>
            </div>
          </div>
          <StorePricingNote {...prices}/>
        </section>
        {!designing && <section id="tissue-design" className="sh-custom" aria-labelledby="sh-custom-title">
          <div className="sh-customCopy">
            <div><p className="sh-eyebrow">{copy.custom}</p><h2 id="sh-custom-title">{copy.customTitle}</h2><p className="sh-customBody">{copy.customBody}</p></div>
            <div className="sh-customActions"><p className="sh-price"><strong>{prices.pricing && <span>¥</span>}{priceNumber(prices.pricing?.customFen)}</strong><small>/ {copy.unit}</small></p>
              <a className="sh-button sh-buttonOutline" href="#tissue-design" onClick={()=>setDesigning(true)}>{copy.design}<ArrowUpRight size={23} aria-hidden="true" /></a>
            </div>
          </div>
          <div className="sh-customDemo">
            <figure className="sh-photoExample">
              <figcaption>{copy.photoLabel}</figcaption>
              <img src="/products/black-coral-800.webp" alt={styles[1].alt} width={800} height={533} loading="lazy" decoding="async" />
            </figure>
            <div className="sh-palette">
              <p className="sh-paletteTitle">{copy.palette}</p>
              <div className="sh-swatches" aria-hidden="true"><i style={{ background: '#303332' }} /><i style={{ background: '#e96568' }} /><i style={{ background: '#e9e5da' }} /><i style={{ background: '#b7ad9c' }} /><i style={{ background: '#91bd69' }} /></div>
              <dl><div><dt>{copy.body}</dt><dd>{copy.dark}</dd></div><div><dt>{copy.corners}</dt><dd>{copy.dark}</dd></div><div><dt>{copy.trim}</dt><dd>{copy.coral}</dd></div></dl>
              <p className="sh-paletteNote">{copy.paletteNote}</p>
            </div>
          </div>
        </section>
        }
        {designing && <section id="tissue-design" className="tb-designer" aria-labelledby="tb-designer-title"><div className="tb-designerHeading"><div><p className="sh-eyebrow">{copy.custom}</p><h2 id="tb-designer-title">{lang==='zh'?'设计你的纸巾盒':'Design your tissue box'}</h2></div><span>{lang==='zh'?'在当前页面搭配':'Design on this page'}</span></div><Suspense fallback={<p className="tb-designerLoading" role="status">{lang==='zh'?'正在打开纸巾盒工坊…':'Opening the design studio…'}</p>}><InlineStudio embedded lightPreview={lightPreview} localOnly={localOnly || frontendPreview || netlifyPricing} initialDesignId={frontendPreview || netlifyPricing ? undefined : initialDesignId} onBack={()=>{setDesigning(false);document.querySelector('#choose-style')?.scrollIntoView({behavior:'smooth',block:'start'});}}/></Suspense></section>}
        <p className="sh-specialNote">{SPECIAL_WORK_NOTE[lang]}</p>
      </main>
      <footer className="sh-footer">
        <div className="sh-footerRow"><p>{copy.imageNote}</p><nav aria-label={lang === 'en' ? 'More information' : '更多信息'}>
          <a href={lang === 'en' ? '/mats?lang=en' : '/mats'}>{copy.mats}</a>
          <a href="/my">{copy.mine}</a>
          <a href="/admin/login">{lang === 'zh' ? '商家管理' : 'Merchant login'}</a>
          <a href="/gallery">{copy.gallery}</a>
          <button type="button" aria-expanded={information === 'contact'} aria-controls="sh-contact" onClick={() => setInformation(current => current === 'contact' ? null : 'contact')}>{copy.contact}</button>
          <button type="button" aria-expanded={information === 'terms'} aria-controls="sh-terms" onClick={() => setInformation(current => current === 'terms' ? null : 'terms')}>{copy.terms}</button>
          <a className="sh-language" href={lang === 'en' ? '/tissue-box' : '/tissue-box?lang=en'} hrefLang={lang === 'en' ? 'zh-CN' : 'en'}>{copy.language}</a>
        </nav></div>
        <section id="sh-contact" className="sh-information" hidden={information !== 'contact'} aria-labelledby="sh-contact-title">
          <div className="sh-informationHeading"><h2 id="sh-contact-title">{copy.contact}</h2><button type="button" onClick={() => { setInformation(null); document.querySelector<HTMLButtonElement>('[aria-controls="sh-contact"]')?.focus(); }} aria-label={`${copy.close} · ${copy.contact}`}><X size={18} aria-hidden="true" /></button></div>
          <ContactOptions lang={lang} />
        </section>
        <section id="sh-terms" className="sh-information" hidden={information !== 'terms'} aria-labelledby="sh-terms-title">
          <div className="sh-informationHeading"><h2 id="sh-terms-title">{copy.terms}</h2><button type="button" onClick={() => { setInformation(null); document.querySelector<HTMLButtonElement>('[aria-controls="sh-terms"]')?.focus(); }} aria-label={`${copy.close} · ${copy.terms}`}><X size={18} aria-hidden="true" /></button></div>
          <p className="sh-termsIntro">{copy.termsIntro}</p>
          <div className="sh-termsList">{copy.facts.map(([title, body], index) => <details key={title}><summary>{title}<Plus size={16} aria-hidden="true" /></summary><p>{index === 2 ? pricingLine(lang, prices.pricing) + ' ' + body : body}</p></details>)}</div>
        </section>
        {copy.languageNote && <p className="sh-languageNote">{copy.languageNote}</p>}
      </footer>
    </div>
  </div></>;
}
