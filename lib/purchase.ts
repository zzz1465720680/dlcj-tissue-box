// 需求摘要（询价草案）的唯一生成逻辑：纯函数，不发起任何提交。
// 复制、下载都只是把本机生成的文本/文件交给用户，不代表已经发送给商家。
import {PARTS, PALETTE, PART_NAMES, type Design, type Material, type Part} from './design';

export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 999;
export const NOTE_MAX = 300;

export const MATERIAL_NAMES: Record<Material, string> = {
  grain: '细纹皮革',
  smooth: '光面皮革',
  suede: '绒面质感',
};

export type QuantityResult = {ok: true; value: number} | {ok: false; message: string};

/** 数量必须是有效正整数，并有合理上限。 */
export function parseQuantity(raw: string): QuantityResult {
  const trimmed = raw.trim();
  if (!trimmed) return {ok: false, message: '请填写数量。'};
  if (!/^\d+$/.test(trimmed)) return {ok: false, message: '数量请填写整数（例如 1）。'};
  const value = Number(trimmed);
  if (value < QUANTITY_MIN) return {ok: false, message: `数量至少为 ${QUANTITY_MIN} 件。`};
  if (value > QUANTITY_MAX) return {ok: false, message: `数量请控制在 ${QUANTITY_MAX} 件以内；更大批量请联系客服单独沟通。`};
  return {ok: true, value};
}

export function colorName(hex: string): string {
  return PALETTE.find(color => color.hex.toLowerCase() === hex.toLowerCase())?.name ?? '自定义色';
}

export type ArtCounts = {images: number; texts: number; strokes: number};

export type PartSummary = {
  part: Part;
  name: string;
  material: string;
  color: string;
  colorHex: string;
  perforated: boolean;
  edge: string;
  edgeName: string;
  thread: string;
  threadName: string;
  art: ArtCounts;
  artTexts: string[];
};

export type DesignSummary = {
  parts: PartSummary[];
  label: {enabled: boolean; text: string; color: string; colorName: string; ink: string; inkName: string; hasImage: boolean};
  totals: ArtCounts;
  artTexts: string[];
};

const counts = (art: Design['parts'][Part]['art']): ArtCounts => ({
  images: art.filter(item => item.kind === 'image').length,
  texts: art.filter(item => item.kind === 'text').length,
  strokes: art.filter(item => item.kind === 'stroke' && !item.erase).length,
});

/** 完整列出 6 个部位与侧标，不遗漏独立包角和自定义图案。 */
export function summarizeDesign(design: Design): DesignSummary {
  const parts: PartSummary[] = PARTS.map(part => {
    const surface = design.parts[part];
    return {
      part,
      name: PART_NAMES[part],
      material: MATERIAL_NAMES[surface.material],
      color: colorName(surface.color),
      colorHex: surface.color.toUpperCase(),
      perforated: surface.perforated,
      edge: surface.edge.toUpperCase(),
      edgeName: colorName(surface.edge),
      thread: surface.thread.toUpperCase(),
      threadName: colorName(surface.thread),
      art: counts(surface.art),
      artTexts: surface.art.filter(item => item.kind === 'text' && item.text).map(item => item.text as string),
    };
  });
  const totals = parts.reduce<ArtCounts>(
    (sum, row) => ({images: sum.images + row.art.images, texts: sum.texts + row.art.texts, strokes: sum.strokes + row.art.strokes}),
    {images: 0, texts: 0, strokes: 0},
  );
  return {
    parts,
    label: {
      enabled: design.label.enabled,
      text: design.label.text,
      color: design.label.color.toUpperCase(),
      colorName: colorName(design.label.color),
      ink: design.label.ink.toUpperCase(),
      inkName: colorName(design.label.ink),
      hasImage: Boolean(design.label.image),
    },
    totals,
    artTexts: parts.flatMap(row => row.artTexts),
  };
}

/** 短签名：把摘要与当前设计绑定，设计一改签名就变。 */
export function designSignature(design: Design): string {
  const source = JSON.stringify(design);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(-6);
}

export type InquiryDraft = {quantity: number; note: string};

function validateInquiry(draft: InquiryDraft) {
  if (!Number.isSafeInteger(draft.quantity) || draft.quantity < QUANTITY_MIN || draft.quantity > QUANTITY_MAX) {
    throw new Error(`请填写 ${QUANTITY_MIN}–${QUANTITY_MAX} 之间的整数数量。`);
  }
  if (draft.note.length > NOTE_MAX) throw new Error(`备注最多 ${NOTE_MAX} 字。`);
}

/** A change marker, not a security token or an order number. Includes quantity and notes. */
export function inquiryContentKey(design: Design, quantity: string, note: string): string {
  const parsed = parseQuantity(quantity);
  const content = JSON.stringify({design, quantity: parsed.ok ? parsed.value : quantity, note: note.trim()});
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let index = 0; index < content.length; index++) {
    const char = content.charCodeAt(index);
    a = Math.imul(a ^ char, 0x01000193);
    b = Math.imul(b ^ char, 0x85ebca6b);
  }
  return [a, b].map(value => (value >>> 0).toString(16).padStart(8, '0')).join('').toUpperCase();
}

const artLine = (art: ArtCounts): string => {
  const bits = [`图片 ${art.images}`, `文字 ${art.texts}`, `笔迹 ${art.strokes}`];
  return bits.join(' · ');
};

const stamp = (when: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
};

const MERCHANT_LINE = '鼎立车眷';

export function buildInquiryText(design: Design, draft: InquiryDraft, when: Date): string {
  validateInquiry(draft);
  const summary = summarizeDesign(design);
  const signature = designSignature(design);
  const note = draft.note.trim();
  const lines: string[] = [
    `${MERCHANT_LINE} 定制需求（本地方案编号 DLCJ-${signature}）`,
    `生成时间：${stamp(when)} · 由客户在本机生成，尚未发送给商家`,
    '',
    `设计名称：${design.name}`,
    `数量：${draft.quantity} 件`,
    `备注：${note || '（无）'}`,
    '',
    '【部位方案】',
  ];
  for (const row of summary.parts) {
    lines.push(
      `· ${row.name}：${row.material}｜颜色 ${row.color} ${row.colorHex}｜打孔 ${row.perforated ? '开' : '关'}｜封边油 ${row.edgeName} ${row.edge}｜缝线 ${row.threadName} ${row.thread}｜图案 ${artLine(row.art)}${row.artTexts.length ? `｜文字：${row.artTexts.join('、')}` : ''}`,
    );
  }
  lines.push('', '【侧标】');
  if (summary.label.enabled) {
    lines.push(
      `窄边布标：启用｜底色 ${summary.label.colorName} ${summary.label.color}｜文字色 ${summary.label.inkName} ${summary.label.ink}｜文字「${summary.label.text || '未填写'}」｜标签图片 ${summary.label.hasImage ? '有（原图在方案文件中）' : '无'}`,
    );
  } else {
    lines.push('窄边布标：未启用');
  }
  lines.push('', '【图案内容】');
  lines.push(`合计：图片 ${summary.totals.images} 张 · 文字 ${summary.totals.texts} 处 · 手绘笔迹 ${summary.totals.strokes} 段`);
  lines.push(summary.artTexts.length ? `文字内容：${summary.artTexts.join('、')}` : '文字内容：无');
  lines.push('图片与笔迹的完整原图保存在随附的 .json 方案文件中，本摘要不包含完整图案内容。');
  lines.push(
    '',
    '【请商家确认】材料与实物色卡、图案可制作性（工艺）、价格与加价规则、起订量、制作交期、运费与售后规则。',
    `【说明】本方案编号 DLCJ-${signature} 是本机识别号，不是商家订单号；生成与复制均不代表已下单、已付款或商家已收到。`,
  );
  return lines.join('\n');
}

/** 完整方案文件：保留图片/笔迹原图，供商家制作与存档。 */
export function buildInquiryJson(design: Design, draft: InquiryDraft, when: Date): string {
  validateInquiry(draft);
  const signature = designSignature(design);
  return JSON.stringify(
    {
      type: 'dlcj-inquiry-draft',
      version: 1,
      signature: `DLCJ-${signature}`,
      generatedAt: when.toISOString(),
      sent: false,
      note: '本文件由客户在本机生成，尚未发送给商家；图片与笔迹原图完整保存在 design 字段内。',
      request: {quantity: draft.quantity, note: draft.note.trim()},
      summary: summarizeDesign(design),
      design,
    },
    null,
    2,
  );
}

export function inquiryFileName(design: Design, when: Date, extension: string): string {
  const safe = (design.name || '定制方案').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${safe}-需求-${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}-${designSignature(design)}.${extension}`;
}

/** 咨询面板顶部展示的可读摘要行，避免用户只看到一大段文本。 */
export function summaryHighlights(design: Design): string[] {
  const summary = summarizeDesign(design);
  const body = summary.parts[0];
  const corners = summary.parts.filter(row => row.part.startsWith('corner'));
  const trim = summary.parts.find(row => row.part === 'trim')!;
  const cornerColors = new Set(corners.map(row => row.colorHex));
  return [
    `主体：${body.material}｜${body.color}｜打孔${body.perforated ? '开' : '关'}`,
    `四个包角：${cornerColors.size > 1 ? `${cornerColors.size} 种颜色` : corners[0].color}｜打孔${corners.every(row => row.perforated) ? '全部开' : corners.some(row => row.perforated) ? '部分开' : '全关'}`,
    `抽纸口饰边：${trim.color}｜封边 ${trim.edgeName}`,
    `图案：图片 ${summary.totals.images} · 文字 ${summary.totals.texts} · 笔迹 ${summary.totals.strokes}`,
    `侧标：${summary.label.enabled ? `${summary.label.colorName}｜文字「${summary.label.text || '未填写'}」` : '未启用'}`,
  ];
}
