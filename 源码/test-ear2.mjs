/* 补测：① 收不到声音时自动换设备 ② Windows 层面被拦时的提示 */
import { createRequire } from 'node:module';
import http from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const URL = 'file:///' + `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;
const PORT = 8822;

let calls = 0;
const srv = http.createServer((req, res) => {
  let ch = []; req.on("data", c => ch.push(c));
  req.on("end", () => {
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" }); res.end(); return; }
    calls++;
    res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
    res.end(JSON.stringify({ text: "We both like music." }));
  });
});
await new Promise(r => srv.listen(PORT, "127.0.0.1", r));

const INIT_BASE = function (blockMic) {
  window.__lvlMap = { devA: 0, devB: 0 }; window.__gains = [];
  window.__setDev = function (id, v) { window.__lvlMap[id] = v; window.__gains.forEach(g => { if (g.id === id) { try { g.gain.gain.value = v; } catch (e) {} } }); };
  window.__setLevel = function (v) { window.__setDev("devB", v); };
  function AC() { return window.AudioContext || window.webkitAudioContext; }
  function makeStream(id) {
    const ctx = window.__actx || (window.__actx = new (AC())());
    try { ctx.resume(); } catch (e) {}
    const osc = ctx.createOscillator(); osc.frequency.value = 440;
    const gain = ctx.createGain(); gain.gain.value = window.__lvlMap[id] || 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain); gain.connect(dest); osc.start();
    const rec = { id: id, gain: gain, osc: osc };
    window.__gains.push(rec);
    try { dest.stream.getAudioTracks()[0].addEventListener("ended", function () { try { osc.stop(); } catch (e) {} const i = window.__gains.indexOf(rec); if (i >= 0) window.__gains.splice(i, 1); }); } catch (e) {}
    return dest.stream;
  }
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true, writable: true,
    value: function (c) {
      if (blockMic) {
        const e = new Error("Permission denied by system");
        e.name = "NotAllowedError";
        return Promise.reject(e);
      }
      const id = (c && c.audio && c.audio.deviceId && c.audio.deviceId.exact) || "devA";
      return Promise.resolve(makeStream(id));
    }
  });
  Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
    configurable: true, writable: true,
    value: function () {
      return Promise.resolve([
        { kind: "audioinput", deviceId: "devA", label: "蓝牙耳机麦克风", groupId: "g1" },
        { kind: "audioinput", deviceId: "devB", label: "笔记本内置麦克风", groupId: "g1" }
      ]);
    }
  });
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query = function (d) {
      if (d && d.name === "microphone") return Promise.resolve({ state: "granted", onchange: null });
      return Promise.resolve({ state: "granted", onchange: null });
    };
  }
  window.__srInsts = 0;
  function FakeSR() { window.__srInsts++; window.__lastSR = this; }
  FakeSR.prototype.start = function () { this.started = true; };
  FakeSR.prototype.stop = function () { this.stopped = true; var h = this.onend; if (h) setTimeout(() => h({}), 0); };
  window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  try {
    localStorage.setItem("hanlin.offline.voice.v1", JSON.stringify({ on: true, auto: false, silence: 1.0, submit: 0, max: 30, wait: 4 }));
    localStorage.setItem("hanlin.offline.stt.v1", JSON.stringify({ on: true, preset: "custom", url: "http://127.0.0.1:" + 8822 + "/v1/audio/transcriptions", model: "t", key: "k", timeout: 8 }));
    localStorage.removeItem("hanlin.offline.mic.v1");
  } catch (e) {}
};

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const browser = await chromium.launch({ executablePath: EDGE, args: ["--autoplay-policy=no-user-gesture-required"] });
const patch = s => String(s).replace(/\s+/g, " ").trim().slice(0, 74);

/* ================= ① 收不到声音 → 自动换设备 ================= */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(INIT_BASE, false);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(3200);   /* 等自动挑设备跑完 */
  const picked = await page.evaluate(() => localStorage.getItem("hanlin.offline.mic.v1"));
  console.log("【① 自动换设备】");
  console.log("   开课时挑中：" + picked + "（两个设备都没声音时应挑第一个）");
  await page.evaluate(() => { const a = document.getElementById("admin"); a.style.transform = "translateY(0)"; a.style.display = "flex"; });
  await page.click("#aStart");
  for (let i = 0; i < 50; i++) { const v = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; }); if (v) break; await page.waitForTimeout(400); }
  await page.click("#btnContinue");
  for (let i = 0; i < 60; i++) { const v = await page.evaluate(() => /^Listening/.test(document.getElementById("status").textContent)); if (v) break; await page.waitForTimeout(300); }
  console.log("   开始听：" + patch(await page.evaluate(() => document.getElementById("status").textContent)));
  /* 模拟：学生正在说，但当前这个麦收不到（devB 才有声音）→ 等到「等待开口」超时后应自动换到 devB */
  await page.evaluate(() => window.__setDev("devB", 0.5));
  await page.waitForTimeout(7000);
  const sw = await page.evaluate(() => ({
    cfg: localStorage.getItem("hanlin.offline.mic.v1"),
    admin: document.getElementById("aStatus").textContent,
    listening: /^Listening/.test(document.getElementById("status").textContent),
    srInsts: window.__srInsts
  }));
  console.log("   换设备后配置：" + sw.cfg);
  console.log("   控制条：" + patch(sw.admin));
  console.log("   还在同一题继续听：" + sw.listening + "（浏览器听写启动 " + sw.srInsts + " 次，应为 0）");
  /* 换完之后（已经在 devB 上）学生说完 → 应该能正常收上去 */
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__setLevel(0));
  await page.waitForTimeout(3500);
  const done = await page.evaluate(() => ({
    box: document.getElementById("answerBox").value,
    bubble: document.getElementById("bubbleText").textContent.trim(),
    recs: JSON.parse(localStorage.getItem("hanlin.offline.records.v1") || "[]").map(r => r.src + ":" + r.answer)
  }));
  console.log("   换设备后答题：" + JSON.stringify(done.box) + " → " + patch(done.bubble));
  console.log("   记录：" + JSON.stringify(done.recs) + "  报错：" + JSON.stringify(errs));
  await ctx.close();
}

/* ================= ② Windows 层面被拦 ================= */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(INIT_BASE, true);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(3600);
  const b = await page.evaluate(() => {
    const w = document.getElementById("micWarn");
    const box = w.querySelector(".mwBox");
    return {
      shown: w.classList.contains("show"),
      title: document.getElementById("mwTitle").textContent,
      body: document.getElementById("mwBody").textContent,
      winBtn: document.getElementById("mwWin").style.display !== "none",
      info: box.classList.contains("info")
    };
  });
  console.log("\n【② Windows 层面被拦】");
  console.log("   提示条出现：" + b.shown + "（红色警报=" + (!b.info) + "）");
  console.log("   标题：" + b.title);
  console.log("   正文：" + patch(b.body));
  console.log("   有「打开 Windows 麦克风设置」按钮：" + b.winBtn);
  console.log("   报错：" + JSON.stringify(errs));
  await ctx.close();
}

await browser.close();
srv.close();
