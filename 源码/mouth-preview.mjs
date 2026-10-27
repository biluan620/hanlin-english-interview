import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';

// 嘴部窗口（原图 1279x1835 坐标）
const X0 = Math.round(0.36 * 1279), Y0 = Math.round(0.19 * 1835);
const WW = Math.round(0.32 * 1279), HH = Math.round(0.20 * 1835);
const ZOOM = 2.6;

async function panel(src, path, isPng) {
  let img;
  if (isPng) {
    img = sharp(path).ensureAlpha();
    // 把透明底换成浅灰，方便看接缝
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < info.width * info.height; i++) {
      const a = data[i * 4 + 3] / 255;
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * a + 235 * (1 - a));
      data[i * 4 + 3] = 255;
    }
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  } else {
    img = sharp(src);
  }
  const meta = await img.metadata();
  const sx = meta.width / 1279, sy = meta.height / 1835;
  return await img
    .extract({
      left: Math.round(X0 * sx), top: Math.round(Y0 * sy),
      width: Math.round(WW * sx), height: Math.round(HH * sy)
    })
    .resize({ width: Math.round(WW * ZOOM), kernel: 'nearest' })
    .png().toBuffer();
}

const a1 = await sharp(`${ROOT}/work/ref/1.jpg`).resize({ width: 1279 }).png().toBuffer();
const a2 = await sharp(`${ROOT}/work/ref/2.jpg`).resize({ width: 1279 }).png().toBuffer();
const p1 = await panel(null, `${ROOT}/outputs/HanLin立绘.png`, true);
const p2 = await panel(null, `${ROOT}/outputs/HanLin说话.png`, true);
const q1 = await panel(await sharp(a1).toBuffer(), null, false);
const q2 = await panel(await sharp(a2).toBuffer(), null, false);
const w = Math.round(WW * ZOOM), h = Math.round(HH * ZOOM), GAP = 18;
await sharp({
  create: { width: w * 4 + GAP * 5, height: h + GAP * 2 + 46, channels: 4, background: '#101826' }
}).composite([
  { input: q1, left: GAP, top: GAP + 46 },
  { input: p1, left: GAP * 2 + w, top: GAP + 46 },
  { input: q2, left: GAP * 3 + w * 2, top: GAP + 46 },
  { input: p2, left: GAP * 4 + w * 3, top: GAP + 46 },
  {
    input: Buffer.from(`<svg width="${w * 4 + GAP * 5}" height="46" xmlns="http://www.w3.org/2000/svg">
      <style>text{font-family:"Microsoft YaHei",sans-serif;font-size:20px;fill:#fff}</style>
      <text x="${GAP}" y="30">1.jpg 原图嘴部</text>
      <text x="${GAP * 2 + w}" y="30">新·不说话（用 1）</text>
      <text x="${GAP * 3 + w * 2}" y="30">2.jpg 原图嘴部</text>
      <text x="${GAP * 4 + w * 3}" y="30">新·说话（用 2 的嘴）</text>
    </svg>`), left: 0, top: 0
  }
]).png().toFile(`${ROOT}/outputs/预览-口型对比.png`);
console.log('已生成 outputs/预览-口型对比.png', `${w * 4 + GAP * 5}x${h + GAP * 2 + 46}`);
