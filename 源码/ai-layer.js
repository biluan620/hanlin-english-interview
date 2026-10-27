  /* ============================================================
     AI 纠错层（可选）
     - 规则引擎先跑；规则没看出问题的句子，才交给 AI 复核
     - 接口走 OpenAI 兼容格式，在线（DeepSeek / Kimi / 智谱 / 通义 / 硅基流动）
       和本地（Ollama / LM Studio）都能用
     - 任何异常（没配、断网、超时、返回不合规）都静默回落到规则结果
     ============================================================ */
  var AI_KEY = "hanlin.offline.ai.v1";
  var AI_PRESETS = [
    ["deepseek", "DeepSeek（在线）", "https://api.deepseek.com/v1/chat/completions", "deepseek-chat"],
    ["kimi", "Kimi 月之暗面（在线）", "https://api.moonshot.cn/v1/chat/completions", "moonshot-v1-8k"],
    ["zhipu", "智谱 GLM（在线）", "https://open.bigmodel.cn/api/paas/v4/chat/completions", "glm-4-flash"],
    ["qwen", "通义千问（在线）", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "qwen-turbo"],
    ["silicon", "硅基流动（在线）", "https://api.siliconflow.cn/v1/chat/completions", "Qwen/Qwen2.5-7B-Instruct"],
    ["ollama", "本地 Ollama（免费、不用 Key）", "http://localhost:11434/v1/chat/completions", "qwen2.5:3b"],
    ["lmstudio", "本地 LM Studio（免费、不用 Key）", "http://localhost:1234/v1/chat/completions", "local-model"],
    ["custom", "自定义（任何 OpenAI 兼容接口）", "", ""]
  ];
  var aiCfg = { on: false, preset: "deepseek", url: "", model: "", key: "", timeout: 8, scope: "missed" };
  function aiPresetOf(id){
    for(var i = 0; i < AI_PRESETS.length; i++){ if(AI_PRESETS[i][0] === id) return AI_PRESETS[i]; }
    return AI_PRESETS[0];
  }
  function loadAi(){
    try{
      var o = JSON.parse(localStorage.getItem(AI_KEY) || "null");
      if(o && typeof o === "object"){
        aiCfg.on = !!o.on; aiCfg.preset = String(o.preset || "deepseek");
        aiCfg.url = String(o.url || ""); aiCfg.model = String(o.model || "");
        aiCfg.key = String(o.key || ""); aiCfg.timeout = Number(o.timeout) || 8;
        aiCfg.scope = (o.scope === "all") ? "all" : "missed";
      }
    }catch(e){}
    if(!aiCfg.url){ var p = aiPresetOf(aiCfg.preset); aiCfg.url = p[2]; aiCfg.model = aiCfg.model || p[3]; }
  }
  function saveAi(){
    try{ localStorage.setItem(AI_KEY, JSON.stringify(aiCfg)); }catch(e){}
  }
  function aiOn(){ return !!(aiCfg.on && aiCfg.url); }
  function aiLabel(){
    if(!aiCfg.on) return "AI 纠错：关";
    var p = aiPresetOf(aiCfg.preset);
    return "AI 纠错：开（" + (aiCfg.preset === "custom" ? "自定义" : p[1].replace("（在线）", "").replace("（免费、不用 Key）", "")) + "）";
  }
  function refreshAiBtn(){
    var b = document.getElementById("aAi");
    if(b) b.textContent = aiLabel();
  }

  /* 提示词写死：只判断语法，只改最小的一处，返回严格 JSON */
  var AI_SYS = [
    "You are an English teacher for Chinese junior-high students (Grade 8, CEFR A2).",
    "A student answered an interview question in English. Check the grammar of that answer.",
    "",
    "Rules:",
    "1. Fix the smallest thing possible. Keep the student's own words and word order. Never rewrite the sentence in your own style.",
    "2. Never change the meaning. Never add new information.",
    "3. If the sentence is acceptable English for a Grade-8 student, return ok=true, even if it is very simple or short.",
    "4. Output EXACTLY ONE JSON object and nothing else. No markdown, no explanation outside the JSON.",
    '   If it is fine:  {"ok":true}',
    '   If it has an error:  {"ok":false,"fixed":"<the corrected sentence>","why":"<\u4e00\u53e5\u4e2d\u6587\uff0c\u4e0d\u8d85\u8fc718\u5b57>"}'
  ].join("\n");

  /* AI 返回的内容必须过这几道关，否则一律丢掉。
     返回 {ok:true} = 模型认为这句没问题；{fixed:"..."} = 模型给出的改句；null = 不可用（连不上 / 格式不对 / 答案不合规） */
  function aiParse(raw, orig){
    var m = String(raw || "").match(/\{[\s\S]*\}/);
    if(!m) return null;
    var o;
    try{ o = JSON.parse(m[0]); }catch(e){ return null; }
    if(!o) return null;
    if(o.ok) return { ok: true };
    var f = String(o.fixed || "").replace(/\s+/g, " ").trim();
    if(!f) return null;
    if(/[\u4e00-\u9fff]/.test(f)) return null;                 // 不许夹中文
    if(/[?\uff1f]/.test(f)) return null;                        // 不许变成问句
    if(f.length > Math.max(30, String(orig).length * 2.2)) return null;  // 不许大改
    if(f.toLowerCase() === String(orig).trim().toLowerCase()) return { ok: true };
    return { fixed: f };
  }

  function aiRequest(text, cb, ms){
    var done = false;
    function fin(v){ if(done) return; done = true; cb(v); }
    var budget = Number(ms || aiCfg.timeout || 8) * 1000;
    var hard = setTimeout(function(){ fin(null); }, budget + 600);
    var ctl = null;
    try{ ctl = new AbortController(); }catch(e){}
    if(ctl) setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, budget);
    var headers = { "Content-Type": "application/json" };
    if(aiCfg.key) headers["Authorization"] = "Bearer " + aiCfg.key;
    var body = {
      model: aiCfg.model || "gpt-3.5-turbo",
      messages: [{ role: "system", content: AI_SYS }, { role: "user", content: String(text) }],
      temperature: 0, max_tokens: 200, stream: false
    };
    var opts = { method: "POST", headers: headers, body: JSON.stringify(body) };
    if(ctl) opts.signal = ctl.signal;
    fetch(aiCfg.url, opts)
      .then(function(r){
        if(!r.ok) return r.text().then(function(t){ throw new Error("HTTP " + r.status + " " + t.slice(0, 120)); });
        return r.json();
      })
      .then(function(j){
        clearTimeout(hard);
        var c = j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : "";
        fin({ raw: String(c || "") });
      })
      .catch(function(err){ clearTimeout(hard); fin({ err: String(err && err.message || err) }); });
  }

  /* 复核一句话：回调收到 {ok:true} / {fixed:"..."} / null（用不了 AI） */
  function aiCheck(text, cb){
    if(!aiOn()){ cb(null); return; }
    aiRequest(text, function(res){
      if(!res || res.err || !res.raw){ cb(null); return; }
      cb(aiParse(res.raw, text));
    });
  }

  /* ---------- 设置面板 ---------- */
  function aiFill(){
    var sel = document.getElementById("aiPreset");
    if(!sel.options.length){
      AI_PRESETS.forEach(function(p){
        var o = document.createElement("option");
        o.value = p[0]; o.textContent = p[1];
        sel.appendChild(o);
      });
    }
    sel.value = aiCfg.preset;
    document.getElementById("aiUrl").value = aiCfg.url || "";
    document.getElementById("aiModel").value = aiCfg.model || "";
    document.getElementById("aiKey").value = aiCfg.key || "";
    document.getElementById("aiTimeout").value = String(aiCfg.timeout || 8);
    document.getElementById("aiScope").value = (aiCfg.scope === "all") ? "all" : "missed";
  }
  function aiMsg(t, color){
    var el = document.getElementById("aiMsg");
    el.textContent = t || "";
    el.style.color = color || "#b45309";
  }
  function aiRead(){
    var sel = document.getElementById("aiPreset");
    aiCfg.preset = sel.value;
    aiCfg.url = String(document.getElementById("aiUrl").value || "").trim();
    aiCfg.model = String(document.getElementById("aiModel").value || "").trim();
    aiCfg.key = String(document.getElementById("aiKey").value || "").trim();
    var t = Number(document.getElementById("aiTimeout").value);
    aiCfg.timeout = (t >= 3 && t <= 60) ? t : 8;
    aiCfg.scope = (document.getElementById("aiScope").value === "all") ? "all" : "missed";
  }
  function openAi(){
    aiFill();
    aiMsg(aiCfg.on ? "AI 现在是开启的。" : "AI 现在是关闭的。填好下面两项就能开。", "#33455f");
    document.getElementById("aiPanel").classList.add("show");
  }
  function bindAi(){
    document.getElementById("aiPreset").addEventListener("change", function(){
      var p = aiPresetOf(this.value);
      if(this.value !== "custom"){
        document.getElementById("aiUrl").value = p[2];
        document.getElementById("aiModel").value = p[3];
      }
      aiMsg(this.value === "ollama" || this.value === "lmstudio"
        ? "本地模型：需要先在这台电脑上把 Ollama / LM Studio 打开，并把模型跑起来。"
        : "填好 API Key 后点「测试连接」。", "#33455f");
    });
    document.getElementById("aAi").addEventListener("click", openAi);
    document.getElementById("aiCancel").addEventListener("click", function(){
      document.getElementById("aiPanel").classList.remove("show");
    });
    document.getElementById("aiOff").addEventListener("click", function(){
      aiCfg.on = false; saveAi(); refreshAiBtn();
      aiMsg("已关闭 AI，HanLin 现在只用离线规则。", "#166534");
    });
    document.getElementById("aiSave").addEventListener("click", function(){
      aiRead();
      if(!aiCfg.url){ aiMsg("请先填接口地址。", "#b91c1c"); return; }
      aiCfg.on = true; saveAi(); refreshAiBtn();
      aiMsg("已保存并开启。可以点「测试连接」验证一下。", "#166534");
    });
    document.getElementById("aiTest").addEventListener("click", function(){
      var btn = this;
      aiRead();
      if(!aiCfg.url){ aiMsg("请先填接口地址。", "#b91c1c"); return; }
      var old = aiCfg.on;
      aiCfg.on = true;                       // 临时打开，让 aiRequest 能发出去
      btn.disabled = true; btn.textContent = "测试中…";
      aiMsg("正在连接 " + aiCfg.url + " …", "#33455f");
      aiRequest("I have many book.", function(res){
        aiCfg.on = old;
        btn.disabled = false; btn.textContent = "测试连接";
        if(!res){ aiMsg("没收到回应（超时）。", "#b91c1c"); return; }
        if(res.err){ aiMsg("连不上：" + res.err + "\n如果是本地模型，请确认它已经启动；如果是在线服务，检查 Key 和网络。", "#b91c1c"); return; }
        var r = aiParse(res.raw, "I have many book.");
        if(r && r.fixed){
          aiMsg("连接成功。示例：\"I have many book.\" → \"" + r.fixed + "\"", "#166534");
        }else if(r && r.ok){
          aiMsg("连接成功，模型也回话了。如果想看它改句的效果，可以拿一句明显有错的话再试。", "#166534");
        }else{
          aiMsg("连接成功，但模型的回答格式不对。可以换一个模型名再试（推荐带 instruct 的对话模型）。", "#b45309");
        }
      });
    });
  }
