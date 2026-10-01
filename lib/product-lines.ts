import type { Lang } from '@/lib/showcase-copy';

// Product entries are independent of the tissue-box design and order schemas.
// Add a new entry here when another product line is ready to be displayed.
export const PRODUCT_LINES = [
  {
    id: 'floor-mats',
    href: '/mats',
    image: '/floor-mats/black-gray-grid-1536.webp',
    imageSet: '/floor-mats/black-gray-grid-800.webp 800w, /floor-mats/black-gray-grid-1536.webp 1536w',
    width: 1536,
    height: 864,
    copy: {
      zh: { label: '亲情car · 脚垫系列', title: '脚垫', body: '看看车内实景里的配色与纹理。', action: '浏览脚垫', alt: '灰色格纹上层垫与黑色围边在车内的搭配展示' },
      en: { label: 'QINQINGCAR · FLOOR MATS', title: 'Floor mats', body: 'Explore colours and textures in a car interior.', action: 'Explore floor mats', alt: 'Gray patterned upper mat with a black surround, shown in a car interior' },
    } satisfies Record<Lang, { label: string; title: string; body: string; action: string; alt: string }>,
  },
  {
    id: 'tissue-box',
    href: '/tissue-box',
    image: '/products/white-lime-1536.webp',
    imageSet: '/products/white-lime-800.webp 800w, /products/white-lime-1536.webp 1536w',
    width: 1536,
    height: 1024,
    copy: {
      zh: { label: '鼎立车眷 · 纸巾盒系列', title: '纸巾盒', body: '现有款式与自由定制，找到喜欢的样子。', action: '浏览纸巾盒', alt: '白色皮纹车载纸巾盒，搭配浅绿色包角与封边' },
      en: { label: 'DINGLI CHEJUAN · TISSUE BOXES', title: 'Tissue boxes', body: 'Find a favourite style, or create your own.', action: 'Explore tissue boxes', alt: 'White leather-textured car tissue box with pale green corners and edging' },
    } satisfies Record<Lang, { label: string; title: string; body: string; action: string; alt: string }>,
  },
] as const;
