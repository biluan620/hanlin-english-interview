import fs from "node:fs";
import path from "node:path";

const ws = process.env.WS;
if (!ws) throw new Error("set WS");
const audioDir = path.join(ws, ".codex-build", "audio");
const htmlPath = path.join(ws, "outputs", "HanLin采访-离线版.html");

const AUDIO = {}, DUR = {};
for (const f of fs.readdirSync(audioDir).sort()) {
  if (!f.endsWith(".wav")) continue;
  const id = f.replace(/\.wav$/, "");
  const buf = fs.readFileSync(path.join(audioDir, f));
  AUDIO[id] = "data:audio/wav;base64," + buf.toString("base64");
  DUR[id] = +(((buf.length - 44) / 32000).toFixed(2));
}

let html = fs.readFileSync(htmlPath, "utf8");
const block = '<!--BUILD:AUDIO-START-->\n<script id="audioMap">window.HANLIN_AUDIO='
  + JSON.stringify(AUDIO) + ";window.HANLIN_DUR=" + JSON.stringify(DUR)
  + ";</script>\n<!--BUILD:AUDIO-END-->";
const re = /<!--BUILD:AUDIO-START-->[\s\S]*?<!--BUILD:AUDIO-END-->/;
if (!re.test(html)) throw new Error("audio marker block not found");
html = html.replace(re, block);
fs.writeFileSync(htmlPath, html);
console.log("clips:", Object.keys(AUDIO).length,
  "| total audio secs:", Object.values(DUR).reduce((a, b) => a + b, 0).toFixed(1),
  "| html MB:", (Buffer.byteLength(html) / 1048576).toFixed(2));
