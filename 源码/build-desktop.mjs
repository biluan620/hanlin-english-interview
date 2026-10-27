/* 编译「HanLin采访-桌面版.exe」：WinForms + WebView2 外壳。
   产物放到「发给同事」文件夹：exe + 3 个 DLL + 图标。 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const PKG = `${ROOT}/outputs/HanLin采访-发给同事`;
const PKGSDK = `${ROOT}/work/webview2/pkg`;
const WORK = `${ROOT}/work/desktop`;
const CSC = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe';

/* ---------- 1. 生成图标（PNG 打包成 ICO，Windows 支持） ---------- */
async function makeIcon() {
  const png = await sharp(`${ROOT}/outputs/HanLin立绘.png`)
    .resize(256, 256, { fit: 'contain', background: { r: 242, g: 247, b: 255, alpha: 1 } })
    .png().toBuffer();
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: icon
  header.writeUInt16LE(1, 4);      // count
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);          // width 0 = 256
  entry.writeUInt8(0, 1);          // height 0 = 256
  entry.writeUInt8(0, 2);          // palette
  entry.writeUInt8(0, 3);          // reserved
  entry.writeUInt16LE(1, 4);       // color planes
  entry.writeUInt16LE(32, 6);      // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);     // offset
  const ico = Buffer.concat([header, entry, png]);
  const out = path.join(WORK, 'hanlin.ico');
  writeFileSync(out, ico);
  console.log('图标已生成：', (ico.length / 1024).toFixed(1), 'KB');
  return out;
}

/* ---------- 2. 复制 SDK 的 DLL ---------- */
function copyDlls() {
  const pairs = [
    [`${PKGSDK}/lib/net462/Microsoft.Web.WebView2.Core.dll`, `${PKG}/Microsoft.Web.WebView2.Core.dll`],
    [`${PKGSDK}/lib/net462/Microsoft.Web.WebView2.WinForms.dll`, `${PKG}/Microsoft.Web.WebView2.WinForms.dll`],
    [`${PKGSDK}/runtimes/win-x64/native/WebView2Loader.dll`, `${PKG}/WebView2Loader.dll`]
  ];
  for (const [from, to] of pairs) {
    if (!existsSync(from)) throw new Error('缺少 SDK 文件：' + from);
    copyFileSync(from, to);
    console.log('  复制', path.basename(to), (readFileSync(to).length / 1024).toFixed(0) + 'KB');
  }
}

/* ---------- 3. 编译 ---------- */
async function compile() {
  const ico = await makeIcon();
  const exe = `${PKG}/HanLin采访-桌面版.exe`;
  const args = [
    '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001',
    '/out:' + exe,
    '/win32icon:' + ico,
    '/win32manifest:' + path.join(WORK, 'app.manifest'),
    '/reference:' + `${PKG}/Microsoft.Web.WebView2.Core.dll`,
    '/reference:' + `${PKG}/Microsoft.Web.WebView2.WinForms.dll`,
    '/reference:System.dll', '/reference:System.Core.dll',
    '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
    path.join(WORK, 'Program.cs')
  ];
  const out = execFileSync(CSC, args, { encoding: 'utf8', windowsHide: true });
  if (out && out.trim()) console.log(out.trim());
  console.log('编译完成：', path.basename(exe), (readFileSync(exe).length / 1024).toFixed(1) + 'KB');
}

mkdirSync(WORK, { recursive: true });
copyDlls();
await compile();
console.log('OK');
