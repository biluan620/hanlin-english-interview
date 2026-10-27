import fs from "node:fs";
import path from "node:path";

const ws = process.env.WS;
if (!ws) throw new Error("set WS");
const artDir = path.join(ws, ".codex-build", "art");
const htmlPath = path.join(ws, "outputs", "HanLin采访-发给同事", "HanLin采访-离线版.html");

const v64 = fs.readFileSync(path.join(artDir, "video.txt"), "utf8").trim();
if (!/^[A-Za-z0-9+/=]+$/.test(v64.slice(0, 200))) throw new Error("video base64 looks wrong");

let html = fs.readFileSync(htmlPath, "utf8");
const re = /<!--ART-START-->[\s\S]*?<!--ART-END-->/;
if (!re.test(html)) throw new Error("ART markers not found");
html = html.replace(re,
  "<!--ART-START-->\n"
  + "      <video id=\"hanlinVideo\" src=\"data:video/mp4;base64," + v64 + "\" muted playsinline preload=\"auto\" aria-label=\"Han Lin, the school newspaper reporter\"></video>\n"
  + "      <!--ART-END-->");
fs.writeFileSync(htmlPath, html);
console.log("video injected | html MB:", (Buffer.byteLength(html) / 1048576).toFixed(2));
