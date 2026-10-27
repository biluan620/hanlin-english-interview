/* 复现「第 2 题不能说话」：假麦克风 + 假宿主桥 + 三题连跑，打印时间线 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const URL = 'file:///' + ROOT + '/work/single/page.html';

const INIT = function (cfg) {
  window.__log = [];
  window.__failHost = !!(cfg && cfg.failHost);
  try { localStorage.clear(); } catch (e) {}

  const handlers = [];
  window.__posted = [];
  window.chrome = {
    webview: {
      postMessage: function (m) {
        window.__posted.push(m && m.type);
        window.__log.push('post:' + (m && m.type));
        if (m && m.type === 'asr') {
          const id = m.id;
          window.__lastWav = m.wavBase64;
          setTimeout(function () {
            handlers.forEach(function (h) {
              if (window.__failHost) h({ data: { type: 'asrError', id: id, message: 'boom' } });
              else h({ data: { type: 'asrResult', id: id, text: 'My partner is taller than me.' } });
            });
          }, 120);
        }
      },
      addEventListener: function (t, h) { if (t === 'message') handlers.push(h); }
    }
  };

  /* 每次调用都造一条全新的流（真实设备就是这样；共用一条会被 stop() 弄死） */
  const gains = [];
  window.__lvl = 0;
  window.__setLvl = function (v) {
    window.__lvl = Number(v) || 0;
    gains.forEach(function (g) { try { g.gain.value = window.__lvl; } catch (e) {} });
  };
  function makeStream() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const a = new AC({ sampleRate: 16000 });
    const dest = a.createMediaStreamDestination();
    const g = a.createGain();
    g.gain.value = window.__lvl;
    gains.push(g);
    const osc = a.createOscillator();
    osc.frequency.value = 220;
    osc.connect(g);
    g.connect(dest);
    osc.start();
    try { a.resume(); } catch (e) {}
    return dest.stream;
  }
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    configurable: true,
    writable: true,
    value: function (cons) {
      const want = (cons && cons.deviceId && cons.deviceId.exact) || '';
      window.__log.push(want ? ('gum:exact=' + want) : 'gum:warm');
      return Promise.resolve(makeStream());
    }
  });
  Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
    configurable: true,
    writable: true,
    value: function () {
      window.__log.push('enum');
      return Promise.resolve([
        { kind: 'audioinput', deviceId: 'blue', label: '蓝牙耳机 Hands-Free' },
        { kind: 'audioinput', deviceId: 'devB', label: '麦克风阵列 (Realtek(R) Audio)' }
      ]);
    }
  });

  /* 假听写：只为让「这台电脑能听英语」的自检放行（本机识别这条路不会用到它） */
  window.__srStarts = 0;
  function FakeSR() {}
  FakeSR.prototype.start = function () { this.on = true; window.__srStarts++; window.__lastSR = this; };
  FakeSR.prototype.stop = function () { this.on = false; };
  window.webkitSpeechRecognition = FakeSR;
  window.SpeechRecognition = FakeSR;
};

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--autoplay-policy=no-user-gesture-required']
});
const FAILHOST = process.argv.indexOf('fail-host') > 0;
const bctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await bctx.addInitScript(INIT, { failHost: FAILHOST });
const page = await bctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL);
await page.waitForTimeout(1000);

const snap = () => page.evaluate(() => {
  const d = window.__asrDbg || {};
  return {
    st: d.phase + '/' + d.watchPhase,
    status: document.getElementById('status').textContent.slice(0, 18),
    starts: d.starts, recs: d.recs, chunks: d.chunks,
    rms: Number((d.rms || 0).toFixed(3)), ticks: d.ticks, fin: d.finishes,
    box: document.getElementById('answerBox').value.slice(0, 26)
  };
});

await page.evaluate(() => { const a = document.getElementById('admin'); a.style.transform = 'translateY(0)'; a.style.display = 'flex'; });

const timeline = [];
let stopTimeline = false;
const tlLoop = (async function () {
  let last = '';
  while (!stopTimeline) {
    let s = null;
    try { s = await snap(); } catch (e) { s = null; }
    if (s) {
      const key = JSON.stringify(s);
      if (key !== last) { timeline.push(s); last = key; }
    }
    await new Promise(r => setTimeout(r, 250));
  }
})();

await page.click('#aStart');
for (let i = 0; i < 60; i++) {
  const v = await page.evaluate(() => { const e = document.getElementById('btnContinue'); return !!(e && e.offsetParent !== null); });
  if (v) break;
  await page.waitForTimeout(300);
}
await page.click('#btnContinue');

for (let q = 1; q <= 3; q++) {
  let ok = false;
  for (let i = 0; i < 60; i++) {
    const s = await snap();
    if (s.starts >= q && s.recs >= q) { ok = true; break; }
    await page.waitForTimeout(300);
  }
  console.log('\n=== 第 ' + q + ' 题 ===  进入收音: ' + ok);
  await page.evaluate(() => window.__setLvl(1));
  await page.waitForTimeout(1400);
  console.log('  说话 1.4 秒: ' + JSON.stringify(await snap()));
  await page.evaluate(() => window.__setLvl(0));
  for (let i = 0; i < 60; i++) {
    const s = await snap();
    if (s.fin >= q) break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  console.log('  提交后: ' + JSON.stringify(await snap()));
  let vis = false;
  for (let i = 0; i < 60; i++) {
    vis = await page.evaluate(() => { const e = document.getElementById('btnContinue'); return !!(e && e.offsetParent !== null); });
    if (vis) break;
    await page.waitForTimeout(300);
  }
  if (!vis) { console.log('  没有出现 Continue —— 流程停在这里'); break; }
  await page.click('#btnContinue');
  await page.waitForTimeout(500);
}

stopTimeline = true;
await tlLoop;
await page.waitForTimeout(4000);
const fin = await page.evaluate(() => ({
  bubble: document.getElementById('bubbleText').textContent.trim(),
  cn: document.getElementById('cnSub').textContent.trim(),
  recs: JSON.parse(localStorage.getItem('hanlin.offline.records.v1') || '[]').length
}));
console.log('\n=== 收尾 ===');
console.log('  HanLin 最后一句: ' + fin.bubble.slice(0, 70));
console.log('  中文字幕: ' + fin.cn.slice(0, 40) + ' | 记录条数: ' + fin.recs);
console.log('  HanLin 提示: ' + await page.evaluate(() => document.getElementById('qHint').textContent.trim()));
console.log('  浏览器听写启动次数: ' + await page.evaluate(() => window.__srStarts));
console.log('  控制条状态: ' + await page.evaluate(() => document.getElementById('aStatus').textContent.trim()));
console.log('\n=== 时间线 ===');
timeline.forEach(function (s, i) { console.log(String(i).padStart(3) + ' ' + JSON.stringify(s)); });
console.log('\n事件序列: ' + JSON.stringify(await page.evaluate(() => window.__log)));
console.log('\n内部事件: ' + JSON.stringify(await page.evaluate(() => window.__asrEv), null, 0));
console.log('报错: ' + JSON.stringify(errs));
await browser.close();
