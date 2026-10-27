/* 把新人物注入离线版页面。
   人物 = 底图（1.jpg 闭嘴）+ 一小块「张嘴」贴图（2.jpg 的嘴）。
   说话时贴图淡入，嘴以外一个像素都不变，所以不会抖、不会闪。
   同时写入「发给同事」文件夹与 outputs 根目录（以「发给同事」为准，再复制出去）。 */
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const PKG = `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;
const art = JSON.parse(readFileSync(`${ROOT}/work/art-1-2.json`, 'utf8'));
const pct = v => (v * 100).toFixed(4) + '%';

let html = readFileSync(PKG, 'utf8');
const before = html.length;

/* 1) 人物两层 */
const artBlock = `<!--ART-START-->
      <img id="artClosed" class="artFrame" src="${art.base}" alt="Han Lin, reporter from our school newspaper" draggable="false">
      <img id="artMouth" class="artMouth" src="${art.patch}" alt="" draggable="false"
           style="left:${pct(art.patchRect.left)};top:${pct(art.patchRect.top)};width:${pct(art.patchRect.width)};height:${pct(art.patchRect.height)}">
      <!--ART-END-->`;
if (!/<!--ART-START-->[\s\S]*?<!--ART-END-->/.test(html)) throw new Error('找不到 ART 区块');
html = html.replace(/<!--ART-START-->[\s\S]*?<!--ART-END-->/, artBlock);

/* 2) 旧版手绘 SVG 嘴（如果还在就删掉） */
html = html.replace(/\s*<svg id="mouth"[\s\S]*?<\/svg>/, '');

/* 3) CSS：画框比例 + 两层人物 */
const cssBlock = `.artBox{position:relative; display:flex; align-items:flex-end; height:86vh; max-height:820px; aspect-ratio:${art.aspect.toFixed(4)}}
  /* 不说话的定格 = 1.jpg；说话时把 2.jpg 的嘴贴上来 */
  .artFrame{position:absolute; left:0; bottom:0; height:100%; width:auto; max-width:none;
    filter:drop-shadow(0 18px 26px rgba(24,51,102,.18))}
  .artMouth{position:absolute; opacity:0; transition:opacity .05s linear; pointer-events:none; max-width:none}
  .talking.mouthOpen .artMouth{opacity:1}
  `;
const cssRe = /\.artBox\{[^}]*\}[\s\S]*?(?=\.charWrap\.talking \.artBox\{)/;
if (!cssRe.test(html)) throw new Error('找不到人物 CSS 区块');
html = html.replace(cssRe, cssBlock);

/* 4) JS：说话时嘴唇开合（两帧只有嘴不同，切换无痕） */
html = html.replace(
  /  var flipTimer = 0[^\n]*\n[\s\S]*?function stopFlip\(\)\{[\s\S]*?\n  \}/,
  `  var flipTimer = 0, flipIdx = 0;
  var FLIP_PATTERN = [[1, 200], [0, 85], [1, 160], [0, 70], [1, 180], [0, 100], [1, 140], [0, 75]];
  function startFlip(){
    stopFlip();
    flipIdx = 0;
    (function step(){
      var it = FLIP_PATTERN[flipIdx % FLIP_PATTERN.length];
      flipIdx++;
      $("charWrap").classList.toggle("mouthOpen", !!it[0]);
      flipTimer = setTimeout(step, it[1]);
    })();
  }
  function stopFlip(){
    if(flipTimer){ clearTimeout(flipTimer); flipTimer = 0; }
    $("charWrap").classList.remove("mouthOpen");
  }`
);

/* 5) talking() 里去掉上一版视频方案的残留 */
html = html.replace(
  /  function talking\(on\)\{[\s\S]*?\n  \}/,
  `  function talking(on){
    $("charWrap").classList.toggle("talking", !!on);
    if(on){ startFlip(); } else { stopFlip(); }
  }`
);

for (const [name, re] of [
  ['ART 区块', /<!--ART-START-->\s*<img id="artClosed"/],
  ['嘴部贴图', /<img id="artMouth"/],
  ['无残留 SVG 嘴', /^(?![\s\S]*<svg id="mouth")[\s\S]*$/],
  ['aspect-ratio', new RegExp('aspect-ratio:' + art.aspect.toFixed(4))],
  ['贴图淡入', /\.talking\.mouthOpen \.artMouth\{opacity:1\}/],
  ['FLIP_PATTERN', /FLIP_PATTERN/],
  ['talking()', /function talking\(on\)\{\n    \$\("charWrap"\)\.classList\.toggle/]
]) {
  if (!re.test(html)) throw new Error('校验失败：' + name);
}
writeFileSync(PKG, html);
writeFileSync(`${ROOT}/outputs/HanLin采访-离线版.html`, html);
console.log('页面已更新：%s KB -> %s KB', (before / 1024).toFixed(0), (html.length / 1024).toFixed(0));
