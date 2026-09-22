export type Lang = 'zh' | 'en';

export type ShowcaseCopy = {
  meta: { title: string; description: string };
  skipLink: string;
  navLabel: string;
  logoLabel: string;
  brand: string;
  nav: { collection: string; details: string; studio: string; cta: string };
  langToggle: { label: string; zh: string; en: string };
  collection: {
    title: string;
    tagline: string;
    series: string;
    seriesColors: string;
    seriesNote: string;
    heroAlt: string;
    eyebrow: string;
    heroTitle: string;
    heroDescription: string;
    explore: string;
    detailsLink: string;
    captionLeft: string;
    captionRight: string;
  };
  poster: {
    label: string;
    imageAlt: string;
    eyebrow: string;
    title: readonly string[];
    description: readonly string[];
    cta: string;
    footerLeft: string;
    footerRight: string;
    noteColors: string;
    noteText: string;
  };
  details: {
    title: string;
    intro: readonly string[];
    craftLabel: string;
    craftTitle: string;
    craftBody: readonly string[];
    craftAlt: string;
    sceneLabel: string;
    sceneTitle: string;
    sceneBody: readonly string[];
    sceneAlt: string;
    sceneNote: string;
  };
  closing: { eyebrow: string; title: string; cta: string };
  footer: { brand: string; wordmark: string; note: string };
};

const zh: ShowcaseCopy = {
  meta: {
    title: '鼎立车眷 · 车载纸巾盒',
    description: '小物，也有讲究。探索鼎立车眷白色撞色系列车载纸巾盒，从材质、配色到图案，定制你的日常。',
  },
  skipLink: '跳转到产品展示',
  navLabel: '主导航',
  logoLabel: '鼎立车眷首页',
  brand: '鼎立车眷',
  nav: { collection: '车载纸巾盒', details: '产品细节', studio: '定制工坊', cta: '开始定制' },
  langToggle: { label: '语言', zh: '中文', en: 'EN' },
  collection: {
    title: '车载纸巾盒',
    tagline: '把讲究，带进日常。',
    series: '白色撞色系列',
    seriesColors: '清新绿、晴空蓝、暖杏橙三款配色',
    seriesNote: '一抹色彩，恰到好处。',
    heroAlt: '白色纸巾盒，绿色包边与打孔包角',
    eyebrow: '鼎立车眷 · 车载纸巾盒',
    heroTitle: '小物，也有讲究。',
    heroDescription: '细腻纹理。利落线条。刚刚好的色彩。',
    explore: '探索定制',
    detailsLink: '看看细节',
    captionLeft: '白色为底，清新点睛。',
    captionRight: '清新绿',
  },
  poster: {
    label: '进入定制工坊，设计你的纸巾盒',
    imageAlt: '白色主体搭配清新绿、晴空蓝、暖杏橙包边的三款纸巾盒',
    eyebrow: '定制工坊',
    title: ['一件日常，', '你的模样。'],
    description: ['从配色到图案，', '把喜欢的样子，变成自己的设计。'],
    cta: '开始定制',
    footerLeft: '材质 · 配色 · 图案 · 细节',
    footerRight: '实时 3D 预览',
    noteColors: '清新绿 / 晴空蓝 / 暖杏橙',
    noteText: '从一抹灵感开始，自由搭配。',
  },
  details: {
    title: '细看，才更动心。',
    intro: ['一处纹理，一道线条。', '把对日常的用心，放进细节里。'],
    craftLabel: '纹理与线条',
    craftTitle: '细节，自有分寸。',
    craftBody: ['细腻皮纹与打孔包角相映，', '一道撞色包边，勾勒利落轮廓。'],
    craftAlt: '白色皮纹、细密缝线、绿色包边与打孔包角的近景',
    sceneLabel: '车内日常',
    sceneTitle: '小小一隅，也有生活感。',
    sceneBody: ['让一抹清新，与车内的色调相处。', '日常小物，也可以是喜欢的风景。'],
    sceneAlt: '白绿纸巾盒置于深色汽车座椅上的场景示意',
    sceneNote: '场景示意',
  },
  closing: { eyebrow: '鼎立车眷', title: '把讲究，带进日常。', cta: '设计我的纸巾盒' },
  footer: {
    brand: '鼎立车眷',
    wordmark: 'DINGLI CHEJUAN',
    note: '页面配色与定制效果供参考，成品以实物打样为准。',
  },
};

const en: ShowcaseCopy = {
  meta: {
    title: '鼎立车眷 · Car Tissue Box',
    description: 'Small things, made with care. Explore the White Contrast Series car tissue box — customize material, colour and pattern to suit your everyday.',
  },
  skipLink: 'Skip to the collection',
  navLabel: 'Main navigation',
  logoLabel: '鼎立车眷 home',
  brand: '鼎立车眷',
  nav: { collection: 'Car Tissue Box', details: 'Product Details', studio: 'Custom Studio', cta: 'Customize' },
  langToggle: { label: 'Language', zh: '中文', en: 'EN' },
  collection: {
    title: 'Car Tissue Box',
    tagline: 'Bring care into the everyday.',
    series: 'White Contrast Series',
    seriesColors: 'Fresh Green, Sky Blue and Warm Apricot',
    seriesNote: 'A touch of colour, exactly enough.',
    heroAlt: 'White tissue box with green edging and perforated corners',
    eyebrow: '鼎立车眷 · Car Tissue Box',
    heroTitle: 'Small things, made with care.',
    heroDescription: 'Fine grain. Clean lines. Colour that sits just right.',
    explore: 'Explore Customizing',
    detailsLink: 'See the Details',
    captionLeft: 'White as the base, a fresh accent.',
    captionRight: 'Fresh Green',
  },
  poster: {
    label: 'Open the customization studio and design your tissue box',
    imageAlt: 'Three tissue boxes with white bodies and fresh green, sky blue and warm apricot corners',
    eyebrow: 'Custom Studio',
    title: ['Your everyday,', 'made yours.'],
    description: ['From colour to pattern —', 'turn what you like into your own design.'],
    cta: 'Start Customizing',
    footerLeft: 'Material · Colour · Pattern · Detail',
    footerRight: 'Live 3D Preview',
    noteColors: 'Fresh Green / Sky Blue / Warm Apricot',
    noteText: 'Start from a touch of inspiration, then mix freely.',
  },
  details: {
    title: 'Look closer, love it more.',
    intro: ['A texture, a line —', 'the care for daily life, kept in the details.'],
    craftLabel: 'Texture & Line',
    craftTitle: 'Details, held in measure.',
    craftBody: ['Fine grain meets perforated corners,', 'a contrast edge draws a clean outline.'],
    craftAlt: 'Close-up of white leather grain, fine stitching, green edging and perforated corners',
    sceneLabel: 'In the Car',
    sceneTitle: 'A small corner, still full of life.',
    sceneBody: ['Let a fresh accent settle into the cabin.', 'Even a small object can be a view you enjoy.'],
    sceneAlt: 'Illustrative scene of the white and green tissue box on a dark car seat',
    sceneNote: 'Illustrative scene',
  },
  closing: { eyebrow: '鼎立车眷', title: 'Bring care into the everyday.', cta: 'Design My Tissue Box' },
  footer: {
    brand: '鼎立车眷',
    wordmark: 'DINGLI CHEJUAN',
    note: 'Colours and customization are shown for reference; the finished product follows the physical sample.',
  },
};

export const SHOWCASE_COPY: Record<Lang, ShowcaseCopy> = { zh, en };

export const resolveLang = (value?: string | null): Lang => (value === 'en' ? 'en' : 'zh');
