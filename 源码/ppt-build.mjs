import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const SKILL_DIR = process.env.SKILL_DIR;
const workspaceDir = process.env.WS;
const TMP_DIR = path.join(workspaceDir, ".codex-build", "ppt");
const OUT_DIR = path.join(workspaceDir, "outputs");
if (!SKILL_DIR || !workspaceDir) throw new Error("set SKILL_DIR and WS");

const FONT = "Microsoft YaHei";
const INK = "#0f172a", SUB = "#5a6a85", BRAND = "#2f6bff", BG = "#f2f7ff";
const LINK_FILE = "HanLin采访.html";

const img = (name) => fs.readFile(path.join(OUT_DIR, name));
const artClosed = await img("HanLin立绘.png");
const artOpen = await img("HanLin说话.png");

function box(slide, left, top, width, height, text, opts = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left, top, width, height },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface: FONT,
    fontSize: opts.size ?? 20,
    bold: !!opts.bold,
    color: opts.color ?? INK,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.valign ?? "top",
    lineSpacing: opts.lineSpacing ?? 1.25,
    autoFit: "none",
    wrap: "square",
  };
  return shape;
}

function art(slide, { top, height, left = 892, width = 330, open = false }) {
  return slide.images.add({
    blob: open ? artOpen : artClosed,
    contentType: "image/png",
    alt: "Han Lin, student reporter for the school newspaper, holding a black microphone",
    fit: "contain",
    position: { left, top, width, height },
  });
}

function startLink(slide, left, top) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left, top, width: 520, height: 46 },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text.set([[
    { run: "Start the interview", link: { uri: LINK_FILE, isExternal: true }, textStyle: { typeface: FONT, bold: true, color: BRAND, underline: "sng", fontSize: "19pt" } },
    { run: "  点击这里开始采访", textStyle: { typeface: FONT, color: SUB, fontSize: "14pt" } },
  ]]);
  shape.text.style = { typeface: FONT, fontSize: 19, color: BRAND, lineSpacing: 1.3 };
  return shape;
}

const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });

/* ---------- 1 封面 ---------- */
{
  const s = presentation.slides.add();
  s.background.fill = BG;
  box(s, 80, 150, 800, 60, "School newspaper interview", { size: 46, bold: true, lineSpacing: 1.1 });
  box(s, 80, 236, 780, 90, "Han Lin, our student reporter, has three questions for you. Answer in English, one question at a time.",
    { size: 21, color: SUB, lineSpacing: 1.45 });
  startLink(s, 80, 356);
  art(s, { top: 96, height: 540, left: 900, width: 320, open: false });
}

/* ---------- 2 规则 ---------- */
{
  const s = presentation.slides.add();
  s.background.fill = BG;
  box(s, 80, 92, 900, 60, "How the interview works", { size: 38, bold: true });
  box(s, 80, 206, 850, 52, "Han Lin asks one question at a time. Three questions in all.", { size: 24, lineSpacing: 1.35 });
  box(s, 80, 282, 850, 52, "You answer in English. Speak into the microphone, or type your answer.", { size: 24, lineSpacing: 1.35 });
  box(s, 80, 358, 850, 90, "After each answer Han Lin says Great! or Good job! If one small mistake creeps in, Han Lin says Good try. A small tip ... and fixes that one mistake.",
    { size: 22, color: SUB, lineSpacing: 1.45 });
  startLink(s, 80, 560);
  art(s, { top: 300, height: 400, left: 985, width: 250, open: true });
}

/* ---------- 3-5 三道题 ---------- */
const questions = [
  "How are you different from each other?",
  "What do you have in common?",
  "What can you learn from your partner?",
];
questions.forEach((q, i) => {
  const s = presentation.slides.add();
  s.background.fill = BG;
  box(s, 80, 132, 400, 40, "Question " + (i + 1), { size: 22, bold: true, color: BRAND });
  box(s, 80, 196, 760, 150, q, { size: 44, bold: true, lineSpacing: 1.2 });
  box(s, 80, 372, 760, 40, "Answer in English when you are ready.", { size: 20, color: SUB });
  startLink(s, 80, 560);
  art(s, { top: 148, height: 480, left: 892, width: 330, open: true });
});

/* ---------- 6 收尾 ---------- */
{
  const s = presentation.slides.add();
  s.background.fill = BG;
  box(s, 80, 214, 780, 170, "Thank you! You did a wonderful interview.", { size: 44, bold: true, lineSpacing: 1.2 });
  box(s, 80, 404, 700, 40, "（下一组：在采访页点 Next group，再点下一组的组名即可）", { size: 16, color: SUB });
  art(s, { top: 120, height: 500, left: 900, width: 320, open: false });
}

/* ---------- 7 老师操作页 ---------- */
{
  const s = presentation.slides.add();
  s.background.fill = "#ffffff";
  box(s, 80, 74, 1000, 50, "老师操作：课前 3 分钟", { size: 32, bold: true });
  const steps = [
    "1. 装英文语音（只做一次）：右键「安装英文语音.ps1」→ 用 PowerShell 以管理员身份运行。装完重启 Edge。",
    "2. 双击「启动采访.bat」用 Edge 打开采访页。第一次会弹麦克风授权，点允许。",
    "3. 点右上角「设置」：填 DeepSeek Key → 点「测试连接」→ 选音色 → 点「试听这句」→ 保存。",
    "4. 上课：鼠标移到屏幕顶端出现控制条 → 填组名 → 点「开始采访」。学生答完按 Next question。",
    "5. 一组结束点「下一组」；课后点「记录」→「导出 CSV」保存全部回答。",
  ];
  steps.forEach((t, i) => box(s, 80, 150 + i * 78, 1120, 70, t, { size: 18, lineSpacing: 1.4 }));
  box(s, 80, 566, 1120, 34, "本页给老师看，放映时可以直接跳过。采访页要放在和本课件同一个文件夹里，链接才不会断。",
    { size: 15, color: SUB });
}

/* ---------- 导出草稿 + 校验 + 最终文件 ---------- */
await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(OUT_DIR, { recursive: true });
const candidatePath = path.join(TMP_DIR, "candidate.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);

const { finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href
);
const stamp = Date.now();
const FINAL_PPTX = path.join(workspaceDir, ".codex-build", "final", `英语采访HanLin-${stamp}.pptx`);
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });
const result = await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: process.env.RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  fontPolicy: { basis: "design", families: [FONT] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(TMP_DIR, `final-${stamp}.validation.json`),
});
console.log("FINAL:", FINAL_PPTX);
const delivered = path.join(OUT_DIR, "英语采访HanLin.pptx");
await fs.copyFile(FINAL_PPTX, delivered);
console.log("DELIVERED:", delivered);
console.log("OK:", JSON.stringify(result.checks ?? result, null, 1).slice(0, 900));

/* ---------- 渲染每页做检查 ---------- */
const { FileBlob } = await import("@oai/artifact-tool");
const back = await PresentationFile.importPptx(await FileBlob.load(delivered));
const snap = await back.inspect({ kind: "slide,textbox,image", maxChars: 30000 });
const ids = [];
for (const line of String(snap.ndjson).split("\n")) {
  if (!line.trim()) continue;
  let o;
  try { o = JSON.parse(line); } catch (e) { continue; }
  if (o && typeof o.id === "string" && o.id.startsWith("sl/")) ids.push(o.id);
}
console.log("slide anchors:", ids.length);
for (let i = 0; i < ids.length; i++) {
  const one = back.resolve(ids[i]);
  const png = await one.export({ format: "png", scale: 1 });
  await fs.writeFile(path.join(TMP_DIR, `slide-${i + 1}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await one.export({ format: "layout" });
  await fs.writeFile(path.join(TMP_DIR, `slide-${i + 1}.layout.json`), await layout.text());
}
console.log("rendered", ids.length, "slides");
