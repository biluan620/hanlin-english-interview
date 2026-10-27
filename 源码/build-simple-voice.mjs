/* 回退到简单版语音：只用浏览器自带听写，点 Answer 就能说。
   把上一轮加的「耳朵层」（设备管理 / 云端识别 / 麦克风面板 / Windows 权限流程）全部撤掉，
   只留下不影响使用的小修：CSV 导出以前会报错（rows 没声明），这个补上。 */
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const PKG = `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;
const simple = readFileSync(`${ROOT}/work/voice-simple.js`, 'utf8').replace(/\s+$/, '');

let html = readFileSync(PKG, 'utf8');
const before = Buffer.byteLength(html, 'utf8');

/* ---------- 1. 整段换回简单版语音 ---------- */
const endAnchor = '  /* ---------- 记录 ---------- */';
const i1 = html.indexOf(endAnchor);
if (i1 < 0) throw new Error('找不到记录段落');
const starts = ['  /* ---------- 语音输入：学生开口说，页面自动转成文字交给 HanLin ---------- */',
  '  /* ---------- 语音输入：点 Answer 说话，浏览器自己听写，说完自动提交 ---------- */',
  '  /*MIC-EAR-START*/'];
let i0 = -1;
for (const a of starts) { const k = html.indexOf(a); if (k >= 0 && k < i1 && (i0 < 0 || k < i0)) i0 = k; }
if (i0 < 0) throw new Error('找不到语音段落');
html = html.slice(0, i0) + simple + '\n\n' + html.slice(i1);

/* ---------- 2. 去掉「只问一次」的权限流程 ---------- */
html = html.replace(/  \/\*MICONCE-START\*\/[\s\S]*?\/\*MICONCE-END\*\/\n\n/, '');
html = html.replace(
  /    \/\* 一打开就先处理麦克风权限[\s\S]*?window\.addEventListener\("pagehide", function\(\)\{ try\{ meterClose\(\); \}catch\(e\)\{\} \}\);\n/,
  ''
);

/* ---------- 3. micCheck 回到直接用浏览器申请 ---------- */
html = html.replace(
  /    ensureMic\(function\(ok, err\)\{\n      if\(ok\)\{ micState = "ok"; hideMicWarn\(\); if\(cb\) cb\(true\); return; \}\n      micState = "blocked";\n      var name = String\(\(err && err\.name\) \|\| ""\);/,
  '    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(st){\n'
  + '      try{ st.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}\n'
  + '      micState = "ok";\n'
  + '      hideMicWarn();\n'
  + '      if(cb) cb(true);\n'
  + '    }).catch(function(err){\n'
  + '      micState = "blocked";\n'
  + '      var name = String((err && err.name) || "");'
);
html = html.replace(
  /      showMicWarn\("麦克风没有打开，学生说话 HanLin 听不到", body, true\);\n      if\(cb\) cb\(false\);\n    \}, true\);/,
  '      showMicWarn("麦克风没有打开，学生说话 HanLin 听不到", body, true);\n      if(cb) cb(false);\n    });'
);

/* ---------- 4. 去掉麦克风面板 / 按钮 / Windows 设置链接 ---------- */
html = html.replace(/  <!--MIC-PANEL-START-->[\s\S]*?<!--MIC-PANEL-END-->\n/, '');
html = html.replace(/\n?    <button class="btn" id="aMic">[^<]*<\/button>/, '');
html = html.replace(/\n?        <a class="btn mwSkip" id="mwWin"[^>]*>[^<]*<\/a>/, '');

/* ---------- 5. 去掉开课前的自动体检 ---------- */
html = html.replace(/  \/\* 开课前先体检一次麦克风[^\n]*\n  setTimeout\(function\(\)\{ if\(micPermState === "granted" \|\| micPermState === "denied"\) earBoot\(function\(\)\{ syncVoiceButtons\(\); \}\); \}, 2500\);\n/, '');
html = html.replace(/\n?  \/\*[^\n]*\*\/\n  setTimeout\(function\(\)\{ if\(micPermState === "granted"\) earBoot\(function\(\)\{ syncVoiceButtons\(\); \}\); \}, 2500\);/, '');
html = html.replace(/\n?  setTimeout\(function\(\)\{ if\(micPermState === "granted"\) earBoot\(function\(\)\{ syncVoiceButtons\(\); \}\); \}, 2500\);/, '');
html = html.replace(/    \/\* 开课前把这个班的麦克风挑好[^\n]*\n    if\(micPermState === "granted" && sttReady\(\)\)\{ earBoot\(function\(\)\{ syncVoiceButtons\(\); \}\); \}\n/, '');

/* ---------- 6. 去掉绑定与来源标记 ---------- */
html = html.replace(/\n?    bindMicPanel\(\);\n/, '\n');
html = html.replace(/      setSrc\("键盘"\);\n/, '');
html = html.replace(/  earSettingsLoad\(\); syncVoiceButtons\(\);/, '  syncVoiceButtons();');

/* ---------- 7. 记录回到原来的列（保留 CSV 表头这个修复） ---------- */
html = html.replace(/      spoken: a\.spoken, src: a\.src \|\| "", ts: a\.ts/, '      spoken: a.spoken, ts: a.ts');
html = html.replace(
  /    var rows = \[\["组别", "题号", "问题", "学生原话（识别）", "提交的答案", "HanLin 改后句", "评语", "识别方式", "时间"\]\];\n    REC\.forEach\(function\(r\)\{ rows\.push\(\[([^\]]*), r\.src \|\| ""\]\); \}\);/,
  '    var rows = [["组别", "题号", "问题", "学生原话（识别）", "提交的答案", "HanLin 改后句", "评语", "时间"]];\n'
  + '    REC.forEach(function(r){ rows.push([$1]); });'
);
html = html.replace(/<th>HanLin 改后句<\/th><th>识别方式<\/th><th>评语<\/th>/, '<th>HanLin 改后句</th><th>评语</th>');
html = html.replace(
  / \+ "<\/td><td>" \+ esc\(r\.src \|\| "—"\) \+ "<\/td><td>" \+ pill \+ " "/,
  ' + "</td><td>" + pill + " "'
);
html = html.replace(
  /          corrected: res\.corrected \|\| "", spoken: spoken, src: \(ansSrc \|\| "键盘"\), ts: nowStr\(\)/,
  '          corrected: res.corrected || "", spoken: spoken, ts: nowStr()'
);

const checks = [
  ['简单版语音', /var voiceCfg = \{ silence: 1\.5, submit: 0\.5, max: 30, wait: 15 \};/],
  ['没有耳朵层', /^(?![\s\S]*MIC-EAR-START)[\s\S]*$/],
  ['没有云端识别', /^(?![\s\S]*function sttSend)[\s\S]*$/],
  ['没有设备探测', /^(?![\s\S]*function micProbe)[\s\S]*$/],
  ['没有只问一次', /^(?![\s\S]*micPrecheck)[\s\S]*$/],
  ['没有麦克风面板', /^(?![\s\S]*id="micPanel")[\s\S]*$/],
  ['没有麦克风按钮', /^(?![\s\S]*id="aMic")[\s\S]*$/],
  ['没有遗留的 earBoot', /^(?![\s\S]*earBoot)[\s\S]*$/],
  ['micCheck 直接申请', /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)\.then/],
  ['记录列已还原', /<th>HanLin 改后句<\/th><th>评语<\/th>/],
  ['CSV 表头还在', /var rows = \[\["组别", "题号", "问题", "学生原话（识别）", "提交的答案", "HanLin 改后句", "评语", "时间"\]\];/],
  ['提交不带来源', /corrected: res\.corrected \|\| "", spoken: spoken, ts: nowStr\(\)/]
];
for (const [name, re] of checks) {
  if (!re.test(html)) throw new Error('校验失败：' + name);
}

writeFileSync(PKG, html);
writeFileSync(`${ROOT}/outputs/HanLin采访-离线版.html`, html);
console.log('已回到简单版：%s KB -> %s KB', (before / 1024).toFixed(0), (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0));
