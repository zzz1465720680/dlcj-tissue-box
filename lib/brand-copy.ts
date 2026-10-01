import type { Lang } from '@/lib/showcase-copy';

export const BRAND_COPY = {
  zh: {
    meta: {
      title: '鼎立车眷 · 汽车内饰与日常',
      description: '把材质、配色与细节，放进每一天的出行。探索鼎立车眷脚垫系列与车载纸巾盒。',
    },
    brand: '鼎立车眷',
    navLabel: '主导航',
    home: '首页',
    mats: '脚垫',
    tissueBox: '纸巾盒',
    language: '语言',
    skip: '跳至主要内容',
    eyebrow: '鼎立车眷 · 汽车内饰与日常',
    title: ['车里的日常，', '也有你的模样。'],
    intro: '把材质、配色与细节，放进每一天的出行。',
    explore: '看看产品系列',
    collection: '产品系列',
    collectionTitle: '喜欢的细节，都在这里。',
    philosophyLabel: 'OUR APPROACH / 我们的心意',
    philosophyTitle: ['让喜欢的细节，', '融进每一次出行。'],
    philosophyBody: '关注看得见的配色，也留心触手可及的纹理。让车里的每一件日常，都多一点自己的喜欢。',
    footer: '用心看细节，认真过日常。',
  },
  en: {
    meta: {
      title: 'DINGLI CHEJUAN · Everyday car interiors',
      description: 'Thoughtful materials, colours and details for your everyday journeys. Explore floor mats and car tissue boxes by DINGLI CHEJUAN.',
    },
    brand: 'DINGLI CHEJUAN',
    navLabel: 'Main navigation',
    home: 'Home',
    mats: 'Floor mats',
    tissueBox: 'Tissue boxes',
    language: 'Language',
    skip: 'Skip to main content',
    eyebrow: 'DINGLI CHEJUAN · EVERYDAY CAR INTERIORS',
    title: ['Everyday journeys.', 'A little more you.'],
    intro: 'Thoughtful materials, colours and details for life on the road.',
    explore: 'Explore the collections',
    collection: 'The collections',
    collectionTitle: 'Details to make your own.',
    philosophyLabel: 'OUR APPROACH',
    philosophyTitle: ['The details you love,', 'on every journey.'],
    philosophyBody: 'Consider the colours you see and the textures you touch. Give the everyday things in your car a little more personality.',
    footer: 'Thoughtful details. Everyday journeys.',
  },
} as const;

export function brandHref(path: string, lang: Lang) {
  return lang === 'en' ? `${path}?lang=en` : path;
}
