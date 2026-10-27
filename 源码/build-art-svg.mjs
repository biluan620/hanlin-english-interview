import fs from "node:fs";
import path from "node:path";

const ws = process.env.WS;
if (!ws) throw new Error("set WS");
const htmlPath = path.join(ws, "outputs", "HanLin采访-发给同事", "HanLin采访-离线版.html");
const svgPath = path.join(ws, "work", "hanlin-svg.txt");

const svg = fs.readFileSync(svgPath, "utf8").trim();
if (!svg.startsWith("<svg id=\"hanlinArt\"")) throw new Error("svg source looks wrong");

let html = fs.readFileSync(htmlPath, "utf8");
const re = /<!--ART-START-->[\s\S]*?<!--ART-END-->/;
if (!re.test(html)) throw new Error("ART markers not found");
html = html.replace(re, "<!--ART-START-->\n      " + svg + "\n      <!--ART-END-->");
// 去掉照片版遗留的 #mouth 图层
html = html.replace(/\s*<svg id="mouth"[\s\S]*?<\/svg>/, "");
fs.writeFileSync(htmlPath, html);
console.log("svg injected; #mouth removed:", !html.includes('id="mouth"'), "| html KB:", Math.round(Buffer.byteLength(html) / 1024));
