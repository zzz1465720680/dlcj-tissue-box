'use client';
/* eslint-disable @next/next/no-img-element -- Local responsive WebP photos are intentionally used without an image service. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { FLOOR_MAT_COPY, type FloorMatSlide } from '@/lib/floor-mats/catalog';
import type { Lang } from '@/lib/showcase-copy';

const INTERVAL_MS = 6000;
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const getReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}
const getVisible = () => document.visibilityState !== 'hidden';
const serverReducedMotion = () => false;
const serverVisible = () => true;

export default function PhotoCarousel({ items, lang, onDesign }: { items: readonly FloorMatSlide[]; lang: Lang; onDesign?: () => void }) {
  const copy = FLOOR_MAT_COPY[lang];
  const [index, setIndex] = useState(0);
  // null follows the motion preference; a button press explicitly opts in/out.
  const [paused, setPaused] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(true);
  const reducedMotion = useSyncExternalStore(subscribeMotion, getReducedMotion, serverReducedMotion);
  const visible = useSyncExternalStore(subscribeVisibility, getVisible, serverVisible);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const playing = paused === null ? !reducedMotion : !paused;
  const canPlay = playing && !hovered && !focused && visible && inView;
  const item = items[index];

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.15 });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canPlay || items.length < 2) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % items.length), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [canPlay, items.length]);

  useEffect(() => {
    // Preload only the next photo instead of eagerly downloading all nine.
    if (!inView || items.length < 2) return;
    const next = items[(index + 1) % items.length];
    const image = new window.Image();
    image.sizes = '(max-width: 700px) 100vw, (max-width: 1336px) calc(100vw - 96px), 1240px';
    image.srcset = next.imageSet;
    image.src = next.image;
  }, [index, inView, items]);

  function advance(direction: number) {
    setPaused(true);
    setIndex(current => (current + direction + items.length) % items.length);
  }

  return (
    <div ref={root} className="fm-carousel sh-carousel" role="region" aria-roledescription={copy.carousel} aria-label={copy.gallery}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        advance(event.key === 'ArrowLeft' ? -1 : 1);
      }}>
      <p id="fm-keyboard-hint" className="sh-srOnly">{copy.keyboard}</p>
      <div className="fm-photoStage sh-stage" tabIndex={0} aria-label={copy.gallery} aria-describedby="fm-keyboard-hint"
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
          gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={event => {
          const start = gesture.current;
          gesture.current = null;
          if (!start || start.id !== event.pointerId) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) advance(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => { gesture.current = null; }}>
        <img key={item.id} className="fm-photo" src={item.image} srcSet={item.imageSet}
          sizes="(max-width: 700px) 100vw, (max-width: 1336px) calc(100vw - 96px), 1240px"
          width="1536" height="864" alt={item.copy[lang].alt} fetchPriority="high" decoding="async" draggable={false} />
        <button className="sh-arrow sh-arrowPrevious" type="button" aria-label={copy.previous} onClick={() => advance(-1)}><ChevronLeft size={22} aria-hidden="true" /></button>
        <button className="sh-arrow sh-arrowNext" type="button" aria-label={copy.next} onClick={() => advance(1)}><ChevronRight size={22} aria-hidden="true" /></button>
        <div className="sh-dots" role="group" aria-label={lang === 'zh' ? '选择脚垫配色' : 'Choose a floor-mat style'}>
          {items.map((slide, i) => <button key={slide.id} type="button" aria-label={`${i + 1} · ${slide.copy[lang].name}`} aria-current={i === index ? 'true' : undefined} onClick={() => { setPaused(true); setIndex(i); }}><span /></button>)}
        </div>
        <button type="button" className="sh-play" aria-label={playing ? copy.pause : copy.play} onClick={() => {
          setPaused(playing);
          if (!playing) { setHovered(false); setFocused(false); }
        }}>{playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}</button>
      </div>
      <div className="sh-productBar">
        <div className="sh-productCopy" aria-live={playing ? 'off' : 'polite'} aria-atomic="true"><h2>{item.copy[lang].name}</h2><p>{item.copy[lang].detail}</p></div>
        <div className="sh-buy">
          <span className="fm-quote">{lang === 'zh' ? '按车型确认' : 'Confirm fitment'}</span>
          <a className="sh-button" href="#mats-design" onClick={onDesign}>{lang === 'zh' ? '开始搭配' : 'Start designing'}<ArrowRight size={23} aria-hidden="true" /></a>
        </div>
        <span className="fm-count sh-srOnly" aria-label={`${index + 1} / ${items.length}`}><strong>{String(index + 1).padStart(2, '0')}</strong> / {String(items.length).padStart(2, '0')}</span>
      </div>
    </div>
  );
}
