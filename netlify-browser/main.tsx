/* eslint-disable @next/next/no-html-link-for-pages -- This entry is a static browser app, without Next routing. */
import {Component, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import '../app/globals.css';
import '../app/showcase.css';
import '../app/store.css';

class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  componentDidCatch(error: unknown) { console.error('Page failed', error); }
  render() {
    if (this.state.failed) return <main style={{padding: '3rem', fontFamily: 'sans-serif'}}><h1>页面暂时无法打开</h1><p>请刷新重试。已保存的本机设计不会因为刷新而删除。</p><a href="/">返回产品展示</a></main>;
    return this.props.children;
  }
}

async function start() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  // Capture before navigation; failures leave the invitation locally for OTP verification.

  const {captureReferralFromUrl} = await import('../lib/store-client');
  void captureReferralFromUrl();
  let page: ReactNode;
  if (path === '/customize') {
    const {default: Studio} = await import('../components/store-studio');
    document.title = '纸巾盒定制工坊 · 鼎立车眷';
    page = <Studio lightPreview={params.get('preview') === 'light'} localOnly={params.get('storage') === 'local'} initialDesignId={params.get('design') ?? undefined}/>;
  } else if (path === '/my') {
    const {default: Account} = await import('../components/store-account');
    document.title = '我的 · 鼎立车眷'; page = <Account/>;
  } else if (path === '/login') {
    const {StoreLogin} = await import('../components/store-account');
    document.title = '手机号登录 · 鼎立车眷'; page = <StoreLogin/>;
  } else if (path === '/checkout') {
    const {default: Checkout} = await import('../components/store-checkout');
    document.title = '订单草稿 · 鼎立车眷'; page = <Checkout/>;
  } else if (path === '/admin') {
    const {default: Admin} = await import('../components/store-admin');
    document.title = '商家管理 · 鼎立车眷'; page = <Admin/>;
  } else if (path === '/gallery') {
    const {default: Gallery} = await import('../components/store-gallery');
    document.title = '搭配灵感 · 鼎立车眷'; page = <Gallery/>;
  } else if (path === '/model-review') {
    const {default: ModelReview} = await import('../components/model-review');
    document.title = 'revision9 模型校对 · 鼎立车眷';
    page = <ModelReview/>;
  } else if (path === '/') {
    const {default: Home, generateMetadata} = await import('../app/page');
    const searchParams = Promise.resolve({lang: params.get('lang') ?? undefined});
    const metadata = await generateMetadata({searchParams});
    if (typeof metadata.title === 'string') document.title = metadata.title;
    if (metadata.description) document.querySelector('meta[name="description"]')?.setAttribute('content', metadata.description);
    document.documentElement.lang = params.get('lang') === 'en' ? 'en' : 'zh-CN';
    page = await Home({searchParams});
  } else {
    page = <main style={{padding: '3rem'}}><h1>没有找到这个页面</h1><a href="/">返回产品展示</a></main>;
  }
  createRoot(document.getElementById('root')!).render(<ErrorBoundary>{page}</ErrorBoundary>);
}

start().catch(error => {
  console.error('Application failed to load', error);
  const root = document.getElementById('root')!;
  root.innerHTML = '<main style="padding:3rem;font-family:sans-serif"><h1>页面暂时无法载入</h1><p>请检查网络后刷新重试。</p><a href="/">返回产品展示</a></main>';
});
