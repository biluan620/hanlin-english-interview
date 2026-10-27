/* 编译「单文件版」：一个 exe 里内嵌 采访页 + 3 个 WebView2 组件 + 图标。
   产物：outputs/HanLin英语采访/HanLin英语采访.exe（文件夹里只有这一个文件） */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, copyFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const OUT = `${ROOT}/outputs/HanLin英语采访`;
const SRC = `${ROOT}/work/single`;
const PKGSDK = `${ROOT}/work/webview2/pkg`;
const PAGE = `${ROOT}/work/single/page.html`;          // 打过「本机离线识别」补丁的页面
const WHISPER = `${ROOT}/work/whisper-pack`;
const SAMPLE = `${ROOT}/work/single/sample.wav`;
const CSC = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe';
const STAMP = new Date().toISOString().replace('T', ' ').slice(0, 19);

/* ---------- 1. 图标 ---------- */
async function makeIcon() {
  const png = await sharp(`${ROOT}/outputs/HanLin立绘.png`)
    .resize(256, 256, { fit: 'contain', background: { r: 242, g: 247, b: 255, alpha: 1 } })
    .png().toBuffer();
  const h = Buffer.alloc(6);
  h.writeUInt16LE(0, 0); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4);
  const e = Buffer.alloc(16);
  e.writeUInt8(0, 0); e.writeUInt8(0, 1); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(png.length, 8); e.writeUInt32LE(22, 12);
  const ico = path.join(SRC, 'hanlin.ico');
  writeFileSync(ico, Buffer.concat([h, e, png]));
  return ico;
}

/* ---------- 2. 编译信息 ---------- */
function writeBuildInfo() {
  const f = path.join(SRC, 'BuildInfo.cs');
  writeFileSync(f, 'static class BuildInfo { public const string Stamp = "' + STAMP + '"; }\n', 'utf8');
  return f;
}

/* ---------- 3. 编译（内嵌资源） ---------- */
async function compile() {
  const ico = await makeIcon();
  const bi = writeBuildInfo();
  mkdirSync(OUT, { recursive: true });
  const exe = `${OUT}/HanLin英语采访.exe`;
  const args = [
    '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001',
    '/out:' + exe,
    '/win32icon:' + ico,
    '/win32manifest:' + path.join(SRC, 'app.manifest'),
    '/reference:' + `${PKGSDK}/lib/net462/Microsoft.Web.WebView2.Core.dll`,
    '/reference:' + `${PKGSDK}/lib/net462/Microsoft.Web.WebView2.WinForms.dll`,
    '/reference:System.dll', '/reference:System.Core.dll',
    '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
    '/reference:System.Web.Extensions.dll',
    '/resource:' + PAGE + ',hanlin.page',
    '/resource:' + `${PKGSDK}/lib/net462/Microsoft.Web.WebView2.Core.dll,hanlin.webview2.core`,
    '/resource:' + `${PKGSDK}/lib/net462/Microsoft.Web.WebView2.WinForms.dll,hanlin.webview2.winforms`,
    '/resource:' + `${PKGSDK}/runtimes/win-x64/native/WebView2Loader.dll,hanlin.webview2.loader`,
    '/resource:' + `${WHISPER}/whisper-cli.exe,hanlin.whisper.cli`,
    '/resource:' + `${WHISPER}/whisper.dll,hanlin.whisper.dll`,
    '/resource:' + `${WHISPER}/ggml.dll,hanlin.ggml.dll`,
    '/resource:' + `${WHISPER}/ggml-base.dll,hanlin.ggml.base`,
    '/resource:' + `${WHISPER}/ggml-cpu.dll,hanlin.ggml.cpu`,
    '/resource:' + `${WHISPER}/ggml-base.en-q5_1.bin,hanlin.model`,
    '/resource:' + SAMPLE + ',hanlin.sample',
    path.join(SRC, 'Program.cs'),
    bi
  ];
  const out = execFileSync(CSC, args, { encoding: 'utf8', windowsHide: true });
  if (out && out.trim()) console.log(out.trim());
  const kb = (statSync(exe).size / 1024).toFixed(0);
  console.log('编译完成：HanLin英语采访.exe', kb + 'KB');
}

/* ---------- 4. 目录里只留这一个 exe ---------- */
function tidy() {
  for (const f of readdirSync(OUT)) {
    if (f === 'HanLin英语采访.exe') continue;
    const p = path.join(OUT, f);
    try { if (statSync(p).isFile()) { rmSync(p, { force: true }); console.log('已删除多余文件：', f); } } catch (e) {}
  }
  console.log('目录内容：', JSON.stringify(readdirSync(OUT)));
}

const manifest = `${SRC}/app.manifest`;
if (!existsSync(manifest)) throw new Error('缺少 app.manifest');
if (!existsSync(PAGE)) throw new Error('缺少采访页：' + PAGE);
if (!existsSync(`${WHISPER}/ggml-base.en-q5_1.bin`)) throw new Error('缺少离线识别模型：' + WHISPER);
if (!existsSync(SAMPLE)) throw new Error('缺少自检音频：' + SAMPLE);
/* 先给页面打补丁，保证内嵌的是最新版 */
execFileSync(process.execPath, [path.join(SRC, 'patch-page.mjs')], { stdio: 'inherit' });
await compile();
tidy();
console.log('版本标记：', STAMP);
