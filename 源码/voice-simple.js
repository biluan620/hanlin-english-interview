  /* ---------- 语音输入：点 Answer 说话，浏览器自己听写，说完自动提交 ---------- */
  var VKEY = "hanlin.offline.voice.v1";
  var rec = null, autoT = 0, watchT = 0, typeT = 0;
  var recText = "", recFinal = "", recPrefix = "", recDone = "";
  var voiceOn = true, autoNext = false, srBroken = false;
  /* silence：说完停多久算一句；submit：识别完之后再等几秒才发出；
     max：一次最长听多久；wait：等学生开口最多等多久 */
  var voiceCfg = { silence: 1.5, submit: 0.5, max: 30, wait: 15 };
  var lastVoiceAt = 0, pendingLeft = 0, listenStart = 0, restartCount = 0, spokeOnce = false;
  var lastRaw = "";

  function srSupported(){ return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  /* 学生画面上只出现英文；中文说明放到老师控制条上 */
  function setVoiceHint(en, cn){ $("voiceHint").textContent = en || ""; if(cn) setAdminStatus(cn); }
  function wave(on){ $("wave").classList.toggle("on", !!on); }
  function micLabel(){ return "🎤 Answer"; }
  function saveVoicePref(){
    try{ localStorage.setItem(VKEY, JSON.stringify({ on: voiceOn, auto: autoNext, silence: voiceCfg.silence, submit: voiceCfg.submit, max: voiceCfg.max, wait: voiceCfg.wait })); }catch(e){}
  }
  function syncVoiceButtons(){
    $("aVoice").textContent = "语音输入：" + (voiceOn ? "开" : "关");
    $("aAuto").textContent = "自动连播：" + (autoNext ? "开" : "关");
    $("aSilence").textContent = "静音判定：" + voiceCfg.silence.toFixed(1) + "s";
    $("aSubmit").textContent = "说完等：" + voiceCfg.submit.toFixed(1) + "s";
    $("aWait").textContent = "等待开口：" + voiceCfg.wait.toFixed(0) + "s";
  }
  function clearPending(){ if(autoT){ clearTimeout(autoT); autoT = 0; } pendingLeft = 0; clearTimeout(typeT); }
  /* 键盘输入：停手 max(静音判定, 2 秒) 再走"说完等"倒计时，避免打字中间的停顿被提前发出去 */
  function scheduleTypingSubmit(){
    clearTimeout(typeT);
    typeT = setTimeout(function(){ if(ST.phase === "asking") scheduleSubmit(); }, Math.max(voiceCfg.silence, 2.0) * 1000);
  }
  function tickPending(){
    if(pendingLeft <= 0){
      clearPending();
      if(ST.phase === "asking") submitAnswer();
      return;
    }
    setStatus("Sending in " + pendingLeft.toFixed(1) + "s… press Send to send now");
    pendingLeft = Math.round((pendingLeft - 0.5) * 10) / 10;
    autoT = setTimeout(tickPending, 500);
  }
  function scheduleSubmit(){
    clearPending();
    if(voiceCfg.submit <= 0){ if(ST.phase === "asking") submitAnswer(); return; }
    pendingLeft = voiceCfg.submit;
    tickPending();
  }

  /* 浏览器会给多个候选，挑最像学生真正说的那一句 */
  function pickBest(seg){
    var best = "", bestScore = -1e9, k;
    for(k = 0; k < seg.length && k < 5; k++){
      var alt = seg[k];
      if(!alt) continue;
      var t = String(alt.transcript || "").replace(/\s+/g, " ").trim();
      if(!t) continue;
      var conf = (typeof alt.confidence === "number" && alt.confidence > 0) ? alt.confidence : 0.6;
      var needsFix = 0;
      try{ needsFix = fixSentence(t).changed ? 1 : 0; }catch(e){}
      var score = conf * 10 - needsFix * 1.2 + Math.min(t.split(/\s+/).length, 14) * 0.04;
      if(score > bestScore){ bestScore = score; best = t; }
    }
    return best;
  }
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
    rec.maxAlternatives = 5;
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
      recFinal = (recDone + " " + fin).replace(/\s+/g, " ").trim();
      var live = (recFinal + " " + mid).replace(/\s+/g, " ").trim();
      var next = (recPrefix ? recPrefix + " " + live : live).replace(/\s+/g, " ").trim();
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
      /* 浏览器常在没人说话时自己结束一轮 —— 自动接上，别让学生白说一次 */
      if(ST.phase === "listening" && Date.now() - listenStart < voiceCfg.max * 1000){ setTimeout(softRestart, 80); return; }
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
  function beginListen(){
    if(!voiceOn) return;
    if(srBroken){ setVoiceHint("Voice input is unavailable. Please type your answer.", "听写已停止：这个环境听不了英语，请用键盘输入。"); return; }
    if(!srSupported()){
      srBroken = true;
      setVoiceHint("This browser cannot listen. Please open with Edge, or type the answer.", "这个浏览器不支持听写，请改用 Edge 或键盘输入。");
      return;
    }
    stopAudio();
    recPrefix = String($("answerBox").value || "").trim();
    recFinal = ""; recDone = ""; recText = recPrefix;
    listenStart = Date.now(); lastVoiceAt = Date.now(); spokeOnce = false; restartCount = 0;
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
      /* 一个字都还没出现：等学生开口，等到「等待开口」为止 */
      if(!spokeOnce && recText === recPrefix){
        if(now - listenStart > voiceCfg.wait * 1000) endListen();
        return;
      }
      if(now - lastVoiceAt > voiceCfg.max * 1000){ endListen(); return; }
      if(now - lastVoiceAt > voiceCfg.silence * 1000) endListen();
    }, 200);
  }
  function endListen(){
    clearInterval(watchT); watchT = 0;
    wave(false);
    if(rec){
      var r = rec; rec = null;
      r.onend = null; r.onerror = null; r.onresult = null;
      try{ r.stop(); }catch(e){}
    }
    if(ST.phase !== "listening") return;
    ST.phase = "asking";
    var t = String($("answerBox").value || recText || "").replace(/\s+/g, " ").trim();
    buttons({ mic: true, micLabel: micLabel(), send: true, boxDisabled: false });
    if(!t){
      say(SCRIPT.notCaught, "抱歉，我没听清，请再说一遍。");
      setHint("");
      setStatus("");
      setAdminStatus("这一轮没听清：让学生靠近麦克风、放慢语速；也可以把「静音判定」调大一点再试。");
      play("notcaught", function(){
        if(ST.qi < 0) return;
        say(SCRIPT.questions[ST.qi], cnFor(ST.qi));
        setHint("Press Answer and try again.");
      });
      return;
    }
    setHint("Got it. You can keep editing, or press Send.");
    lastRaw = t;   /* 原生识别文本，原样留档，不做任何修改 */
    scheduleSubmit();
  }
