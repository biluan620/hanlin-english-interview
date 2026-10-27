import fs from "node:fs";
import path from "node:path";

const ws = process.env.WS;
if (!ws) throw new Error("set WS");
const artDir = path.join(ws, ".codex-build", "art");
const htmlPath = path.join(ws, "outputs", "HanLin采访-发给同事", "HanLin采访-离线版.html");
const outDir = path.join(ws, "outputs");

const webp = fs.readFileSync(path.join(artDir, "hanlin-flat.webp.txt"), "utf8").trim();
const mouthSvg = fs.readFileSync(path.join(artDir, "hanlin-mouth.svg"), "utf8").trim();
if (!/^data:image\/webp;base64,/.test(webp)) throw new Error("webp data url looks wrong");
if (!mouthSvg.startsWith("<svg id=\"mouth\"")) throw new Error("mouth svg looks wrong");

let html = fs.readFileSync(htmlPath, "utf8");
const re = /<!--ART-START-->[\s\S]*?<!--ART-END-->/;
if (!re.test(html)) throw new Error("ART markers not found");
html = html.replace(re,
  "<!--ART-START-->\n      <img id=\"hanlinArt\" src=\"" + webp + "\" alt=\"Han Lin, the school newspaper reporter\" draggable=\"false\">\n      <!--ART-END-->\n"
  + "      <div class=\"mouthWrap\">" + mouthSvg + "</div>");
fs.writeFileSync(htmlPath, html);

// 课件用两版立绘（闭口 / 张口）
fs.writeFileSync(path.join(outDir, "HanLin立绘.png"), Buffer.from(fs.readFileSync(path.join(artDir, "hanlin-closed.png.txt"), "utf8").split(",")[1], "base64"));
fs.writeFileSync(path.join(outDir, "HanLin说话.png"), Buffer.from(fs.readFileSync(path.join(artDir, "hanlin-open.png.txt"), "utf8").split(",")[1], "base64"));
console.log("art injected | html KB:", Math.round(Buffer.byteLength(html) / 1024));
