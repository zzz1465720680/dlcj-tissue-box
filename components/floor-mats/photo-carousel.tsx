'use client';
/* eslint-disable @next/next/no-img-element -- Local responsive WebP photos are intentionally used without an image service. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
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

export default function PhotoCarousel({ items, lang }: { items: readonly FloorMatSlide[]; lang: Lang }) {
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
    <div ref={root} className="fm-carousel" role="region" aria-roledescription={copy.carousel} aria-label={copy.gallery}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        advance(event.key === 'ArrowLeft' ? -1 : 1);
      }}>
      <p id="fm-keyboard-hint" className="dc-visuallyHidden">{copy.keyboard}</p>
      <div className="fm-photoStage" tabIndex={0} aria-label={copy.gallery} aria-describedby="fm-keyboard-hint"
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
        <button className="fm-arrow fm-arrow--previous" type="button" aria-label={copy.previous} onClick={() => advance(-1)}><ChevronLeft size={24} aria-hidden="true" /></button>
        <button className="fm-arrow fm-arrow--next" type="button" aria-label={copy.next} onClick={() => advance(1)}><ChevronRight size={24} aria-hidden="true" /></button>
      </div>
      <div className="fm-captionRow">
        <div className="fm-caption" aria-live={playing ? 'off' : 'polite'} aria-atomic="true"><h2>{item.copy[lang].name}</h2><p>{item.copy[lang].detail}</p></div>
        <div className="fm-controls">
          <span className="fm-count" aria-label={`${index + 1} / ${items.length}`}><strong>{String(index + 1).padStart(2, '0')}</strong><span aria-hidden="true"> / {String(items.length).padStart(2, '0')}</span></span>
          <button type="button" className="fm-playToggle" aria-label={playing ? copy.pause : copy.play} onClick={() => {
            setPaused(playing);
            if (!playing) {
              // An explicit Play press may resume while this control has focus.
              setHovered(false);
              setFocused(false);
            }
          }}>
            {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}<span>{playing ? copy.pauseText : copy.playText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
