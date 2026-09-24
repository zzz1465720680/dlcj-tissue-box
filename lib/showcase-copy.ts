export type Lang = 'zh' | 'en';

export type Colorway = {id: string; name: string; description: string; alt: string};

export type ShowcaseCopy = {
  meta: { title: string; description: string };
  skipLink: string;
  navLabel: string;
  logoLabel: string;
  brand: string;
  nav: { collection: string; colorways: string; details: string; purchase: string; studio: string; cta: string };
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
  hero: { start: string; how: string };
  colorways: {
    title: string;
    intro: string;
    presetNote: string;
    items: readonly Colorway[];
    choose: string;
    freeform: string;
    freeformNote: string;
  };
  info: {
    title: string;
    intro: readonly string[];
    rangeTitle: string;
    range: readonly string[];
    confirmedTitle: string;
    confirmed: readonly string[];
    pendingTitle: string;
    careTitle: string;
    care: readonly string[];
  };
  steps: { title: string; intro: string; items: readonly {title: string; body: string}[]; note: string };
  faq: { title: string; intro: string; items: readonly {q: string; a: string}[] };
  languageNote: string;
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
    description: '小物，也有讲究。白色撞色系列车载纸巾盒：选一款推荐配色，或自己定材质、颜色、打孔与图案，生成可发给商家的定制方案。',
  },
  skipLink: '跳转到产品展示',
  navLabel: '主导航',
  logoLabel: '鼎立车眷首页',
  brand: '鼎立车眷',
  nav: { collection: '车载纸巾盒', colorways: '推荐配色', details: '产品细节', purchase: '购买流程', studio: '定制工坊', cta: '开始定制' },
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
    heroDescription: '配色、缝线和图案，按你的喜好搭配。生成专属方案，与商家确认材料和报价。',
    explore: '选一款推荐配色',
    detailsLink: '定制与购买流程',
    captionLeft: '白色为底，清新点睛。',
    captionRight: '清新绿',
  },
  hero: { start: '选一款推荐配色', how: '定制与购买流程' },
  colorways: {
    title: '先挑一款配色，再慢慢改。',
    intro: '下面三款是推荐搭配，点一下就会带进定制工坊，进去以后每个部位都可以继续调整。',
    presetNote: '预设示例图（本站 3D 渲染缩略图），不是你当前设计的实时效果。',
    items: [
      {id: 'porcelain-blue', name: '白瓷 · 湖蓝', description: '白色主体与湖蓝封边，清爽的撞色搭配。', alt: '「白瓷 · 湖蓝」预设搭配缩略图：白色主体与湖蓝封边'},
      {id: 'black-coral', name: '曜石 · 珊瑚红', description: '黑色主体与打孔包角，配珊瑚红封边。', alt: '「曜石 · 珊瑚红」预设搭配缩略图：黑色主体、黑色包角与珊瑚红封边'},
      {id: 'forest-linen', name: '森林 · 亚麻', description: '墨绿主体配亚麻色包角，带一枚侧标，偏沉稳。', alt: '「森林 · 亚麻」预设搭配缩略图：墨绿主体与亚麻色包角'},
    ],
    choose: '用这款配色定制',
    freeform: '从零自由定制',
    freeformNote: '保留已有搭配，也可以从推荐款开始调整。编辑中的配色切换支持撤销。',
  },
  info: {
    title: '定制前，先了解这些。',
    intro: ['先选择喜欢的效果，再与商家确认实际材料、尺寸和报价。'],
    rangeTitle: '可以预览的设计选项',
    range: [
      '主体：预览细纹、光面、绒面质感，调整颜色与打孔效果',
      '四个包角：可以整组联动，也可以分别设成不同颜色与质感',
      '抽纸口饰边：封边油颜色与缝线颜色可以分开选择',
      '图案：图片、文字、手绘笔迹，添加后随皮料折合实时显示',
      '侧标：窄边布标可留空、写最多 12 字，或换成一张小图',
      '配色：12种推荐颜色，也可自选；实物颜色需按色卡确认',
    ],
    confirmedTitle: '你的方案如何保存',
    confirmed: [
      '设计选项用于表达喜好，材料供应和制作工艺由商家确认',
      '可定制部位：主体皮料、四个包角、抽纸口饰边，共 6 个部位，另有侧标',
      '图案方式：图片、文字、手绘笔迹，编辑时实时预览折合效果',
      '选款与导出：无需账号即可在本机完成搭配、保存草稿并导出方案文件',
    ],
    pendingTitle: '购买前一起确认',
    careTitle: '摆放与养护',
    care: [
      '抽纸口在顶部，抽出方向朝上；车内请放在不易滑动、不挡视线、不影响安全气囊的位置',
      '皮料避免长时间暴晒与浸水，沾到水用干布轻擦；具体养护以商家说明为准',
      '是否适配你的车：先量一下打算放置的位置，再把车型一起告诉商家确认',
    ],
  },
  steps: {
    title: '从看到，到手边。',
    intro: '四步走完：先定搭配，再和商家确认，然后付款、收货。',
    items: [
      {title: '选款或自由设计', body: '挑选推荐配色，或在定制工坊调整各个部位、缝线和图案。'},
      {title: '生成方案并确认细节', body: '在工坊点「确认方案 · 咨询这款」，核对 6 个部位、侧标、数量与备注，复制需求文字，或下载方案文件（JSON）与多角度效果图（PNG）。'},
      {title: '与商家确认后购买', body: '把需求发给商家，确认材料、可制作性、价格、交期与运费之后，按商家给出的付款方式购买。网站上暂不支持在线支付。'},
      {title: '制作与交付', body: '商家按确认后的方案制作并安排发货；定制确认、修改与售后规则以商家说明为准。'},
    ],
    note: '请将方案主动发给商家。确认报价和制作细节后再购买，本站不在线收款。',
  },
  faq: {
    title: '常见问题',
    intro: '关于适配、配色与购买，你可能还想了解。',
    items: [
      {q: '尺寸适合我的车吗？', a: '建模参考尺寸是 16 × 10.5 × 约 6 cm，用来做 3D 预览；成品实测尺寸和抽纸适配规格还要等商家确认，我们不承诺具体车型适配。建议先量一下中控台、扶手箱或门板格的放置位置，再把车型告诉商家。'},
      {q: '颜色和材质能做到完全一样吗？', a: '屏幕效果可能与实物有差别。网页颜色和质感用于表达设计意向，购买前请与商家核对实物色卡及可用材料。'},
      {q: '我想要的图案、照片能做吗？', a: '可以先上传图案查看搭配。能否制作、采用何种工艺及实际效果，需要商家根据原图确认；预览不等于成品效果。'},
      {q: '价格怎么算？', a: '价格、加价规则（图案数量、特殊材料、打孔工艺等）、起订量与运费由商家根据你的方案确认。网站上暂时不显示价格，也不在线收款。'},
      {q: '多久能做好，怎么收到？', a: '提交需求时可以备注期望收到的时间。制作交期、配送方式与运费由商家在购买前确认。'},
      {q: '怎样购买这款定制纸巾盒？', a: '完成搭配后，复制需求或下载方案，发给此前联系的商家账号。确认材料、报价和交期后，再按双方确认的方式购买。'},
      {q: '一定要用 3D 吗？', a: '不用。3D 只是预览，并且是按需加载的。手机或网络不佳时，可以先选配色，再生成需求文字和方案文件（JSON），一样能完成咨询。'},
    ],
  },
  languageNote: '本页与定制工坊均提供中文；工坊与方案摘要目前只有中文版本。',
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
    note: '页面配色与定制效果供参考，成品以实物打样为准；价格、交期与售后以商家确认为准。',
  },
};

const en: ShowcaseCopy = {
  meta: {
    title: '鼎立车眷 · Car Tissue Box',
    description: 'Small things, made with care. The White Contrast Series car tissue box: pick a colourway or customize material, colour, perforation and pattern, then export a plan to confirm with the maker.',
  },
  skipLink: 'Skip to the collection',
  navLabel: 'Main navigation',
  logoLabel: '鼎立车眷 home',
  brand: '鼎立车眷',
  nav: { collection: 'Car Tissue Box', colorways: 'Colourways', details: 'Product Details', purchase: 'How to Buy', studio: 'Custom Studio', cta: 'Customize' },
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
    heroDescription: 'Choose your colours, stitching and artwork. Create a personal design, then confirm materials and a quote with the maker.',
    explore: 'Pick a Colourway',
    detailsLink: 'How Customizing Works',
    captionLeft: 'White as the base, a fresh accent.',
    captionRight: 'Fresh Green',
  },
  hero: { start: 'Pick a colourway', how: 'How customizing works' },
  colorways: {
    title: 'Start from a colourway, then change anything.',
    intro: 'These three are recommended combinations. One tap takes them into the studio, where every part can still be adjusted.',
    presetNote: 'Preset example images (thumbnails rendered by this site) — not a live view of your own design.',
    items: [
      {id: 'porcelain-blue', name: 'Porcelain · Lake Blue', description: 'A white body with crisp lake-blue edging.', alt: 'Preset thumbnail: white body with lake-blue edging'},
      {id: 'black-coral', name: 'Obsidian · Coral', description: 'Black body and perforated black corners with coral-red edging.', alt: 'Preset thumbnail: black body and black corners with coral-red edging'},
      {id: 'forest-linen', name: 'Forest · Linen', description: 'Deep green body with linen corners and a side label — the calmest of the three.', alt: 'Preset thumbnail: deep green body with linen corners'},
    ],
    choose: 'Customize with this colourway',
    freeform: 'Start from scratch',
    freeformNote: 'Continue your local draft or start with a recommended combination. Colourway changes can be undone while editing.',
  },
  info: {
    title: 'A few details before you customize.',
    intro: ['Explore your design, then confirm physical materials, dimensions and pricing with the maker.'],
    rangeTitle: 'Design options to preview',
    range: [
      'Preview grain, smooth or suede finishes and adjust colour and perforation',
      'Four corners: adjust them as a group, or give each one its own colour and finish',
      'Opening trim: edge-paint colour and thread colour are chosen separately',
      'Artwork: images, text and freehand strokes, folded onto the leather in the live preview',
      'Side label: leave it blank, write up to 12 characters, or use a small image',
      'Colour: a 12-colour palette plus a custom picker, with separate values for edge paint and thread',
    ],
    confirmedTitle: 'Keeping your design',
    confirmed: [
      'Preview options express your preferences; available materials and production methods need confirmation',
      'Customizable parts: body, four corners and opening trim — six parts in total, plus a side label',
      'Artwork methods: images, text and freehand strokes with a live folded preview',
      'Selecting and exporting: no account needed — design, keep a local draft and export the plan file',
    ],
    pendingTitle: 'Confirm before purchasing',
    careTitle: 'Placement and care',
    care: [
      'The opening faces up on the top face; keep it somewhere it will not slide, block your view or interfere with an airbag',
      'Avoid long sun exposure and soaking; wipe with a dry cloth if it gets wet — follow the maker’s care instructions',
      'To check the fit for your car, measure the spot you have in mind and tell the maker your car model',
    ],
  },
  steps: {
    title: 'From looking to holding.',
    intro: 'Four steps: choose the design, confirm with the maker, pay, then receive it.',
    items: [
      {title: 'Pick a colourway or design freely', body: 'Pick a recommended combination or adjust each part, stitching and artwork in the studio.'},
      {title: 'Generate the plan and check the details', body: 'In the studio, tap “确认方案 · 咨询这款” to review all six parts, the side label, quantity and notes, then copy the request text or download the plan file (JSON) and multi-angle image (PNG).'},
      {title: 'Confirm with the maker, then buy', body: 'Send the request to the maker and confirm material, feasibility, price, lead time and shipping, then pay the way the maker asks. Online payment is not supported on this site yet.'},
      {title: 'Made and delivered', body: 'The maker produces the confirmed design and arranges delivery; confirmation, change and after-sales rules follow the maker’s terms.'},
    ],
    note: 'Send your plan to the maker and confirm the quote before buying. This site does not take online payments.',
  },
  faq: {
    title: 'Questions people ask',
    intro: 'Fit, colours and how to purchase your custom piece.',
    items: [
      {q: 'Will it fit my car?', a: 'The modelling reference is about 16 × 10.5 × 6 cm, used for the 3D preview. The measured finished size and the tissue pack it fits still need confirmation from the maker, and we do not promise a fit for any specific car. Measure the spot you have in mind and tell the maker your car model.'},
      {q: 'Can the colour and material match exactly?', a: 'Screen colours and textures may differ from the finished item. Confirm physical swatches and available materials with the maker before buying.'},
      {q: 'Can my pattern or photo be made?', a: 'Upload artwork to explore a design. The maker needs to review the original file and confirm feasibility, production method and the finished effect.'},
      {q: 'How is the price calculated?', a: 'Price, upcharges (number of artwork elements, special materials, perforation), minimum order quantity and shipping are confirmed by the maker based on your design. This site does not display prices and does not take payment.'},
      {q: 'How long does it take, and how do I receive it?', a: 'Production lead time, shipping method, delivery scope and cost are confirmed by the maker. This site does not promise a number of days or free shipping.'},
      {q: 'How do I buy my custom tissue box?', a: 'Copy or download your plan and send it to the maker you contacted. Agree on materials, price and lead time, then use the agreed purchase method.'},
      {q: 'Do I have to use the 3D view?', a: 'No. 3D is only a preview and loads on demand. On a phone or a slow connection you can pick a colourway first and then generate the request text and plan file (JSON) — that is enough to start the conversation.'},
    ],
  },
  languageNote: 'This page is available in English and Chinese. The customization studio and the request summary are currently in Chinese only.',
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
    note: 'Colours and customization are shown for reference; the finished product follows the physical sample, and price, lead time and after-sales follow the maker’s confirmation.',
  },
};

export const SHOWCASE_COPY: Record<Lang, ShowcaseCopy> = { zh, en };

export const resolveLang = (value?: string | null): Lang => (value === 'en' ? 'en' : 'zh');