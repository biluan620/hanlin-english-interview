import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const A = await sharp('C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai/work/ref/1.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const B = await sharp('C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai/work/ref/2.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const bw = A.info.width, bh = A.info.height, Bw = B.info.width, Bh = B.info.height;
const gA = new Float32Array(bw * bh), gB = new Float32Array(Bw * Bh);
for (let i = 0; i < bw * bh; i++) gA[i] = 0.299 * A.data[i * 3] + 0.587 * A.data[i * 3 + 1] + 0.114 * A.data[i * 3 + 2];
for (let i = 0; i < Bw * Bh; i++) gB[i] = 0.299 * B.data[i * 3] + 0.587 * B.data[i * 3 + 1] + 0.114 * B.data[i * 3 + 2];
const s = 1.0025, dx = -10.5, dy = 26;
const inv = 1 / s, tx = (bw - 1) / 2 - (Bw - 1) / 2 * inv + dx, ty = (bh - 1) / 2 - (Bh - 1) / 2 * inv + dy;
const samp = (x, y) => {
  const u = x * inv + tx, v = y * inv + ty;
  if (u < 0 || v < 0 || u > Bw - 1.001 || v > Bh - 1.001) return null;
  const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i = y0 * Bw + x0;
  return gB[i] * (1 - fx) * (1 - fy) + gB[i + 1] * fx * (1 - fy) + gB[i + Bw] * (1 - fx) * fy + gB[i + Bw + 1] * fx * fy;
};
function dump(name, x0p, x1p, y0p, y1p, GC, GR) {
  console.log(`--- ${name}  x ${x0p}-${x1p}%  y ${y0p}-${y1p}% ---`);
  const ch = ' .:-=+*#%@';
  for (let gy = 0; gy < GR; gy++) {
    let line = '';
    for (let gx = 0; gx < GC; gx++) {
      const X0 = Math.round(x0p / 100 * bw + gx * (x1p - x0p) / 100 * bw / GC);
      const X1 = Math.round(x0p / 100 * bw + (gx + 1) * (x1p - x0p) / 100 * bw / GC);
      const Y0 = Math.round(y0p / 100 * bh + gy * (y1p - y0p) / 100 * bh / GR);
      const Y1 = Math.round(y0p / 100 * bh + (gy + 1) * (y1p - y0p) / 100 * bh / GR);
      let acc = 0, n = 0;
      for (let y = Y0; y < Y1; y += 2) for (let x = X0; x < X1; x += 2) {
        const v = samp(x, y); if (v === null) continue;
        acc += Math.abs(gA[y * bw + x] - v); n++;
      }
      line += ch[Math.min(9, Math.round((n ? acc / n : 0) / 4))];
    }
    console.log(line);
  }
}
dump('对齐后差异', 28, 76, 12, 52, 66, 34);
// 逐行给出差异最大的 x 位置（1% 分辨率）
console.log('--- 每 1% 高度上差异质心与幅度 ---');
for (let p = 12; p <= 52; p += 1) {
  const y0 = Math.round(p / 100 * bh), y1 = Math.round((p + 1) / 100 * bh);
  let acc = 0, n = 0, sx = 0, mx = 0;
  for (let y = y0; y < y1; y += 2) for (let x = Math.round(0.28 * bw); x < Math.round(0.76 * bw); x += 2) {
    const v = samp(x, y); if (v === null) continue;
    const d = Math.abs(gA[y * bw + x] - v);
    acc += d; if (d > 30) { sx += x; mx++; } n++;
  }
  const cx = mx ? Math.round(sx / mx / bw * 100) : -1;
  console.log(`y=${String(p).padStart(2)}%  平均差 ${(acc / n).toFixed(1).padStart(5)}   强差异像素 ${String(mx).padStart(5)}   质心 x=${cx}%`);
}
