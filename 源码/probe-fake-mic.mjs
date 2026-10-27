/* 单独验证假麦克风能不能产生电平 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--autoplay-policy=no-user-gesture-required']
});
const page = await browser.newPage();
await page.goto('about:blank');
const out = await page.evaluate(async function () {
  const AC = window.AudioContext || window.webkitAudioContext;
  const a = new AC({ sampleRate: 16000 });
  const dest = a.createMediaStreamDestination();
  const g = a.createGain();
  g.gain.value = 1;
  const osc = a.createOscillator();
  osc.frequency.value = 220;
  osc.connect(g);
  g.connect(dest);
  osc.start();
  await a.resume();
  await new Promise(r => setTimeout(r, 500));

  const b = new AC({ sampleRate: 16000 });
  await b.resume();
  const src = b.createMediaStreamSource(dest.stream);
  const an = b.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  await new Promise(r => setTimeout(r, 600));
  an.getByteTimeDomainData(buf);
  let mn = 255, mx = 0;
  for (let i = 0; i < buf.length; i++) { if (buf[i] < mn) mn = buf[i]; if (buf[i] > mx) mx = buf[i]; }
  return { stateA: a.state, stateB: b.state, rateA: a.sampleRate, rateB: b.sampleRate, min: mn, max: mx, track: dest.stream.getAudioTracks().length };
});
console.log(JSON.stringify(out));
await browser.close();
