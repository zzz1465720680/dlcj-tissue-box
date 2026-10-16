// Bandwidth derivatives for the Netlify build (2026-10-16).
// Sources stay in public/ (excluded from dist-netlify by vite.netlify.config.ts);
// this writes smaller web derivatives next to them. Not run during the build.
//
// Tools are intentionally not repo dependencies. Run with:
//   mkdir -p /tmp/gltf-tools && npm i --prefix /tmp/gltf-tools @gltf-transform/core@4 \
//     @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf@1.5.7 meshoptimizer
//   NODE_PATH=/tmp/gltf-tools/node_modules node scripts/shrink-web-assets.mjs
// (draco3dgltf 1.5.8 cannot decode in gltf-transform 4.5; pin 1.5.7.)
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = p => path.join(root, 'public', p);
const req = createRequire(path.join(process.env.NODE_PATH || root, 'x.js'));
const {NodeIO} = req('@gltf-transform/core');
const {ALL_EXTENSIONS, KHRDracoMeshCompression} = req('@gltf-transform/extensions');
const {dequantize, prune, weld, simplify} = req('@gltf-transform/functions');
const draco3d = req('draco3dgltf');
const {MeshoptDecoder, MeshoptSimplifier} = req('meshoptimizer');
await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(),
  'meshopt.decoder': MeshoptDecoder});
const only = new Set(process.argv.slice(2));
const want = key => !only.size || only.has(key);
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = [];
const done = (src, out) => report.push(`${path.relative(root, out)}  ${fs.statSync(src).size} -> ${fs.statSync(out).size}`);
function draco(doc, bits) {
  const ext = doc.getRoot().listExtensionsUsed().find(e => e.extensionName === 'KHR_draco_mesh_compression') || doc.createExtension(KHRDracoMeshCompression);
  ext.setRequired(true).setEncoderOptions({method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed: 0, decodeSpeed: 0, quantizationBits: {COLOR: 8, ...bits}});
}

// 1. revision9 tissue box: approved meshopt GLB -> Draco. Geometry is not simplified.
// Zero-weight Cut_pattern morph targets are dropped (prepareDisplayModel discards them).
// Quantization matches/exceeds the approved asset: position 16, normal 12, texcoord 16
// (TEXCOORD_1/2 were float), generic 16 (_WEB_METRIC body/trim; corners use the atlas).
if (want('r9')) {
  const src = pub('models/revision9/tissuebox-r9.glb'), out = pub('models/revision9/tissuebox-r9.draco.glb');
  const doc = await io.read(src);
  for (const mesh of doc.getRoot().listMeshes()) {
    if (mesh.getWeights().some(w => w !== 0)) throw new Error('non-zero morph weight: ' + mesh.getName());
    for (const prim of mesh.listPrimitives()) for (const t of prim.listTargets()) prim.removeTarget(t);
    mesh.setWeights([]);
  }
  await doc.transform(prune({keepAttributes: true, keepIndices: true, keepLeaves: true, keepSolidTextures: true}), dequantize());
  for (const e of doc.getRoot().listExtensionsUsed()) if (['EXT_meshopt_compression', 'KHR_mesh_quantization'].includes(e.extensionName)) e.dispose();
  draco(doc, {POSITION: 16, NORMAL: 12, TEX_COORD: 16, GENERIC: 16});
  await io.write(out, doc); done(src, out);
}

// 2. Floor mats: weld identical vertices, simplify with 1e-4 relative error (sub-0.1 mm),
// locked borders, then Draco 14/10/12/12. Embedded textures (already WebP, 446 KB) unchanged.
if (want('mats')) {
  const list = JSON.parse(fs.readFileSync(pub('models/floor-mats/models.json'), 'utf8'));
  for (const model of list) {
    const rel = model.url.split('?')[0], file = path.join(root, 'public', rel);
    const original = path.join(root, 'checks/floor-mats-original', path.basename(rel));
    fs.mkdirSync(path.dirname(original), {recursive: true});
    if (!fs.existsSync(original)) fs.copyFileSync(file, original);
    const doc = await io.read(original);
    await doc.transform(weld(), simplify({simplifier: MeshoptSimplifier, ratio: 0, error: 1e-4, lockBorder: true}));
    draco(doc, {POSITION: 14, NORMAL: 10, TEX_COORD: 12, GENERIC: 12});
    await io.write(file, doc); done(original, file);
    model.url = rel + '?v=' + sha(file).slice(0, 12);
  }
  fs.writeFileSync(pub('models/floor-mats/models.json'), JSON.stringify(list, null, 2) + '\n');
}

// 3. Standalone textures.
if (want('textures')) {
  const jobs = [
    ['models/leather-normal.png', 'models/leather-normal-2048.webp', s => s.webp({quality: 92, effort: 6, smartSubsample: true})],
    ['models/leather-roughness.png', 'models/leather-roughness-2048.webp', s => s.webp({quality: 90, effort: 6})],
    ['references/white.jpg', 'references/white-1280.webp', s => s.resize({height: 1280}).webp({quality: 82, effort: 6})],
    ['references/pattern.jpg', 'references/pattern-1280.webp', s => s.resize({height: 1280}).webp({quality: 82, effort: 6})],
  ];
  for (const [src, out, fn] of jobs) { await fn(sharp(pub(src))).toFile(pub(out)); done(pub(src), pub(out)); }
}

// 4. Logo: same SVG (header/favicon), but the embedded raster is pre-tinted bronze and 320 px wide
// instead of the 1002 px original with an SVG colour filter. dc-mark-source.png stays the source.
if (want('logo')) {
  const src = pub('brand/dc-mark-source.png');
  const {data, info} = await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  for (let i = 0; i < data.length; i += 4) { data[i] = 81; data[i + 1] = 72; data[i + 2] = 62; } // feColorMatrix 0.318/0.282/0.243
  const png = await sharp(data, {raw: info}).resize({width: 320}).png({compressionLevel: 9, palette: true, colors: 64}).toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1082 950" role="img" aria-label="DC 商标">\n  <title>鼎立车眷 DC 商标</title>\n  <image x="40" y="40" width="1002" height="870" xlink:href="data:image/png;base64,${png.toString('base64')}"/>\n</svg>\n`;
  const before = fs.statSync(pub('brand/dc-logo.svg')).size;
  fs.writeFileSync(pub('brand/dc-logo.svg'), svg);
  report.push(`public/brand/dc-logo.svg  ${before} -> ${svg.length}`);
}
console.log(report.join('\n'));
