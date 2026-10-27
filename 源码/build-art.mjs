import fs from "node:fs";
import path from "node:path";

const ws = process.env.WS;
if (!ws) throw new Error("set WS");
const htmlPath = path.join(ws, "outputs", "HanLin采访-发给同事", "HanLin采访-离线版.html");
const artPath = path.join(ws, ".codex-build", "art", "hanlin-webp.txt");

const dataUrl = fs.readFileSync(artPath, "utf8").trim();
if (!/^data:image\/webp;base64,/.test(dataUrl)) throw new Error("art data url looks wrong");

let html = fs.readFileSync(htmlPath, "utf8");
const re = /<!--ART-START-->[\s\S]*?<!--ART-END-->/;
if (!re.test(html)) throw new Error("ART markers not found");
const block = "<!--ART-START-->\n      <img id=\"hanlinArt\" src=\"" + dataUrl
  + "\" alt=\"Han Lin, the school newspaper reporter\" draggable=\"false\">\n      <!--ART-END-->";
html = html.replace(re, block);
fs.writeFileSync(htmlPath, html);
console.log("art injected:", Math.round(dataUrl.length / 1024), "KB data url | html MB:", (Buffer.byteLength(html) / 1048576).toFixed(2));
