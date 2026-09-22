import type { Metadata } from 'next';
import Studio from '@/components/studio';

export const metadata: Metadata = {
  title: '纸巾盒定制工坊 · 鼎立车眷',
  description: '从材质到配色，从图案到细节，设计你的专属车载纸巾盒，实时查看 3D 效果。',
};

export default function CustomizePage() {
  return <Studio />;
}
