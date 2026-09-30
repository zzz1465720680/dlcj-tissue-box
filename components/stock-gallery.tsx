'use client';

import { useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, ClipboardCopy, Minus, Plus } from 'lucide-react';
import { copyText } from '@/lib/clipboard';
import { STOCK_PRICE } from '@/lib/pricing';
import type { Lang } from '@/lib/showcase-copy';
import ContactOptions from './contact-options';

type Style = { id: string; name: string; description: string; alt: string; colors: string[] };

export default function StockGallery({ items, lang }: { items: Style[]; lang: Lang }) {
  const english = lang === 'en';
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [inquiring, setInquiring] = useState(false);
  const [notice, setNotice] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const [copying, setCopying] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const selection = useRef(0);
  const allButton = useRef<HTMLButtonElement>(null);
  const inquiryId = 'stock-inquiry';
  const thumbsId = 'stock-style-list';
  const item = items[index];

  const select = (next: number) => {
    const wrapped = (next + items.length) % items.length;
    selection.current = wrapped;
    setIndex(wrapped);
    setInquiring(false);
    setNotice('');
    setManualCopy(false);
    setCopying(false);
  };
  const step = (direction: number) => select(selection.current + direction);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  };
  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    touch.current = null;
    if (event.touches.length !== 1 || (event.target as HTMLElement).closest('button')) return;
    touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touch.current;
    touch.current = null;
    if (!start || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx > 0 ? -1 : 1);
  };
  const inquiry = english
    ? `DINGLI CHEJUAN · Existing style enquiry\nStyle: ${item.name}\nStyle ID: ${item.id}\nPrice: CNY ${STOCK_PRICE} per piece\nPlease confirm quantity, delivery time and shipping before purchasing.`
    : `鼎立车眷 · 现有款式咨询\n款式：${item.name}\n款式编号：${item.id}\n单价：¥${STOCK_PRICE} / 件\n想了解这款，请协助确认数量、制作交期与运费。`;
  const copyInquiry = async () => {
    const requestedIndex = selection.current;
    setCopying(true);
    const copied = await copyText(inquiry);
    if (selection.current !== requestedIndex) return;
    setCopying(false);
    setManualCopy(!copied);
    setNotice(copied
      ? english ? 'Style enquiry copied. Send it to the maker in WeChat.' : '款式需求已复制，请在微信中发送给商家。'
      : english ? 'Select and copy the enquiry below.' : '请长按或选中下方的款式需求，手动复制。');
  };

  return <div className="sc-gallery" role="region" aria-label={english ? 'Existing styles' : '现有款式选款'}>
    <figure className="sc-galleryFigure">
      <div className="sc-galleryStage" onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touch.current = null; }}>
        <img src={`/products/${item.id}-800.webp`} srcSet={`/products/${item.id}-800.webp 800w, /products/${item.id}-1536.webp 1536w`}
          sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1000px) calc(100vw - 56px), 860px"
          alt={item.alt} width="1536" height="1024" loading="lazy" decoding="async" draggable={false} />
        <button type="button" className="sc-galleryArrow sc-galleryPrev" onClick={() => step(-1)} aria-label={english ? 'Previous style' : '上一款'}><ChevronLeft size={21} /></button>
        <button type="button" className="sc-galleryArrow sc-galleryNext" onClick={() => step(1)} aria-label={english ? 'Next style' : '下一款'}><ChevronRight size={21} /></button>
      </div>
      <figcaption className="sc-galleryCaption">
        <div>
          <div className="sc-galleryName" aria-live="polite" aria-atomic="true"><h3>{item.name}</h3><span className="sc-galleryCount">{String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span></div>
          <p>{item.description}</p>
        </div>
        <button type="button" className="sc-galleryConsult" aria-expanded={inquiring} aria-controls={inquiryId} onClick={() => setInquiring(!inquiring)}>{english ? 'Enquire about this style' : '咨询这款'}<ArrowUpRight size={16} /></button>
      </figcaption>
    </figure>

    <button ref={allButton} type="button" className="sc-galleryAll" aria-expanded={expanded} aria-controls={thumbsId} onClick={() => setExpanded(!expanded)}>
      {expanded ? english ? 'Hide all styles' : '收起全部款式' : english ? `View all ${items.length} styles` : `查看全部 ${items.length} 款`}{expanded ? <Minus size={15} /> : <Plus size={15} />}
    </button>
    <div id={thumbsId} hidden={!expanded} className="sc-galleryThumbs" role="group" aria-label={english ? 'Choose a style' : '选择款式'}>
      {items.map((style, i) => <button key={style.id} type="button" className="sc-galleryThumb" aria-pressed={i === index} aria-label={style.name} onClick={() => { select(i); setExpanded(false); allButton.current?.focus(); }}>
        <img src={`/products/${style.id}-800.webp`} alt="" width="800" height="533" loading="lazy" decoding="async" />
        <span>{style.name}</span>
      </button>)}
    </div>

    <div id={inquiryId} className="sc-stockInquiry" hidden={!inquiring}>
      <div className="sc-stockInquiryHeading"><p><strong>{item.name}</strong><span>¥{STOCK_PRICE} / {english ? 'piece' : '件'}</span></p>
        <button type="button" className="sc-stockCopy" onClick={copyInquiry} disabled={copying}><ClipboardCopy size={15} />{copying ? english ? 'Copying…' : '复制中…' : english ? 'Copy style enquiry' : '复制款式需求'}</button>
      </div>
      {notice && <p className="sc-stockNotice" role="status">{notice}</p>}
      {manualCopy && <textarea className="sc-stockManual" aria-label={english ? 'Style enquiry to copy' : '手动复制款式需求'} readOnly value={inquiry} rows={5} onFocus={event => event.currentTarget.select()} />}
      <ContactOptions key={item.id} lang={lang} />
    </div>
  </div>;
}
