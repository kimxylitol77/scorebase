// 배포 변경 자동 검수 — 최근 배포 커밋의 git diff + 변경 라우트 404 체크를
// Ollama(qwen)·ChatGPT(gpt-4o-mini) 두 외부 AI 가 리뷰. 결과를 stdout 으로 출력해
// code-diagnostics.sh 가 Claude(감독관)에게 종합 판정 자료로 넘긴다.
// 정적 tsc 진단이 못 잡는 런타임 404(예: af id 를 ts id 자리에 넣어 /transfers/1100 404)를
// 배포 직후 변경분에 좁혀 잡는 것이 목적.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
try {
  require("dotenv").config({ path: path.resolve(__dirname, ".env") });
  require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
} catch { /* dotenv 미설치(worktree 검증 환경) — 외부 주입 env 사용 */ }

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const REPO = path.resolve(__dirname, "..");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:14b";
const OPENAI_KEY = process.env.OPENAI_API_KEY;
// OPENAI_MODEL 은 사이트 글 작성용으로 UUID 오설정된 이력이 있어 전용 env 로 분리(기본 gpt-4o-mini).
const OPENAI_MODEL = process.env.CODE_REVIEW_OPENAI_MODEL || "gpt-4o-mini";
const STATE = "/tmp/code-review-deploy.last"; // 마지막 검사 커밋 SHA (증분)
const DIFF_LIMIT = 12000; // AI 입력 diff 최대 길이

function git(cmd) {
  return execSync(`git -C "${REPO}" ${cmd}`, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }).trim();
}

// 배포 검사 범위 — 마지막 검사 SHA..HEAD. 첫 실행은 최근 24시간(없으면 HEAD~5).
function range() {
  const head = git("rev-parse HEAD");
  let base = "";
  try { base = fs.readFileSync(STATE, "utf8").trim(); } catch { /* 첫 실행 */ }
  // 저장된 base 가 현재 트리에 없으면(rebase 등) 폴백
  if (base) { try { git(`cat-file -e ${base}^{commit}`); } catch { base = ""; } }
  if (!base) {
    try { base = git('rev-list -1 --before="24 hours ago" HEAD'); } catch { /* noop */ }
    if (!base) base = git("rev-parse HEAD~5");
  }
  return { base, head };
}

// 변경 파일 → 라우트 URL (Next app router). 동적 [seg] 은 샘플 id 불가라 표시만.
function fileToRoute(f) {
  const m = f.match(/^src\/app\/(.*)\/(page|route)\.(tsx?|jsx?)$/);
  if (!m) return null;
  // route group (xxx) 세그먼트 제거
  const seg = m[1].split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/");
  return { url: "/" + seg, dynamic: /\[.+\]/.test(seg), kind: m[2] };
}

// production HTTP 상태 (정적 라우트만; redirect 는 따라가지 않고 그대로 — 307 은 정상일 수 있음)
async function checkUrl(u) {
  try {
    const r = await fetch(SITE + u, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "scorebase-code-review/1.0" },
    });
    return r.status;
  } catch {
    return 0; // 네트워크 오류/타임아웃
  }
}

// Ollama(맥미니 로컬) 코드 리뷰 — qwen 이 "3줄 요약" 지시를 무시하고 diff 를 장황히 나열하는
// 경향이 있어 system 강화 + num_predict 로 길이를 강제(temperature 도 낮춰 결정적으로).
async function ollamaReview(prompt, system) {
  const strictSystem = system + " 엄수: diff 내용을 요약·나열·설명하지 마라. 발견한 404/회귀 위험만 최대 3줄로, 없으면 '이상 없음' 한 줄만 써라.";
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: "system", content: strictSystem }, { role: "user", content: prompt }],
        stream: false,
        options: { temperature: 0.2, num_predict: 350 },
      }),
      signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS) || 300000),
    });
    if (!r.ok) return `(Ollama HTTP ${r.status} — 'ollama serve' 확인)`;
    const j = await r.json();
    return (j.message?.content || "").trim() || "(빈 응답)";
  } catch (e) {
    return `(Ollama 실패: ${String(e.message).slice(0, 80)})`;
  }
}

// ChatGPT 코드 리뷰 (chat completions)
async function chatgptReview(prompt, system) {
  if (!OPENAI_KEY) return "(OPENAI_API_KEY 없음 — skip)";
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return `(ChatGPT HTTP ${r.status}: ${t.slice(0, 80)})`;
    }
    const j = await r.json();
    return (j.choices?.[0]?.message?.content || "").trim() || "(빈 응답)";
  } catch (e) {
    return `(ChatGPT 실패: ${String(e.message).slice(0, 80)})`;
  }
}

const SYSTEM =
  "너는 배포 직후 코드 변경을 검수하는 시니어 리뷰어다. 방금 production 에 배포된 git diff 와 " +
  "변경된 라우트의 실제 HTTP 상태를 보고, 404/런타임 에러/회귀 위험만 한국어로 3줄 이내로 지적해라. " +
  "특히 (1) id 체계 불일치(예: api-football id 를 TheSports id 자리에) (2) 깨진 내부 링크 " +
  "(3) 잘못된 라우트/리다이렉트 (4) null/빈값 미처리. 위험 없으면 '이상 없음'만. 추측·장문 금지.";

async function main() {
  const { base, head } = range();
  if (base === head) {
    console.log("배포 변경 없음 (마지막 검사 이후 새 커밋 없음).");
    return;
  }

  const commits = git(`log --oneline ${base}..${head}`) || "(범위 내 커밋 없음)";
  const files = git(`diff --name-only ${base}..${head}`).split("\n").filter(Boolean);
  let diff = git(`diff ${base}..${head} -- src/`);
  if (diff.length > DIFF_LIMIT) diff = diff.slice(0, DIFF_LIMIT) + "\n…(diff 생략)";

  // 변경 라우트 추출 + HTTP 체크 (정적 page 만)
  const routes = [...new Map(files.map(fileToRoute).filter(Boolean).map((r) => [r.url + r.kind, r])).values()];
  const statics = routes.filter((r) => !r.dynamic && r.kind === "page");
  const httpResults = [];
  for (const r of statics) httpResults.push({ url: r.url, status: await checkUrl(r.url) });
  const dynamics = routes.filter((r) => r.dynamic);

  const httpSummary = httpResults.length
    ? httpResults.map((h) => `${h.status || "ERR"} ${h.url}`).join("\n")
    : "(변경된 정적 페이지 라우트 없음)";
  const dynNote = dynamics.length
    ? `\n동적 라우트 변경(샘플 id 필요 — diff·링크로 판단): ${dynamics.map((d) => d.url).join(", ")}`
    : "";

  const userPrompt = `[배포 커밋]\n${commits}\n\n[변경 라우트 HTTP 상태]\n${httpSummary}${dynNote}\n\n[diff (src/)]\n${diff}`;

  const [ollama, chatgpt] = await Promise.all([
    ollamaReview(userPrompt, SYSTEM),
    chatgptReview(userPrompt, SYSTEM),
  ]);

  const bad = httpResults.filter((h) => h.status === 404 || h.status >= 500 || h.status === 0);

  // stdout — code-diagnostics.sh 가 캡처해 Claude 감독관 종합에 투입
  const out = [];
  out.push(`## 배포 변경 검수 (${base.slice(0, 7)}..${head.slice(0, 7)} · ${files.length}파일)`);
  out.push(`\n[변경 라우트 HTTP]\n${httpSummary}${dynNote}`);
  if (bad.length) out.push(`\n[주의] 깨진 라우트 ${bad.length}건: ${bad.map((b) => `${b.status} ${b.url}`).join(", ")}`);
  out.push(`\n[Ollama(${OLLAMA_MODEL}) 검수]\n${ollama}`);
  out.push(`\n[ChatGPT(${OPENAI_MODEL}) 검수]\n${chatgpt}`);
  console.log(out.join("\n"));

  try { fs.writeFileSync(STATE, head); } catch { /* state 저장 실패 무시 */ }
}

main().catch((e) => {
  console.error("code-review-deploy 오류:", e.message);
  process.exit(0); // sh 흐름·heartbeat 보존
});
