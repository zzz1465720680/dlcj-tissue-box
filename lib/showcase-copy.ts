export type Lang = 'zh' | 'en';
export const resolveLang = (value?: string): Lang => value === 'en' ? 'en' : 'zh';

const zh = {
  meta: { title: '鼎立车眷 · 车载纸巾盒', description: '七款现有款式与自由配色定制，价格以商品当前定价为准。从喜欢的配色开始，搭配你的车载纸巾盒；专属图案、刺绣等特殊需求请私聊报价。' },
  brand: '鼎立车眷', skip: '跳转到选款', navLabel: '页面导航', language: '语言',
  nav: ['选款式', '看细节', '自由定制'], customize: '开始定制',
  hero: { eyebrow: '鼎立车眷 · 车载纸巾盒', title: ['一件小物，', '随你心意。'], body: '从喜欢的配色开始，让车里的日常，也有自己的样子。', choose: '挑选款式', custom: '自由搭配', caption: '白瓷 · 青柠', alt: '白色皮革与青柠绿封边纸巾盒，棚拍风格精修图' },
  colorways: { label: '01 / 选现有款', title: '先选一个，喜欢的样子。', intro: '以下款式，统一价格。', choose: '咨询这款', note: '产品图经 AI 精修，颜色与细节以实物为准。', items: [
    { id: 'white-lime', name: '白瓷 · 青柠', description: '柔白皮纹，一抹清新绿。', colors: ['#eeede5', '#91c866'], alt: '白瓷青柠纸巾盒：白色主体、打孔包角与青柠绿封边' },
    { id: 'black-coral', name: '曜石 · 珊瑚红', description: '深色皮面，珊瑚红勾边。', colors: ['#282b2a', '#e96469'], alt: '曜石珊瑚红纸巾盒：黑色主体、打孔包角与红色封边' },
    { id: 'ivory', name: '奶油白', description: '同色缝线，干净而柔和。', colors: ['#e9e5da', '#d5d0c2'], alt: '奶油白纸巾盒：象牙白主体、无孔包角与同色缝线' },
    { id: 'warm-grey', name: '暖灰', description: '温润灰调，浅色封边。', colors: ['#b7ad9c', '#ded3ba'], alt: '暖灰色纸巾盒：纯色皮面、无孔包角与浅色封边' },
    { id: 'diamond-ivory', name: '菱格打孔', description: '细密孔纹，透出一抹蓝。', colors: ['#d7d4c9', '#4d798c'], alt: '浅色菱格打孔纸巾盒：主体菱形孔纹透出蓝色，搭配无孔包角' },
    { id: 'orange', name: '橙色', description: '明快橙色，为日常添一点活力。', colors: ['#ec731a', '#eedab5'], alt: '橙色纸巾盒：纯色皮面、橙色缝线和细浅色封边' },
    { id: 'yellow', name: '明黄', description: '温暖明黄，细线勾勒轮廓。', colors: ['#e3b324', '#e9dcb4'], alt: '明黄色纸巾盒：纯色皮面、同色缝线与浅色封边' },
  ] },
  details: { label: '02 / 看细节', title: ['好看的配色，', '也值得细看。'], caption: '曜石 · 珊瑚红 / 车内实拍', alt: '用户实拍的黑红纸巾盒放在深色汽车座椅上', items: [
    { title: '看得见的皮纹', body: '皮面的纹理与柔和光泽，近看也有层次。' },
    { title: '包角与封边', body: '打孔包角搭配撞色封边，或选择同色搭配，轮廓各有表情。' },
    { title: '细节，由你搭配', body: '主体、包角和抽纸口饰边，都可以分别调整颜色与缝线。' },
  ] },
  start: { label: '03 / 自由定制', title: '想自己搭配？', body: '主体、包角、封边与缝线，搭配自己的颜色。', steps: [
    { title: '选一个起点', body: '用推荐款开始，或自由搭配。' },
    { title: '调整喜欢的细节', body: '搭配皮料、封边与缝线；特殊工艺先聊一聊。' },
    { title: '确认后制作', body: '把方案发给商家，确认材料、报价和交期。' },
  ], custom: '进入定制工坊', contact: '想先聊一聊？联系定制', questions: '定制前，你可能想了解', purchase: '价格、交期与购买方式', purchaseNote: '网站用于选款和整理方案，不在线收款。购买前请与商家确认：' },
  faq: [
    { q: '现有款式和配色定制，有什么区别？', a: '页面展示的现有款式采用基础款价格，包括菱格打孔款。自己搭配颜色与细节采用配色定制价格，均以商品当前定价为准；加入自己的图案、刺绣等特殊需求，需要私聊确认工艺和报价。运费与交期另行确认。' },
    { q: '尺寸和抽纸适配，怎么确认？', a: '请量好车内放置位置和抽纸包装尺寸，发给商家核对。工坊里的 16 × 10.5 × 约 6 cm 是建模参考，成品尺寸以实测确认为准。' },
    { q: '颜色、材质和图案可以改吗？', a: '自由定制可以在工坊中调整主体、四个包角、抽纸口饰边和侧标。加入文字、图片或手绘可用于表达想法，专属图案与刺绣等特殊制作需私聊报价。实际材料、颜色和工艺，以与商家确认为准。' },
    { q: '搭配好了，怎么保存和发送？', a: '无需账号即可在本机搭配与保存草稿。在工坊点击“确认方案 · 咨询”，核对数量和备注，复制需求或下载方案，再主动发送给商家。手机慢网时也可以切换轻量预览。' },
    { q: '车内怎样摆放和养护？', a: '放在不易滑动、不挡视线、不影响安全气囊的位置。避免长时间暴晒与浸水；沾水后用干布轻擦，具体养护请按商家说明。' },
  ],
  footer: '颜色与材质以实物为准；制作与交付以双方确认为准。', languageNote: '',
};

const en = {
  meta: { title: '鼎立车眷 · Car Tissue Box', description: 'Seven existing styles and custom colour combinations. See the current store prices. Personal artwork, embroidery and special work are quoted privately.' },
  brand: '鼎立车眷', skip: 'Skip to colourways', navLabel: 'Page navigation', language: 'Language',
  nav: ['Styles', 'Details', 'Customize'], customize: 'Customize',
  hero: { eyebrow: 'DINGLI CHEJUAN · CAR TISSUE BOX', title: ['A little detail.', 'Entirely you.'], body: 'Start with a colour you love. Make the everyday feel a little more your own.', choose: 'Explore styles', custom: 'Create your own', caption: 'Porcelain · Lime', alt: 'White leather tissue box with lime edging, retouched studio product image' },
  colorways: { label: '01 / EXISTING STYLES', title: 'Find a style you love.', intro: 'One price for every style shown.', choose: 'Enquire about this style', note: 'Product images are AI-retouched. Confirm colours and details against the physical product.', items: [
    { id: 'white-lime', name: 'Porcelain · Lime', description: 'Soft white, a fresh line of green.', colors: ['#eeede5', '#91c866'], alt: 'White tissue box with perforated white corners and lime edging' },
    { id: 'black-coral', name: 'Obsidian · Coral', description: 'Dark leather, outlined in coral.', colors: ['#282b2a', '#e96469'], alt: 'Black tissue box with perforated corners and coral-red edging' },
    { id: 'ivory', name: 'Soft Ivory', description: 'Tonal stitching, quietly simple.', colors: ['#e9e5da', '#d5d0c2'], alt: 'Ivory tissue box with unperforated corners and matching stitching' },
    { id: 'warm-grey', name: 'Warm Grey', description: 'A warm grey tone with a pale outline.', colors: ['#b7ad9c', '#ded3ba'], alt: 'Warm greige tissue cover with solid corner pieces and pale edging' },
    { id: 'diamond-ivory', name: 'Diamond Perforation', description: 'Fine perforations with a hint of blue.', colors: ['#d7d4c9', '#4d798c'], alt: 'Light leather tissue cover with diamond perforations over blue backing and solid corners' },
    { id: 'orange', name: 'Orange', description: 'A bright touch for the everyday.', colors: ['#ec731a', '#eedab5'], alt: 'Orange leather tissue cover with matching stitching and thin pale edging' },
    { id: 'yellow', name: 'Golden Yellow', description: 'Warm yellow, gently outlined.', colors: ['#e3b324', '#e9dcb4'], alt: 'Golden yellow leather tissue cover with tonal stitching and pale edging' },
  ] },
  details: { label: '02 / DETAILS', title: ['A colour you love.', 'Details to look closer at.'], caption: 'Obsidian · Coral / Original photograph', alt: 'Original photograph of the black and coral tissue box on a dark car seat', items: [
    { title: 'Leather texture', body: 'Visible grain and a soft sheen bring depth to the surface.' },
    { title: 'Corners and edging', body: 'Perforated corners and contrasting edges, or a quiet tonal combination.' },
    { title: 'Made personal', body: 'Choose colours and stitching for the body, corners and opening trim separately.' },
  ] },
  start: { label: '03 / CUSTOM COMBINATIONS', title: 'Make it your own.', body: 'Choose your own colours for the body, corners, edging and stitching.', steps: [
    { title: 'Choose a starting point', body: 'Start from a colourway or build your own.' },
    { title: 'Add your details', body: 'Explore leather, edging and stitching. Discuss special work with the maker.' },
    { title: 'Confirm with the maker', body: 'Share your plan and agree on materials, price and lead time.' },
  ], custom: 'Open the design studio', contact: 'Prefer to talk first? Contact the maker', questions: 'Before you customize', purchase: 'Price, delivery and purchasing', purchaseNote: 'This site helps you design and prepare a request. It does not take payments. Confirm these details with the maker:' },
  faq: [
    { q: 'How do existing styles and custom combinations differ?', a: 'Existing styles, including Diamond Perforation, use the standard price. Your own colours and details use the custom combination price; see the current store prices. Personal artwork, embroidery and other special work are quoted privately. Confirm shipping and lead time separately.' },
    { q: 'How do I check the size and tissue-pack fit?', a: 'Measure the available space in your car and your tissue pack, then share both with the maker. The studio’s 16 × 10.5 × approximately 6 cm is a modelling reference, not a confirmed finished size.' },
    { q: 'Can I change the colours, materials and artwork?', a: 'Customize the body, four corners, opening trim and side label. Text, images and drawings express your ideas; personal artwork and embroidery production are quoted privately. Confirm available materials, colours and production methods with the maker.' },
    { q: 'How do I save and share my design?', a: 'No account is needed to design and keep a local draft. Use “确认方案 · 咨询” to review quantity and notes, copy or download the request, then send it to the maker. A lightweight preview is available for slower connections.' },
    { q: 'How should I place and care for it?', a: 'Choose a stable spot that does not block your view or interfere with airbags. Avoid long sun exposure and soaking. Wipe water off with a dry cloth and follow the maker’s care advice.' },
  ],
  footer: 'Confirm physical colours and materials, production and delivery with the maker.', languageNote: 'The design studio is currently in Chinese.',
};
export const SHOWCASE_COPY = { zh, en };
