/* 重新设计 HanLin 人物：
   1.jpg = 不说话的闭嘴基准帧
   2.jpg = 说话时的张嘴帧
   两帧来自同一幅画（整体有约 10px / 29px 位移），先把 2 对齐到 1，
   只把「嘴」这一小块从 2 换到 1 上，人物其余部分完全不动 —— 说话时不会整个人跳。
   最后抠掉白底、输出透明 PNG + WebP data URL。 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const SRC1 = ROOT + '/work/ref/1.jpg';
const SRC2 = ROOT + '/work/ref/2.jpg';

/* ---------- 读原图 ---------- */
async function rawRGB(p) {
  const { data, info } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}
const A = await rawRGB(SRC1);
const B = await rawRGB(SRC2);
console.log('1.jpg', A.W + 'x' + A.H, ' 2.jpg', B.W + 'x' + B.H);

/* ---------- 灰度缓存 ---------- */
function gray(img) {
  const g = new Float32Array(img.W * img.H);
  for (let i = 0, n = img.W * img.H; i < n; i++) {
    const j = i * 3;
    g[i] = 0.299 * img.data[j] + 0.587 * img.data[j + 1] + 0.114 * img.data[j + 2];
  }
  return g;
}
const gA = gray(A), gB = gray(B);
const gsample = (g, W, H, x, y) => {
  if (x < 0 || y < 0 || x > W - 1.001 || y > H - 1.001) return null;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const i00 = y0 * W + x0, i10 = i00 + 1, i01 = i00 + W, i11 = i01 + 1;
  return g[i00] * (1 - fx) * (1 - fy) + g[i10] * fx * (1 - fy) + g[i01] * (1 - fx) * fy + g[i11] * fx * fy;
};

/* ---------- 对齐搜索 ----------
   A 上的点 (x,y) 对应 B 上的 (x/s - cA/s + cB + dx , y/s - cA'/s + cB' + dy)
   用参数 tx,ty 表示纯仿射： u = x*inv + tx , v = y*inv + ty  */
const cA = { x: (A.W - 1) / 2, y: (A.H - 1) / 2 };
const cB = { x: (B.W - 1) / 2, y: (B.H - 1) / 2 };

// 只在对齐用的「嘴周」区域打分，并挖掉嘴本身（嘴本来就该不一样，不能参与对齐）
// 两图之间存在轻微非均匀缩放，所以按「嘴附近」局部最优来对齐，而不追求整张脸最优。
const fRegion = {
  x0: Math.round(0.36 * A.W), x1: Math.round(0.68 * A.W),
  y0: Math.round(0.15 * A.H), y1: Math.round(0.30 * A.H)
};
const mouthZone = { cx: 0.512 * A.W, cy: 0.288 * A.H, rx: 0.105 * A.W, ry: 0.048 * A.H };
function inMouth(x, y) {
  const dx = (x - mouthZone.cx) / mouthZone.rx, dy = (y - mouthZone.cy) / mouthZone.ry;
  return dx * dx + dy * dy < 1;
}
function score(dx, dy, s, step) {
  const inv = 1 / s;
  const tx = cA.x - cB.x * inv + dx, ty = cA.y - cB.y * inv + dy;
  let sum = 0, n = 0;
  for (let y = fRegion.y0; y < fRegion.y1; y += step) {
    for (let x = fRegion.x0; x < fRegion.x1; x += step) {
      if (inMouth(x, y)) continue;
      const v = gsample(gB, B.W, B.H, x * inv + tx, y * inv + ty);
      if (v === null) continue;
      sum += Math.abs(gA[y * A.W + x] - v); n++;
    }
  }
  return n ? sum / n : 1e9;
}
let best = { v: 1e9, dx: 0, dy: 0, s: 1 };
for (let s = 0.985; s <= 1.0155; s += 0.005)
  for (let dy = 14; dy <= 44; dy += 2)
    for (let dx = -26; dx <= 6; dx += 2) {
      const v = score(dx, dy, s, 4);
      if (v < best.v) best = { v, dx, dy, s };
    }
let fine = { ...best };
for (let s = best.s - 0.004; s <= best.s + 0.0041; s += 0.0015)
  for (let dy = best.dy - 2.5; dy <= best.dy + 2.5; dy += 0.5)
    for (let dx = best.dx - 2.5; dx <= best.dx + 2.5; dx += 0.5) {
      const v = score(dx, dy, s, 2);
      if (v < fine.v) fine = { v, dx, dy, s };
    }
console.log('对齐：dx=%s dy=%s scale=%s  脸区残差 %s（未对齐 %s）',
  fine.dx, fine.dy, fine.s.toFixed(4), fine.v.toFixed(2), score(0, 0, 1, 2).toFixed(2));

const INV = 1 / fine.s;
const TX = cA.x - cB.x * INV + fine.dx, TY = cA.y - cB.y * INV + fine.dy;
const sampleB = (ch, x, y) => gsample(ch, B.W, B.H, x * INV + TX, y * INV + TY);

/* ---------- 把 B 的头部区域重采样进 A 的坐标系 ---------- */
const head = {
  x0: Math.round(0.26 * A.W), x1: Math.round(0.78 * A.W),
  y0: Math.round(0.04 * A.H), y1: Math.round(0.50 * A.H)
};
const chB = [new Float32Array(A.W * A.H), new Float32Array(A.W * A.H), new Float32Array(A.W * A.H)];
for (let c = 0; c < 3; c++) {
  const g = new Float32Array(B.W * B.H);
  for (let i = 0, n = B.W * B.H; i < n; i++) g[i] = B.data[i * 3 + c];
  chB[c] = g;
}
const warpB = [new Float32Array(A.W * A.H), new Float32Array(A.W * A.H), new Float32Array(A.W * A.H)];
for (let y = head.y0; y < head.y1; y++) {
  for (let x = head.x0; x < head.x1; x++) {
    for (let c = 0; c < 3; c++) {
      const v = sampleB(chB[c], x, y);
      warpB[c][y * A.W + x] = v === null ? A.data[(y * A.W + x) * 3 + c] : v;
    }
  }
}

/* ---------- 差异图 → 嘴部过渡带 ----------
   在两图真正不一样的地方（张嘴、唇形、下巴阴影）生成过渡带；两图一样的地方
   （脸颊、鼻子、衣服）差异接近 0，自然不会被选中。 */
const bw = A.W, bh = A.H;
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  if (r <= 0) { out.set(src); return out; }
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1);
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

// 差异只在一个比嘴略大的窗口里统计，窗口外一律不动
const win = {
  x0: Math.round(0.415 * bw), x1: Math.round(0.625 * bw),
  y0: Math.round(0.235 * bh), y1: Math.round(0.325 * bh)
};
const diff = new Float32Array(bw * bh);
for (let y = win.y0; y < win.y1; y++) {
  for (let x = win.x0; x < win.x1; x++) {
    const p = y * bw + x;
    const gW = 0.299 * warpB[0][p] + 0.587 * warpB[1][p] + 0.114 * warpB[2][p];
    diff[p] = Math.abs(gA[p] - gW);
  }
}
const ds = boxBlur(diff, bw, bh, 7);          // 抹掉噪点，留下成片的真实差异
const mask = new Float32Array(bw * bh);
// 窗口四周做平滑收边，避免在窗口边界上出现一条突然的接缝
const TW = 0.18;
const taper = (t) => {
  const u = Math.min(1, Math.max(0, t));
  const s = u < TW ? u / TW : (u > 1 - TW ? (1 - u) / TW : 1);
  return s * s * (3 - 2 * s);
};
for (let y = win.y0; y < win.y1; y++) {
  for (let x = win.x0; x < win.x1; x++) {
    const p = y * bw + x;
    const tx = taper((x - win.x0) / (win.x1 - win.x0));
    const ty = taper((y - win.y0) / (win.y1 - win.y0));
    mask[p] = Math.min(1, Math.max(0, (ds[p] - 9) / 9)) * tx * ty;
  }
}
const soft = boxBlur(mask, bw, bh, Math.round(0.007 * bw));   // ≈9px 羽化
for (let i = 0; i < mask.length; i++) mask[i] = Math.min(1, soft[i] * 1.5);
{
  let area = 0, hard = 0;
  for (let i = 0; i < mask.length; i++) { area += mask[i]; if (mask[i] > 0.9) hard++; }
  console.log('过渡带：等效面积 %s px（占全图 %s%%），实心 %s px',
    area.toFixed(0), (area / (bw * bh) * 100).toFixed(2), hard);
}
// 接缝检查：过渡带上「基准帧」和「2 的嘴」差多少（差得越小越看不出接缝）
{
  let s = 0, n = 0, mx = 0;
  let worst = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0.03 && mask[i] < 0.97) {
      let dd = 0;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(A.data[i * 3 + c] - warpB[c][i]);
        dd += d;
      }
      dd /= 3;
      s += dd; n++; if (dd > mx) mx = dd;
      worst.push([dd, i]);
    }
  }
  console.log('羽化带上的两帧色差：平均 %s，最大 %s（0-255）',
    (s / n).toFixed(1), mx.toFixed(0));
  worst.sort((a, b) => b[0] - a[0]);
  console.log('羽化带差异最大处：', worst.slice(0, 8).map(([d, i]) =>
    `x=${(i % bw / bw * 100).toFixed(1)}% y=${(Math.floor(i / bw) / bh * 100).toFixed(1)}% d=${d.toFixed(0)}`).join(' | '));
}

/* 打印一张粗粒度掩膜图，便于肉眼核对位置 */
{
  const GC = 44, GR = 30, ch = ' .:-=+*#%@';
  const X0 = Math.round(0.30 * bw), X1 = Math.round(0.72 * bw);
  const Y0 = Math.round(0.18 * bh), Y1 = Math.round(0.42 * bh);
  console.log('口型过渡带（画面 x30-72% / y18-42%，@ = 完全用 2.jpg 的嘴）：');
  for (let gy = 0; gy < GR; gy++) {
    let line = '';
    for (let gx = 0; gx < GC; gx++) {
      const x0 = Math.round(X0 + gx * (X1 - X0) / GC), x1 = Math.round(X0 + (gx + 1) * (X1 - X0) / GC);
      const y0 = Math.round(Y0 + gy * (Y1 - Y0) / GR), y1 = Math.round(Y0 + (gy + 1) * (Y1 - Y0) / GR);
      let s = 0, n = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { s += mask[y * bw + x]; n++; }
      line += ch[Math.min(9, Math.round(s / n * 9))];
    }
    console.log(line);
  }
}

/* ---------- 合成两帧 ---------- */
function composeToRGBA(useMouth) {
  const out = Buffer.alloc(bw * bh * 4);
  for (let i = 0; i < bw * bh; i++) {
    for (let c = 0; c < 3; c++) {
      const base = A.data[i * 3 + c];
      out[i * 4 + c] = useMouth ? Math.round(base * (1 - mask[i]) + warpB[c][i] * mask[i]) : base;
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

/* ---------- 抠白底（两帧共用同一张 alpha，保证切换时轮廓不抖） ---------- */
const TH = 247;
const bg = new Uint8Array(bw * bh);
const queue = new Int32Array(bw * bh);
let qh = 0, qt = 0;
const minCh = i => {
  const j = i * 3;
  return Math.min(A.data[j], A.data[j + 1], A.data[j + 2]);
};
const seed = p => { if (!bg[p] && minCh(p) >= TH) { bg[p] = 1; queue[qt++] = p; } };
for (let x = 0; x < bw; x++) { seed(x); seed((bh - 1) * bw + x); }
for (let y = 0; y < bh; y++) { seed(y * bw); seed(y * bw + bw - 1); }
while (qh < qt) {
  const p = queue[qh++], x = p % bw, y = (p - x) / bw;
  if (x > 0) seed(p - 1);
  if (x < bw - 1) seed(p + 1);
  if (y > 0) seed(p - bw);
  if (y < bh - 1) seed(p + bw);
}
let raw = new Float32Array(bw * bh);
for (let i = 0; i < raw.length; i++) raw[i] = bg[i] ? 0 : 1;
raw = boxBlur(raw, bw, bh, 1);

/* 边缘「去白边」：alpha 半透明处取最近不透明像素的颜色 */
const colorIdx = new Int32Array(bw * bh).fill(-1);
{ // 多轮向内扩散，把不透明像素的颜色填到边缘
  let idx = new Uint8Array(bw * bh);
  for (let i = 0; i < idx.length; i++) if (raw[i] > 0.85) { idx[i] = 1; colorIdx[i] = i; }
  for (let pass = 0; pass < 3; pass++) {
    const snap = idx.slice();
    for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) {
      const p = y * bw + x;
      if (snap[p]) continue;
      for (const q of [p - 1, p + 1, p - bw, p + bw]) if (snap[q]) { idx[p] = 1; colorIdx[p] = colorIdx[q]; break; }
    }
  }
}
const frameClosed = composeToRGBA(false);
const frameOpen = composeToRGBA(true);
function applyAlpha(buf) {
  for (let i = 0; i < bw * bh; i++) {
    const a = raw[i];
    buf[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    if (a < 0.99 && colorIdx[i] >= 0 && colorIdx[i] !== i) {
      const s = colorIdx[i] * 4;
      for (let c = 0; c < 3; c++) buf[i * 4 + c] = buf[s + c];
    }
  }
}
applyAlpha(frameClosed);
applyAlpha(frameOpen);
console.log('透明像素占比 %s%%', (bg.reduce((s, v) => s + v, 0) / (bw * bh) * 100).toFixed(1));

/* ---------- 裁掉四周多余白边（两帧同一裁切框） ---------- */
let cx0 = bw, cx1 = 0, cy0 = bh, cy1 = 0;
for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
  if (raw[y * bw + x] > 0.35) {
    if (x < cx0) cx0 = x; if (x > cx1) cx1 = x;
    if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
  }
}
const pad = Math.round(0.012 * bw);
cx0 = Math.max(0, cx0 - pad); cy0 = Math.max(0, cy0 - pad);
cx1 = Math.min(bw - 1, cx1 + pad); cy1 = Math.min(bh - 1, cy1 + pad);
const cw = cx1 - cx0 + 1, chh = cy1 - cy0 + 1;
console.log('裁切框 %dx%d（原图 %dx%d），左上 %d,%d', cw, chh, bw, bh, cx0, cy0);

function cropRaw(buf) {
  const raw2 = Buffer.alloc(cw * chh * 4);
  for (let y = 0; y < chh; y++) {
    for (let x = 0; x < cw; x++) {
      const s = ((y + cy0) * bw + (x + cx0)) * 4, d = (y * cw + x) * 4;
      raw2[d] = buf[s]; raw2[d + 1] = buf[s + 1]; raw2[d + 2] = buf[s + 2]; raw2[d + 3] = buf[s + 3];
    }
  }
  return raw2;
}

/* 网页用：底图 = 闭嘴帧；再单独切一小块「张嘴」贴图盖在上面。
   贴图颜色取 2.jpg 的嘴、alpha 取过渡带，叠上去就等于完整的张嘴帧。
   这样做的好处是嘴以外的像素只有一个来源，说话时不会有任何抖动或噪点闪。 */
let patchRect = null;
async function exportHTMLFrames() {
  const WEB_W = 860;
  const scale = WEB_W / cw;
  // 过渡带的外接框
  let px0 = 1e9, px1 = -1, py0 = 1e9, py1 = -1;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (mask[y * bw + x] > 0.004) {
      if (x < px0) px0 = x; if (x > px1) px1 = x;
      if (y < py0) py0 = y; if (y > py1) py1 = y;
    }
  }
  const pad = 6;
  px0 = Math.max(cx0, px0 - pad); px1 = Math.min(cx1, px1 + pad);
  py0 = Math.max(cy0, py0 - pad); py1 = Math.min(cy1, py1 + pad);
  const pW = px1 - px0 + 1, pH = py1 - py0 + 1;
  // 贴图（颜色 = 2 的嘴，alpha = 过渡带），按 860 宽基准切，和底图同尺度
  const pRaw = Buffer.alloc(pW * pH * 4);
  for (let y = 0; y < pH; y++) for (let x = 0; x < pW; x++) {
    const s = (y + py0) * bw + (x + px0), d = (y * pW + x) * 4;
    const m = Math.min(1, Math.max(0, mask[s]));
    pRaw[d] = Math.round(warpB[0][s]); pRaw[d + 1] = Math.round(warpB[1][s]); pRaw[d + 2] = Math.round(warpB[2][s]);
    pRaw[d + 3] = Math.round(m * 255);
  }
  const patch = await sharp(pRaw, { raw: { width: pW, height: pH, channels: 4 } })
    .resize({ width: Math.round(pW * scale), kernel: 'lanczos3' })
    .webp({ quality: 90, alphaQuality: 95, effort: 5 }).toBuffer();
  const base = await sharp(cropRaw(frameClosed), { raw: { width: cw, height: chh, channels: 4 } })
    .resize({ width: WEB_W, kernel: 'lanczos3' })
    .webp({ quality: 88, alphaQuality: 95, effort: 5 }).toBuffer();
  patchRect = {
    left: (px0 - cx0) / cw, top: (py0 - cy0) / chh,
    width: pW / cw, height: pH / chh
  };
  console.log('网页底图 %s KB，嘴部贴图 %s KB（%sx%s，占画面 %s%% x %s%%）',
    (base.length / 1024).toFixed(1), (patch.length / 1024).toFixed(1),
    Math.round(pW * scale), Math.round(pH * scale),
    (patchRect.width * 100).toFixed(2), (patchRect.height * 100).toFixed(2));
  return { base, patch };
}

async function exportPNG(buf, w, path) {
  const raw2 = cropRaw(buf);
  await sharp(raw2, { raw: { width: cw, height: chh, channels: 4 } })
    .resize({ width: w, kernel: 'lanczos3' })
    // 课件是静态页面，不需要来回切，所以用 256 色压缩体积
    .png({ compressionLevel: 9, palette: true, quality: 92, dither: 0.7 })
    .toFile(path);
}

const PNG_W = Number(process.env.PNG_W || 900);
await exportPNG(frameClosed, PNG_W, `${ROOT}/outputs/HanLin立绘.png`);
await exportPNG(frameOpen, PNG_W, `${ROOT}/outputs/HanLin说话.png`);
const web = await exportHTMLFrames();
writeFileSync(`${ROOT}/work/art-1-2.json`, JSON.stringify({
  aspect: cw / chh,
  webWidth: 860,
  base: 'data:image/webp;base64,' + web.base.toString('base64'),
  patch: 'data:image/webp;base64,' + web.patch.toString('base64'),
  patchRect
}));
console.log('OK aspect=%s (w/h) patchRect=%s', (cw / chh).toFixed(4), JSON.stringify(patchRect));
