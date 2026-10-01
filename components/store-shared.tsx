/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element -- Shared with the static browser store. */
'use client';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {ArrowLeft, ArrowUpRight, LoaderCircle, ShieldCheck} from 'lucide-react';
import {errorMessage, storeRequest, type StorePagination, type StoreSession} from '@/lib/store-client';

export function StoreShell({children, title, eyebrow = '鼎立车眷 · 客户空间', description, section}: {children: ReactNode; title: string; eyebrow?: string; description?: string; section?: string}) {
  return <div className="store-page"><a className="store-skip" href="#store-main">跳转到正文</a><header className="store-header"><a href="/" className="store-brand"><img src="/brand/dc-logo.svg" alt="" onError={event => {event.currentTarget.hidden = true;}}/><span>鼎立车眷<small>DINGLI CHEJUAN</small></span></a><nav aria-label="商城导航"><a href="/">选款</a><a href="/customize">自由定制</a><a href="/gallery" aria-current={section === 'gallery' ? 'page' : undefined}>灵感作品</a><a href="/my" aria-current={section === 'my' ? 'page' : undefined}>我的</a></nav></header><main id="store-main" className="store-main"><div className="store-heading"><a className="store-back" href="/"><ArrowLeft size={15}/>回到选款</a><p className="store-eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="store-lead">{description}</p>}</div>{children}</main><footer className="store-footer"><span>一件小物，随你心意。</span><a href="/customize">去工坊搭配 <ArrowUpRight size={14}/></a><small>颜色、材料与制作细节以双方确认为准</small></footer></div>;
}
export function StoreLoading({text = '正在读取…'}: {text?: string}) {return <div className="store-loading" role="status"><LoaderCircle size={19} className="spin"/>{text}</div>;}
export function StoreNotice({children, error = false}: {children: ReactNode; error?: boolean}) {return <div className={`store-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>;}
export function StoreServiceError({error, retry}: {error: unknown; retry?: () => void}) {return <div className="store-card store-service-error"><StoreNotice error>{errorMessage(error)}</StoreNotice><p>关闭或刷新页面不会删除工坊里已保存的本机设计。你仍可继续搭配、查看本机方案或下载备份。</p><div className="store-actions">{retry && <button className="store-button" onClick={retry}>重试连接</button>}<a className="store-button secondary" href="/customize?storage=local">回到本机设计</a></div></div>;}
export function StoreEmpty({title, children, action}: {title: string; children?: ReactNode; action?: ReactNode}) {return <div className="store-empty"><span className="store-empty-mark">◇</span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;}
export function StorePrivacyNote() {return <p className="store-privacy-note"><ShieldCheck size={15}/>设计默认仅自己可见；公开展示需要你单独授权，并由商家精选。</p>;}
export function useStoreSession() {
  const [session, setSession] = useState<StoreSession | null>(null), [error, setError] = useState<unknown>(null), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => {const controller = new AbortController(); void storeRequest<StoreSession>('/session', {signal: controller.signal}).then(value => {setSession(value); setError(null); setLoading(false);}).catch(cause => {if (!controller.signal.aborted) {setError(cause); setLoading(false);}}); return () => controller.abort();}, [revision]);
  return {session, error, loading, reload: () => {setLoading(true); setRevision(value => value + 1);}};
}
/** Private photos are fetched with a session and rendered as revocable blob URLs, never external HTML. */
export function PrivatePhoto({photoId, alt}: {photoId: string; alt: string}) {
  const [image, setImage] = useState<{id: string; src: string} | null>(null), [failedId, setFailedId] = useState<string | null>(null);
  useEffect(() => {const controller = new AbortController(); let objectUrl: string | undefined; void fetch('/api/store/objects/' + encodeURIComponent(photoId), {credentials: 'same-origin', signal: controller.signal}).then(async response => {if (!response.ok || !/^image\/(jpeg|png|webp)(;|$)/.test(response.headers.get('content-type') || '')) throw new Error('无法读取照片'); const blob = await response.blob(); if (controller.signal.aborted) return; objectUrl = URL.createObjectURL(blob); setImage({id: photoId, src: objectUrl});}).catch(() => {if (!controller.signal.aborted) setFailedId(photoId);}); return () => {controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl);};}, [photoId]);
  if (failedId === photoId) return <div className="store-photo-fallback" role="status">照片暂时无法读取，请刷新后重试</div>;
  return image?.id === photoId ? <img className="store-private-photo" src={image.src} alt={alt} loading="lazy"/> : <div className="store-photo-fallback"><StoreLoading text="读取照片…"/></div>;
}

export function StoreLoadMore<T>({endpoint, field, initialPage, loaded, onItems}: {endpoint: string; field: string; initialPage?: StorePagination; loaded: number; onItems: (items: T[]) => void}) {
  const [page, setPage] = useState(initialPage), [busy, setBusy] = useState(false), [error, setError] = useState(''); const lock = useRef(false);
  if (!page || page.total <= page.limit) return null;
  async function load() {
    if (!page?.hasMore || lock.current) return; lock.current = true; setBusy(true); setError('');
    try {const result = await storeRequest<Record<string, unknown>>(endpoint + '?limit=' + page.limit + '&offset=' + loaded); const rows = result[field]; if (!Array.isArray(rows)) throw new Error('列表响应异常，请稍后重试'); onItems(rows as T[]); setPage(result.pagination as StorePagination | undefined);}
    catch (cause) {setError(errorMessage(cause));} finally {setBusy(false); lock.current = false;}
  }
  return <div className="store-load-more"><p className="store-small-note">已显示 {loaded} 条，共 {page.total} 条</p>{error && <StoreNotice error>{error}</StoreNotice>}{page.hasMore && loaded < page.total && <button className="store-button secondary" disabled={busy} onClick={() => void load()}>{busy ? '读取中…' : '加载更多'}</button>}</div>;
}
