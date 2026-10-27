  /* ---------- 麦克风体检 ----------
     学生"说了没反应"最常见的原因是浏览器没给麦克风权限。
     这里会主动弹一次授权，并把结果直接写在大屏幕上，老师一眼就知道该怎么办。 */
  var micState = "unknown";
  function micBox(){ return document.getElementById("micWarn"); }
  function showMicWarn(title, body, canRetry){
    var w = micBox();
    if(!w) return;
    document.getElementById("mwTitle").textContent = title;
    document.getElementById("mwBody").innerHTML = body;
    var rb = document.getElementById("mwRetry");
    rb.style.display = canRetry ? "" : "none";
    w.classList.add("show");
  }
  function hideMicWarn(){
    var w = micBox();
    if(w) w.classList.remove("show");
  }
  function micCheck(cb){
    if(!srSupported()){
      micState = "unsupported";
      showMicWarn("这个浏览器不能听英语",
        "听写要用 Edge 或 Chrome。请改用文件夹里的 <b>启动采访-不询问麦克风.bat</b> 打开，或者把默认浏览器换成 Edge 后重新双击本文件。",
        false);
      if(cb) cb(false);
      return;
    }
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      micState = "unknown";
      if(cb) cb(true);
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(st){
      try{ st.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); }catch(e){}
      micState = "ok";
      hideMicWarn();
      if(cb) cb(true);
    }).catch(function(err){
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
    });
  }
