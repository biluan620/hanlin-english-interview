/* 麦克风「只问一次」改造：
   1. 整个页面只申请一次麦克风，并且一直留着这条流 —— 之后点 Answer 直接说话，不会再弹框
   2. 页面一打开就先查权限状态：
        · 已经允许过 → 静默打开，什么都不提示
        · 还没问过   → 顶部给一个蓝色提示条，点一下允许（只问这一次）
        · 被拒绝     → 给红色提示条和补救步骤
   3. 万一某些机器上「一直占用麦克风」挤掉了听写，自动放开再重试一次
   用启动脚本打开时权限本来就是 granted，所以一条提示都不会出现。 */
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const PKG = `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;
let html = readFileSync(PKG, 'utf8');
const before = Buffer.byteLength(html, 'utf8');

/* 幂等 */
html = html.replace(/\n?  \/\*MICONCE-START\*\/[\s\S]*?\/\*MICONCE-END\*\//, '');
html = html.replace(/\n?  #micWarn \.mwBox\.info\{[^}]*\}/, '');
html = html.replace(/\n?  #micWarn \.mwBox\.info \.mwGo\{[^}]*\}/, '');
html = html.replace(/    rb\.textContent = retryLabel \|\| "重试";\n/, '');
html = html.replace(/    var box = w\.querySelector\("\.mwBox"\);\n    if\(box\) box\.classList\.toggle\("info", tone === "info"\);\n/, '');
html = html.replace(/    w\.classList\.toggle\("gate", tone === "info"\);\n/, '');
html = html.replace(/\n?  \/\* 蓝色提示条放屏幕底部[^\n]*\n  #micWarn\.gate\{top:auto; bottom:14px\}/, '');
html = html.replace(/function showMicWarn\(title, body, canRetry, retryLabel, tone\)\{/, 'function showMicWarn(title, body, canRetry){');
html = html.replace(/\n?  function refreshMicGate\(granted\)\{[\s\S]*?\n  \}\n  function micPrecheck\(\)\{[\s\S]*?\n  \}\n/, '\n');
html = html.replace(/    setTimeout\(micPrecheck, 600\);\n/, '');
html = html.replace(/\n    \/\* 一打开就先处理麦克风权限[\s\S]*?window\.addEventListener\("pagehide", function\(\)\{ try\{ meterClose\(\); \}catch\(e\)\{\} \}\);/, '');
html = html.replace(/      if\(e === "audio-capture"\)\{[\s\S]*?\n      \}\n/, '');
html = html.replace(/  var micAsked = false, micGateOn = false;\n/, '');
/* 把上一轮换掉的 meterOpen 还原回去，下面才能再换一次（保证可以反复运行） */
const ORIG_METEROPEN = `  function meterOpen(){
    if(micStream || micCtx) return;
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
    }).then(function(st){
      micStream = st;
      try{
        var AC = window.AudioContext || window.webkitAudioContext;
        micCtx = new AC();
        var src = micCtx.createMediaStreamSource(st);
        micAnalyser = micCtx.createAnalyser();
        micAnalyser.fftSize = 1024;
        micAnalyser.smoothingTimeConstant = 0.55;
        micBuf = new Uint8Array(micAnalyser.fftSize);
        src.connect(micAnalyser);
      }catch(e){ micAnalyser = null; }
    }).catch(function(){ micStream = null; micAnalyser = null; });
  }
`;
html = html.replace(
  /  function attachAnalyser\(\)\{[\s\S]*?\n  \}\n  \/\* 只申请一次麦克风[\s\S]*?\n  \}\n/,
  ORIG_METEROPEN
);

/* ---------- 1. 提示条底色：允许=蓝色（提示），被拒=红色（警报） ---------- */
html = html.replace(
  /(<\/style>)/,
  `  #micWarn .mwBox.info{background:#eef6ff; border-color:#2f6bff; color:#12305e}
  #micWarn .mwBox.info b{color:#0f2a55}
  #micWarn .mwBox.info .mwGo{background:linear-gradient(135deg,#2f6bff,#1b47b5); border-color:#16327a; color:#fff}
  #micWarn .mwBox.info .mwSkip{background:#fff; color:#1b47b5; border-color:#2f6bff}
  /* 蓝色提示条放屏幕底部，免得挡住顶部的老师控制条和「开始采访」 */
  #micWarn.gate{top:auto; bottom:14px}
$1`
);

/* ---------- 2. showMicWarn 支持自定义按钮文字和色调 ---------- */
html = html.replace(
  /  function showMicWarn\(title, body, canRetry\)\{\n    var w = micBox\(\);\n    if\(!w\) return;\n    document\.getElementById\("mwTitle"\)\.textContent = title;\n    document\.getElementById\("mwBody"\)\.innerHTML = body;\n    var rb = document\.getElementById\("mwRetry"\);\n    rb\.style\.display = canRetry \? "" : "none";\n    w\.classList\.add\("show"\);\n  \}/,
  `  function showMicWarn(title, body, canRetry, retryLabel, tone){
    var w = micBox();
    if(!w) return;
    document.getElementById("mwTitle").textContent = title;
    document.getElementById("mwBody").innerHTML = body;
    var rb = document.getElementById("mwRetry");
    rb.style.display = canRetry ? "" : "none";
    rb.textContent = retryLabel || "重试";
    var box = w.querySelector(".mwBox");
    if(box) box.classList.toggle("info", tone === "info");
    w.classList.toggle("gate", tone === "info");
    w.classList.add("show");
  }`
);

/* ---------- 3. 权限状态 + 提示条逻辑 ---------- */
const gate = `  /*MICONCE-START*/
  /* ---------- 麦克风：整个页面只申请一次，之后一直留着 ---------- */
  var micPermState = "unknown";
  function refreshMicGate(granted){
    if(granted){ hideMicWarn(); return; }
    if(micPermState === "denied"){
      showMicWarn("麦克风被浏览器挡住了，学生说话 HanLin 听不到",
        "点地址栏左边的 🔒（或 🎤）图标 → 把「麦克风」改成<b>允许</b> → 回来点「重试」。"
        + "<br><span style='opacity:.85'>想以后都不弹框：关掉这个页面，双击文件夹里的 <b>启动采访-不询问麦克风.bat</b> 打开。</span>",
        true, "重试");
      return;
    }
    showMicWarn("麦克风还没允许（整个页面只问这一次）",
      "点下面的「允许麦克风」，浏览器弹框时点<b>允许</b>就行了。<b>之后这一节课里点 Answer 就能直接说，不会再问第二次。</b>"
      + "<br><span style='opacity:.85'>想连这一次都不弹框：关掉这个页面，双击文件夹里的 <b>启动采访-不询问麦克风.bat</b> 打开。</span>",
      true, "允许麦克风", "info");
  }
  function micPrecheck(){
    try{
      if(!navigator.permissions || !navigator.permissions.query) return;
      navigator.permissions.query({ name: "microphone" }).then(function(p){
        micPermState = p.state || "unknown";
        if(micPermState === "granted"){
          /* 已经允许过：静默打开，不弹任何东西 */
          micState = "ok";
          hideMicWarn();
          ensureMic(function(){});
        }else{
          refreshMicGate(false);
        }
        p.onchange = function(){
          micPermState = p.state;
          if(p.state === "granted"){ micState = "ok"; hideMicWarn(); ensureMic(function(){}); }
          else refreshMicGate(false);
        };
      }).catch(function(){});
    }catch(e){}
  }
  /*MICONCE-END*/

`;
html = html.replace(/  function micCheck\(cb\)\{/, gate + '  function micCheck(cb){');

/* ---------- 4. 全景只开一条麦克风流 ---------- */
html = html.replace(
  /  function meterOpen\(\)\{[\s\S]*?\n  \}\n(?=  function meterClose\(\)\{)/,
  `  function attachAnalyser(){
    if(micAnalyser || !micStream) return;
    try{
      var AC = window.AudioContext || window.webkitAudioContext;
      if(!micCtx) micCtx = new AC();
      var src = micCtx.createMediaStreamSource(micStream);
      micAnalyser = micCtx.createAnalyser();
      micAnalyser.fftSize = 1024;
      micAnalyser.smoothingTimeConstant = 0.55;
      micBuf = new Uint8Array(micAnalyser.fftSize);
      src.connect(micAnalyser);
    }catch(e){ micAnalyser = null; }
  }
  /* 只申请一次麦克风，并且一直留着这条流 —— 点 Answer 的时候不会再弹框 */
  function ensureMic(cb, force){
    /* 已经被拒绝过就别一直撞墙；只有用户主动点按钮时才再试一次 */
    if(micPermState === "denied" && !force){ if(cb) cb(false, null); return; }
    if(micStream){
      attachAnalyser();
      if(cb) cb(true);
      return;
    }
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ if(cb) cb(false, null); return; }
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
    }).then(function(st){
      micStream = st;
      try{ st.getTracks().forEach(function(t){ t.addEventListener("ended", function(){ micStream = null; }); }); }catch(e){}
      attachAnalyser();
      if(cb) cb(true);
    }).catch(function(err){
      micStream = null;
      var name = String((err && err.name) || "");
      if(name === "NotAllowedError" || name === "SecurityError") micPermState = "denied";
      if(cb) cb(false, err);
    });
  }
`
);

/* ---------- 5. micCheck 复用同一条流，不再重复申请 ---------- */
html = html.replace(
  /    navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)\.then\(function\(st\)\{\n      try\{ st\.getTracks\(\)\.forEach\(function\(t\)\{ try\{ t\.stop\(\); \}catch\(e\)\{\} \}\); \}catch\(e\)\{\}\n      micState = "ok";\n      hideMicWarn\(\);\n      if\(cb\) cb\(true\);\n    \}\)\.catch\(function\(err\)\{[\s\S]*?\n    \}\);/,
  `    ensureMic(function(ok, err){
      if(ok){ micState = "ok"; hideMicWarn(); if(cb) cb(true); return; }
      micState = "blocked";
      var name = String((err && err.name) || "");
      var body;
      if(name === "NotFoundError" || name === "OverconstrainedError"){
        body = "这台电脑没有检测到麦克风。请插上麦克风（或耳机麦），然后点下面的「重试」。也可以用键盘输入答案。";
      }else{
        body = "点浏览器地址栏左边的 🔒（或 🎤）图标 → 把「麦克风」改成<b>允许</b> → 回来点下面的「重试」。"
             + "<br><span style='opacity:.8'>如果每次都弹这个框，直接用文件夹里的 <b>启动采访-不询问麦克风.bat</b> 打开，它会让浏览器不弹窗、直接允许。</span>";
      }
      showMicWarn("麦克风没有打开，学生说话 HanLin 听不到", body, true);
      if(cb) cb(false);
    }, true);`
);

/* ---------- 6. 开始听之前确保麦克风已经就绪 ---------- */
html = html.replace(/    meterOpen\(\);\n    startRec\(\);/, '    ensureMic();\n    startRec();');

/* ---------- 7. 结束收音时不释放麦克风（全课共用一条流） ---------- */
html = html.replace(
  /    \$\("wave"\)\.classList\.remove\("loud"\);\n    meterClose\(\);\n/,
  '    $("wave").classList.remove("loud");\n'
);

/* ---------- 8. 万一听写被「麦克风被占用」挤掉，放开再重试 ---------- */
html = html.replace(
  /      setVoiceHint\("Voice input had a problem\. Please type your answer\.", "听写出错：" \+ e \+ "，可改用键盘输入。"\);/,
  `      if(e === "audio-capture"){
        /* 个别机器上「页面一直占着麦克风」会让听写抢不到设备：先松开再重试一次 */
        meterClose();
        if(ST.phase === "listening") setTimeout(softRestart, 250);
        return;
      }
      setVoiceHint("Voice input had a problem. Please type your answer.", "听写出错：" + e + "，可改用键盘输入。");`
);

/* ---------- 9. 页面一打开就查权限，并挂上释放钩子 ---------- */
html = html.replace(
  /    setTimeout\(function\(\)\{ if\(!srSupported\(\)\) micCheck\(\); \}, 400\);/,
  `    setTimeout(function(){ if(!srSupported()) micCheck(); }, 400);
    /* 一打开就先处理麦克风权限：允许过就静默打开，没问过就给个蓝色提示条。
       这样上课点 Answer 的时候不会再弹框。 */
    setTimeout(micPrecheck, 600);
    window.addEventListener("pagehide", function(){ try{ meterClose(); }catch(e){} });`
);

for (const [name, re] of [
  ['提示条样式', /#micWarn \.mwBox\.info\{/],
  ['按钮文字', /rb\.textContent = retryLabel \|\| "重试";/],
  ['提示条不挡按钮', /#micWarn\.gate\{top:auto; bottom:14px\}/],
  ['提示条位置切换', /w\.classList\.toggle\("gate", tone === "info"\);/],
  ['提示条逻辑', /function refreshMicGate\(granted\)\{/],
  ['权限预检', /function micPrecheck\(\)\{/],
  ['一次性麦克风', /function ensureMic\(cb, force\)\{/],
  ['电平接入', /function attachAnalyser\(\)\{/],
  ['micCheck 复用', /ensureMic\(function\(ok, err\)\{/],
  ['拒绝后不反复申请', /if\(micPermState === "denied" && !force\)\{/],
  ['开始听前就绪', /    ensureMic\(\);\n    startRec\(\);/],
  ['结束不释放麦克风', /^(?![\s\S]*classList\.remove\("loud"\);\n    meterClose\(\);)[\s\S]*$/],
  ['占用回落', /if\(e === "audio-capture"\)\{/],
  ['启动预检', /setTimeout\(micPrecheck, 600\);/],
  ['页面卸载释放', /window\.addEventListener\("pagehide"/]
]) {
  if (!re.test(html)) throw new Error('校验失败：' + name);
}
if((html.match(/MICONCE-START/g) || []).length !== 1) throw new Error('麦克风层注入多次');
if(/\n\s*meterClose\(\);\n\s*if\(rec\)\{/.test(html)) throw new Error('endListen 里还在释放麦克风');

writeFileSync(PKG, html);
writeFileSync(`${ROOT}/outputs/HanLin采访-离线版.html`, html);
console.log('麦克风只问一次 已注入：%s KB -> %s KB', (before / 1024).toFixed(0), (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0));
