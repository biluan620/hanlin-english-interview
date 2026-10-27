/* 语音层测试：用假的 SpeechRecognition 驱动，验证新加的行为 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const URL = 'file:///' + `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;

const FAKE = () => {
  window.__starts = 0;
  window.__insts = [];
  function FakeSR(){
    var self = this;
    self.onresult = null; self.onend = null; self.onerror = null;
    self.lang = ""; self.continuous = false; self.interimResults = false; self.maxAlternatives = 1;
    self.started = false; self.stopped = false;
    window.__insts.push(self);
    window.__last = self;
  }
  FakeSR.prototype.start = function(){
    this.started = true; window.__starts++;
    window.__last = this;
  };
  FakeSR.prototype.stop = function(){
    this.stopped = true;
    var h = this.onend;
    if(h) setTimeout(function(){ h({}); }, 0);
  };
  FakeSR.prototype.abort = function(){ this.stopped = true; };
  window.webkitSpeechRecognition = FakeSR;
  window.SpeechRecognition = FakeSR;
  window.__fire = function(kind, payload){
    var r = window.__last;
    if(!r) return "no instance";
    if(kind === "end"){ if(r.onend) r.onend({}); return "ok"; }
    if(kind === "error"){ if(r.onerror) r.onerror({ error: payload }); return "ok"; }
    if(kind === "result"){
      var res = payload.map(function(alts){
        var a = alts.map(function(x){ return { transcript: x[0], confidence: x[1] }; });
        a.isFinal = true;
        return a;
      });
      res.length = payload.length;
      if(r.onresult) r.onresult({ results: res });
      return "ok";
    }
    return "unknown";
  };
  try{
    localStorage.setItem("hanlin.offline.voice.v1",
      JSON.stringify({ on: true, auto: false, silence: 3.0, submit: 0, max: 30, wait: 4 }));
    localStorage.removeItem("hanlin.offline.ai.v1");
  }catch(e){}
};

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['microphone'] });
await ctx.addInitScript(FAKE);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL);
await page.waitForTimeout(900);
await page.evaluate(() => { const a = document.getElementById('admin'); a.style.transform = 'translateY(0)'; a.style.display = 'flex'; });
const state = () => page.evaluate(() => ({
  box: document.getElementById('answerBox').value,
  bubble: document.getElementById('bubbleText').textContent.trim().slice(0, 44),
  status: document.getElementById('status').textContent,
  admin: document.getElementById('aStatus').textContent,
  starts: window.__starts,
  waitBtn: document.getElementById('aWait').textContent,
  alive: window.__last && window.__last.started && !window.__last.stopped
}));

async function waitListening(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 15000)) {
    const v = await page.evaluate(() => ({
      st: document.getElementById('status').textContent,
      starts: window.__starts || 0
    }));
    if (/^Listening/.test(v.st) && v.starts > 0) return true;
    await page.waitForTimeout(250);
  }
  return false;
}
async function clickContinue() {
  for (let i = 0; i < 40; i++) {
    const vis = await page.evaluate(() => { const e = document.getElementById('btnContinue'); return e && e.offsetParent !== null; });
    if (vis) { await page.click('#btnContinue'); return true; }
    await page.waitForTimeout(400);
  }
  return false;
}
await page.click('#aStart');
await clickContinue();
await waitListening(18000);
let s = await state();
console.log('【开始听】', JSON.stringify(s));
if (!s.alive) console.log('  !! 识别没有在跑');
if (s.waitBtn !== '等待开口：4s') console.log('  !! 等待开口按钮没读到我预设的 4s:', s.waitBtn);

/* 1) 浏览器自己结束一轮 → 必须自动接上 */
const before1 = s.starts;
await page.evaluate(() => window.__fire('end'));
await page.waitForTimeout(600);
s = await state();
console.log('【1 自动续听】start 次数', before1, '->', s.starts, '| 还在听:', s.alive, '| 状态:', s.status);

/* 2) no-speech 错误 → 也要接上 */
const before2 = s.starts;
await page.evaluate(() => window.__fire('error', 'no-speech'));
await page.waitForTimeout(700);
s = await state();
console.log('【2 no-speech 续听】start 次数', before2, '->', s.starts, '| 还在听:', s.alive);

/* 2.5) 跨轮不丢字：说一句 → 浏览器结束一轮 → 再说一句，两段都要在 */
await page.evaluate(() => window.__fire('result', [[['My partner is tall.', 0.9]]]));
await page.waitForTimeout(300);
const mid1 = (await state()).box;
await page.evaluate(() => window.__fire('end'));
await page.waitForTimeout(500);
await page.evaluate(() => window.__fire('result', [[['He likes music.', 0.9]]]));
await page.waitForTimeout(300);
const mid2 = (await state()).box;
const keepOk = mid1 === 'My partner is tall.' && mid2 === 'My partner is tall. He likes music.';
console.log('【2.5 跨轮不丢字】', keepOk ? '通过' : '不合格', '| 第一句:', JSON.stringify(mid1), '| 两轮之后:', JSON.stringify(mid2));

/* 3) 多候选择优：正确句在第二个候选、置信度更高 */
await page.evaluate(() => window.__fire('result', [
  [['I like play basketball.', 0.42], ['We both like play basketball.', 0.78], ['We both like to play basketball', 0.7]],
  [['I am good at English.', 0.9], ['I am good English.', 0.2]]
]));
await page.waitForTimeout(5000);
s = await state();
console.log('【3 候选择优】识别框:', JSON.stringify(s.box));
console.log('            ', s.bubble, '|', s.admin);

/* 4) 等待开口超时（wait=4s）：什么都不说 */
await clickContinue();
await waitListening(18000);
const t0 = Date.now();
await page.waitForTimeout(6500);
s = await state();
console.log('【4 等待开口超时】等了', ((Date.now() - t0) / 1000).toFixed(1) + 's |', s.bubble, '|', s.admin);
console.log('\nerrs: ' + JSON.stringify(errs));
await browser.close();
