/* 耳朵层测试：用「可控音量的假麦克风 + 假云端识别服务」跑完整链路 */
import { createRequire } from 'node:module';
import http from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const URL = 'file:///' + `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;
const PORT = 8821;

/* ---- 假云端识别服务 ---- */
let lastReq = null, mode = "ok", calls = 0;
const srv = http.createServer((req, res) => {
  let chunks = [];
  req.on("data", c => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST" });
      res.end();
      return;
    }
    if (req.url.indexOf("/v1/audio/transcriptions") === 0) {
      calls++;
      lastReq = { auth: req.headers.authorization || "", ctype: req.headers["content-type"] || "", body };
      if (mode === "fail") {
        res.writeHead(500, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
        res.end('{"error":"boom"}');
        return;
      }
      res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "My partner is taller than me." }));
      return;
    }
    res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
    res.end("no");
  });
});
await new Promise(r => srv.listen(PORT, "127.0.0.1", r));

/* ---- 页面里注入：可控音量的假麦克风 + 假听写引擎 ---- */
const INIT = () => {
  window.__gains = [];
  window.__setLevel = function (v) { window.__gains.forEach(g => { try { g.gain.gain.value = v; } catch (e) {} }); };
  function AC() { return window.AudioContext || window.webkitAudioContext; }
  function makeStream(id) {
    const ctx = window.__actx || (window.__actx = new (AC())());
    try { ctx.resume(); } catch (e) {}
    const osc = ctx.createOscillator(); osc.frequency.value = 440;
    const gain = ctx.createGain(); gain.gain.value = (id === "devB" ? 0.5 : 0);
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain); gain.connect(dest); osc.start();
    const rec = { id: id, gain: gain, osc: osc, stream: dest.stream };
    window.__gains.push(rec);
    try {
      dest.stream.getAudioTracks()[0].addEventListener("ended", function () {
        try { osc.stop(); } catch (e) {}
        const i = window.__gains.indexOf(rec); if (i >= 0) window.__gains.splice(i, 1);
      });
    } catch (e) {}
    return dest.stream;
  }
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true, writable: true,
    value: function (c) {
      const id = (c && c.audio && c.audio.deviceId && c.audio.deviceId.exact) || "default";
      return Promise.resolve(makeStream(id));
    }
  });
  Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
    configurable: true, writable: true,
    value: function () {
      return Promise.resolve([
        { kind: "audioinput", deviceId: "devA", label: "蓝牙耳机麦克风（哑的）", groupId: "g1" },
        { kind: "audioinput", deviceId: "devB", label: "笔记本内置麦克风", groupId: "g1" },
        { kind: "audiooutput", deviceId: "spk", label: "扬声器", groupId: "g1" }
      ]);
    }
  });
  if (navigator.permissions && navigator.permissions.query) {
    const oq = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function (d) {
      if (d && d.name === "microphone") return Promise.resolve({ state: "granted", onchange: null });
      return oq(d);
    };
  }
  window.__srInsts = 0;
  function FakeSR() { window.__srInsts++; window.__lastSR = this; }
  FakeSR.prototype.start = function () { this.started = true; };
  FakeSR.prototype.stop = function () { this.stopped = true; var h = this.onend; if (h) setTimeout(() => h({}), 0); };
  window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
};

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(INIT);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await page.goto(URL);
await page.waitForTimeout(900);
if (errs.length) { console.log("!! 载入就报错：" + JSON.stringify(errs)); }
else console.log("载入无报错 ✓");

const patch = (s) => s.replace(/\s+/g, " ").trim().slice(0, 70);

/* 1) 面板：配置云端识别 */
await page.evaluate(() => { const a = document.getElementById("admin"); a.style.transform = "translateY(0)"; a.style.display = "flex"; });
await page.click("#aMic");
await page.waitForTimeout(2500);
const panel = await page.evaluate(() => ({
  status: document.getElementById("micStatusLine").textContent,
  rows: [...document.querySelectorAll("#micListBody tr")].slice(1).map(tr => [...tr.querySelectorAll("td")].map(td => td.textContent.trim()).slice(0, 2).join(" | ")),
  presets: [...document.querySelectorAll("#sttPreset option")].map(o => o.textContent)
}));
console.log("\n【1 面板】状态：" + panel.status);
console.log("   设备列表：" + JSON.stringify(panel.rows));
console.log("   服务预设：" + JSON.stringify(panel.presets));
await page.selectOption("#sttPreset", "custom");
await page.fill("#sttUrl", "http://127.0.0.1:" + PORT + "/v1/audio/transcriptions");
await page.fill("#sttModel", "test-asr");
await page.fill("#sttKey", "sk-test");
await page.fill("#sttTimeout", "8");
await page.click("#sttSave");
await page.waitForTimeout(300);
console.log("   保存后：" + patch(await page.evaluate(() => document.getElementById("micStatusLine").textContent + " / " + document.getElementById("micTestMsg").textContent)));
await page.click("#micClose");

/* 2) 自动挑设备：应该挑到能收到声音的 devB */
await page.waitForTimeout(2600);
const micCfg = await page.evaluate(() => localStorage.getItem("hanlin.offline.mic.v1"));
console.log("\n【2 自动挑麦克风】" + micCfg);

/* 3) 走一题：说话 → 静音 → 上传 → 点评 */
await page.click("#aStart");
for (let i = 0; i < 50; i++) { const v = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; }); if (v) break; await page.waitForTimeout(400); }
await page.click("#btnContinue");
for (let i = 0; i < 60; i++) { const v = await page.evaluate(() => /^Listening/.test(document.getElementById("status").textContent)); if (v) break; await page.waitForTimeout(300); }
console.log("\n【3 收音】状态：" + patch(await page.evaluate(() => document.getElementById("status").textContent)));
await page.waitForTimeout(600);
await page.evaluate(() => window.__setLevel(0.5));      /* 学生开始说 */
await page.waitForTimeout(900);
await page.evaluate(() => window.__setLevel(0));        /* 说完 */
await page.waitForTimeout(4500);
const after = await page.evaluate(() => ({
  box: document.getElementById("answerBox").value,
  bubble: document.getElementById("bubbleText").textContent.trim(),
  admin: document.getElementById("aStatus").textContent,
  recs: JSON.parse(localStorage.getItem("hanlin.offline.records.v1") || "[]")
}));
console.log("   识别框：" + JSON.stringify(after.box));
console.log("   屏幕台词：" + patch(after.bubble) + "  |  控制条：" + patch(after.admin));
console.log("   记录识别方式：" + JSON.stringify(after.recs.map(r => r.src)));

/* 4) 请求体检：是不是合法的 16k 单声道 WAV */
if (lastReq) {
  const b = lastReq.body;
  const at = b.indexOf(Buffer.from("RIFF"));
  const ok = at >= 0;
  console.log("\n【4 上传内容】次数 " + calls + " | Authorization=" + lastReq.auth.slice(0, 12) + " | " + (ok ? [
    "格式=" + b.slice(at + 8, at + 12).toString(),
    "声道=" + b.readUInt16LE(at + 22),
    "采样率=" + b.readUInt32LE(at + 24),
    "位深=" + b.readUInt16LE(at + 34),
    "字节=" + b.length,
    "model字段=" + (b.toString("latin1").indexOf("test-asr") >= 0)
  ].join(" ") : "没找到 RIFF"));
} else console.log("\n【4 上传内容】没有收到请求 ✗");

/* 5) 记录表 + CSV 有「识别方式」 */
await page.evaluate(() => { const a = document.getElementById("admin"); a.style.transform = "translateY(0)"; a.style.display = "flex"; });
await page.click("#aRecords");
await page.waitForTimeout(500);
const heads = await page.evaluate(() => [...document.querySelectorAll("#recBody th")].map(t => t.textContent));
console.log("\n【5 记录表头】" + JSON.stringify(heads));
await page.click("#rClose");
const dl = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
await page.click("#aRecords"); await page.waitForTimeout(300);
await page.click("#rExport");
const d = await dl;
let csvText = "";
if (d) { const p = await d.path(); csvText = (await import("node:fs")).readFileSync(p, "utf8"); }
console.log("   CSV 前两行：" + JSON.stringify(csvText.split(/\r?\n/).slice(0, 2).map(patch)));

/* 6) 回退：云端失败 → 自动改用浏览器听写 */
mode = "fail";
await page.click("#rClose");
await page.waitForTimeout(200);
for (let i = 0; i < 50; i++) { const v = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; }); if (v) break; await page.waitForTimeout(400); }
const srBefore = await page.evaluate(() => window.__srInsts);
await page.click("#btnContinue");
for (let i = 0; i < 60; i++) { const v = await page.evaluate(() => /^Listening/.test(document.getElementById("status").textContent)); if (v) break; await page.waitForTimeout(300); }
await page.waitForTimeout(700);
await page.evaluate(() => window.__setLevel(0.5));
await page.waitForTimeout(800);
await page.evaluate(() => window.__setLevel(0));
await page.waitForTimeout(4000);
const fb = await page.evaluate(() => ({
  sr: window.__srInsts,
  admin: document.getElementById("aStatus").textContent,
  hint: document.getElementById("voiceHint").textContent
}));
console.log("\n【6 回退】云端失败后，浏览器听写启动次数 " + srBefore + " → " + fb.sr);
console.log("   控制条：" + patch(fb.admin));

console.log("\n报错：" + JSON.stringify(errs));
await browser.close();
srv.close();
