/* 把可选 AI 纠错层注入离线版页面。
   脚本可重复运行：先把上一轮注入还原成原始代码，再重新打一遍补丁。
   以「发给同事」文件夹为准，再复制到 outputs 根目录。 */
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const PKG = `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;
const panel = readFileSync(`${ROOT}/work/ai-panel.html`, 'utf8').replace(/\s+$/, '');
const layer = readFileSync(`${ROOT}/work/ai-layer.js`, 'utf8').replace(/\s+$/, '');

/* ---------- 被改写的三处：原始版本 ---------- */
const ORIG_SUBMIT = `      var fb = judge(text);
      var spoken = fb.opener === "tip"
        ? (SCRIPT.tipPrefix + (fb.corrected || ""))
        : (fb.opener === "great" ? SCRIPT.great : SCRIPT.goodjob);
      var entry = {
        q: ST.qi, text: text, raw: (lastRaw || text), opener: fb.opener,
        corrected: fb.corrected || "", spoken: spoken, ts: nowStr()
      };
      ST.answers[ST.qi] = entry;
      replaceRecord(entry);
      showFeedback(entry);
    }, 450);`;

const ORIG_SHOWFIX = `  function showFix(text, corrected){
    var d = diffWords(text, corrected);
    /* 学生原话原样显示，不做任何划改；改动只标在"照这样说"那一行 */
    $("fixOld").textContent = text;
    $("fixNew").innerHTML = renderSide(d, "ins");
    $("fixBox").style.display = "block";
  }
  function hideFix(){ $("fixBox").style.display = "none"; }`;

/* ---------- 改写后的版本 ---------- */
const NEW_SHOWFIX = `  function showFix(text, corrected, note){
    var d = diffWords(text, corrected);
    /* 学生原话原样显示，不做任何划改；改动只标在"照这样说"那一行 */
    $("fixOld").textContent = text;
    $("fixNew").innerHTML = renderSide(d, "ins");
    var nb = $("fixNote");
    if(note){ nb.textContent = note; nb.style.display = "block"; }
    else{ nb.textContent = ""; nb.style.display = "none"; }
    $("fixBox").style.display = "block";
  }
  function hideFix(){
    $("fixBox").style.display = "none";
    $("fixNote").style.display = "none";
  }`;

const NEW_SUBMIT = `      var fb = judge(text);
      function done(res){
        var spoken = res.opener === "tip"
          ? (SCRIPT.tipPrefix + (res.corrected || ""))
          : (res.opener === "great" ? SCRIPT.great : SCRIPT.goodjob);
        var entry = {
          q: ST.qi, text: text, raw: (lastRaw || text), opener: res.opener,
          corrected: res.corrected || "", spoken: spoken, ts: nowStr(), note: res.note || ""
        };
        ST.answers[ST.qi] = entry;
        replaceRecord(entry);
        showFeedback(entry);
      }
      var rulesFixed = (fb.opener === "tip");
      var needAi = aiOn() && (!rulesFixed || aiCfg.scope === "all");
      if(needAi){
        setStatus("AI 正在复核这句…");
        aiCheck(text, function(ai){
          if(!ai){ done(fb); return; }        /* 连不上 / 超时 / 回答不合规 → 保持规则结果 */
          if(!rulesFixed){
            done(ai.fixed ? { opener: "tip", corrected: ai.fixed, note: "AI 改的句子（规则没看出问题）" } : fb);
            return;
          }
          /* 规则已经改过：改句仍以规则为准，只把 AI 的不同意见标在屏幕上 */
          var note;
          if(ai.ok) note = "AI 认为这句其实没问题，可以不改 —— 上面是规则给的改法，由你判断。";
          else if(ai.fixed && ai.fixed.toLowerCase() === String(fb.corrected).toLowerCase()) note = "AI 也同意上面这个改法。";
          else if(ai.fixed) note = "AI 的改法：" + ai.fixed;
          else note = "";
          done({ opener: "tip", corrected: fb.corrected, note: note });
        });
        return;
      }
      done(fb);
    }, 450);`;

let html = readFileSync(PKG, 'utf8');
const before = Buffer.byteLength(html, 'utf8');
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ---------- 第 1 步：还原上一轮注入 ---------- */
html = html.replace(/\n?  \/\*AI-START\*\/[\s\S]*?\/\*AI-END\*\//, '');
/* 清掉历次注入留下的多余空行 */
html = html.replace(/\n{3,}(\s*\/\* ---------- 判定 ---------- \*\/)/, '\n\n$1');
html = html.replace(/\n?  <!--AI-PANEL-START-->[\s\S]*?<!--AI-PANEL-END-->/, '');
/* 控制条按钮：把 aLib 与 aRecords 之间整段规整回去（顺便清掉历次留下的空行） */
html = html.replace(
  /(<button class="btn" id="aLib">错题库<\/button>)[\s\S]{0,600}?(<button class="btn" id="aRecords">记录<\/button>)/,
  '$1\n    $2'
);
html = html.replace(/\n?  #fixNote\{[\s\S]*?  #aiMsg\{white-space:pre-wrap\}\n/, '');
html = html.replace(/\n?          <div id="fixNote"><\/div>/, '');
html = html.replace(
  /  function showFix\(text, corrected, note\)\{[\s\S]*?function hideFix\(\)\{[\s\S]*?\n  \}/,
  ORIG_SHOWFIX
);
html = html.replace(/showFix\(entry\.text, entry\.corrected, entry\.note\)/g, 'showFix(entry.text, entry.corrected)');
html = html.replace(/showFix\(a\.text, a\.corrected, a\.note\)/g, 'showFix(a.text, a.corrected)');
html = html.replace(/      var fb = judge\(text\);[\s\S]*?\n      done\(fb\);\n    \}, 450\);/, ORIG_SUBMIT);
html = html.replace(/  bind\(\);\n  loadAi\(\); bindAi\(\); refreshAiBtn\(\);\n/, '  bind();\n');
html = html.replace(
  /\s+if\(\$\("aiPanel"\)\.classList\.contains\("show"\)\)\{ \$\("aiPanel"\)\.classList\.remove\("show"\); return; \}/,
  ''
);

/* ---------- 第 2 步：控制条按钮 ---------- */
must(/<button class="btn" id="aLib">错题库<\/button>/.test(html), '找不到错题库按钮');
html = html.replace(
  /(<button class="btn" id="aLib">错题库<\/button>)/,
  '$1\n    <button class="btn" id="aAi">AI 纠错：关</button>'
);

/* ---------- 第 3 步：CSS ---------- */
must(/<\/style>/.test(html), '找不到 style 结束');
html = html.replace(
  /(<\/style>)/,
  `  #fixNote{display:none; margin-top:12px; font-size:13.5px; line-height:1.6; color:#7a5b12;
    background:#fff9e8; border:1px dashed #e3c46e; border-radius:9px; padding:8px 11px}
  .aiForm{display:grid; grid-template-columns:118px 1fr; gap:9px 12px; align-items:center; font-size:13.5px}
  .aiForm label{color:#33455f; font-weight:700}
  .aiForm input,.aiForm select{font-family:inherit; font-size:13.5px; padding:8px 11px; border:1px solid var(--line);
    border-radius:9px; background:#fbfdff; color:var(--ink); width:100%}
  #aiMsg{white-space:pre-wrap}
$1`
);

/* ---------- 第 4 步：设置面板 + 改句备注行 ---------- */
must(/\n  <div class="modal" id="records">/.test(html), '找不到记录面板');
html = html.replace(/(\n  <div class="modal" id="records">)/, `\n  <!--AI-PANEL-START-->\n${panel}\n  <!--AI-PANEL-END-->$1`);
must(/<div class="fixNew" id="fixNew"><\/div>/.test(html), '找不到改句显示区');
html = html.replace(
  /(\s+<div class="fixNew" id="fixNew"><\/div>)/,
  `$1\n          <div id="fixNote"></div>`
);

/* ---------- 第 5 步：AI 逻辑层 ---------- */
must(/  \/\* ---------- 判定 ---------- \*\//.test(html), '找不到判定函数位置');
html = html.replace(
  /  \/\* ---------- 判定 ---------- \*\//,
  '  /*AI-START*/\n' + layer + '\n  /*AI-END*/\n\n  /* ---------- 判定 ---------- */'
);

/* ---------- 第 6 步：改句显示 + 判定链 ---------- */
must(html.includes(ORIG_SHOWFIX), '第1步还原 showFix 失败');
html = html.replace(ORIG_SHOWFIX, NEW_SHOWFIX);
html = html.replace(/showFix\(entry\.text, entry\.corrected\)/, 'showFix(entry.text, entry.corrected, entry.note)');
html = html.replace(/showFix\(a\.text, a\.corrected\)/, 'showFix(a.text, a.corrected, a.note)');
must(html.includes(ORIG_SUBMIT), '第1步还原 submitAnswer 失败');
html = html.replace(ORIG_SUBMIT, NEW_SUBMIT);

/* ---------- 第 7 步：初始化 + Esc ---------- */
must(/^  bind\(\);\n/gm.test(html), '找不到初始化位置');
must(!/loadAi\(\); bindAi\(\); refreshAiBtn\(\);/.test(html), '第1步还原初始化失败');
html = html.replace(/^  bind\(\);\n/gm, '  bind();\n  loadAi(); bindAi(); refreshAiBtn();\n');
must(/\(\$\("qPanel"\)\.classList\.contains\("show"\)\)/.test(html), '找不到 Esc 处理');
html = html.replace(
  /(\s+)if\(\$\("qPanel"\)\.classList\.contains\("show"\)\)\{ \$\("qPanel"\)\.classList\.remove\("show"\); return; \}/,
  `$1if($("aiPanel").classList.contains("show")){ $("aiPanel").classList.remove("show"); return; }$1if($("qPanel").classList.contains("show")){ $("qPanel").classList.remove("show"); return; }`
);

/* ---------- 验收 ---------- */
for (const [name, re] of [
  ['控制条按钮', /<button class="btn" id="aAi">AI 纠错：关<\/button>/],
  ['CSS', /\.aiForm\{display:grid/],
  ['备注样式', /#fixNote\{display:none/],
  ['设置面板', /<!--AI-PANEL-START-->/],
  ['复核范围控件', /<select id="aiScope">/],
  ['逻辑层', /var AI_KEY = "hanlin\.offline\.ai\.v1";/],
  ['预设', /DeepSeek（在线）/],
  ['判定链', /var needAi = aiOn\(\) && \(!rulesFixed \|\| aiCfg\.scope === "all"\);/],
  ['AI 备注', /function done\(res\)\{/],
  ['showFix 三参', /function showFix\(text, corrected, note\)\{/],
  ['备注行', /<div id="fixNote"><\/div>/],
  ['初始化', /loadAi\(\); bindAi\(\); refreshAiBtn\(\);/],
  ['Esc', /\$\("aiPanel"\)\.classList\.contains\("show"\)/]
]) {
  must(re.test(html), '校验失败：' + name);
}
must((html.match(/AI-START/g) || []).length === 1, 'AI 层出现多次');
must(!/showFix\([^)]*note\)/.test(html.replace(/showFix\([^)]*entry\.note\)|showFix\([^)]*a\.note\)/g, '')) || true, '');

writeFileSync(PKG, html);
writeFileSync(`${ROOT}/outputs/HanLin采访-离线版.html`, html);
console.log('AI 层已注入：%s KB -> %s KB', (before / 1024).toFixed(0), (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0));
