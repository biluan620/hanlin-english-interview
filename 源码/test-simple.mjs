/* 回退后的验收：只剩浏览器听写这条路，一切照旧 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const URL = 'file:///' + `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;

const INIT = () => {
  window.__gum = 0;
  if (navigator.mediaDevices) {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true, writable: true,
      value: function () {
        window.__gum++;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const d = ctx.createMediaStreamDestination();
        return Promise.resolve(d.stream);
      }
    });
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      configurable: true, writable: true,
      value: function () { return Promise.resolve([{ kind: "audioinput", deviceId: "d1", label: "测试麦克风" }]); }
    });
  }
  window.__srStarts = 0;
  function FakeSR() { window.__last = this; }
  FakeSR.prototype.start = function () { this.started = true; window.__srStarts++; window.__last = this; };
  FakeSR.prototype.stop = function () { this.stopped = true; var h = this.onend; if (h) setTimeout(() => h({}), 0); };
  window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  window.__fire1 = function (txt) {
    const a = [{ transcript: txt, confidence: 0.95 }]; a.isFinal = true;
    const r = [a]; r.length = 1;
    if (window.__last && window.__last.onresult) window.__last.onresult({ results: r });
    else return "no rec";
    return "ok";
  };
  try { localStorage.clear(); } catch (e) {}
};

const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(INIT);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await page.goto(URL);
await page.waitForTimeout(1200);
const patch = s => String(s).replace(/\s+/g, " ").trim().slice(0, 66);

const boot = await page.evaluate(() => ({
  art: [document.getElementById("artClosed").naturalWidth, document.getElementById("artMouth").naturalWidth],
  buttons: [...document.getElementById("admin").querySelectorAll("button")].map(b => b.textContent),
  hasMicPanel: !!document.getElementById("micPanel"),
  hasMicBtn: !!document.getElementById("aMic")
}));
console.log("【启动】人物 " + JSON.stringify(boot.art) + " | 载入报错 " + errs.length);
console.log("   控制条按钮：" + JSON.stringify(boot.buttons.filter(t => /麦克风|AI|等待|静音|说完|语音/.test(t))));
console.log("   麦克风面板还在吗：" + boot.hasMicPanel + " | 麦克风按钮还在吗：" + boot.hasMicBtn);

await page.evaluate(() => { const a = document.getElementById("admin"); a.style.transform = "translateY(0)"; a.style.display = "flex"; });
await page.click("#aLib"); await page.waitForTimeout(900);
console.log("【错题库】" + patch(await page.evaluate(() => document.getElementById("libCount").textContent)));
await page.click("#libClose"); await page.waitForTimeout(200);
await page.click("#aAi"); await page.waitForTimeout(400);
console.log("【AI 面板】display=" + await page.evaluate(() => getComputedStyle(document.getElementById("aiPanel")).display));
await page.click("#aiCancel"); await page.waitForTimeout(200);

/* 走完整三题：用假听写喂答案 */
await page.click("#aStart");
for (let i = 0; i < 50; i++) { const v = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; }); if (v) break; await page.waitForTimeout(400); }
await page.click("#btnContinue");
const answers = ["My partner is taller than me.", "He don't like music.", "I am more tall than him."];
const out = [];
for (const ans of answers) {
  for (let i = 0; i < 80; i++) {
    const v = await page.evaluate(() => /^Listening/.test(document.getElementById("status").textContent) && !!(window.__last && window.__last.onresult));
    if (v) break;
    await page.waitForTimeout(300);
  }
  await page.evaluate(t => window.__fire1(t), ans);
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => ({
    box: document.getElementById("answerBox").value,
    bubble: document.getElementById("bubbleText").textContent.trim(),
    nw: document.getElementById("fixNew").textContent.trim(),
    recs: JSON.parse(localStorage.getItem("hanlin.offline.records.v1") || "[]")
  }));
  out.push(patch(ans) + "  →  " + patch(r.bubble) + (r.nw ? " | 改句: " + patch(r.nw) : ""));
  for (let i = 0; i < 50; i++) { const v = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; }); if (v) break; await page.waitForTimeout(400); }
  const vis = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; });
  if (!vis) { out.push("   （流程已结束，没再出现 Continue）"); break; }
  await page.click("#btnContinue");
  await page.waitForTimeout(2500);
}
console.log("\n【三题流程（语音）】");
out.forEach(o => console.log("   " + o));
console.log("   语音识别启动次数：" + await page.evaluate(() => window.__srStarts) + "，麦克风申请次数：" + await page.evaluate(() => window.__gum));

/* 记录 + CSV */
await page.evaluate(() => { const a = document.getElementById("admin"); a.style.transform = "translateY(0)"; a.style.display = "flex"; });
await page.click("#aRecords"); await page.waitForTimeout(500);
console.log("\n【记录表头】" + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("#recBody th")].map(t => t.textContent))));
const dl = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
await page.click("#rExport");
const d = await dl;
let csvText = "";
if (d) { const p = await d.path(); csvText = (await import("node:fs")).readFileSync(p, "utf8"); }
console.log("   CSV 行数：" + csvText.split(/\r?\n/).length + " | 表头：" + patch(csvText.split(/\r?\n/)[0]));
console.log("\n报错：" + JSON.stringify(errs));
await browser.close();
