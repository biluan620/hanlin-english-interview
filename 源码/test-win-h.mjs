/* 测：① 出题后自动聚焦答题框 ② 听写整段进来时不被提前提交 ③ 普通打字仍会正常自动提交 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const URL = 'file:///' + `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;

const INIT = () => {
  if (navigator.mediaDevices) {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true, writable: true,
      value: function () {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        return Promise.resolve(ctx.createMediaStreamDestination().stream);
      }
    });
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      configurable: true, writable: true, value: function () { return Promise.resolve([]); }
    });
  }
  function FakeSR() {}
  FakeSR.prototype.start = function () { this.started = true; };
  FakeSR.prototype.stop = function () { this.stopped = true; };
  window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  try { localStorage.clear(); } catch (e) {}
};

const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(INIT);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await page.goto(URL);
await page.waitForTimeout(1200);
const patch = s => String(s).replace(/\s+/g, " ").trim().slice(0, 60);
const recCount = () => page.evaluate(() => (JSON.parse(localStorage.getItem("hanlin.offline.records.v1") || "[]") || []).length);

await page.evaluate(() => { const a = document.getElementById("admin"); a.style.transform = "translateY(0)"; a.style.display = "flex"; });
console.log("启动报错：" + errs.length + " | 控制条提示：" + patch(await page.evaluate(() => document.getElementById("aStatus").textContent)));

await page.click("#aStart");
for (let i = 0; i < 50; i++) { const v = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; }); if (v) break; await page.waitForTimeout(400); }
await page.click("#btnContinue");
for (let i = 0; i < 60; i++) { const v = await page.evaluate(() => /^Listening/.test(document.getElementById("status").textContent)); if (v) break; await page.waitForTimeout(300); }
await page.waitForTimeout(600);

/* ① 自动聚焦 */
const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
console.log("\n【① 出题后焦点】document.activeElement = " + focused + (focused === "answerBox" ? "  ✓" : "  ✗"));

/* ② 听写式整段输入：一次性 17 个字符 → 2 秒之内不该提交，3.5 秒之后才提交 */
const t0 = Date.now();
await page.fill("#answerBox", "My partner is tall");
await page.waitForTimeout(2000);
const midRec = await recCount();
const midBubble = patch(await page.evaluate(() => document.getElementById("bubbleText").textContent));
console.log("\n【② 整段输入后 2.0 秒】已提交 " + midRec + " 条 | 屏幕：" + midBubble + (midRec === 0 ? "  ✓ 没被提前发出去" : "  ✗ 提前发了"));
/* 再补一段（模拟继续说） */
await page.fill("#answerBox", "My partner is tall and he likes music");
await page.waitForTimeout(2000);
const mid2 = await recCount();
console.log("   又补了一段后 2.0 秒：已提交 " + mid2 + " 条" + (mid2 === 0 ? "  ✓ 仍没发" : "  ✗ 提前发了"));
for (let i = 0; i < 40; i++) { if (await recCount() > 0) break; await page.waitForTimeout(250); }
const t1 = Date.now();
const fb = await page.evaluate(() => ({ bubble: document.getElementById("bubbleText").textContent.trim(), recs: JSON.parse(localStorage.getItem("hanlin.offline.records.v1") || "[]") }));
console.log("   最终在最后一次输入后 " + ((t1 - t0 - 4000) / 1000).toFixed(1) + " 秒提交 | 屏幕：" + patch(fb.bubble));
console.log("   记录内容：" + JSON.stringify(fb.recs.map(r => r.answer)));

/* ③ 普通打字：停手 2.5 秒内应自动提交 */
for (let i = 0; i < 50; i++) { const v = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; }); if (v) break; await page.waitForTimeout(400); }
const vis = await page.evaluate(() => { const e = document.getElementById("btnContinue"); return e && e.offsetParent !== null; });
if (vis) {
  await page.click("#btnContinue");
  for (let i = 0; i < 60; i++) { const v = await page.evaluate(() => /^Listening/.test(document.getElementById("status").textContent)); if (v) break; await page.waitForTimeout(300); }
  await page.waitForTimeout(600);
  const t2 = Date.now();
  await page.click("#answerBox");
  await page.keyboard.type("We both like music.", { delay: 90 });
  for (let i = 0; i < 40; i++) { if (await recCount() > 1) break; await page.waitForTimeout(250); }
  const t3 = Date.now();
  console.log("\n【③ 手打一句】最后停手到提交约 " + ((t3 - t2) / 1000).toFixed(1) + " 秒 | 屏幕：" + patch(await page.evaluate(() => document.getElementById("bubbleText").textContent)));
} else {
  console.log("\n【③ 手打一句】没有出现下一题，跳过");
}
console.log("\n报错：" + JSON.stringify(errs));
await browser.close();
