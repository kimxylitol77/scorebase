// 감독관 봇 — 작업 중인 git diff 를 GPT(OpenAI)로 채점하는 on-demand 코드 리뷰어.
// self-review bias 방지용: Claude 가 작성한 코드를 다른 모델(GPT)이 적대적으로 채점한다.
// 사용: node scripts/supervisor-review.mjs  (uncommitted 변경 + 새 파일 자동 수집)
// 통과 기준: score >= PASS_SCORE && blockers 0 → exit 0(배포 가능), 아니면 exit 1.
//
// 환경: /Users/kimss/scorebase/.env.local 의 OPENAI_API_KEY (로컬 셸 export 가 빈 값이라 파일에서 직접 읽음).

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const PASS_SCORE = 80;
const MODEL = process.env.SUPERVISOR_MODEL || "gpt-4o";
const SELF = "scripts/supervisor-review.mjs"; // 자기 자신은 채점 대상에서 제외
const ENV_PATH = "/Users/kimss/scorebase/.env.local";

function loadKey() {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) return process.env.OPENAI_API_KEY.trim();
  for (const line of readFileSync(ENV_PATH, "utf-8").split("\n")) {
    const m = line.match(/^OPENAI_API_KEY=(.*)$/);
    if (m) return m[1].replace(/^["']|["']$/g, "").trim();
  }
  throw new Error("OPENAI_API_KEY 를 찾을 수 없습니다");
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 }).trim();
}

// uncommitted tracked 변경(git diff HEAD) + 새 파일(untracked) 을 하나의 diff 텍스트로.
function collectDiff() {
  let diff = sh("git diff HEAD");
  const codeExt = /\.(ts|tsx|js|jsx|mjs|css|sql|prisma|json|md)$/;
  const allUntracked = sh("git ls-files --others --exclude-standard")
    .split("\n")
    .map((s) => s.trim())
    .filter((f) => f && f !== SELF);
  const MAX_FILE = 20000; // 생성 데이터 등 대용량 파일은 내용 제외(토큰 보호)
  const bigFiles = [];
  for (const f of allUntracked.filter((f) => codeExt.test(f))) {
    try {
      const body = readFileSync(f, "utf-8");
      if (body.length > MAX_FILE) { bigFiles.push(f); continue; }
      diff += `\n\n=== NEW FILE: ${f} ===\n` + body;
    } catch {
      /* skip unreadable */
    }
  }
  // 코드가 아닌 새 에셋(이미지·SVG 등) + 대용량 생성 파일은 내용 대신 추가 사실만 알림.
  const assets = [...allUntracked.filter((f) => !codeExt.test(f)), ...bigFiles];
  if (assets.length) diff += `\n\n=== 새로 추가된 에셋(내용 생략, 저장소에 존재·참조 유효) ===\n` + assets.join("\n");
  const files = sh("git diff HEAD --name-only").split("\n").filter(Boolean).filter((f) => f !== SELF);
  return { diff, files: [...files, ...allUntracked] };
}

const SYSTEM = `당신은 Scorebase(Next.js 16 + Prisma + Neon Postgres 한국 스포츠 미디어)의 깐깐한 시니어 코드 리뷰 감독관입니다.
이 diff 는 다른 AI(Claude)가 작성했습니다. 동료가 아니라 적대적 검수자로서, 배포를 막아야 할 진짜 결함을 찾는 데 집중하세요. 막연한 칭찬은 금지.

채점 차원:
1. 정확성·버그 — 로직 오류, 런타임 예외, 타입 불일치, null/undefined 처리, 잘못된 데이터 가정.
2. 회귀 위험 — 기존 동작을 깨뜨리는가. 인터페이스 변경 시 모든 호출부가 갱신됐는가.
3. 프로젝트 규칙(CLAUDE.md) — 외과적 변경(요청 범위 밖 수정 없음), 단순함(과한 추상화 없음), 새 파일 첫 줄 한국어 헤더 주석, 한국어 문장은 마침표로 종결(콜론 금지).
4. SEO 타당성(해당 시) — 키워드 스터핑/스팸이 아닌 자연스러운 최적화인가. 메타/구조화 데이터가 올바른가.
5. 단순성·가독성 — 더 단순한 방법이 있는가.

반드시 아래 JSON 스키마로만 답하세요(다른 텍스트 금지):
{
  "score": <0~100 정수>,
  "verdict": "PASS" | "REVISE",
  "blockers": [<배포를 막아야 하는 치명적 이슈. 없으면 빈 배열>],
  "suggestions": [<배포는 가능하나 개선 권고. 파일:내용 형태>],
  "praise": [<잘된 점 1~2개. 과장 금지>],
  "summary": "<한국어 2~3문장 총평. 문장은 마침표로 끝낼 것>"
}
verdict 는 score>=${PASS_SCORE} 이고 blockers 가 비었을 때만 PASS.`;

async function main() {
  const key = loadKey();
  const { diff, files } = collectDiff();
  if (!diff.trim()) {
    console.log("채점할 변경이 없습니다 (git diff HEAD 비어 있음).");
    process.exit(0);
  }
  console.log(`[감독관] 모델=${MODEL} · 변경 파일 ${files.length}개 · diff ${diff.length.toLocaleString()}자\n채점 중...\n`);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `변경 파일:\n${files.join("\n")}\n\n=== DIFF ===\n${diff}` },
      ],
    }),
  });
  if (!res.ok) {
    console.error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
    process.exit(2);
  }
  const data = await res.json();
  let r;
  try {
    r = JSON.parse(data.choices[0].message.content);
  } catch {
    console.error("응답 JSON 파싱 실패:\n" + data.choices?.[0]?.message?.content);
    process.exit(2);
  }

  const pass = r.score >= PASS_SCORE && (r.blockers?.length ?? 0) === 0;
  const bar = "─".repeat(52);
  console.log(bar);
  console.log(`  감독관 점수: ${r.score}/100   판정: ${pass ? "✅ PASS (배포 가능)" : "⛔ REVISE (수정 필요)"}`);
  console.log(bar);
  console.log(`\n총평: ${r.summary}\n`);
  if (r.blockers?.length) {
    console.log("배포 차단 이슈(blockers):");
    r.blockers.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    console.log("");
  }
  if (r.suggestions?.length) {
    console.log("개선 권고(suggestions):");
    r.suggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    console.log("");
  }
  if (r.praise?.length) {
    console.log("잘된 점:");
    r.praise.forEach((p) => console.log(`  · ${p}`));
    console.log("");
  }
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("감독관 실행 실패:", e.message);
  process.exit(2);
});
