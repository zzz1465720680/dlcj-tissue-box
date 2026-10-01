'use client';
import {useEffect, useState, type CSSProperties} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {storeRequest, type Paginated, type StorePagination, type GalleryItem, type PublicDesign} from '@/lib/store-client';
import {StoreEmpty, StoreLoading, StoreLoadMore, StoreServiceError, StoreShell} from './store-shared';

const safeColor = (color: unknown, fallback: string) => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color) ? color : fallback;
export function DesignPalettePreview({design}: {design: PublicDesign}) {
  const body = design.parts.body, corner = design.parts.corner0, trim = design.parts.trim;
  const style = {'--preview-body': safeColor(body?.color, '#e9e5da'), '--preview-edge': safeColor(body?.edge, '#8b9c73'), '--preview-corner': safeColor(corner?.color, '#e9e5da'), '--preview-trim': safeColor(trim?.color, '#e9e5da')} as CSSProperties;
  return <div className="store-palette-preview" style={style} aria-label="设计配色示意，非实物照片"><div className="store-preview-shadow"/><div className="store-preview-box"><span className="store-preview-top"/><span className="store-preview-opening"/><i className="store-preview-corner left"/><i className="store-preview-corner right"/></div><span className="store-preview-caption">配色示意 · 以实物为准</span></div>;
}
export default function StoreGallery() {
  const [page, setPage] = useState<StorePagination | undefined>();
  const [gallery, setGallery] = useState<GalleryItem[] | null>(null), [error, setError] = useState<unknown>(null), [revision, setRevision] = useState(0);
  useEffect(() => {const controller = new AbortController(); void storeRequest<Paginated<{gallery: GalleryItem[]}>>('/gallery', {signal: controller.signal}).then(result => {setGallery(result.gallery); setPage(result.pagination); setError(null);}).catch(cause => {if (!controller.signal.aborted) setError(cause);}); return () => controller.abort();}, [revision]);
  return <StoreShell section="gallery" title="每一种喜欢，都有自己的颜色。" eyebrow="灵感作品 · 商家精选" description="经设计者单独授权，再由商家挑选的配色灵感。"><div className="store-gallery-intro"><p>这里展示作品配色，不展示客户的私人图案、姓名、手机号或订单信息。保存设计不会自动出现在这里。</p><a href="/customize" className="store-text-link">做一份自己的搭配 <ArrowUpRight size={17}/></a></div>{error ? <StoreServiceError error={error} retry={() => setRevision(value => value + 1)}/> : !gallery ? <StoreLoading text="读取精选作品…"/> : gallery.length ? <div className="store-gallery-grid">{gallery.map((item, index) => <article className="store-gallery-card" key={item.id}><DesignPalettePreview design={item.design}/><div><p className="store-eyebrow">精选配色 / {String(index + 1).padStart(2, '0')}</p><h2>{item.design.name}</h2><div className="store-palette-swatches" aria-label="作品用色">{Object.entries(item.design.parts).map(([part, surface]) => <span key={part} style={{backgroundColor: safeColor(surface.color, '#e9e5da')}} title={safeColor(surface.color, '#e9e5da')}/>)}</div><a href="/customize" className="store-text-link">从灵感开始搭配 <ArrowUpRight size={15}/></a></div></article>)}</div> : <StoreEmpty title="下一份灵感，正在路上" action={<a className="store-button" href="/customize">先做自己的设计</a>}>暂时没有已授权并上架的作品。设计师的每一次公开展示，都由自己决定。</StoreEmpty>}{gallery && !error && <StoreLoadMore<GalleryItem> key={revision} endpoint="/gallery" field="gallery" initialPage={page} loaded={gallery.length} onItems={items => setGallery(current => [...(current || []), ...items])}/>}</StoreShell>;
}
