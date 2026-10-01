'use client';
import {lazy, Suspense, useSyncExternalStore} from 'react';
import '../app/store.css';
const pages = {
  my: lazy(() => import('./store-account')),
  login: lazy(() => import('./store-account').then(module => ({default: module.StoreLogin}))),
  checkout: lazy(() => import('./store-checkout')),
  admin: lazy(() => import('./store-admin')),
  gallery: lazy(() => import('./store-gallery')),
};
const subscribe=()=>()=>{};
/** Original app-router build compatibility; account data is never server-embedded. */
export default function StoreRoute({page}: {page:keyof typeof pages}) {
  const hydrated=useSyncExternalStore(subscribe,()=>true,()=>false);
  const Component=pages[page];
  const loading=<main className="store-page" style={{padding:'3rem'}}><p role="status">正在打开客户空间…</p></main>;
  return hydrated?<Suspense fallback={loading}><Component/></Suspense>:loading;
}
