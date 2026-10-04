/* eslint-disable @next/next/no-location-assign-relative-destination -- This login belongs to the static Netlify browser app. */
'use client';
import {useRef,useState,type FormEvent} from 'react';
import {LockKeyhole} from 'lucide-react';
import {errorMessage,storePost} from '@/lib/store-client';
import {StoreLoading,StoreNotice,StoreServiceError,StoreShell,useStoreSession} from './store-shared';

export default function MerchantLogin() {
  const auth = useStoreSession();
  const [username,setUsername] = useState(''),[password,setPassword] = useState(''),[busy,setBusy] = useState(false),[error,setError] = useState('');
  const lock = useRef(false);
  async function login(event:FormEvent) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {await storePost('/auth/admin/login',{username:username.trim(),password}); setPassword(''); window.location.assign('/admin');}
    catch(cause) {setError(errorMessage(cause));}
    finally {lock.current=false;setBusy(false);}
  }
  return <StoreShell title="商家登录" eyebrow="鼎立车眷 · 商家管理" description="登录后可查看和调整纸巾盒商品价格。"><section className="store-card store-login-card" aria-labelledby="merchant-login-heading"><LockKeyhole size={24}/><h2 id="merchant-login-heading">使用商家账号</h2>{auth.loading ? <StoreLoading/> : auth.error ? <StoreServiceError error={auth.error} retry={auth.reload}/> : auth.session?.user?.role==='admin' ? <><StoreNotice>已登录：{auth.session.user.phoneMasked}</StoreNotice><a href="/admin" className="store-button">进入商家管理</a></> : !auth.session?.capabilities.merchantPassword ? <StoreNotice>商家登录尚未配置，请店铺负责人完成安全设置。</StoreNotice> : <form className="store-form" onSubmit={login}><label htmlFor="merchant-account">商家账号<input id="merchant-account" name="username" type="text" autoComplete="username" required maxLength={254} value={username} onChange={event=>setUsername(event.target.value)} disabled={busy}/></label><label htmlFor="merchant-password">网站商家密码<input id="merchant-password" name="password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label><p className="store-field-hint">请输入店铺设置的网站商家密码。</p>{error && <StoreNotice error>{error}</StoreNotice>}<button className="store-button" disabled={busy}>{busy?'正在登录…':'登录商家管理'}</button></form>}</section></StoreShell>;
}
