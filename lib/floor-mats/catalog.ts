import type { Lang } from '@/lib/showcase-copy';

export type FloorMatSlide = {
  id: string;
  image: string;
  imageSet: string;
  copy: Record<Lang, { name: string; detail: string; alt: string }>;
};

function slide(id: string, zh: FloorMatSlide['copy']['zh'], en: FloorMatSlide['copy']['en']): FloorMatSlide {
  return {
    id,
    image: `/floor-mats/${id}-1536.webp`,
    imageSet: `/floor-mats/${id}-800.webp 800w, /floor-mats/${id}-1536.webp 1536w`,
    copy: { zh, en },
  };
}

// Display references only: these IDs are not orderable SKUs or verified fitments.
// Chinese colourway names follow the supplied images, including “碳纤丝”.
// Material composition must be confirmed before adding specification claims.
export const FLOOR_MAT_SLIDES: readonly FloorMatSlide[] = [
  slide('black-gray-grid',
    { name: '黑灰格', detail: '灰色格纹 · 黑色围边', alt: '黑灰格配色参考，灰色格纹上层垫搭配黑色围边与两个圆形固定扣' },
    { name: 'Black & gray grid', detail: 'Gray pattern · Black surround', alt: 'Gray patterned upper mat with a black surround and two round fasteners' }),
  slide('black-brown-grid',
    { name: '黑棕格', detail: '棕色格纹 · 黑色围边', alt: '黑棕格配色参考，棕色格纹上层垫搭配黑色围边' },
    { name: 'Black & brown grid', detail: 'Brown pattern · Black surround', alt: 'Brown patterned upper mat with a black surround in a car interior' }),
  slide('orange-texture',
    { name: '理想橙碳纤丝', detail: '橙色纹理 · 黑色围边', alt: '理想橙配色参考，橙色纹理上层垫搭配黑色围边' },
    { name: 'Orange texture', detail: 'Orange texture · Black surround', alt: 'Orange textured upper mat with a black surround in a car interior' }),
  slide('black-silver-grid',
    { name: '黑银格', detail: '银灰格纹 · 黑色围边', alt: '黑银格配色参考，银灰格纹上层垫搭配黑色围边' },
    { name: 'Black & silver grid', detail: 'Silver-gray pattern · Black surround', alt: 'Silver-gray patterned upper mat with a black surround in a car interior' }),
  slide('coffee-orange-grid',
    { name: '咖桔格', detail: '桔色格纹 · 咖色围边', alt: '咖桔格配色参考，桔色格纹上层垫搭配咖色围边' },
    { name: 'Coffee & orange grid', detail: 'Orange pattern · Coffee surround', alt: 'Orange patterned upper mat with a coffee-colored surround in a car interior' }),
  slide('black-silver-texture',
    { name: '黑银碳纤丝', detail: '银灰纹理 · 黑色围边', alt: '黑银纹理配色参考，银灰纹理上层垫搭配黑色围边' },
    { name: 'Black & silver texture', detail: 'Silver-gray texture · Black surround', alt: 'Silver-gray textured upper mat with a black surround in a car interior' }),
  slide('black-wine-grid',
    { name: '黑酒红格', detail: '酒红格纹 · 黑色围边', alt: '黑酒红格配色参考，酒红格纹上层垫搭配黑色围边' },
    { name: 'Black & wine-red grid', detail: 'Wine-red pattern · Black surround', alt: 'Wine-red patterned upper mat with a black surround in a car interior' }),
  slide('black-tong-texture',
    { name: '黑桐碳纤丝', detail: '棕色纹理 · 黑色围边', alt: '黑桐纹理配色参考，棕色纹理上层垫搭配黑色围边' },
    { name: 'Black & brown texture', detail: 'Brown texture · Black surround', alt: 'Brown textured upper mat with a black surround in a car interior' }),
  slide('black-gray-texture',
    { name: '黑灰碳纤丝', detail: '灰色纹理 · 黑色围边', alt: '黑灰纹理配色参考，灰色纹理上层垫搭配黑色围边' },
    { name: 'Black & gray texture', detail: 'Gray texture · Black surround', alt: 'Gray textured upper mat with a black surround in a car interior' }),
];

export const FLOOR_MAT_COPY = {
  zh: {
    meta: { title: '亲情car · 脚垫系列｜鼎立车眷', description: '浏览亲情car脚垫的车内配色与纹理搭配参考。大图展示格纹、色彩与围边细节。' },
    eyebrow: '亲情car · 脚垫系列',
    title: '脚下的细节，随你心意。',
    intro: '先看看不同配色，在车里的样子。',
    gallery: '脚垫配色展示',
    carousel: '轮播',
    previous: '上一款脚垫',
    next: '下一款脚垫',
    play: '播放轮播',
    pause: '暂停轮播',
    playText: '播放',
    pauseText: '暂停',
    keyboard: '使用左右方向键切换配色，手机上可左右滑动。',
    imageNote: '首张图片经 AI 精修，其余为提供的配色参考。颜色、纹理与细节以实物为准。',
    aboutLabel: 'COLOUR & TEXTURE / 配色与纹理',
    aboutTitle: '多一点，自己的喜欢。',
    aboutBody: '格纹的层次、纹理的变化，或是一抹喜欢的颜色。让脚下的搭配，也成为车内日常的一部分。',
    availability: '可体验四块及整套的三维配色搭配。车型适配、选材与制作细节请与商家确认。',
  },
  en: {
    meta: { title: 'QINQINGCAR floor mats｜DINGLI CHEJUAN', description: 'Explore floor-mat colour and texture references in a car interior. View patterns, colour accents and surround details in a large-photo gallery.' },
    eyebrow: 'QINQINGCAR · FLOOR MATS',
    title: 'Details that feel like you.',
    intro: 'See how different colours look in a car interior.',
    gallery: 'Floor-mat colour gallery',
    carousel: 'carousel',
    previous: 'Previous floor mat',
    next: 'Next floor mat',
    play: 'Play slideshow',
    pause: 'Pause slideshow',
    playText: 'Play',
    pauseText: 'Pause',
    keyboard: 'Use the left and right arrow keys, or swipe on your phone, to change colours.',
    imageNote: 'The first image is AI-retouched; the others are supplied colour references. Confirm colours, textures and details against the physical product.',
    aboutLabel: 'COLOUR & TEXTURE',
    aboutTitle: 'A little more your own.',
    aboutBody: 'A patterned surface, a different texture, or a touch of your favourite colour. Let the details underfoot become part of your everyday interior.',
    availability: 'Explore four individual mats or the full set in 3D. Confirm vehicle fitment, materials and production details with the maker.',
  },
} as const;
