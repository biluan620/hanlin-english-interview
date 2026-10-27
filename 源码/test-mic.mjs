/* 麦克风「只问一次」测试：
   A. 用启动脚本的开关打开（权限已是 granted）→ 不该出现任何提示条，且全程只申请一次麦克风
   B. 直接双击打开（权限是 prompt）→ 应出现蓝色提示条，并告诉老师怎么彻底不弹
   两个场景都要能正常走完答题。 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const URL = 'file:///' + `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;

const INIT = () => {
  /* 数一数到底申请了几次麦克风 */
  window.__gum = 0;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (c) { window.__gum++; return orig(c); };
  }
  /* 假的听写引擎，避免依赖真实语音服务 */
  window.__insts = []; window.__starts = 0;
  function FakeSR() { window.__insts.push(this); window.__last = this; }
  FakeSR.prototype.start = function () { this.started = true; window.__starts++; window.__last = this; };
  FakeSR.prototype.stop = function () { this.stopped = true; var h = this.onend; if (h) setTimeout(() => h({}), 0); };
  window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  try { localStorage.setItem('hanlin.offline.voice.v1', JSON.stringify({ on: true, auto: false, silence: 3, submit: 0, max: 30, wait: 10 })); } catch (e) {}
};

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ executablePath: EDGE });

async function run(label, args, grant) {
  const br = await chromium.launch({ executablePath: EDGE, ...(args ? { args } : {}) });
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 } });
  if (grant) await ctx.grantPermissions(['microphone']);
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1800);
  const boot = await page.evaluate(() => ({
    perm: window.__perm || 'n/a',
    warnShown: document.getElementById('micWarn').classList.contains('show'),
    warnTone: (document.querySelector('#micWarn .mwBox') || {}).className,
    warnTitle: document.getElementById('mwTitle').textContent,
    btn: document.getElementById('mwRetry').textContent,
    gum: window.__gum,
    streamOpen: null
  }));
  console.log(`\n${label}`);
  console.log(`   提示条: ${boot.warnShown ? '有' : '没有'} | 标题: ${boot.warnShown ? boot.warnTitle : '—'} | 按钮: ${boot.btn} | 色调: ${boot.warnTone}`);
  console.log(`   打开页面时申请麦克风次数: ${boot.gum}`);
  await page.evaluate(() => { const a = document.getElementById('admin'); a.style.transform = 'translateY(0)'; a.style.display = 'flex'; });
  const overlap = await page.evaluate(() => {
    const w = document.getElementById('micWarn');
    if (!w.classList.contains('show')) return 'no-banner';
    const b = w.getBoundingClientRect(), s = document.getElementById('aStart').getBoundingClientRect();
    const hit = !(b.bottom < s.top || b.top > s.bottom || b.right < s.left || b.left > s.right);
    return hit ? '挡住开始采访(不良)' : '不挡按钮';
  });
  console.log(`   提示条与「开始采访」的位置关系: ${overlap}`);
  if (boot.warnShown && boot.warnTone.indexOf('info') >= 0) {
    await page.click('#mwRetry');
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => ({ gum: window.__gum, title: document.getElementById('mwTitle').textContent, tone: (document.querySelector('#micWarn .mwBox') || {}).className }));
    console.log(`   点了「允许麦克风」之后：申请次数 ${after.gum} | 提示条: ${after.title} | 色调 ${after.tone}`);
  }
  await page.evaluate(() => { const w = document.getElementById('micWarn'); if (w) w.classList.remove('show'); });
  await page.click('#aStart');
  for (let i = 0; i < 40; i++) { const v = await page.evaluate(() => { const e = document.getElementById('btnContinue'); return e && e.offsetParent !== null; }); if (v) break; await page.waitForTimeout(400); }
  await page.click('#btnContinue');
  await page.waitForTimeout(7000);
  const mid = await page.evaluate(() => ({ gum: window.__gum, status: document.getElementById('status').textContent, starts: window.__starts }));
  console.log(`   开始收音后：申请次数 ${mid.gum} | 识别启动 ${mid.starts} 次 | ${mid.status.slice(0, 40)}`);
  /* 学生说一句 → 自动提交 */
  await page.evaluate(() => window.__fire && window.__fire('result', [[['My partner is tall.', 0.95]]]));
  await page.waitForTimeout(200);
  await page.evaluate(() => { const l = window.__last; if (l && l.onresult) l.onresult({ results: (function () { const a = [{ transcript: 'My partner is tall.', confidence: 0.95 }]; a.isFinal = true; const r = [a]; r.length = 1; return r; })() }); });
  await page.waitForTimeout(5000);
  const end = await page.evaluate(() => ({
    gum: window.__gum,
    bubble: document.getElementById('bubbleText').textContent.trim(),
    box: document.getElementById('answerBox').value,
    admin: document.getElementById('aStatus').textContent
  }));
  console.log(`   答完一题：申请次数 ${end.gum} | 识别到: ${JSON.stringify(end.box)} | ${end.bubble}`);
  console.log(`   报错: ${JSON.stringify(errs)}`);
  await ctx.close();
  await br.close();
  return end.gum;
}

// A：模拟启动脚本（权限已允许，且带假麦克风设备）
const a = await run('【A 用启动脚本打开 / 权限已允许】', ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], false);
// B：模拟直接双击（权限还是 prompt）
const b = await run('【B 直接双击打开 / 权限未允许】', null, false);
console.log(`\n结论：A 场景全程申请 ${a} 次；B 场景 ${b} 次。`);
await browser.close();
