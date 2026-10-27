import path from "node:path";
import { pathToFileURL } from "node:url";

const SKILL_DIR = process.env.SKILL_DIR;
const utils = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);
console.log("utils exports:", Object.keys(utils).join(", "));
try {
  console.log("default font:", utils.resolvePresentationFont());
} catch (e) {
  console.log("default font error:", e.message);
}
for (const name of ["Microsoft YaHei", "Segoe UI", "SimSun", "Microsoft JhengHei", "Arial"]) {
  try {
    console.log("explicit", name, "->", utils.resolvePresentationFont({ fontFamily: name }));
  } catch (e) {
    console.log("explicit", name, "ERR:", e.message);
  }
}
