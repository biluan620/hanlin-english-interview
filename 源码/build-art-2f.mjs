import fs from "node:fs";
import path from "node:path";

const ws = process.env.WS;
if (!ws) throw new Error("set WS");
const artDir = path.join(ws, ".codex-build", "art");
const htmlPath = path.join(ws, "outputs", "HanLin采访-发给同事", "HanLin采访-离线版.html");
const outDir = path.join(ws, "outputs");

const f1 = fs.readFileSync(path.join(artDir, "f1.webp.txt"), "utf8").trim();
const f2 = fs.readFileSync(path.join(artDir, "f2.webp.txt"), "utf8").trim();
if (!/^data:image\/webp;base64,/.test(f1) || !/^data:image\/webp;base64,/.test(f2)) throw new Error("frames look wrong");

let html = fs.readFileSync(htmlPath, "utf8");
const re = /<!--ART-START-->[\s\S]*?<!--ART-END-->/;
if (!re.test(html)) throw new Error("ART markers not found");
html = html.replace(re,
  "<!--ART-START-->\n"
  + "      <img id=\"artClosed\" class=\"artFrame\" src=\"" + f1 + "\" alt=\"Han Lin, the school newspaper reporter\" draggable=\"false\">\n"
  + "      <img id=\"artOpen\" class=\"artFrame\" src=\"" + f2 + "\" alt=\"\" draggable=\"false\">\n"
  + "      <!--ART-END-->");
fs.writeFileSync(htmlPath, html);

// 课件用两帧立绘
fs.writeFileSync(path.join(outDir, "HanLin立绘.png"), Buffer.from(fs.readFileSync(path.join(artDir, "f1.png.txt"), "utf8").split(",")[1], "base64"));
fs.writeFileSync(path.join(outDir, "HanLin说话.png"), Buffer.from(fs.readFileSync(path.join(artDir, "f2.png.txt"), "utf8").split(",")[1], "base64"));
console.log("two frames injected | html KB:", Math.round(Buffer.byteLength(html) / 1024));
