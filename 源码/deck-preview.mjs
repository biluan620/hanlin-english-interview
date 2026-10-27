/* 从渲染好的课件页面拼一张预览，重点看人物在 PPT 里的样子 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const fs = await import('node:fs');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const TMP = `${ROOT}/.codex-build/ppt`;
const pick = [1, 3, 6];
const W = 940, GAP = 22, HEAD = 40;
const tiles = [];
for (const i of pick) {
  const p = `${TMP}/full-${i}.png`;
  if (!fs.existsSync(p)) { console.log('missing', p); continue; }
  const buf = await sharp(p).resize({ width: W }).png().toBuffer();
  const m = await sharp(buf).metadata();
  tiles.push({ label: `第 ${i} 页`, buf, h: m.height });
}
const totalH = HEAD + tiles.reduce((s, t) => s + t.h + GAP + HEAD, 0) + GAP;
const layers = [{ input: Buffer.from(`<svg width="${W + GAP * 2}" height="${totalH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b1220"/></svg>`), left: 0, top: 0 }];
let y = GAP;
for (const t of tiles) {
  layers.push({
    input: Buffer.from(`<svg width="${W}" height="${HEAD}" xmlns="http://www.w3.org/2000/svg">
      <style>text{font-family:"Microsoft YaHei",sans-serif;font-size:22px;fill:#9fb4d6}</style>
      <text x="0" y="28">${t.label}</text></svg>`), left: GAP, top: y
  });
  y += HEAD;
  layers.push({ input: t.buf, left: GAP, top: y });
  y += t.h + GAP;
}
await sharp({ create: { width: W + GAP * 2, height: totalH, channels: 4, background: '#0b1220' } })
  .composite(layers).png().toFile(`${ROOT}/outputs/预览-课件人物.png`);
console.log('已生成 outputs/预览-课件人物.png', (W + GAP * 2) + 'x' + totalH);
