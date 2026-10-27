// 本地假 AI 接口：验证页面解析、格式校验与降级逻辑（不消耗真实 Key）
import http from "node:http";

const PORT = Number(process.argv[2] || 8791);

function reply(answer) {
  const a = String(answer || "").toLowerCase();
  // 故意设计几种返回，用来测各种分支
  if (a.includes("questionmarktip")) return { opener: "tip", tip: "Is this right?" };          // 含问号 → 应降级
  if (a.includes("longtip")) return { opener: "tip", tip: "This sentence is much much much too long to be a small tip for a grade eight student to repeat back" }; // 超长 → 降级
  if (a.includes("chinesetip")) return { opener: "tip", tip: "你应该说 We both like music." };    // 含中文 → 降级
  if (a.includes("badopener")) return { opener: "wow", tip: "" };                                 // 非法 opener → 降级
  if (a.includes("grammar")) return { opener: "tip", tip: "We both like music." };                // 正常纠错
  if (a.includes("broken")) return null;                                                          // 非法 JSON → 降级
  return { opener: "great", tip: "" };
}

const server = http.createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": req.headers.origin || "*",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Max-Age": "600"
  };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  let body = "";
  req.on("data", c => { body += c; });
  req.on("end", () => {
    let user = "";
    try {
      const j = JSON.parse(body);
      const m = (j.messages || []).filter(x => x.role === "user").pop();
      user = m ? m.content : "";
    } catch (e) { user = body; }
    const ans = (user.split("Student answer:")[1] || "").trim();
    const obj = reply(ans);
    const content = obj === null ? "{not json" : JSON.stringify(obj);
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
  });
});
server.listen(PORT, "127.0.0.1", () => console.log("fake ai on http://127.0.0.1:" + PORT + "/v1"));
