/* eslint-disable @next/next/no-html-link-for-pages -- This entry is a static browser app, without Next routing. */
import {Component, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {frontendPreview, localPricingPreview} from '../lib/frontend-preview';
import '../app/globals.css';
import '../app/showcase.css';
import '../app/store.css';

class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  componentDidCatch(error: unknown) { console.error('Page failed', error); }
  render() {
    if (this.state.failed) return <main style={{padding: '3rem', fontFamily: 'sans-serif'}}><h1>页面暂时无法打开</h1><p>请刷新重试。已保存的本机设计不会因为刷新而删除。</p><a href="/">返回首页</a></main>;
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
  if (frontendPreview && ['/my', '/login', '/checkout', '/admin', '/gallery'].includes(path)) {
    document.title = '测试预览 · 服务未启用';
    page = <main style={{padding: '3rem 1.5rem', maxWidth: 720, margin: 'auto'}}><h1>此功能等待服务接入</h1><p>当前链接用于检查外观与本机定制。手机号登录、云端设计、订单、优惠券、作品发布和商家后台暂未启用，也不会发送短信、邮件或处理付款。</p><p>请不要在测试预览中填写真实个人信息。</p><p><a href="/customize">体验本机定制</a> · <a href="/">返回首页</a></p></main>;
  } else if (path === '/customize') {
    const {default: Studio} = await import('../components/store-studio');
    document.title = '纸巾盒定制工坊 · 鼎立车眷';
    page = <Studio lightPreview={params.get('preview') === 'light'} localOnly={frontendPreview || params.get('storage') === 'local'} initialDesignId={frontendPreview ? undefined : params.get('design') ?? undefined}/>;
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
  } else if (['/', '/mats', '/tissue-box'].includes(path)) {
    const {default: Home, generateMetadata} = path === '/mats'
      ? await import('../app/mats/page')
      : path === '/tissue-box'
        ? await import('../app/tissue-box/page')
        : await import('../app/page');
    const searchParams = Promise.resolve({lang: params.get('lang') ?? undefined});
    const metadata = await generateMetadata({searchParams});
    if (typeof metadata.title === 'string') document.title = metadata.title;
    if (metadata.description) document.querySelector('meta[name="description"]')?.setAttribute('content', metadata.description);
    document.documentElement.lang = params.get('lang') === 'en' ? 'en' : 'zh-CN';
    page = await Home({searchParams});
  } else {
    page = <main style={{padding: '3rem'}}><h1>没有找到这个页面</h1><a href="/">返回首页</a></main>;
  }
  createRoot(document.getElementById('root')!).render(<ErrorBoundary>{localPricingPreview && <aside aria-label="本地改价测试说明" style={{padding: '12px 18px', background: '#fff3cd', color: '#513b00', borderBottom: '1px solid #e2c875', fontSize: 14}}>本地合成数据测试 · 管理员 13800000003，顾客 13800000001；验证码只在启动终端显示。请勿输入真实资料，支付及真实通知关闭。</aside>}{frontendPreview && <aside aria-label="测试预览说明" style={{padding: '12px 18px', background: '#fff3cd', color: '#513b00', borderBottom: '1px solid #e2c875', fontSize: 14, lineHeight: 1.65}}><strong>前端测试预览</strong> · 可浏览和本机定制，设计仅保存在当前浏览器。登录、云端订单、短信邮件和付款均未启用，请勿填写真实个人信息。</aside>}{page}</ErrorBoundary>);
}

start().catch(error => {
  console.error('Application failed to load', error);
  const root = document.getElementById('root')!;
  root.innerHTML = '<main style="padding:3rem;font-family:sans-serif"><h1>页面暂时无法载入</h1><p>请检查网络后刷新重试。</p><a href="/">返回首页</a></main>';
});
