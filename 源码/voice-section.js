  /* ---------- 语音输入：自己采音 + 云端识别，浏览器听写只作回退 ---------- */
  var VKEY = "hanlin.offline.voice.v1";
  var rec = null, autoT = 0, watchT = 0, typeT = 0;
  var recText = "", recFinal = "", recPrefix = "", recDone = "";
  var voiceOn = true, autoNext = false, srBroken = false;
  /* silence：说完停多久算一句；submit：识别完之后再等几秒才发出；
     max：一次最长录多久；wait：等学生开口最多等多久 */
  var voiceCfg = { silence: 1.5, submit: 0.5, max: 30, wait: 15 };
  var lastVoiceAt = 0, pendingLeft = 0, listenStart = 0, restartCount = 0;
  var spokeOnce = false, micPeak = 0, lastLoudAt = 0;
  var lastRaw = "";
  var ansSrc = "";              /* 这一句答案从哪里来：云端 / 浏览器 / 键盘 */
  function setSrc(v){ ansSrc = v; }

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
    if($("aMic")) $("aMic").textContent = "麦克风：" + (micCfg.auto ? "自动" : (micCfg.label || "手动")).slice(0, 12);
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

  /* ============================================================
     一、麦克风设备：枚举 / 逐个试听 / 自动挑选 / 自动切换
     ============================================================ */
  var MICKEY = "hanlin.offline.mic.v1";
  var micCfg = { auto: true, deviceId: "", label: "" };
  var micStream = null, micCtx = null, micSrcNode = null, micAn = null, micBuf = null, micProc = null, micGain = null;
  var LOUD = 0.075, meterSeen = false;
  var audCtxField = null;
  function loadMicCfg(){
    try{
      var o = JSON.parse(localStorage.getItem(MICKEY) || "null");
      if(o && typeof o === "object"){
        micCfg.auto = (o.auto !== false);
        micCfg.deviceId = String(o.deviceId || "");
        micCfg.label = String(o.label || "");
      }
    }catch(e){}
  }
  function saveMicCfg(){ try{ localStorage.setItem(MICKEY, JSON.stringify(micCfg)); }catch(e){} }

  function micConstraints(deviceId){
    var c = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
    if(deviceId) c.deviceId = { exact: deviceId };
    return c;
  }
  function micOpen(deviceId, cb){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ cb(false, null); return; }
    navigator.mediaDevices.getUserMedia({ audio: micConstraints(deviceId) })
      .then(function(st){ cb(true, st); })
      .catch(function(err){ cb(false, err); });
  }
  function micRms(an, buf){
    try{
      an.getByteTimeDomainData(buf);
      var s = 0, n = buf.length, i, v;
      for(i = 0; i < n; i += 2){ v = (buf[i] - 128) / 128; s += v * v; }
      return Math.min(1, Math.sqrt(s / (n / 2)) * 3.2);
    }catch(e){ return 0; }
  }
  /* 开着一条流听 ms 毫秒，返回这段时间里的峰值音量 */
  function micPeakOf(stream, ms, cb){
    var AC = window.AudioContext || window.webkitAudioContext, c = null, an = null;
    try{ c = new AC(); }catch(e){ cb(-1); return; }
    try{ c.resume(); }catch(e){}
    try{
      an = c.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.5;
      c.createMediaStreamSource(stream).connect(an);
      var buf = new Uint8Array(an.fftSize), mx = 0, t0 = Date.now();
      var tk = setInterval(function(){
        var v = micRms(an, buf);
        if(v > mx) mx = v;
        if(Date.now() - t0 >= ms){
          clearInterval(tk);
          try{ c.close(); }catch(e){}
          cb(mx);
        }
      }, 50);
    }catch(e){ try{ c.close(); }catch(e2){} cb(-1); }
  }
  function micList(cb){
    if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices){ cb([]); return; }
    navigator.mediaDevices.enumerateDevices().then(function(all){
      var ins = [];
      all.forEach(function(d){
        if(d.kind === "audioinput") ins.push({ id: d.deviceId, label: d.label || ("麦克风 " + (ins.length + 1)) });
      });
      cb(ins);
    }).catch(function(){ cb([]); });
  }
  /* 逐个打开试听；stopEarly=true 时一旦听到声音就不再往下试 */
  function micProbe(done, each, stopEarly){
    micList(function(list){
      var out = [], i = 0;
      if(!list.length){ done(out); return; }
      (function next(){
        if(i >= list.length){ done(out); return; }
        var d = list[i++];
        if(!d.id){ var r0 = { id: "", label: d.label, peak: -1 }; out.push(r0); if(each) each(r0); next(); return; }
        micOpen(d.id, function(ok, st){
          if(!ok){
            var r1 = { id: d.id, label: d.label, peak: -1 };
            out.push(r1); if(each) each(r1); next(); return;
          }
          micPeakOf(st, 600, function(p){
            try{ st.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}
            var r2 = { id: d.id, label: d.label, peak: p };
            out.push(r2); if(each) each(r2);
            if(stopEarly && p >= 0.03){ done(out); return; }
            next();
          });
        });
      })();
    });
  }
  /* 挑一个真能收到声音的设备 */
  function earChoose(cb){
    if(!micCfg.auto && micCfg.deviceId){ cb({ id: micCfg.deviceId, label: micCfg.label, peak: -2 }); return; }
    micProbe(function(list){
      var best = null;
      list.forEach(function(d){ if(d.peak >= 0 && (!best || d.peak > best.peak)) best = d; });
      if(best && best.peak >= 0.015){
        micCfg.deviceId = best.id; micCfg.label = best.label;
        saveMicCfg();
        cb(best);
      }else{
        cb(best || { id: "", label: "(系统默认)", peak: -1 });
      }
    }, null, true);
  }
  function micStreamStop(){
    try{ if(micStream) micStream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}
    micStream = null;
  }
  function micRelease(){
    earTeardownAudio();
    micStreamStop();
  }
  function meterClose(){ micRelease(); }
  /* 保证麦克风是开着的（整节课只开这一条流） */
  function ensureMic(cb, force){
    if(micStream){ if(cb) cb(true); return; }
    if(micPermState === "denied" && !force){ if(cb) cb(false, null); return; }
    var id = (!micCfg.auto && micCfg.deviceId) ? micCfg.deviceId : (micCfg.deviceId || "");
    micOpen(id, function(ok, st){
      if(ok){
        micStream = st;
        try{
          st.getTracks().forEach(function(t){
            t.addEventListener("ended", function(){ micStream = null; });
            var lb = String(t.label || "");
            if(lb) { micCfg.label = lb; if(!micCfg.auto) saveMicCfg(); }
          });
        }catch(e){}
      }else{
        micStream = null;
        var nm = String((st && st.name) || "");
        if(nm === "NotAllowedError" || nm === "SecurityError") micPermState = "denied";
        /* 选中的设备打不开就退回默认设备再试一次 */
        if(id){
          micOpen("", function(ok2, st2){
            if(ok2){ micStream = st2; }
            if(cb) cb(ok2, st2);
          });
          return;
        }
      }
      if(cb) cb(ok, st);
    });
  }
  /* 开课时体检：先要一次权限（顺便拿到设备名字），再挑一个能收声的 */
  function earBoot(cb){
    if(micPermState === "denied"){ refreshMicGate(false); if(cb) cb(null); return; }
    ensureMic(function(ok){
      if(!ok){ refreshMicGate(false); if(cb) cb(null); return; }
      earChoose(function(win){
        if(cb) cb(win);
      });
    }, true);
  }
  /* 上课中发现收不到声音：换一个能收声的设备（每题最多自动换一次） */
  function earSwitch(cb){
    var oldId = micCfg.deviceId;
    micStreamStop();
    micProbe(function(list){
      var best = null;
      list.forEach(function(d){
        if(d.id === oldId) return;
        if(d.peak >= 0.015 && (!best || d.peak > best.peak)) best = d;
      });
      if(!best){ cb(false, null); return; }
      micCfg.deviceId = best.id; micCfg.label = best.label;
      saveMicCfg();
      micOpen(best.id, function(ok, st){
        if(!ok){ cb(false, null); return; }
        micStream = st;
        syncVoiceButtons();
        cb(true, best);
      });
    }, null, true);
  }

  /* ============================================================
     二、录音（自己采音）→ 16kHz 单声道 WAV
     ============================================================ */
  var recChunks = [], recRate = 16000, recOn = false;
  var recTh = 0.02, recCalDone = false, recCalPeak = 0, recStartAt = 0;
  var earDone = false, earMode = false, earSwitched = 0;

  function earTeardownAudio(){
    recOn = false;
    try{ if(micProc) micProc.onaudioprocess = null; }catch(e){}
    try{ if(micProc) micProc.disconnect(); }catch(e){}
    try{ if(micSrcNode) micSrcNode.disconnect(); }catch(e){}
    try{ if(micGain) micGain.disconnect(); }catch(e){}
    try{ if(micAn) micAn.disconnect(); }catch(e){}
    try{ if(micCtx && micCtx.close) micCtx.close(); }catch(e){}
    micCtx = null; micAn = null; micBuf = null; micProc = null; micGain = null; micSrcNode = null;
  }
  function earStart(){
    if(!micStream) return false;
    earTeardownAudio();
    var AC = window.AudioContext || window.webkitAudioContext, c = null;
    try{ c = new AC({ sampleRate: 16000 }); }catch(e){ try{ c = new AC(); }catch(e2){ c = null; } }
    if(!c) return false;
    recRate = c.sampleRate || 16000;
    micCtx = c;
    try{
      micAn = c.createAnalyser(); micAn.fftSize = 1024; micAn.smoothingTimeConstant = 0.5;
      micBuf = new Uint8Array(micAn.fftSize);
      micProc = c.createScriptProcessor(4096, 1, 1);
      micGain = c.createGain(); micGain.gain.value = 0;
      micSrcNode = c.createMediaStreamSource(micStream);
      micSrcNode.connect(micAn);
      micSrcNode.connect(micProc);
      micProc.connect(micGain);
      micGain.connect(c.destination);
      recChunks = [];
      recOn = true;
      micProc.onaudioprocess = function(ev){
        if(!recOn) return;
        try{ recChunks.push(new Float32Array(ev.inputBuffer.getChannelData(0))); }catch(e){}
      };
      try{ c.resume(); }catch(e){}
      recCalDone = false; recCalPeak = 0; recTh = 0.02;
      return true;
    }catch(e){ earTeardownAudio(); return false; }
  }
  function micLevelNow(){
    if(!micAn || !micBuf) return -1;
    return micRms(micAn, micBuf);
  }
  /* 拼起来 → 裁掉首尾静音 → 重采样到 16k → 16bit PCM WAV */
  function earWav(chunks, rate){
    var i, total = 0;
    for(i = 0; i < chunks.length; i++) total += chunks[i].length;
    if(!total) return null;
    var all = new Float32Array(total), off = 0;
    for(i = 0; i < chunks.length; i++){ all.set(chunks[i], off); off += chunks[i].length; }
    var th = Math.max(0.006, recTh * 0.5), s = 0, e = total - 1;
    while(s < total && Math.abs(all[s]) < th) s++;
    while(e > s && Math.abs(all[e]) < th) e--;
    if(e - s < rate * 0.15) return null;
    var pad = Math.round(rate * 0.2);
    s = Math.max(0, s - pad); e = Math.min(total - 1, e + pad);
    var src = all.subarray(s, e + 1);
    var out = src, outRate = rate;
    if(Math.abs(rate - 16000) > 1){
      var ratio = rate / 16000, n = Math.floor(src.length / ratio);
      out = new Float32Array(n);
      for(i = 0; i < n; i++){
        var x = i * ratio, i0 = Math.floor(x), f = x - i0;
        out[i] = src[i0] * (1 - f) + (src[i0 + 1] === undefined ? src[i0] : src[i0 + 1]) * f;
      }
      outRate = 16000;
    }
    var n2 = out.length, buf = new ArrayBuffer(44 + n2 * 2), v = new DataView(buf);
    function ws(o, str){ for(var k = 0; k < str.length; k++) v.setUint8(o + k, str.charCodeAt(k)); }
    ws(0, "RIFF"); v.setUint32(4, 36 + n2 * 2, true); ws(8, "WAVEfmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, outRate, true); v.setUint32(28, outRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, "data"); v.setUint32(40, n2 * 2, true);
    for(i = 0; i < n2; i++){
      var y = out[i];
      if(y > 1) y = 1; else if(y < -1) y = -1;
      v.setInt16(44 + i * 2, y < 0 ? y * 0x8000 : y * 0x7FFF, true);
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  /* ============================================================
     三、云端识别
     ============================================================ */
  var STTKEY = "hanlin.offline.stt.v1";
  var STT_PRESETS = [
    ["siliconflow", "硅基流动 SenseVoice（推荐）", "https://api.siliconflow.cn/v1/audio/transcriptions", "FunAudioLLM/SenseVoiceSmall"],
    ["zhipu", "智谱 GLM ASR", "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions", "glm-asr"],
    ["custom", "自定义（任何 OpenAI 兼容接口）", "", ""]
  ];
  var sttCfg = { on: true, preset: "siliconflow", url: STT_PRESETS[0][2], model: STT_PRESETS[0][3], key: "", timeout: 12 };
  function sttPresetOf(id){
    for(var i = 0; i < STT_PRESETS.length; i++){ if(STT_PRESETS[i][0] === id) return STT_PRESETS[i]; }
    return STT_PRESETS[0];
  }
  function loadStt(){
    try{
      var o = JSON.parse(localStorage.getItem(STTKEY) || "null");
      if(o && typeof o === "object"){
        sttCfg.on = (o.on !== false);
        sttCfg.preset = String(o.preset || "siliconflow");
        sttCfg.url = String(o.url || "");
        sttCfg.model = String(o.model || "");
        sttCfg.key = String(o.key || "");
        sttCfg.timeout = Number(o.timeout) || 12;
      }
    }catch(e){}
    if(!sttCfg.url){ var p = sttPresetOf(sttCfg.preset); sttCfg.url = p[2]; sttCfg.model = sttCfg.model || p[3]; }
  }
  function saveStt(){ try{ localStorage.setItem(STTKEY, JSON.stringify(sttCfg)); }catch(e){} }
  /* 有地址、并且（有 Key 或明确选了自定义本地接口）才认为云端识别可用 */
  function sttReady(){ return !!(sttCfg.on && sttCfg.url && (sttCfg.key || sttCfg.preset === "custom")); }
  function sttLabel(){
    if(!sttReady()) return "浏览器听写";
    return "云端（" + (sttCfg.preset === "siliconflow" ? "硅基流动" : sttCfg.preset === "zhipu" ? "智谱 GLM" : "自定义") + "）";
  }
  function sttSend(blob, cb){
    var done = false;
    function fin(v){ if(done) return; done = true; cb(v); }
    var budget = Math.max(4, Number(sttCfg.timeout) || 12) * 1000;
    var ctl = null;
    try{ ctl = new AbortController(); }catch(e){}
    var hard = setTimeout(function(){ fin(null); }, budget + 900);
    if(ctl) setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, budget);
    var fd = new FormData();
    fd.append("file", blob, "answer.wav");
    fd.append("model", sttCfg.model || "whisper-1");
    var headers = {};
    if(sttCfg.key) headers.Authorization = "Bearer " + sttCfg.key;
    var opts = { method: "POST", headers: headers, body: fd };
    if(ctl) opts.signal = ctl.signal;
    fetch(sttCfg.url, opts)
      .then(function(r){
        if(!r.ok) return r.text().then(function(t){ throw new Error("HTTP " + r.status + " " + String(t).replace(/\s+/g, " ").slice(0, 90)); });
        return r.json();
      })
      .then(function(j){
        clearTimeout(hard);
        var t = "";
        if(typeof j === "string") t = j;
        else if(j && typeof j.text === "string") t = j.text;
        else if(j && j.data && typeof j.data.text === "string") t = j.data.text;
        else if(j && j.result && j.result[0] && typeof j.result[0].text === "string") t = j.result[0].text;
        t = String(t || "").replace(/\s+/g, " ").trim();
        fin((!t || t.length > 400) ? null : t);
      })
      .catch(function(){ clearTimeout(hard); fin(null); });
  }

  /* ============================================================
     四、浏览器听写（回退路径）—— 保留原逻辑
     ============================================================ */
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
      if(next !== recText){
        recText = next;
        $("answerBox").value = next;
        lastVoiceAt = Date.now();
        spokeOnce = true;
        setSrc("浏览器");
        if(autoT){ clearPending(); }
      }
    };
    rec.onerror = function(ev){
      var e = (ev && ev.error) || "";
      if(e === "no-speech"){ if(ST.phase === "listening") setTimeout(softRestart, 120); return; }
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
      if(e === "audio-capture"){
        if(ST.phase === "listening") setTimeout(softRestart, 250);
        return;
      }
      setVoiceHint("Voice input had a problem. Please type your answer.", "听写出错：" + e + "，可改用键盘输入。");
    };
    rec.onend = function(){
      if(ST.phase === "listening" && Date.now() - listenStart < voiceCfg.max * 1000){ setTimeout(softRestart, 80); return; }
      endListen();
    };
    try{ rec.start(); }catch(e){ setTimeout(function(){ try{ rec.start(); }catch(e2){ endListen(); } }, 250); }
  }
  function softRestart(){
    if(ST.phase !== "listening" || earMode) return;
    if(++restartCount > 60){ endListen(); return; }
    recDone = recFinal;
    if(rec){
      var r = rec; rec = null;
      r.onend = null; r.onerror = null; r.onresult = null;
      try{ r.stop(); }catch(e){}
    }
    startRec();
  }
  function watchSr(){
    clearInterval(watchT);
    watchT = setInterval(function(){
      if(ST.phase !== "listening" || earMode){ clearInterval(watchT); watchT = 0; return; }
      var now = Date.now();
      if(!spokeOnce && recText === recPrefix){
        if(now - listenStart > voiceCfg.wait * 1000) endListen();
        return;
      }
      if(now - lastVoiceAt > voiceCfg.max * 1000){ endListen(); return; }
      if(now - lastVoiceAt > voiceCfg.silence * 1000) endListen();
    }, 200);
  }

  /* ============================================================
     五、收音总入口：云端优先，失败自动回退到浏览器听写
     ============================================================ */
  function beginListen(forceSr){
    if(!voiceOn) return;
    var cloud = !forceSr && sttReady();
    if(!cloud && !srSupported()){
      srBroken = true;
      setVoiceHint("This browser cannot listen. Please type the answer.", "这个浏览器不支持听写，请改用 Edge 或键盘输入。");
      if(sttReady()) setAdminStatus("浏览器不支持听写，建议在「麦克风」面板里配置云端识别。");
      return;
    }
    stopAudio();
    recPrefix = String($("answerBox").value || "").trim();
    recFinal = ""; recDone = ""; recText = recPrefix;
    listenStart = Date.now(); lastVoiceAt = Date.now(); lastLoudAt = 0;
    micPeak = 0; meterSeen = false; spokeOnce = false; restartCount = 0;
    earDone = false; earSwitched = 0;
    earMode = cloud;
    ST.phase = "listening";
    wave(true);
    setVoiceHint("");
    setHint("");
    buttons({ mic: true, micLabel: "■ Stop", micRec: true, boxDisabled: false });
    clearInterval(watchT); watchT = 0;
    if(cloud){ setSrc("云端"); earRun(); return; }
    setSrc("浏览器");
    ensureMic(function(){});
    startRec();
    watchSr();
  }

  /* ---- 自己采音这条路 ---- */
  function earRun(){
    if(ST.phase !== "listening") return;
    if(!micStream){
      ensureMic(function(ok){
        if(!ok){ earFallback("麦克风打不开"); return; }
        earRun();
      });
      return;
    }
    if(!earStart()){ earFallback("录音初始化失败"); return; }
    setStatus("Listening… speak English now. When you finish, pause " + voiceCfg.silence.toFixed(1) + "s.");
    clearInterval(watchT);
    watchT = setInterval(function(){
      if(ST.phase !== "listening" || !earMode){ clearInterval(watchT); watchT = 0; return; }
      var now = Date.now();
      var lvl = micLevelNow();
      if(lvl >= 0){
        meterSeen = true;
        if(lvl > micPeak) micPeak = lvl;
        $("wave").classList.toggle("loud", lvl >= LOUD);
        /* 头 350 毫秒拿噪声底，之后定阈值 */
        if(!recCalDone){
          if(lvl > recCalPeak) recCalPeak = lvl;
          if(now - listenStart > 350){
            recCalDone = true;
            recTh = Math.min(0.08, Math.max(0.02, recCalPeak * 2.5));
          }
        }
      }
      if(lvl >= recTh){
        spokeOnce = true;
        lastVoiceAt = now;
        lastLoudAt = now;
      }
      if(spokeOnce){
        if(now - lastVoiceAt > voiceCfg.max * 1000){ earFinish(); return; }
        if(now - lastVoiceAt > voiceCfg.silence * 1000){ earFinish(); return; }
        return;
      }
      if(now - listenStart > voiceCfg.wait * 1000){
        /* 一句都没说：如果连声音都没有，就自动换一个麦克风继续听 */
        if(earSwitched < 1 && micCfg.auto && micPeak < Math.max(recTh * 0.6, 0.02)){
          earSwitched++;
          clearInterval(watchT); watchT = 0;   /* 换设备期间先停掉这个循环，免得又触发一次结束 */
          setAdminStatus("当前麦克风收不到声音，正在换一个试试…");
          earSwitch(function(ok, win){
            if(!ok){ endListen(); return; }
            setAdminStatus("已换成「" + win.label + "」继续听。");
            listenStart = Date.now(); lastVoiceAt = Date.now();
            micPeak = 0; meterSeen = false; recCalDone = false; recCalPeak = 0; recTh = 0.02;
            earRun();
          });
          return;
        }
        endListen();
      }
    }, 150);
  }
  function earFinish(){
    if(earDone) return;
    earDone = true;
    clearInterval(watchT); watchT = 0;
    wave(false);
    $("wave").classList.remove("loud");
    var chunks = recChunks.slice();
    earTeardownAudio();
    var blob = earWav(chunks, recRate);
    if(!blob){ endListen(); return; }
    setStatus("Recognizing…");
    setAdminStatus("云端识别中…");
    sttSend(blob, function(text){
      if(ST.phase !== "listening") return;
      if(!text){ earFallback("云端识别没成功"); return; }
      $("answerBox").value = text;
      recText = text;
      setSrc("云端");
      endListen();
    });
  }
  function earFallback(reason){
    earTeardownAudio();
    earMode = false;
    if(ST.phase !== "listening") return;
    setAdminStatus(reason + "，已自动改用浏览器听写。");
    if(srBroken || !srSupported()){
      earMode = false;
      setVoiceHint("Voice input is unavailable. Please type your answer.", "听写不可用，请用键盘输入。");
      endListen();
      return;
    }
    setSrc("浏览器");
    recPrefix = String($("answerBox").value || "").trim();
    recFinal = ""; recDone = ""; recText = recPrefix;
    listenStart = Date.now(); lastVoiceAt = Date.now(); spokeOnce = false; restartCount = 0;
    ensureMic(function(){});
    startRec();
    watchSr();
  }
  function endListen(){
    clearInterval(watchT); watchT = 0;
    wave(false);
    $("wave").classList.remove("loud");
    if(rec){
      var r = rec; rec = null;
      r.onend = null; r.onerror = null; r.onresult = null;
      try{ r.stop(); }catch(e){}
    }
    earTeardownAudio();
    earMode = false; earDone = false;
    if(ST.phase !== "listening") return;
    ST.phase = "asking";
    var t = String($("answerBox").value || recText || "").replace(/\s+/g, " ").trim();
    buttons({ mic: true, micLabel: micLabel(), send: true, boxDisabled: false });
    if(!t){
      say(SCRIPT.notCaught, "抱歉，我没听清，请再说一遍。");
      setHint("");
      setStatus("");
      if(meterSeen && micPeak < Math.max(recTh * 0.6, 0.015)){
        setAdminStatus("这一轮麦克风几乎没收到声音：点控制条上的「麦克风」看看哪个设备能收到声音。");
      }else if(micPeak >= recTh){
        setAdminStatus("听到了声音但没转成文字：让学生靠近麦克风、放慢语速；也可以把「静音判定」调大一点再试。");
      }
      play("notcaught", function(){
        if(ST.qi < 0) return;
        say(SCRIPT.questions[ST.qi], cnFor(ST.qi));
        setHint("Press Answer and try again.");
      });
      return;
    }
    setHint("Got it. You can keep editing, or press Send.");
    lastRaw = t;
    scheduleSubmit();
  }

  /* ============================================================
     六、老师面板：麦克风与识别
     ============================================================ */
  function micStatusLine(){
    var el = $("micStatusLine");
    if(!el) return;
    var dev = micCfg.auto ? ("自动挑选" + (micCfg.label ? "（" + micCfg.label + "）" : "")) : ("已锁定：" + (micCfg.label || micCfg.deviceId));
    el.textContent = "识别引擎：" + sttLabel() + "　·　麦克风：" + dev;
  }
  function micTestResult(msg, ok){
    var el = $("micTestMsg");
    if(!el) return;
    el.textContent = msg || "";
    el.style.color = ok ? "#166534" : "#b45309";
  }
  function renderMicList(){
    var box = $("micListBody");
    if(!box) return;
    box.innerHTML = '<div class="vHint" style="color:#33455f">正在检测所有麦克风，请稍等…（会逐个试听 0.6 秒）</div>';
    micProbe(function(list){
      var h = '<table class="rec"><tr><th style="width:46%">麦克风</th><th style="width:20%">测到的声音</th><th>结论 / 试听</th></tr>';
      if(!list.length) h += '<tr><td colspan="3">这台电脑没有检测到任何麦克风。</td></tr>';
      list.forEach(function(d, idx){
        var verdict = d.peak < 0 ? "打不开" : (d.peak >= 0.015 ? "能收到声音" : "几乎收不到");
        var color = d.peak >= 0.015 ? "#166534" : "#b45309";
        h += "<tr><td>" + esc(d.label) + "</td><td>" + (d.peak < 0 ? "—" : (d.peak * 100).toFixed(1)) + "</td><td>"
          + '<span style="color:' + color + ';font-weight:700">' + verdict + "</span> "
          + '<button class="btn" data-listen="' + idx + '" style="padding:2px 8px;font-size:12px">试听 3 秒</button>'
          + ' <button class="btn" data-pin="' + idx + '" style="padding:2px 8px;font-size:12px">锁定这个</button></td></tr>';
      });
      box.innerHTML = h + "</table>";
      micCache = list;
      Array.prototype.forEach.call(box.querySelectorAll("[data-listen]"), function(b){
        b.addEventListener("click", function(){
          var d = micCache[Number(this.getAttribute("data-listen"))];
          if(d) micPreview(d, this);
        });
      });
      Array.prototype.forEach.call(box.querySelectorAll("[data-pin]"), function(b){
        b.addEventListener("click", function(){
          var d = micCache[Number(this.getAttribute("data-pin"))];
          if(!d) return;
          micCfg.auto = false; micCfg.deviceId = d.id; micCfg.label = d.label;
          saveMicCfg(); syncVoiceButtons(); micStatusLine();
          micTestResult("已锁定：「" + d.label + "」。以后一直用它。", true);
        });
      });
    }, null, false);
  }
  var micCache = [];
  function micPreview(d, btn){
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = "听 3 秒…";
    micTestResult("对着麦克风说一句话（3 秒）…", true);
    micOpen(d.id, function(ok, st){
      if(!ok){ btn.disabled = false; btn.textContent = old; micTestResult("这个设备打不开：" + ((st && st.name) || ""), false); return; }
      var AC = window.AudioContext || window.webkitAudioContext, c = new AC();
      try{ c.resume(); }catch(e){}
      var an = c.createAnalyser(); an.fftSize = 1024;
      c.createMediaStreamSource(st).connect(an);
      var buf = new Uint8Array(an.fftSize), mx = 0, t0 = Date.now();
      var tk = setInterval(function(){
        var v = micRms(an, buf);
        if(v > mx) mx = v;
        var el = $("micTestBar");
        if(el) el.style.width = Math.min(100, Math.round(v * 260)) + "%";
        if(Date.now() - t0 >= 3000){
          clearInterval(tk);
          try{ st.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
          try{ c.close(); }catch(e){}
          if($("micTestBar")) $("micTestBar").style.width = "0%";
          btn.disabled = false; btn.textContent = old;
          micTestResult(mx >= 0.015
            ? "「" + d.label + "」能收到声音（峰值 " + (mx * 100).toFixed(1) + "），可以用这个。"
            : "「" + d.label + "」几乎收不到声音（峰值 " + (mx * 100).toFixed(1) + "）。换一个试试，或者把麦克风离近一点。", mx >= 0.015);
        }
      }, 80);
    });
  }
  function sttFill(){
    var sel = $("sttPreset");
    if(!sel) return;
    if(!sel.options.length){
      STT_PRESETS.forEach(function(p){
        var o = document.createElement("option");
        o.value = p[0]; o.textContent = p[1];
        sel.appendChild(o);
      });
    }
    sel.value = sttCfg.preset;
    $("sttUrl").value = sttCfg.url || "";
    $("sttModel").value = sttCfg.model || "";
    $("sttKey").value = sttCfg.key || "";
    $("sttTimeout").value = String(sttCfg.timeout || 12);
  }
  function sttRead(){
    sttCfg.preset = $("sttPreset").value;
    sttCfg.url = String($("sttUrl").value || "").trim();
    sttCfg.model = String($("sttModel").value || "").trim();
    sttCfg.key = String($("sttKey").value || "").trim();
    var t = Number($("sttTimeout").value);
    sttCfg.timeout = (t >= 4 && t <= 60) ? t : 12;
  }
  function openMicPanel(){
    micStatusLine();
    sttFill();
    micTestResult("", true);
    $("micPanel").classList.add("show");
    renderMicList();
  }
  function bindMicPanel(){
    $("aMic").addEventListener("click", openMicPanel);
    $("micClose").addEventListener("click", function(){ $("micPanel").classList.remove("show"); });
    $("micRedetect").addEventListener("click", renderMicList);
    $("micAuto").addEventListener("click", function(){
      micCfg.auto = !micCfg.auto;
      this.textContent = "自动挑选麦克风：" + (micCfg.auto ? "开" : "关");
      saveMicCfg(); syncVoiceButtons(); micStatusLine();
      micTestResult(micCfg.auto ? "已改成自动挑选：每次开课会自己找能收到声音的那个。" : "已改成手动：请在下面锁定一个麦克风。", true);
    });
    $("micRelock").addEventListener("click", function(){
      micCfg.auto = true; micCfg.deviceId = ""; micCfg.label = "";
      saveMicCfg(); syncVoiceButtons(); micStatusLine();
      $("micAuto").textContent = "自动挑选麦克风：开";
      renderMicList();
    });
    $("sttPreset").addEventListener("change", function(){
      var p = sttPresetOf(this.value);
      if(this.value !== "custom"){ $("sttUrl").value = p[2]; $("sttModel").value = p[3]; }
    });
    $("sttSave").addEventListener("click", function(){
      sttRead(); sttCfg.on = true; saveStt();
      micStatusLine();
      micTestResult(sttReady()
        ? "已保存，识别引擎：云端（" + ($("sttPreset").selectedOptions[0] || {}).textContent + "）。可以点「测试识别」验证。"
        : "地址填好了，但还没填 API Key。", sttReady());
    });
    $("sttOff").addEventListener("click", function(){
      sttCfg.on = false; saveStt(); micStatusLine();
      micTestResult("已关闭云端识别，改回浏览器听写。", true);
    });
    $("sttTest").addEventListener("click", function(){
      sttRead(); sttCfg.on = true; saveStt(); micStatusLine();
      var btn = this;
      if(!sttCfg.url){ micTestResult("请先填接口地址。", false); return; }
      if(!micStream){ micTestResult("麦克风还没打开，先点上面的「试听」允许一次麦克风。", false); return; }
      btn.disabled = true; btn.textContent = "请对着麦克风说一句话（3 秒）…";
      micTestResult("录音 3 秒，然后发给识别接口…", true);
      if(!earStart()){ btn.disabled = false; btn.textContent = "测试识别"; micTestResult("录音启动失败。", false); return; }
      setTimeout(function(){
        var chunks = recChunks.slice();
        earTeardownAudio();
        var blob = earWav(chunks, recRate);
        btn.textContent = "识别中…";
        sttSend(blob, function(text){
          btn.disabled = false; btn.textContent = "测试识别";
          micTestResult(text ? ("识别成功：「" + text + "」") : "没识别出文字。检查 Key / 网络，或换一个模型名。", !!text);
        });
      }, 3000);
    });
  }
  function earSettingsLoad(){
    loadMicCfg(); loadStt();
    if($("micAuto")) $("micAuto").textContent = "自动挑选麦克风：" + (micCfg.auto ? "开" : "关");
    micStatusLine();
  }
