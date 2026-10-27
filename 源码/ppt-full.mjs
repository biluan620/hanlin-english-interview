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
const LINK_FILE = "HanLin采访-离线版.html";
const DECK = "英语采访HanLin-完整课件.pptx";

const read = (name) => fs.readFile(path.join(OUT_DIR, name));
const artClosed = await read("HanLin立绘.png");
const artOpen = await read("HanLin说话.png");

function box(slide, left, top, width, height, text, opts = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    name: opts.name,
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
function art(slide, { top, height, left = 900, width = 320, open = false }) {
  return slide.images.add({
    blob: open ? artOpen : artClosed,
    contentType: "image/png",
    alt: "Han Lin, the school newspaper reporter, holding a black microphone",
    fit: "contain",
    position: { left, top, width, height },
  });
}
function startLink(slide, left, top) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left, top, width: 560, height: 46 },
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
function notes(slide, text) { slide.speakerNotes.textFrame.setText(text); }
const newSlide = (p) => { const s = p.slides.add(); s.background.fill = BG; return s; };

const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });

/* 1 封面 */
{
  const s = newSlide(p);
  box(s, 80, 150, 800, 62, "School newspaper interview", { size: 46, bold: true, lineSpacing: 1.1 });
  box(s, 80, 238, 780, 96, "Han Lin, our student reporter, has three questions for you. Answer in English, one question at a time.",
    { size: 21, color: SUB, lineSpacing: 1.45 });
  startLink(s, 80, 372);
  art(s, { top: 96, height: 540, open: false });
  notes(s, "开场：点 Start the interview 打开采访页，F11 全屏。HanLin 会先读开场白。");
}

/* 2 学习目标 */
{
  const s = newSlide(p);
  box(s, 80, 100, 900, 54, "Learning goals", { size: 38, bold: true });
  box(s, 80, 218, 1080, 48, "You can say how you and your partner are different.", { size: 25, lineSpacing: 1.35 });
  box(s, 80, 286, 1080, 48, "You can find and say what you have in common.", { size: 25, lineSpacing: 1.35 });
  box(s, 80, 354, 1080, 48, "You can say what you can learn from your partner.", { size: 25, lineSpacing: 1.35 });
  box(s, 80, 470, 1080, 70, "Language focus: describing people, comparing, present simple and present continuous.",
    { size: 19, color: SUB, lineSpacing: 1.4 });
  notes(s, "先读一遍目标（约 1 分钟），让学生知道这节课要开口说什么。");
}

/* 3 热身 */
{
  const s = newSlide(p);
  box(s, 80, 140, 800, 54, "Warm-up: talk with your partner", { size: 38, bold: true });
  box(s, 80, 246, 760, 110, "One minute. Find two differences and two things you have in common.", { size: 27, lineSpacing: 1.4 });
  box(s, 80, 386, 760, 70, "Then be ready to tell the class one of each.", { size: 21, color: SUB, lineSpacing: 1.4 });
  art(s, { top: 210, height: 440, open: true });
  notes(s, "两两一组说 1 分钟，不用写。目的是先让学生把话说出来，再进入正式采访。");
}

/* 4 实用句型 */
{
  const s = newSlide(p);
  box(s, 80, 84, 900, 50, "Useful sentences", { size: 38, bold: true });
  box(s, 80, 156, 700, 34, "不需要背，说的时候照着填就行。", { size: 17, color: SUB });
  box(s, 80, 224, 540, 40, "差别 Differences", { size: 22, bold: true, color: BRAND });
  box(s, 80, 276, 540, 96, "One difference is that I ______ , but my partner ______ .", { size: 21, lineSpacing: 1.45 });
  box(s, 80, 378, 540, 96, "I like ______ , but my partner likes ______ .", { size: 21, lineSpacing: 1.45 });
  box(s, 80, 480, 540, 96, "My partner is ______ , and I am ______ .", { size: 21, lineSpacing: 1.45 });
  box(s, 690, 224, 540, 40, "相同 In common", { size: 22, bold: true, color: BRAND });
  box(s, 690, 276, 540, 96, "We are both ______ .", { size: 21, lineSpacing: 1.45 });
  box(s, 690, 336, 540, 96, "We both like ______ .", { size: 21, lineSpacing: 1.45 });
  box(s, 690, 424, 540, 40, "学到什么 Learning from a partner", { size: 22, bold: true, color: BRAND });
  box(s, 690, 476, 540, 96, "I can learn ______ from my partner.", { size: 21, lineSpacing: 1.45 });
  box(s, 690, 536, 540, 96, "My partner is good at ______ , so I want to try that too.", { size: 21, lineSpacing: 1.45 });
  notes(s, "这一页可以一直开着。学生卡住时提醒他们看这一页，而不是直接给答案。");
}

/* 5 采访规则 */
{
  const s = newSlide(p);
  box(s, 80, 92, 900, 50, "How the interview works", { size: 38, bold: true });
  box(s, 80, 200, 850, 48, "Han Lin asks one question at a time. Three questions in all.", { size: 24, lineSpacing: 1.35 });
  box(s, 80, 272, 850, 48, "You answer in English. Your teacher types your answer in, and Han Lin replies.", { size: 24, lineSpacing: 1.35 });
  box(s, 80, 344, 850, 96, "Han Lin says Great! or Good job!. If one small mistake creeps in, he says Good try. A small tip ... and shows you the right sentence on the screen.",
    { size: 21, color: SUB, lineSpacing: 1.45 });
  startLink(s, 80, 540);
  art(s, { top: 300, height: 400, left: 985, width: 250, open: true });
  notes(s, "说明规则：一次一个问题，用英语回答，点评很短。然后点 Start the interview。");
}

/* 6-8 三道题 */
const questions = [
  { q: "How are you different from each other?", frame: "Start with: One difference is that I ______ , but my partner ______ ." },
  { q: "What do you have in common?", frame: "Start with: We are both ______ ." },
  { q: "What can you learn from your partner?", frame: "Start with: I can learn ______ from my partner." },
];
questions.forEach((item, i) => {
  const s = newSlide(p);
  box(s, 80, 122, 400, 40, "Question " + (i + 1), { size: 22, bold: true, color: BRAND });
  box(s, 80, 184, 770, 150, item.q, { size: 44, bold: true, lineSpacing: 1.2 });
  box(s, 80, 350, 770, 70, item.frame, { size: 20, color: SUB, lineSpacing: 1.45 });
  startLink(s, 80, 540);
  art(s, { top: 148, height: 480, open: true });
  notes(s, "点 Start the interview 让这一组学生回答。答完在采访页点 Next question。");
});

/* 9 收尾 */
{
  const s = newSlide(p);
  box(s, 80, 190, 780, 170, "Thank you! You did a wonderful interview.", { size: 44, bold: true, lineSpacing: 1.2 });
  box(s, 80, 372, 780, 80, "You described differences, found things in common, and said what you can learn from your partner.",
    { size: 20, color: SUB, lineSpacing: 1.45 });
  box(s, 80, 486, 780, 40, "（下一组：在采访页点 Next group，改好组名再继续）", { size: 16, color: SUB });
  art(s, { top: 120, height: 500, open: false });
  notes(s, "收尾。可以挑一组说得好的学生再复述一遍答案，加深印象。");
}

/* 10 老师操作页 */
{
  const s = newSlide(p);
  s.background.fill = "#ffffff";
  box(s, 80, 66, 1000, 50, "老师操作：不用装任何东西", { size: 32, bold: true });
  const steps = [
    "1. 双击「HanLin采访-离线版.html」用任何浏览器打开，按 F11 全屏；也可以直接放映本课件，在带链接的页面点蓝色的 Start the interview。",
    "2. 鼠标移到屏幕顶端弹出控制条 → 填组名 → 点「开始采访」。",
    "3. 学生用英语回答，老师把答案打进屏幕下方的框、按回车，HanLin 立刻改句并点评。",
    "4. 点 Next question 进下一题；一组结束点 Next group，改好组名继续下一组。",
    "5. 课后点「记录」→「导出 CSV」，把全部回答和改后句存成 Excel。",
  ];
  steps.forEach((t, i) => box(s, 80, 122 + i * 68, 1120, 64, t, { size: 18, lineSpacing: 1.4 }));
  box(s, 80, 470, 1120, 40, "不需要联网、不需要装语音包、不需要 API Key、不需要注册。HanLin 的声音已经录好放在文件里。",
    { size: 18, bold: true, color: BRAND });
  box(s, 80, 524, 1120, 34, "本页给老师看，放映时可以直接跳过。采访页必须和本课件放在同一个文件夹里，链接才不会断。",
    { size: 15, color: SUB });
  notes(s, "本页不投影。离线版采访页与课件同目录时，「Start the interview」可直接点击打开，全程不需要网络。");
}

/* ---------- 导出草稿 + 校验 + 交付 ---------- */
await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(OUT_DIR, { recursive: true });
const candidatePath = path.join(TMP_DIR, "candidate-full.pptx");
await (await PresentationFile.exportPptx(p)).save(candidatePath);

const { finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href
);
const stamp = Date.now();
const staged = path.join(workspaceDir, ".codex-build", "final", `full-${stamp}.pptx`);
await fs.mkdir(path.dirname(staged), { recursive: true });
const result = await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath: staged,
  pythonExecutable: process.env.RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  fontPolicy: { basis: "design", families: [FONT] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(TMP_DIR, `full-${stamp}.validation.json`),
});
const delivered = path.join(OUT_DIR, DECK);
await fs.copyFile(staged, delivered);
console.log("DELIVERED:", delivered);
console.log("integrity:", result.packageIntegrity.status, "findings:", result.packageIntegrity.finding_count,
  "| layout findings:", result.presentationLayout.finding_count, "| slides:", result.packageIntegrity.slide_count);

/* ---------- 渲染每页做检查 ---------- */
const { FileBlob } = await import("@oai/artifact-tool");
const back = await PresentationFile.importPptx(await FileBlob.load(delivered));
const snap = await back.inspect({ kind: "slide", maxChars: 30000 });
const ids = [];
for (const line of String(snap.ndjson).split("\n")) {
  if (!line.trim()) continue;
  let o;
  try { o = JSON.parse(line); } catch (e) { continue; }
  if (o && typeof o.id === "string" && o.id.startsWith("sl/")) ids.push(o.id);
}
for (let i = 0; i < ids.length; i++) {
  const one = back.resolve(ids[i]);
  const png = await one.export({ format: "png", scale: 1 });
  await fs.writeFile(path.join(TMP_DIR, `full-${i + 1}.png`), new Uint8Array(await png.arrayBuffer()));
}
console.log("rendered slides:", ids.length);
