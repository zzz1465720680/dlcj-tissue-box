import type { Metadata } from 'next';
import { SHOWCASE_COPY, resolveLang } from '@/lib/showcase-copy';
import StoreHome from '@/components/store-home';
import '../store-home.css';

type PageProps = { searchParams: Promise<{ lang?: string; edit?: string; preview?: string; storage?: string; design?: string; preset?: string }> };
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  return SHOWCASE_COPY[resolveLang((await searchParams).lang)].meta;
}
export default async function TissueBoxPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const lang = resolveLang(params.lang);
  return <StoreHome lang={lang} initialDesignOpen={params.edit==='1' || !!params.preset || !!params.design} lightPreview={params.preview==='light'} localOnly={params.storage==='local'} initialDesignId={params.design}/>;
}
