'use client';
import { useState } from 'react';
import PhotoCarousel from './photo-carousel';
import MatConfigurator from './mat-configurator';
import { FLOOR_MAT_SLIDES } from '@/lib/floor-mats/catalog';
import type { Lang } from '@/lib/showcase-copy';

export default function FloorMatShowcase({lang}: {lang: Lang}) {
  const [started, setStarted] = useState(false);
  return <><PhotoCarousel items={FLOOR_MAT_SLIDES} lang={lang} onDesign={()=>setStarted(true)}/><MatConfigurator lang={lang} started={started} onStart={()=>setStarted(true)}/></>;
}
