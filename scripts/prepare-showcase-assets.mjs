import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Web delivery copies only. Original photography and generated masters stay intact.
const project = process.cwd();
const destination = path.join(project, 'public/showcase');
await mkdir(destination, { recursive: true });
const sources = [
  ['G:/DLCJ/12_广告设计/纸巾盒网站展示_20260922/hero-studio.png', 'hero-studio', [840, 1672]],
  ['G:/DLCJ/12_广告设计/纸巾盒网站展示_20260922/customize-collection.png', 'customize-collection', [840, 1672]],
  ['G:/DLCJ/12_广告设计/纸巾盒0914_品牌广告/01_图文成品/03_细节特写.png', 'craft-detail', [600, 1086]],
  ['G:/DLCJ/12_广告设计/纸巾盒0914_品牌广告/工作文件/视频画面/V2_车内场景.png', 'car-scene', [600, 941]],
];
for (const [source, name, widths] of sources) {
  for (const width of widths) {
    const output = path.join(destination, `${name}-${width}.webp`);
    const info = await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality: 86, effort: 5 }).toFile(output);
    console.log(`${path.basename(output)}: ${info.width} × ${info.height}, ${Math.round(info.size / 1024)} KB`);
  }
}
