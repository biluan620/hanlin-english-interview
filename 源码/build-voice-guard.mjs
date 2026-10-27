/* 麦克风体检 + 醒目提示条：
   - 开始采访时主动申请一次麦克风权限（会弹出浏览器的授权框，而不是悄悄失败）
   - 权限被拒 / 没有麦克风 / 浏览器不支持时，在大屏幕上用中文写清楚怎么办，并给一个「重试」按钮
   - 听写出错时自动把这个提示条叫出来
   以「发给同事」文件夹为准，再复制到 outputs 根目录。 */
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const PKG = `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;
const markup = readFileSync(`${ROOT}/work/voice-guard.html`, 'utf8').replace(/\s+$/, '');
const logic = readFileSync(`${ROOT}/work/voice-guard.js`, 'utf8').replace(/\s+$/, '');

let html = readFileSync(PKG, 'utf8');
const before = Buffer.byteLength(html, 'utf8');

/* 幂等：先清掉上一次注入 */
html = html.replace(/\n?  <!--MIC-WARN-START-->[\s\S]*?<!--MIC-WARN-END-->/, '');
html = html.replace(/\n?  \/\*MICGUARD-START\*\/[\s\S]*?\/\*MICGUARD-END\*\//, '');
html = html.replace(/\n?  #micWarn\{[\s\S]*?#micWarn \.mwSkip\{[^}]*\}/, '');
html = html.replace(/\n\s*micCheck\(\);\n/, '');

/* 1) 提示条结构 */
html = html.replace(/(<div id="stage">)/, `$1\n  <!--MIC-WARN-START-->\n${markup}\n  <!--MIC-WARN-END-->`);

/* 2) 样式 */
html = html.replace(/(<\/style>)/,
`  #micWarn{position:fixed; left:0; right:0; top:8px; z-index:45; display:none; padding:0 12px; pointer-events:none}
  #micWarn.show{display:block}
  #micWarn .mwBox{max-width:920px; margin:0 auto; pointer-events:auto; background:#fff5f3; border:2px solid #e2523d;
    border-radius:14px; padding:14px 18px; box-shadow:0 18px 40px rgba(60,10,0,.28); color:#7a1f12; font-size:15px; line-height:1.65}
  #micWarn .mwBox b{display:block; font-size:17.5px; margin-bottom:4px}
  #micWarn .mwBtns{display:flex; gap:10px; margin-top:11px; flex-wrap:wrap}
  #micWarn .mwGo{background:linear-gradient(135deg,#e2523d,#b3341f); color:#fff; border-color:#8d2415}
  #micWarn .mwSkip{background:#fff; color:#7a1f12; border-color:#e2523d}
$1`);

/* 3) 逻辑 + 绑定 */
html = html.replace(
  /  \/\* ---------- 判定 ---------- \*\//,
  '  /*MICGUARD-START*/\n' + logic + `
  function bindVoiceGuard(){
    var st = document.getElementById("aStart");
    if(st) st.addEventListener("click", function(){ setTimeout(function(){ micCheck(); }, 300); });
    var rb = document.getElementById("mwRetry");
    if(rb) rb.addEventListener("click", function(){
      micCheck(function(ok){ if(ok && ST.phase === "asking"){ beginListen(); } });
    });
    var sk = document.getElementById("mwSkip");
    if(sk) sk.addEventListener("click", function(){
      hideMicWarn(); try{ $("answerBox").focus(); }catch(e){}
    });
    /* 页面一打开就先体检一次，别等上课才发现 */
    setTimeout(function(){ if(!srSupported()) micCheck(); }, 400);
  }
  /*MICGUARD-END*/

  /* ---------- 判定 ---------- */`
);

/* 4) 听写报错时把提示条叫出来 */
html = html.replace(
  /        setVoiceHint\("Microphone is blocked\. Allow it in the address bar and try again\.", "麦克风被拒绝：点地址栏左边的锁图标允许后重试。"\);/,
  `        setVoiceHint("Microphone is blocked. Allow it in the address bar and try again.", "麦克风被拒绝：点地址栏左边的锁图标允许后重试。");
        micCheck();`
);
html = html.replace(
  /        setVoiceHint\("Speech recognition needs the internet\. Please type your answer\.", "听写需要联网（HanLin 的声音不需要）。已切回键盘输入。"\);/,
  `        setVoiceHint("Speech recognition needs the internet. Please type your answer.", "听写需要联网（HanLin 的声音不需要）。已切回键盘输入。");
        showMicWarn("听写连不上（多半是浏览器不是 Edge）",
          "语音听写要用 <b>Edge</b> 才稳。如果现在开的是 Chrome 或别的浏览器，请改用文件夹里的 <b>启动采访-不询问麦克风.bat</b> 重新打开。<br>"
          + "现在也可以直接用键盘输入答案，采访的其他功能都正常。", false);`
);

/* 5) 初始化 */
html = html.replace(
  /  loadAi\(\); bindAi\(\); refreshAiBtn\(\);/,
  `  loadAi(); bindAi(); refreshAiBtn();
  bindVoiceGuard();`
);

for (const [name, re] of [
  ['提示条结构', /<!--MIC-WARN-START-->\s*<div id="micWarn">/],
  ['样式', /#micWarn \.mwBox\{max-width:920px/],
  ['逻辑', /function micCheck\(cb\)\{/],
  ['绑定', /function bindVoiceGuard\(\)\{/],
  ['听写报错联动', /micCheck\(\);\n      \}else if\(e === "network"\)/],
  ['联网报错联动', /showMicWarn\("听写连不上（多半是浏览器不是 Edge）"/],
  ['初始化', /bindVoiceGuard\(\); \n?  setAdminStatus|bindVoiceGuard\(\);/]
]) {
  if (!re.test(html)) throw new Error('校验失败：' + name);
}
if ((html.match(/MICGUARD-START/g) || []).length !== 1) throw new Error('麦克风体检层注入多次');

writeFileSync(PKG, html);
writeFileSync(`${ROOT}/outputs/HanLin采访-离线版.html`, html);
console.log('麦克风体检已注入：%s KB -> %s KB', (before / 1024).toFixed(0), (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0));
