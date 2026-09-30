import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const inputs = 'G:/DLCJ/output/product-photos-20260928';
const photos = [
  ['white-lime', 'white-lime-aligned-v2.png'],
  ['black-coral', 'black-coral-aligned-v2.png'],
  ['ivory', 'ivory.png'],
];
await mkdir(path.join(root, 'public/products'), { recursive: true });
for (const [id, file] of photos) {
  for (const width of [800, 1536]) {
    await sharp(path.join(inputs, file)).resize({ width }).webp({ quality: 88 })
      .toFile(path.join(root, 'public/products', `${id}-${width}.webp`));
  }
  await sharp(path.join(inputs, file)).resize({ width: 480 }).webp({ quality: 86 })
    .toFile(path.join(root, 'public/presets', `${id}.webp`));
}
await sharp('G:/DLCJ/01_原始素材/图片/01_纸巾盒/2026-09-22_产品实拍/微信图片_20260922095938_541_3.jpg')
  .rotate().resize({ width: 1200 }).webp({ quality: 86 })
  .toFile(path.join(root, 'public/products/black-coral-in-car.webp'));
console.log('Prepared three product colourways and the original in-car photo.');
