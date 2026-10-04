import type {Design} from './design';
import {frontendPreview} from './frontend-preview';
import {validPricing, type StorePricing} from './pricing';

export type StoreUser = {id: string; role: 'customer' | 'admin'; phoneMasked: string};
export type StoreSession = {user: StoreUser | null; capabilities: {sms: boolean; orders: boolean; payment: false; merchantPassword?: boolean; cloudDesigns?: boolean; gallery?: boolean; pricing?: boolean; mode?: 'netlify-pricing'}};
export type SavedStoreDesign = {id: string; version: number; name: string; createdAt: string; updatedAt?: string; design: Design; galleryConsent: boolean; galleryPublished: boolean};
export type StoreCoupon = {id: string; userId: string; amountFen: number; availableFen: number; spendableFen: number; reservedFen: number; redeemedFen: number; expiresAt: string; source: string; status: 'available' | 'expired' | 'reserved' | 'redeemed' | 'revoked'};
export type StoreAddress = {name: string; phone: string; province: string; city: string; district: string; detail: string};
export type MaterialRecord = {version: number; note: string; photoRefs: string[]; createdAt: string};
export type StoreOrder = {id: string; userId: string; kind: 'standard' | 'custom' | 'bespoke'; product: string; quantity: number; designId?: string; designVersion?: number; designSnapshot: Design | {type: 'stock'; stockId: string; product: string; material: string}; checkout: {name: string; phone: string; address: string}; status: string; currency: 'CNY'; pricingVersion?: number | null; unitPriceFen: number | null; goodsTotalFen: number | null; discountFen: number; goodsPayableFen: number | null; shippingFen: number | null; shippingState: string; shippingVersion: number; acceptedShippingVersion: number | null; totalFen: number | null; quoteVersion: number; acceptedQuoteVersion: number | null; materialVersion: number; acceptedMaterialVersion: number | null; materials: MaterialRecord[]; createdAt: string; updatedAt: string; paidAt: string | null; production: {startedAt: string | null; earliestAt: string | null; latestAt: string | null; calendarDays: number[]}; shipment: {carrier: string; tracking: string; dispatchedAt: string} | null; paymentEnabled: false};
export type InvitationInfo = {inviteCode: string; rewardedInvites: number; rewardFen: number; validDays: number; perOrderCapFen: number};
export type PublicDesign = {name: string; parts: Record<string, {color: string; material: string; perforated: boolean; edge: string; thread: string}>; label?: {enabled: boolean; color: string; ink: string}};
export type GalleryItem = {id: string; version: number; design: PublicDesign};
export type GalleryCandidate = {designId: string; version: number; published: boolean; design: PublicDesign};

export class StoreApiError extends Error {
  constructor(public code: string, message: string, public status = 0, public retryAfterSeconds?: number, public pricing?: StorePricing) {super(message); this.name = 'StoreApiError';}
}
export const API_BASE = '/api/store';
/** JSON transport only. Session cookies are HttpOnly and supplied by the browser. */
export async function storeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (frontendPreview) throw new StoreApiError('FRONTEND_PREVIEW', '当前是前端测试预览，账号、云端保存和订单服务未启用。请使用本机设计。', 503);
  if (!path.startsWith('/') || path.startsWith('//')) throw new StoreApiError('INVALID_PATH', '请求地址无效');
  let response: Response;
  try {response = await fetch(API_BASE + path, {...init, credentials: 'same-origin', headers: {...(typeof init.body === 'string' ? {'Content-Type': 'application/json'} : {}), ...init.headers}});}
  catch (error) {if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new StoreApiError('NETWORK_ERROR', '暂时连接不上服务，请检查网络后重试。本机设计仍然保留。');}
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new StoreApiError('SERVICE_UNAVAILABLE', '账号与订单服务尚未接通，可以继续浏览和在本机设计。', response.status);
  const result: unknown = await response.json();
  if (!response.ok) {
    const details = result && typeof result === 'object' ? result as Record<string, unknown> : {};
    throw new StoreApiError(typeof details.error === 'string' ? details.error : 'REQUEST_FAILED', typeof details.message === 'string' ? details.message : '操作暂未完成，请稍后重试。', response.status, typeof details.retryAfterSeconds === 'number' ? details.retryAfterSeconds : Number(response.headers.get('retry-after')) || undefined, validPricing(details.pricing) ? details.pricing : undefined);
  }
  return result as T;
}
export function storePost<T>(path: string, data: unknown, signal?: AbortSignal): Promise<T> {return storeRequest<T>(path, {method: 'POST', body: JSON.stringify(data), signal});}
export async function readStorePricing(signal?: AbortSignal): Promise<StorePricing> {
  const result = await storeRequest<{pricing: unknown}>('/pricing', {signal, cache: 'no-store'});
  if (!validPricing(result.pricing)) throw new StoreApiError('INVALID_PRICING', '商品价格暂时无法确认，请重试。');
  return result.pricing;
}
export function errorMessage(error: unknown): string {return error instanceof Error ? error.message : '暂时无法完成，请稍后重试。';}
export function isUnauthorized(error: unknown): boolean {return error instanceof StoreApiError && error.status === 401;}
export function safeReturnTo(raw?: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n]/.test(raw)) return '/my';
  try {const url = new URL(raw, 'https://store.invalid'); return url.origin === 'https://store.invalid' && url.pathname !== '/login' ? url.pathname + url.search + url.hash : '/my';} catch {return '/my';}
}
export function loginHref(returnTo?: string): string {return '/login?return_to=' + encodeURIComponent(safeReturnTo(returnTo));}
export function formatYuan(value: number | null | undefined): string {return typeof value === 'number' && Number.isFinite(value) ? `¥${(value / 100).toFixed(value % 100 ? 2 : 0)}` : '待确认';}
export function formatDate(value?: string | null): string {if (!value) return '待确认'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '待确认' : date.toLocaleDateString('zh-CN');}
export function newOperationKey(): string {return crypto.randomUUID();}

export async function uploadStoreDesign(design: Design, options: {id?: string; operationKey?: string; signal?: AbortSignal} = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(design));
  if (bytes.length > 12_000_000) throw new StoreApiError('DESIGN_TOO_LARGE', '设计超过 12 MB，请减少图片后重试。当前本机设计仍然保留。');
  const upload = await storePost<{uploadId: string; chunkSize: number}>('/uploads', {kind: 'design', byteLength: bytes.length, operationKey: options.operationKey || await stableOperationKey('design', {id: options.id, design}), id: options.id}, options.signal);
  validateUploadStart(upload);
  for (let offset = 0, index = 0; offset < bytes.length; offset += upload.chunkSize, index++) {
    await storeRequest(`/uploads/${encodeURIComponent(upload.uploadId)}/chunks/${index}`, {method: 'PUT', headers: {'Content-Type': 'application/octet-stream'}, body: bytes.slice(offset, offset + upload.chunkSize), signal: options.signal});
  }
  const result = await storePost<{design: SavedStoreDesign}>(`/uploads/${encodeURIComponent(upload.uploadId)}/complete`, {}, options.signal);
  await retireOperationKey('design', {id: options.id, design});
  return result;
}
/** Adapter for the editor's existing /api/designs contract; never intercepts global fetch. */
export const designRequest: typeof fetch = async (input, init) => {
  try {
    const request = input instanceof Request ? new Request(input, init) : new Request(new URL(String(input), window.location.origin), init);
    const url = new URL(request.url);
    if (url.origin !== window.location.origin || url.pathname !== '/api/designs') return Response.json({error: '请求地址无效'}, {status: 400});
    if (request.method === 'POST') {
      const {design} = await uploadStoreDesign(await request.json(), {signal: request.signal, id: request.headers.get('X-Design-Id') || undefined});
      return Response.json({id: design.id, date: design.createdAt});
    }
    if (request.method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {const {design} = await storeRequest<{design: SavedStoreDesign}>('/designs/' + encodeURIComponent(id), {signal: request.signal}); return Response.json({id: design.id, date: design.createdAt, design: design.design});}
      const {designs} = await storeRequest<{designs: SavedStoreDesign[]}>('/designs', {signal: request.signal});
      return Response.json({designs: designs.map(row => ({id: row.id, name: row.name, date: row.createdAt}))});
    }
    return Response.json({error: '不支持的操作'}, {status: 405});
  } catch (error) {return Response.json({error: errorMessage(error)}, {status: error instanceof StoreApiError ? error.status || 503 : 503});}
};

const operationKeys = new Map<string, string>();
/** Reuses a key after an ambiguous network failure without storing customer data. */
export async function stableOperationKey(namespace: string, payload: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const storageKey = `dlcj-operation:${namespace}:${hash}`;
  let saved = operationKeys.get(storageKey);
  try {saved ||= sessionStorage.getItem(storageKey) || undefined;} catch { /* In-memory retry key remains available. */ }
  if (!saved) {saved = newOperationKey(); operationKeys.set(storageKey, saved); try {sessionStorage.setItem(storageKey, saved);} catch { /* Storage can be unavailable in private browsing. */ }}
  return saved;
}
const REFERRAL_KEY = 'dlcj-referral-code';
export function pendingReferralCode(): string {try {return sessionStorage.getItem(REFERRAL_KEY) || '';} catch {return '';}}
export function clearPendingReferral(): void {try {sessionStorage.removeItem(REFERRAL_KEY);} catch { /* Optional storage only. */ }}
export async function captureReferralFromUrl(): Promise<boolean> {
  if (frontendPreview) return false;
  const url = new URL(window.location.href), inviteCode = url.searchParams.get('ref');
  if (!inviteCode || !/^[A-Za-z0-9_-]{4,40}$/.test(inviteCode)) return false;
  try {sessionStorage.setItem(REFERRAL_KEY, inviteCode);} catch { /* Explicit URL still remains available. */ }
  try {await storePost('/referral/capture', {inviteCode}); url.searchParams.delete('ref'); window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash); return true;} catch {return false;}
}
export async function uploadMaterialPhoto(file: File): Promise<{id: string; url: string}> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8_000_000) throw new StoreApiError('INVALID_PHOTO', '请上传 8 MB 以内的 JPG、PNG 或 WebP 照片');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const operationKey = await stableOperationKey('photo', Array.from(new Uint8Array(digest)));
  const upload = await storePost<{uploadId: string; chunkSize: number}>('/uploads', {kind: 'material-photo', byteLength: bytes.length, contentType: file.type, operationKey});
  validateUploadStart(upload);
  for (let offset = 0, index = 0; offset < bytes.length; offset += upload.chunkSize, index++) await storeRequest(`/uploads/${encodeURIComponent(upload.uploadId)}/chunks/${index}`, {method: 'PUT', headers: {'Content-Type': 'application/octet-stream'}, body: bytes.slice(offset, offset + upload.chunkSize)});
  const result = await storePost<{object: {id: string; url: string}}>(`/uploads/${encodeURIComponent(upload.uploadId)}/complete`, {});
  await retireOperationKey('photo', Array.from(new Uint8Array(digest)));
  return result.object;
}

/** Only call after receiving an unambiguous successful response. */
export async function retireOperationKey(namespace: string, payload: unknown): Promise<void> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const storageKey = `dlcj-operation:${namespace}:${hash}`;
  operationKeys.delete(storageKey);
  try {sessionStorage.removeItem(storageKey);} catch { /* Optional storage only. */ }
}

function validateUploadStart(upload: {uploadId: string; chunkSize: number}): void {
  if (typeof upload.uploadId !== 'string' || !upload.uploadId || !Number.isInteger(upload.chunkSize) || upload.chunkSize < 1 || upload.chunkSize > 1_000_000) throw new StoreApiError('INVALID_UPLOAD_RESPONSE', '上传服务响应异常，请稍后重试。本机设计仍然保留。');
}
export type StorePagination = {limit: number; offset: number; total: number; hasMore: boolean};
export type Paginated<T> = T & {pagination?: StorePagination};

/** Checkout needs only enough eligible coupons to cover the per-order cap. */
export async function checkoutCoupons(signal?: AbortSignal): Promise<{coupons: StoreCoupon[]}> {
  const coupons: StoreCoupon[] = []; let offset = 0;
  for (;;) {
    const result = await storeRequest<Paginated<{coupons: StoreCoupon[]}>>('/coupons' + (offset ? `?limit=100&offset=${offset}` : ''), {signal});
    coupons.push(...result.coupons);
    if (!result.pagination?.hasMore || coupons.reduce((sum, item) => sum + item.spendableFen, 0) >= 3000) return {coupons};
    const next = result.pagination.offset + result.pagination.limit;
    if (!Number.isSafeInteger(next) || next <= offset) throw new StoreApiError('INVALID_PAGINATION', '优惠券列表响应异常，请稍后重试');
    offset = next;
  }
}
