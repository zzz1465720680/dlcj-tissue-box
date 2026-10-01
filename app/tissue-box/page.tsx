import type { Metadata } from 'next';
import { SHOWCASE_COPY, resolveLang } from '@/lib/showcase-copy';
import StoreHome from '@/components/store-home';
import '../store-home.css';

type PageProps = { searchParams: Promise<{ lang?: string }> };
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  return SHOWCASE_COPY[resolveLang((await searchParams).lang)].meta;
}
export default async function TissueBoxPage({ searchParams }: PageProps) {
  const lang = resolveLang((await searchParams).lang);
  return <StoreHome lang={lang} />;
}
