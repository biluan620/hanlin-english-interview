/* 把「初中英语 200 个常见易错点」注入离线版页面的素材库。
   注入位置：现有 RULES2 规则表之后（同一作用域，可直接用到 thirdForm / sameCase 等函数）。
   以「发给同事」文件夹里的 HTML 为准，再复制到 outputs 根目录。 */
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const PKG = `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;

const lib = readFileSync(`${ROOT}/work/lib-cz200.js`, 'utf8').replace(/\s+$/, '');
const block = '  /*LIB200-START*/\n' + lib + '\n  /*LIB200-END*/\n';

let html = readFileSync(PKG, 'utf8');
const before = Buffer.byteLength(html, 'utf8');

// 幂等：先删掉上一次注入的内容
html = html.replace(/  \/\*LIB200-START\*\/[\s\S]*?\/\*LIB200-END\*\/\n/, '');

const anchor = '"逗号后面要空格",null,null]\n  ];\n';
if (!html.includes(anchor)) throw new Error('找不到 RULES2 结尾锚点');
html = html.replace(anchor, anchor + block);

for (const [name, re] of [
  ['注入成功', /\/\*LIB200-START\*\//],
  ['注入块唯一', /^[\s\S]*LIB200-START[\s\S]*LIB200-END[\s\S]*$/],
  ['注入在 RULES2 之后', /"逗号后面要空格",null,null\]\n  \];\n  \/\*LIB200-START\*\//],
  ['拼进 RULES2', /LIB200\.forEach\(function\(r\)\{ RULES2\.push\(r\); \}\);/]
]) {
  if (!re.test(html)) throw new Error('校验失败：' + name);
}
if ((html.match(/LIB200-START/g) || []).length !== 1) throw new Error('LIB200 块出现多次');

writeFileSync(PKG, html);
writeFileSync(`${ROOT}/outputs/HanLin采访-离线版.html`, html);
console.log('素材库已注入：%s KB -> %s KB', (before / 1024).toFixed(0), (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0));
