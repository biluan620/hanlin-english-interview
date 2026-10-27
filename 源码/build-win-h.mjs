/* 让页面能直接消化「系统语音输入（Win+H）」打进来的文字：
   1. 出题时自动聚焦答题框 —— Win+H 说的话才会落进来
   2. 自动提交改成「文本不再增长」判断，听写整段进来时放宽停顿，避免说到一半被发出去
   3. 控制条起始提示里加一句 Win+H 的用法
   不加新按钮、不加新面板、不加新的存储项。 */
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const PKG = `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;
let html = readFileSync(PKG, 'utf8');
const before = Buffer.byteLength(html, 'utf8');

/* 幂等：先把上一轮的改动还原成原样 */
html = html.replace(
  /  \/\* Win\+H 的系统语音输入[\s\S]*?\n  var prevTypeLen = 0;\n  function scheduleTypingSubmit\(burst\)\{[\s\S]*?\n  \}/,
  '  /* 键盘输入：停手 max(静音判定, 2 秒) 再走"说完等"倒计时，避免打字中间的停顿被提前发出去 */\n'
  + '  function scheduleTypingSubmit(){\n'
  + '    clearTimeout(typeT);\n'
  + '    typeT = setTimeout(function(){ if(ST.phase === "asking") scheduleSubmit(); }, Math.max(voiceCfg.silence, 2.0) * 1000);\n'
  + '  }'
);
html = html.replace(
  /    \$\("answerBox"\)\.addEventListener\("input", function\(\)\{\n      var v = String\(\$\("answerBox"\)\.value \|\| ""\);\n      var add[\s\S]*?\n    \}\);/,
  '    $("answerBox").addEventListener("input", function(){\n'
  + '      if(ST.phase !== "asking") return;\n'
  + '      if(!String($("answerBox").value || "").trim()){ clearPending(); return; }\n'
  + '      scheduleTypingSubmit();\n'
  + '    });'
);
html = html.replace(
  /    \/\* 自动聚焦答题框[\s\S]*?prevTypeLen = 0;\n    var micOk = voiceOn && !srBroken;/,
  '    var micOk = voiceOn && !srBroken;'
);
html = html.replace(
  /\n  \/\* Win\+H 提示[\s\S]*?\n  setTimeout\(function\(\)\{ if\(ST\.phase === "idle"\) setAdminStatus\([^\n]*\n/,
  '\n'
);
html = html.replace(/  function endListen\(noAuto\)\{/, '  function endListen(){');
html = html.replace(/    if\(!noAuto\) scheduleSubmit\(\);/, '    scheduleSubmit();');

/* 1. 出题时自动聚焦答题框 */
html = html.replace(
  /    var micOk = voiceOn && !srBroken;/,
  '    /* 自动聚焦答题框：这样按 Win+H 用系统语音输入时，说的话会直接落进这里 */\n'
  + '    try{ $("answerBox").focus(); }catch(e){}\n'
  + '    prevTypeLen = 0;\n'
  + '    var micOk = voiceOn && !srBroken;'
);

/* 2. 自动提交按「文本不再增长」判断，听写整段进来时多等一会儿 */
html = html.replace(
  /  \/\* 键盘输入：停手 max\(静音判定, 2 秒\)[^\n]*\n  function scheduleTypingSubmit\(\)\{\n    clearTimeout\(typeT\);\n    typeT = setTimeout\(function\(\)\{ if\(ST\.phase === "asking"\) scheduleSubmit\(\); \}, Math\.max\(voiceCfg\.silence, 2\.0\) \* 1000\);\n  \}/,
  '  /* Win+H 的系统语音输入是一次塞进来一整段，所以按「文本不再增长」来判断：\n'
  + '     普通手打停 2.5 秒就发；一次进来 8 个字符以上的（听写/粘贴）等 3.5 秒，免得说到一半被发出去。 */\n'
  + '  var prevTypeLen = 0;\n'
  + '  function scheduleTypingSubmit(burst){\n'
  + '    clearTimeout(typeT);\n'
  + '    var pause = Math.max(voiceCfg.silence, 2.5);\n'
  + '    if(burst) pause = Math.max(pause, 3.5);\n'
  + '    typeT = setTimeout(function(){ if(ST.phase === "asking") scheduleSubmit(); }, pause * 1000);\n'
  + '  }'
);
html = html.replace(
  /    \$\("answerBox"\)\.addEventListener\("input", function\(\)\{\n      if\(ST\.phase !== "asking"\) return;\n      if\(!String\(\$\("answerBox"\)\.value \|\| ""\)\.trim\(\)\)\{ clearPending\(\); return; \}\n      scheduleTypingSubmit\(\);\n    \}\);/,
  '    $("answerBox").addEventListener("input", function(){\n'
  + '      var v = String($("answerBox").value || "");\n'
  + '      var add = v.length - prevTypeLen;\n'
  + '      if(add < 0) add = 0;\n'
  + '      prevTypeLen = v.length;\n'
  + '      if(!v.trim()){ clearPending(); return; }\n'
  + '      /* 正在用浏览器听写时，如果有文字从别处进来（例如 Win+H 系统语音输入），\n'
  + '         就当学生答完了：停止听写，把这段文字收下走正常提交。 */\n'
  + '      if(ST.phase === "listening"){ endListen(true); scheduleTypingSubmit(add >= 8); return; }\n'
  + '      if(ST.phase !== "asking") return;\n'
  + '      scheduleTypingSubmit(add >= 8);\n'
  + '    });'
);

/* 3. endListen 支持「先停止听写，但先别自动提交」 */
html = html.replace(/  function endListen\(\)\{/, '  function endListen(noAuto){');
html = html.replace(
  /    lastRaw = t;   \/\* 原生识别文本，原样留档，不做任何修改 \*\/\n    scheduleSubmit\(\);/,
  '    lastRaw = t;   /* 原生识别文本，原样留档，不做任何修改 */\n    if(!noAuto) scheduleSubmit();'
);

/* 4. 控制条起始提示 */
html = html.replace(
  /  setAdminStatus\("按「开始采访」开始第 1 组 · 学生对着麦克风说英语，HanLin 自动接话（听写需联网）"\);/,
  '  setAdminStatus("按「开始采访」开始第 1 组 · 学生对着麦克风说英语，HanLin 自动接话（听写需联网）");\n'
  + '  /* Win+H 提示：装了英文语音包之后，也可以用系统自带的离线语音输入 */\n'
  + '  setTimeout(function(){ if(ST.phase === "idle") setAdminStatus("按「开始采访」开始 · 也可以按 Win+H 用系统语音输入直接说英语（需先装英文语音包）"); }, 200);'
);

const checks = [
  ['endListen 带参数', /function endListen\(noAuto\)\{/],
  ['出题聚焦', /try\{ \$\("answerBox"\)\.focus\(\); \}catch\(e\)\{\}/],
  ['长度重置', /    prevTypeLen = 0;\n    var micOk/],
  ['听写停顿', /function scheduleTypingSubmit\(burst\)\{/],
  ['突发放宽', /if\(burst\) pause = Math\.max\(pause, 3\.5\);/],
  ['输入增量', /var add = v\.length - prevTypeLen;/],
  ['突发判定', /scheduleTypingSubmit\(add >= 8\);/],
  ['听写中也能收下', /if\(ST\.phase === "listening"\)\{ endListen\(true\); scheduleTypingSubmit\(add >= 8\); return; \}/],
  ['增量不为负', /if\(add < 0\) add = 0;/],
  ['endListen 可跳过自动提交', /function endListen\(noAuto\)\{/],
  ['endListen 尾部可选', /if\(!noAuto\) scheduleSubmit\(\);/],
  ['Win+H 提示', /也可以按 Win\+H 用系统语音输入直接说英语/]
];
for (const [name, re] of checks) {
  if (!re.test(html)) throw new Error('校验失败：' + name);
}
if ((html.match(/var prevTypeLen = 0;/g) || []).length !== 1) throw new Error('prevTypeLen 重复');
if ((html.match(/function scheduleTypingSubmit/g) || []).length !== 1) throw new Error('scheduleTypingSubmit 重复');

writeFileSync(PKG, html);
writeFileSync(`${ROOT}/outputs/HanLin采访-离线版.html`, html);
console.log('Win+H 支持已注入：%s KB -> %s KB', (before / 1024).toFixed(0), (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0));
