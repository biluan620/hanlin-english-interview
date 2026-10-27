/* 把交付文件夹里的 .bat 统一成 CRLF 换行 + 无 BOM。
   cmd.exe 对 LF 换行的批处理会解析错乱（for / goto / rem 都会出岔子），必须修。 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const DIR = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai/outputs/HanLin采访-发给同事';
let n = 0;
for (const f of readdirSync(DIR)) {
  if (!/\.bat$/i.test(f)) continue;
  const p = path.join(DIR, f);
  let b = readFileSync(p);
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);   // 去 BOM
  let s = b.toString('utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  writeFileSync(p, Buffer.from(s, 'utf8'));
  const after = readFileSync(p);
  console.log(f, '→ CRLF 行数', (s.match(/\r\n/g) || []).length, '| BOM', after[0] === 0xEF ? '有' : '无');
  n++;
}
console.log('处理了', n, '个 .bat');
