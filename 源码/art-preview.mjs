/* 截取页面里的人物，生成对比预览图 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { chromium } = require('playwright');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const URL = 'file:///' + encodeURI(`${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`);

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(URL);
await page.waitForTimeout(1200);
await page.addStyleTag({ content: '#admin,.vHint{display:none!important} *{animation:none!important;transition:none!important}' });
await page.waitForTimeout(400);
const clip = await page.evaluate(() => {
  const r = document.querySelector('.artBox').getBoundingClientRect();
  return { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: r.width + 12, height: r.height + 12 };
});
const idle = await page.screenshot({ clip });
await page.evaluate(() => document.getElementById('charWrap').classList.add('talking', 'mouthOpen'));
await page.evaluate(() => {
  const m = document.getElementById('artMouth');
  m.style.transition = 'none'; m.style.opacity = '1';
});
await page.waitForTimeout(300);
const talk = await page.screenshot({ clip });
await page.evaluate(() => document.getElementById('charWrap').className = '');
await browser.close();
console.log('errs:', JSON.stringify(errs));

async function flat(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < info.width * info.height; i++) {
    const a = data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * a + 246 * (1 - a));
    data[i * 4 + 3] = 255;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}
const f1 = await flat(idle), f2 = await flat(talk);
const m1 = await f1.png().toBuffer(), m2 = await f2.png().toBuffer();
const meta = await sharp(m1).metadata();
const W = meta.width, H = meta.height;

// 嘴部放大（人脸大致在 y 4%-30%，嘴在 y 26%-32%）
const mx = Math.round(0.36 * W), my = Math.round(0.20 * H);
const mw = Math.round(0.32 * W), mh = Math.round(0.16 * H);
const Z = 3;
const z1 = await sharp(m1).extract({ left: mx, top: my, width: mw, height: mh }).resize({ width: mw * Z, kernel: 'nearest' }).png().toBuffer();
const z2 = await sharp(m2).extract({ left: mx, top: my, width: mw, height: mh }).resize({ width: mw * Z, kernel: 'nearest' }).png().toBuffer();

const GAP = 24, HEAD = 52;
const zW = mw * Z, zH = mh * Z;
const totalW = zW * 2 + GAP * 3;
const totalH = HEAD + zH + GAP;
await sharp({ create: { width: totalW, height: totalH, channels: 4, background: '#0f172a' } })
  .composite([
    { input: z1, left: GAP, top: HEAD },
    { input: z2, left: GAP * 2 + zW, top: HEAD },
    {
      input: Buffer.from(`<svg width="${totalW}" height="${HEAD}" xmlns="http://www.w3.org/2000/svg">
        <style>text{font-family:"Microsoft YaHei",sans-serif;font-size:24px;fill:#fff}</style>
        <text x="${GAP}" y="34">不说话（画面用 1.jpg 的嘴）</text>
        <text x="${GAP * 2 + zW}" y="34">说话时（画面用 2.jpg 的嘴）</text>
      </svg>`), left: 0, top: 0
    }
  ]).png().toFile(`${ROOT}/outputs/预览-人物-嘴部对比.png`);

await sharp(m1).resize({ width: 900 }).png().toFile(`${ROOT}/outputs/预览-人物-闭口.png`);
await sharp(m2).resize({ width: 900 }).png().toFile(`${ROOT}/outputs/预览-人物-说话.png`);
console.log('人物框尺寸', W + 'x' + H, '已生成 3 张预览');

/* 头部口型动图：按页面里的开合节奏播一遍 */
{
  const hx = Math.round(0.22 * W), hy = Math.round(0.01 * H);
  const hw = Math.round(0.58 * W), hh = Math.round(0.40 * H);
  const cut = async (buf) => await sharp(buf).extract({ left: hx, top: hy, width: hw, height: hh })
    .resize({ width: 460 }).png().toBuffer();
  const c1 = await cut(m1), c2 = await cut(m2);
  const seq = [c2, c1, c2, c1, c2, c2, c1, c2, c1, c2, c1, c1];
  const gif = await sharp(seq, { join: { animated: true } }).gif({ delay: 130, loop: 0 }).toBuffer();
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${ROOT}/outputs/预览-人物-口型动图.gif`, gif);
  console.log('口型动图 %s KB', (gif.length / 1024).toFixed(0));
}
