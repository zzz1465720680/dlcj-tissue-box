'use client';
import {errorMessage} from '@/lib/store-client';
export default function StorePricingNote({loading, error, preview, changed, reload}: {loading: boolean; error: unknown; preview: boolean; changed?: boolean; reload: () => void}) {
  if (preview) return <p className="store-small-note" role="status">前端测试预览：显示初始参考价，订单服务未启用。</p>;
  if (loading) return <p className="store-small-note" role="status">正在确认商品价格…</p>;
  if (error) return <p className="store-small-note" role="alert">价格暂待确认：{errorMessage(error)} <button type="button" className="store-text-link" onClick={reload}>重试价格</button></p>;
  if (changed) return <p className="store-small-note" role="alert">商品价格已更新，请核对当前金额，并在下单前重新确认。</p>;
  return null;
}
