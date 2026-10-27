/* 让听写更准、更不容易中断：
   1. Chromium 常在没人说话时自己结束一轮识别 —— 现在会自动接上，不再让学生白说
   2. maxAlternatives 1 → 5，并在多个候选里挑最像学生真正说的那一句
   3. 麦克风加上降噪 / 回声消除 / 自动增益，并实时看音量：
      能区分「完全没声音」和「听到了但没转成文字」，好告诉老师该查什么
   4. 新增「等待开口」时间（默认 15 秒），学生慢一点开口也不会被提前掐掉  */
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const PKG = `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;
let html = readFileSync(PKG, 'utf8');
const before = Buffer.byteLength(html, 'utf8');

/* 幂等：清掉上一次注入 */
html = html.replace(/\n?  \/\*VOICE-START\*\/[\s\S]*?\/\*VOICE-END\*\//, '');
html = html.replace(/\n?    <button class="btn" id="aWait">[^<]*<\/button>/, '');
html = html.replace(/\n?  \.wave\.loud i\{[^}]*\}/, '');
html = html.replace(/(?:  var listenStart = 0[^\n]*\n)+/, '');
html = html.replace(/(?:    \$\("aWait"\)\.addEventListener\("click", function\(\)\{[\s\S]*?\n    \}\);\n)+/, '');
html = html.replace(/(?:    \$\("aWait"\)\.textContent = "等待开口：" \+ voiceCfg\.wait\.toFixed\(0\) \+ "s";\n)+/, '');

/* ---------- 1. 配置项：加「等待开口」 ---------- */
html = html.replace(
  /var voiceCfg = \{ silence: 1\.5, submit: 0\.5, max: 30 \};/,
  'var voiceCfg = { silence: 1.5, submit: 0.5, max: 30, wait: 15 };'
);
html = html.replace(
  /\{ on: voiceOn, auto: autoNext, silence: voiceCfg\.silence, submit: voiceCfg\.submit, max: voiceCfg\.max \}/,
  '{ on: voiceOn, auto: autoNext, silence: voiceCfg.silence, submit: voiceCfg.submit, max: voiceCfg.max, wait: voiceCfg.wait }'
);
html = html.replace(
  /(\$\("aSilence"\)\.textContent = "静音判定：" \+ voiceCfg\.silence\.toFixed\(1\) \+ "s";)/,
  '$1\n    $("aWait").textContent = "等待开口：" + voiceCfg.wait.toFixed(0) + "s";'
);
html = html.replace(
  /    if\(typeof vp\.max === "number"\) voiceCfg\.max = vp\.max;/,
  '    if(typeof vp.max === "number") voiceCfg.max = vp.max;\n    if(typeof vp.wait === "number") voiceCfg.wait = vp.wait;'
);

/* ---------- 2. 控制条按钮 ---------- */
html = html.replace(
  /(<button class="btn" id="aSubmit">说完等：2\.0s<\/button>)/,
  '$1\n    <button class="btn" id="aWait">等待开口：15s</button>'
);
html = html.replace(
  /(    \$\("aSubmit"\)\.addEventListener\("click", function\(\)\{[\s\S]*?\n    \}\);\n)/,
  `$1    $("aWait").addEventListener("click", function(){
      var vals = [6, 10, 15, 20, 30];
      var i = vals.indexOf(voiceCfg.wait);
      voiceCfg.wait = vals[(i + 1) % vals.length];
      syncVoiceButtons();
      saveVoicePref();
    });
`
);

/* ---------- 3. 样式：听到声音时波形变绿 ---------- */
html = html.replace(
  /(<\/style>)/,
  `  .wave.loud i{background:#22c55e}
$1`
);

/* ---------- 4. 变量声明 ---------- */
html = html.replace(
  /  var recFinal = "", recPrefix = "", lastVoiceAt = 0, pendingLeft = 0;/,
  '  var recFinal = "", recPrefix = "", lastVoiceAt = 0, pendingLeft = 0;\n'
  + '  var listenStart = 0, restartCount = 0, spokeOnce = false, micPeak = 0, lastLoudAt = 0, recDone = "";'
);

/* ---------- 5. 核心：麦克风电平 + 候选择优 + 自动续听 ---------- */
const core = `  /*VOICE-START*/
  /* ---------- 麦克风电平：用来分辨「没声音」和「有声音但没听清」 ---------- */
  var micStream = null, micCtx = null, micAnalyser = null, micBuf = null;
  var LOUD = 0.075;                 /* 超过这个音量算学生在说话 */
  var meterSeen = false;            /* 这一轮有没有成功拿到过麦克风电平 */
  function meterOpen(){
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
  function meterClose(){
    try{ if(micStream) micStream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}
    try{ if(micCtx && micCtx.close) micCtx.close(); }catch(e){}
    micStream = null; micCtx = null; micAnalyser = null;
  }
  /* 0~1 的音量；拿不到麦克风电平时返回 -1 */
  function meterLevel(){
    if(!micAnalyser || !micBuf) return -1;
    try{
      micAnalyser.getByteTimeDomainData(micBuf);
      var sum = 0, n = micBuf.length, i, v;
      for(i = 0; i < n; i += 2){ v = (micBuf[i] - 128) / 128; sum += v * v; }
      return Math.min(1, Math.sqrt(sum / (n / 2)) * 3.2);
    }catch(e){ return -1; }
  }
  /* Chromium 会给出多个候选，挑「最像学生真正说的那一句」：
     先看置信度，其次优先不需要纠错的那句（更可能是拼对了的英语），再看完整度 */
  function pickBest(seg){
    var best = "", bestScore = -1e9, k;
    for(k = 0; k < seg.length && k < 5; k++){
      var alt = seg[k];
      if(!alt) continue;
      var t = String(alt.transcript || "").replace(/\\s+/g, " ").trim();
      if(!t) continue;
      var conf = (typeof alt.confidence === "number" && alt.confidence > 0) ? alt.confidence : 0.6;
      var needsFix = 0;
      try{ needsFix = fixSentence(t).changed ? 1 : 0; }catch(e){}
      var score = conf * 10 - needsFix * 1.2 + Math.min(t.split(/\\s+/).length, 14) * 0.04;
      if(score > bestScore){ bestScore = score; best = t; }
    }
    return best;
  }
  /* 开一轮识别。Chromium 会时不时自己结束，所以 onend 里要能接上 */
  function startRec(){
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    try{ rec = new SR(); }catch(e){
      srBroken = true;
      setVoiceHint("Voice input failed to start. Please type your answer.", "听写初始化失败，请用键盘输入。");
      return;
    }
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;          /* 多要几个候选，挑最像的 */
    rec.onresult = function(ev){
      var fin = "", mid = "";
      for(var i = 0; i < ev.results.length; i++){
        var seg = ev.results[i];
        if(seg.isFinal){
          var bt = pickBest(seg);
          fin += (bt || String((seg[0] && seg[0].transcript) || "")) + " ";
        }else{
          mid += String((seg[0] && seg[0].transcript) || "") + " ";
        }
      }
      /* recDone 存着上一轮已经识别出来的内容：浏览器自己结束一轮时不会丢掉前面说过的词 */
      recFinal = (recDone + " " + fin).replace(/\\s+/g, " ").trim();
      var live = (recFinal + " " + mid).replace(/\\s+/g, " ").trim();
      var next = (recPrefix ? recPrefix + " " + live : live).replace(/\\s+/g, " ").trim();
      /* 只有「文字真的变了」才刷新静音计时：环境噪音引起的回调不算说话 */
      if(next !== recText){
        recText = next;
        $("answerBox").value = next;
        lastVoiceAt = Date.now();
        spokeOnce = true;
        if(autoT){ clearPending(); }
      }
    };
    rec.onerror = function(ev){
      var e = (ev && ev.error) || "";
      if(e === "no-speech"){
        /* 只是这一轮没听到声音，别把整次收音结束掉 */
        if(ST.phase === "listening") setTimeout(softRestart, 120);
        return;
      }
      if(e === "aborted") return;
      if(e === "not-allowed" || e === "service-not-allowed"){
        setVoiceHint("Microphone is blocked. Allow it in the address bar and try again.", "麦克风被拒绝：点地址栏左边的锁图标允许后重试。");
        micCheck();
        return;
      }
      if(e === "network"){
        srBroken = true;
        setVoiceHint("Speech recognition needs the internet. Please type your answer.", "听写需要联网（HanLin 的声音不需要）。已切回键盘输入。");
        showMicWarn("听写连不上（多半是浏览器不是 Edge）",
          "语音听写要用 <b>Edge</b> 才稳。如果现在开的是 Chrome 或别的浏览器，请改用文件夹里的 <b>启动采访-不询问麦克风.bat</b> 重新打开。<br>"
          + "现在也可以直接用键盘输入答案，采访的其他功能都正常。", false);
        return;
      }
      setVoiceHint("Voice input had a problem. Please type your answer.", "听写出错：" + e + "，可改用键盘输入。");
    };
    rec.onend = function(){
      /* 还在收音时间里，浏览器自己结束了一轮 —— 自动接上，别让学生白说一次 */
      if(ST.phase === "listening" && Date.now() - listenStart < voiceCfg.max * 1000){
        setTimeout(softRestart, 80);
        return;
      }
      endListen();
    };
    try{ rec.start(); }catch(e){ setTimeout(function(){ try{ rec.start(); }catch(e2){ endListen(); } }, 250); }
  }
  function softRestart(){
    if(ST.phase !== "listening") return;
    if(++restartCount > 60){ endListen(); return; }
    recDone = recFinal;                 /* 接上下一轮之前，先记住这一轮已经听到的 */
    if(rec){
      var r = rec; rec = null;
      r.onend = null; r.onerror = null; r.onresult = null;
      try{ r.stop(); }catch(e){}
    }
    startRec();
  }
  /*VOICE-END*/

`;
html = html.replace(/  function beginListen\(\)\{/, core + '  function beginListen(){');

/* ---------- 6. 重写 beginListen：用新的 startRec + 等待开口 ---------- */
const newBegin = `  function beginListen(){
    if(!voiceOn) return;
    if(srBroken){ setVoiceHint("Voice input is unavailable. Please type your answer.", "听写已停止：这个环境听不了英语，请用键盘输入。"); return; }
    if(!srSupported()){
      srBroken = true;
      setVoiceHint("This browser cannot listen. Please open with Edge, or type the answer.", "这个浏览器不支持听写，请改用 Edge 或键盘输入。");
      return;
    }
    stopAudio();
    recPrefix = String($("answerBox").value || "").trim();
    recFinal = "";
    recDone = "";
    recText = recPrefix;
    listenStart = Date.now();
    lastVoiceAt = Date.now();
    lastLoudAt = 0;
    micPeak = 0;
    meterSeen = false;
    spokeOnce = false;
    restartCount = 0;
    meterOpen();
    startRec();
    ST.phase = "listening";
    wave(true);
    setVoiceHint("");
    setStatus("Listening… speak English now. When you finish, pause " + voiceCfg.silence.toFixed(1) + "s.");
    setHint("");
    buttons({ mic: true, micLabel: "■ Stop", micRec: true, boxDisabled: false });
    clearInterval(watchT);
    watchT = setInterval(function(){
      if(ST.phase !== "listening"){ clearInterval(watchT); watchT = 0; return; }
      var now = Date.now();
      /* 实时音量：既能判断学生是否真的开口，也让学生看到「它听得见」 */
      var lvl = meterLevel();
      if(lvl >= 0){
        meterSeen = true;
        $("wave").classList.toggle("loud", lvl >= LOUD);
        if(lvl >= LOUD){ lastLoudAt = now; if(lvl > micPeak) micPeak = lvl; }
      }
      /* 一个字都还没出现：等学生开口，等到「等待开口」为止 */
      if(!spokeOnce && recText === recPrefix){
        if(now - listenStart > voiceCfg.wait * 1000) endListen();
        return;
      }
      if(now - lastVoiceAt > voiceCfg.max * 1000){ endListen(); return; }
      if(now - lastVoiceAt > voiceCfg.silence * 1000) endListen();
    }, 200);
  }
  function endListen(){`;
html = html.replace(/  function beginListen\(\)\{[\s\S]*?\n  function endListen\(\)\{/, newBegin);

/* ---------- 7. endListen：区分「没声音」和「有声音没听清」 ---------- */
html = html.replace(
  /  function endListen\(\)\{\n    clearInterval\(watchT\); watchT = 0;\n    wave\(false\);\n    if\(rec\)\{ var r = rec; rec = null; r\.onend = null; try\{ r\.stop\(\); \}catch\(e\)\{\} \}/,
  `  function endListen(){
    clearInterval(watchT); watchT = 0;
    wave(false);
    $("wave").classList.remove("loud");
    meterClose();
    if(rec){
      var r = rec; rec = null;
      r.onend = null; r.onerror = null; r.onresult = null;
      try{ r.stop(); }catch(e){}
    }`
);
html = html.replace(
  /      say\(SCRIPT\.notCaught, "抱歉，我没听清，请再说一遍。"\);\n      setHint\(""\);\n      setStatus\(""\);/,
  `      say(SCRIPT.notCaught, "抱歉，我没听清，请再说一遍。");
      setHint("");
      setStatus("");
      if(meterSeen && micPeak < 0.02){
        setAdminStatus("这一轮麦克风几乎没收到声音：检查麦克风有没有插好 / 被静音，或换个输入设备。");
      }else if(micPeak >= LOUD){
        setAdminStatus("听到了声音但没转成文字：让学生靠近麦克风、放慢语速；也可以把「静音判定」调大一点再试。");
      }`
);

for (const [name, re] of [
  ['配置项', /var voiceCfg = \{ silence: 1\.5, submit: 0\.5, max: 30, wait: 15 \};/],
  ['等待开口按钮', /<button class="btn" id="aWait">等待开口：15s<\/button>/],
  ['按钮刷新', /\$\("aWait"\)\.textContent = "等待开口："/],
  ['按钮循环', /\$\("aWait"\)\.addEventListener\("click"/],
  ['配置持久化', /if\(typeof vp\.wait === "number"\) voiceCfg\.wait = vp\.wait;/],
  ['电平样式', /\.wave\.loud i\{background:#22c55e\}/],
  ['电平模块', /function meterLevel\(\)\{/],
  ['候选择优', /function pickBest\(seg\)\{/],
  ['自动续听', /function softRestart\(\)\{/],
  ['多候选', /rec\.maxAlternatives = 5;/],
  ['no-speech 续听', /if\(e === "no-speech"\)\{/],
  ['等待开口逻辑', /if\(now - listenStart > voiceCfg\.wait \* 1000\) endListen\(\);/],
  ['诊断提示', /这一轮麦克风几乎没收到声音/],
  ['电平可用标记', /meterSeen = true;/],
  ['变量声明', /var listenStart = 0, restartCount = 0, spokeOnce = false, micPeak = 0, lastLoudAt = 0, recDone = "";/],
  ['跨轮累积', /recFinal = \(recDone \+ " " \+ fin\)/],
  ['续听前存档', /recDone = recFinal;/],
  ['电平释放', /meterClose\(\);/]
]) {
  if (!re.test(html)) throw new Error('校验失败：' + name);
}
if((html.match(/VOICE-START/g) || []).length !== 1) throw new Error('语音层注入多次');

writeFileSync(PKG, html);
writeFileSync(`${ROOT}/outputs/HanLin采访-离线版.html`, html);
console.log('语音升级已注入：%s KB -> %s KB', (before / 1024).toFixed(0), (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0));
