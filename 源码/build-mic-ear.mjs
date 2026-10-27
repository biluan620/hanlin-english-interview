/* 「任何设备都能收到声音」改造：
   - 整段重写语音部分：自己用 getUserMedia 采音（可枚举设备、逐个试听、自动挑/自动切），
     编码成 16kHz 单声道 WAV 发给云端识别；失败自动回退到浏览器听写
   - 新增老师面板「麦克风与识别」
   - 记录与 CSV 增加「识别方式」列
   以「发给同事」文件夹为准，再复制到 outputs 根目录。 */
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const PKG = `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;
const section = readFileSync(`${ROOT}/work/voice-section.js`, 'utf8').replace(/\s+$/, '');
const panel = readFileSync(`${ROOT}/work/mic-panel.html`, 'utf8').replace(/\s+$/, '');

let html = readFileSync(PKG, 'utf8');
const before = Buffer.byteLength(html, 'utf8');

/* 幂等：先清掉上一次注入 */
html = html.replace(
  /  \/\*MIC-EAR-START\*\/[\s\S]*?\/\*MIC-EAR-END\*\//,
  '  /* ---------- 语音输入：学生开口说，页面自动转成文字交给 HanLin ---------- */'
);
html = html.replace(/  <!--MIC-PANEL-START-->[\s\S]*?<!--MIC-PANEL-END-->\n/, '');
html = html.replace(/\n?    <button class="btn" id="aMic">[^<]*<\/button>/, '');
html = html.replace(/\n?        <a class="btn mwSkip" id="mwWin"[^>]*>[^<]*<\/a>/, '');
html = html.replace(/(    if\(typeof vp\.wait === "number"\) voiceCfg\.wait = vp\.wait;\n)+/, '    if(typeof vp.wait === "number") voiceCfg.wait = vp.wait;\n');
html = html.replace(
  /        if\(nm === "NotAllowedError" \|\| nm === "SecurityError"\)\{\n          micPermState = "denied";\n          micSysBlocked = \/system\/i\.test\(String\(\(st && st\.message\) \|\| ""\)\);\n        \}/,
  '        if(nm === "NotAllowedError" || nm === "SecurityError") micPermState = "denied";'
);
html = html.replace(/    if\(micSysBlocked\)\{\n      showMicWarn\("Windows 把麦克风关掉了[\s\S]*?\n      return;\n    \}\n/, '');
html = html.replace(/    var w1 = document\.getElementById\("mwWin"\);\n    if\(w1\) w1\.style\.display = "none";\n/, '');
html = html.replace(/  var micPermState = "unknown", micSysBlocked = false;/, '  var micPermState = "unknown";');
html = html.replace(/  \/\* 开课前先体检一次麦克风[^\n]*\n  setTimeout\(function\(\)\{ if\(micPermState === "granted" \|\| micPermState === "denied"\) earBoot\(function\(\)\{ syncVoiceButtons\(\); \}\); \}, 2500\);\n/, '');
html = html.replace(/    \/\* 开课前把这个班的麦克风挑好[^\n]*\n    if\(micPermState === "granted" && sttReady\(\)\)\{ earBoot\(function\(\)\{ syncVoiceButtons\(\); \}\); \}\n/, '');
html = html.replace(/\n?    bindMicPanel\(\);\n/, '\n');
html = html.replace(/      setSrc\("键盘"\);\n/, '');
html = html.replace(/  earSettingsLoad\(\); syncVoiceButtons\(\);/, '  syncVoiceButtons();');

/* ---------- 1. 整段重写语音部分 ---------- */
const startAnchor = '  /* ---------- 语音输入：学生开口说，页面自动转成文字交给 HanLin ---------- */';
const endAnchor = '  /* ---------- 记录 ---------- */';
const i0 = html.indexOf(startAnchor);
const i1 = html.indexOf(endAnchor);
if (i0 < 0 || i1 < 0 || i1 < i0) throw new Error('找不到语音部分边界');
html = html.slice(0, i0) + '  /*MIC-EAR-START*/\n' + section + '\n  /*MIC-EAR-END*/\n\n' + html.slice(i1);

/* ---------- 2. 报警条上加一个「打开 Windows 麦克风设置」 ---------- */
html = html.replace(
  /        <button class="btn mwGo" id="mwRetry">重试<\/button>/,
  '        <button class="btn mwGo" id="mwRetry">重试</button>\n'
  + '        <a class="btn mwSkip" id="mwWin" href="ms-settings:privacy-microphone" style="display:none;text-decoration:none">打开 Windows 麦克风设置</a>'
);

/* ---------- 3. 系统层面被拦时的提示 ---------- */
html = html.replace(
  /        if\(nm === "NotAllowedError" \|\| nm === "SecurityError"\) micPermState = "denied";/,
  '        if(nm === "NotAllowedError" || nm === "SecurityError"){\n'
  + '          micPermState = "denied";\n'
  + '          micSysBlocked = /system/i.test(String((st && st.message) || ""));\n'
  + '        }'
);
html = html.replace(
  /  var micPermState = "unknown";/,
  '  var micPermState = "unknown", micSysBlocked = false;'
);
html = html.replace(
  /  function refreshMicGate\(granted\)\{\n    if\(granted\)\{ hideMicWarn\(\); return; \}\n    if\(micPermState === "denied"\)\{/,
  '  function refreshMicGate(granted){\n'
  + '    if(granted){ hideMicWarn(); return; }\n'
  + '    var wWin = document.getElementById("mwWin");\n'
  + '    if(micSysBlocked){\n'
  + '      if(wWin) wWin.style.display = "";\n'
  + '      showMicWarn("Windows 把麦克风关掉了，浏览器完全拿不到声音",\n'
  + '        "这是系统开关，跟用哪个麦克风无关。请打开：<b>设置 → 隐私和安全性 → 麦克风</b> → 把「<b>麦克风访问</b>」和「<b>让桌面应用访问你的麦克风</b>」都打开，然后回来点「重试」。",\n'
  + '        true, "重试");\n'
  + '      return;\n'
  + '    }\n'
  + '    if(wWin) wWin.style.display = "none";\n'
  + '    if(micPermState === "denied"){'
);

/* ---------- 4. 控制条按钮 + 面板 ---------- */
html = html.replace(
  /(    <button class="btn" id="aWait">等待开口：15s<\/button>)/,
  '$1\n    <button class="btn" id="aMic">麦克风：自动</button>'
);
html = html.replace(
  /(\n  <div class="modal" id="records">)/,
  `\n  <!--MIC-PANEL-START-->\n${panel}\n  <!--MIC-PANEL-END-->$1`
);

/* ---------- 5. 记录与 CSV 增加「识别方式」 ---------- */
html = html.replace(
  /      spoken: a\.spoken, ts: a\.ts/,
  '      spoken: a.spoken, src: a.src || "", ts: a.ts'
);
html = html.replace(
  /  function csv\(\)\{\n    REC\.forEach\(function\(r\)\{ rows\.push\(\[([^\]]*)\]\); \}\);/,
  '  function csv(){\n'
  + '    var rows = [["组别", "题号", "问题", "学生原话（识别）", "提交的答案", "HanLin 改后句", "评语", "识别方式", "时间"]];\n'
  + '    REC.forEach(function(r){ rows.push([$1, r.src || ""]); });'
);
html = html.replace(
  /<th>提交的答案<\/th><th>HanLin 改后句<\/th><th>评语<\/th><\/tr>'/,
  '<th>提交的答案</th><th>HanLin 改后句</th><th>识别方式</th><th>评语</th></tr>\''
);
html = html.replace(
  /        \+ \(r\.corrected \? esc\(r\.corrected\) : "—"\) \+ "<\/td><td>" \+ pill \+ " "/,
  '        + (r.corrected ? esc(r.corrected) : "—") + "</td><td>" + esc(r.src || "—") + "</td><td>" + pill + " "'
);

/* ---------- 6. 提交时记录这一句是从哪来的 ---------- */
html = html.replace(
  /          corrected: res\.corrected \|\| "", spoken: spoken, ts: nowStr\(\)/,
  '          corrected: res.corrected || "", spoken: spoken, src: (ansSrc || "键盘"), ts: nowStr()'
);

/* ---------- 7. 绑定面板 + 手动输入就当成键盘来源 ---------- */
html = html.replace(
  /  function bind\(\)\{\n    \$\("btnSend"\)\.addEventListener\("click", submitAnswer\);/,
  '  function bind(){\n    bindMicPanel();\n    $("btnSend").addEventListener("click", submitAnswer);'
);
html = html.replace(
  /    \$\("answerBox"\)\.addEventListener\("input", function\(\)\{\n      if\(ST\.phase !== "asking"\) return;/,
  '    $("answerBox").addEventListener("input", function(){\n      setSrc("键盘");\n      if(ST.phase !== "asking") return;'
);

/* ---------- 8. 启动载入配置 / 开课前先把麦克风挑好 ---------- */
html = html.replace(
  /  syncVoiceButtons\(\);\n  \$\("answerBox"\)\.placeholder/,
  '  earSettingsLoad(); syncVoiceButtons();\n  $("answerBox").placeholder'
);
html = html.replace(
  /  bindVoiceGuard\(\);/,
  '  bindVoiceGuard();\n'
  + '  /* 开课前先体检一次麦克风：允许过就挑一个能收声的；被系统拦住就把原因写在屏幕上 */\n'
  + '  setTimeout(function(){ if(micPermState === "granted" || micPermState === "denied") earBoot(function(){ syncVoiceButtons(); }); }, 2500);'
);
html = html.replace(
  /  function startInterview\(\)\{\n    stopAudio\(\);/,
  '  function startInterview(){\n'
  + '    /* 开课前把这个班的麦克风挑好：能收到声音的那个（老师锁定过就听老师的） */\n'
  + '    if(micPermState === "granted" && sttReady()){ earBoot(function(){ syncVoiceButtons(); }); }\n'
  + '    stopAudio();'
);

const checks = [
  ['语音段落', /\/\*MIC-EAR-START\*\//],
  ['云端识别', /function sttSend\(blob, cb\)\{/],
  ['设备试听', /function micProbe\(done, each, stopEarly\)\{/],
  ['WAV 编码', /function earWav\(chunks, rate\)\{/],
  ['自动切换', /function earSwitch\(cb\)\{/],
  ['回退', /function earFallback\(reason\)\{/],
  ['面板', /<!--MIC-PANEL-START-->/],
  ['控制条按钮', /<button class="btn" id="aMic">麦克风：自动<\/button>/],
  ['Windows 设置链接', /id="mwWin" href="ms-settings:privacy-microphone"/],
  ['系统被拦提示', /Windows 把麦克风关掉了，浏览器完全拿不到声音/],
  ['系统标记', /var micPermState = "unknown", micSysBlocked = false;/],
  ['系统拦截判定', /micSysBlocked = \/system\/i\.test\(String\(\(st && st\.message\) \|\| ""\)\);/],
  ['换设备时停掉旧循环', /clearInterval\(watchT\); watchT = 0;   \/\* 换设备期间/],
  ['识别方式列', /"识别方式", "时间"\]/],
  ['表格列', /<th>识别方式<\/th>/],
  ['提交带来源', /src: \(ansSrc \|\| "键盘"\)/],
  ['绑定面板', /    bindMicPanel\(\);/],
  ['输入记为键盘', /      setSrc\("键盘"\);/],
  ['启动载入', /  earSettingsLoad\(\); syncVoiceButtons\(\);/],
  ['开课前提早挑麦', /setTimeout\(function\(\)\{ if\(micPermState === "granted" \|\| micPermState === "denied"\) earBoot/],
  ['开始采访时挑麦', /if\(micPermState === "granted" && sttReady\(\)\)\{ earBoot/]
];
for (const [name, re] of checks) {
  if (!re.test(html)) throw new Error('校验失败：' + name);
}
if ((html.match(/MIC-EAR-START/g) || []).length !== 1) throw new Error('语音段注入多次');
if ((html.match(/function ensureMic\(cb, force\)/g) || []).length !== 1) throw new Error('ensureMic 重复');
if ((html.match(/function beginListen\(forceSr\)/g) || []).length !== 1) throw new Error('beginListen 重复');

writeFileSync(PKG, html);
writeFileSync(`${ROOT}/outputs/HanLin采访-离线版.html`, html);
console.log('耳朵层已注入：%s KB -> %s KB', (before / 1024).toFixed(0), (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0));
