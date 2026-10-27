/* 整体回归：默认（没配云端）时的行为 + 全部面板 + 三题完整流程 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const URL = 'file:///' + `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;

const INIT = () => {
  window.__lvl = 0.4; window.__gains = [];
  function AC() { return window.AudioContext || window.webkitAudioContext; }
  function makeStream() {
    const ctx = window.__actx || (window.__actx = new (AC())());
    try { ctx.resume(); } catch (e) {}
    const osc = ctx.createOscillator(); osc.frequency.value = 440;
    const gain = ctx.createGain(); gain.gain.value = window.__lvl;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain); gain.connect(dest); osc.start();
    const rec = { gain: gain, osc: osc };
    window.__gains.push(rec);
    try { dest.stream.getAudioTracks()[0].addEventListener("ended", function () { try { osc.stop(); } catch (e) {} const i = window.__gains.indexOf(rec); if (i >= 0) window.__gains.splice(i, 1); }); } catch (e) {}
    return dest.stream;
  }
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, writable: true, value: function () { return Promise.resolve(makeStream()); } });
  Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
    configurable: true, writable: true,
    value: function () { return Promise.resolve([{ kind: "audioinput", deviceId: "devA", label: "测试麦克风", groupId: "g1" }]); }
  });
  navigator.permissions.query = function () { return Promise.resolve({ state: "granted", onchange: null }); };
  window.__srInsts = 0;
  function FakeSR() { window.__srInsts++; window.__lastSR = this; }
  FakeSR.prototype.start = function () { this.started = true; };
  FakeSR.prototype.stop = function () { this.stopped = true; var h = this.onend; if (h) setTimeout(() => h({}), 0); };
  window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  try { localStorage.clear(); } catch (e) {}
};

const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(INIT);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await page.goto(URL);
await page.waitForTimeout(1200);
const patch = s => String(s).replace(/\s+/g, " ").trim().slice(0, 60);

const boot = await page.evaluate(() => ({
  art: [document.getElementById("artClosed").naturalWidth, document.getElementById("artMouth").naturalWidth],
  buttons: [...document.getElementById("admin").querySelectorAll("button")].map(b => b.textContent).filter(t => /麦克风|AI|等待|静音|说完/.test(t)),
  micBanner: document.getElementById("micWarn").classList.contains("show")
}));
console.log("【启动】人物 " + JSON.stringify(boot.art) + " | 提示条=" + boot.micBanner);
console.log("   按钮：" + JSON.stringify(boot.buttons));

await page.evaluate(() => { const a = document.getElementById("admin"); a.style.transform = "translateY(0)"; a.style.display = "flex"; });
await page.click("#aLib");
await page.waitForTimeout(900);
console.log("【错题库】" + patch(await page.evaluate(() => document.getElementById("libCount").textContent)));
await page.click("#libClose"); await page.waitForTimeout(200);
await page.click("#aAi");
await page.waitForTimeout(500);
console.log("【AI 面板】display=" + await page.evaluate(() => getComputedStyle(document.getElementById("aiPanel")).display));
await page.click("#aiCancel"); await page.waitForTimeout(200);
await page.click("#aMic");
await page.waitForTimeout(2200);
console.log("【麦克风面板】" + patch(await page.evaluate(() => document.getElementById("micStatusLine").textContent)));
await page.click("#micClose"); await page.waitForTimeout(200);

/* 默认没配云端 → 应该走浏览器听写 */
await page.click("#aStart");
for (let i = 0; i < 50; i++) { const v = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; }); if (v) break; await page.waitForTimeout(400); }
await page.click("#btnContinue");
for (let i = 0; i < 60; i++) { const v = await page.evaluate(() => window.__srInsts > 0); if (v) break; await page.waitForTimeout(300); }
console.log("\n【默认走浏览器听写】启动次数=" + await page.evaluate(() => window.__srInsts));
const results = [];
for (const ans of ["My partner is taller than me.", "He don't like music.", "I am more tall than him."]) {
  await page.fill("#answerBox", ans);
  await page.waitForTimeout(200);
  await page.click("#btnSend");
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => ({
    bubble: document.getElementById("bubbleText").textContent.trim(),
    nw: document.getElementById("fixNew").textContent.trim(),
    src: (JSON.parse(localStorage.getItem("hanlin.offline.records.v1") || "[]") || []).slice(-1)[0].src
  }));
  results.push(ans + "  →  " + patch(r.bubble) + " | 改句: " + patch(r.nw) + " | 来源: " + r.src);
  for (let i = 0; i < 50; i++) { const v = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; }); if (v) break; await page.waitForTimeout(400); }
  const last = await page.evaluate(() => document.getElementById("btnContinue").textContent);
  await page.click("#btnContinue");
  await page.waitForTimeout(2500);
  if (/Next group|结束/.test(last)) break;
}
console.log("\n【三题流程】");
results.forEach(r => console.log("   " + r));
console.log("\n报错：" + JSON.stringify(errs));
await browser.close();
