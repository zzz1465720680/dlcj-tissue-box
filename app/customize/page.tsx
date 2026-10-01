import type { Metadata } from 'next';
import StoreStudio from '@/components/store-studio';
export const metadata: Metadata = {
  title: '纸巾盒定制工坊 · 鼎立车眷',
  description: '从细纹皮革到配色，从图案到细节，设计你的专属车载纸巾盒，实时查看 3D 效果。',
};
export default async function CustomizePage({searchParams}: {searchParams: Promise<{preview?: string; storage?: string; design?: string}>}) {
  const params = await searchParams;
  return <StoreStudio lightPreview={params.preview === 'light'} localOnly={params.storage === 'local'} initialDesignId={params.design}/>;
}
