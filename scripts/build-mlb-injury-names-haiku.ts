// MLB 부상자 영문 → 한국어 선수명 사전 (Haiku 음역) — IL 등재 선수 보강.
// 기존 mlb-player-names-haiku.ts(박스스코어 소스)는 IL 선수를 구조적으로 못 잡음 → 부상자 union 으로 별도 보강.
// 소스: BALLDONTLIE + ESPN MLB 부상자 union (페이지가 실제 쓰는 데이터). 기존 사전 미커버만 음역.
// 출력: data/mlb-injury-names-haiku.json (멱등 머지) → player-names.ts 에서 import.
//   data/*.json 이라 mac-mini weekly-static-refresh.sh 가 자동 갱신·push.
//   실행: env -u ANTHROPIC_API_KEY npx tsx scripts/build-mlb-injury-names-haiku.ts [LIMIT]
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config();
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchBalldontlieInjuries } from "../src/lib/sports/balldontlie";
import { fetchEspnInjuries } from "../src/lib/sports/espn-injuries";
import { toKoreanPlayerName } from "../src/lib/player-names";

const BATCH = 50;
const OUT = "data/mlb-injury-names-haiku.json";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const LIMIT = parseInt(process.argv[2] ?? "0", 10);

if (!ANTHROPIC_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 미설정 (env -u ANTHROPIC_API_KEY 로 실행했는지 확인)");
  process.exit(1);
}

interface AnthropicResp { content?: Array<{ text?: string }> }

async function collectInjuredNames(): Promise<string[]> {
  const names = new Set<string>();
  try {
    const bdl = await fetchBalldontlieInjuries("MLB");
    for (const i of bdl) if (i.playerName?.trim()) names.add(i.playerName.trim());
  } catch (e) { console.warn("! BALLDONTLIE 실패:", (e as Error).message); }
  try {
    const espn = await fetchEspnInjuries("MLB");
    for (const i of espn) if (i.playerName?.trim()) names.add(i.playerName.trim());
  } catch (e) { console.warn("! ESPN 실패:", (e as Error).message); }
  return [...names];
}

async function haikuTranslate(batch: string[]): Promise<Record<string, string>> {
  // 프롬프트는 기존 build-mlb-player-names-haiku.ts 와 동일 관례 (표기 일관성).
  const prompt =
    `다음 MLB 영문 선수 이름을 한국 스포츠 미디어 표기로 음역해주세요.\n` +
    `참고: 위키피디아 한국어판 또는 네이버/다음 스포츠 표기 기준.\n` +
    `- 음역 정확성 우선 (Aaron Judge → 에런 저지, Shohei Ohtani → 오타니 쇼헤이)\n` +
    `- 일본 선수는 성+이름 순 (Yusei Kikuchi → 키쿠치 유세이, Seiya Suzuki → 스즈키 세이야)\n` +
    `- 풀네임 한국어 표기\n` +
    `- 한국인 메이저리거의 한국 성씨는 두음법칙 적용: Lee → 이, Ryu → 류, Roh → 노, Lim → 임 (예: Hyun-jin Ryu → 류현진)\n` +
    `- 자신없는 선수는 결과에서 제외해도 됨\n\n` +
    `선수 list:\n` +
    batch.map((n, i) => `${i + 1}. "${n}"`).join("\n") +
    `\n\n출력 형식 — JSON 객체 한 줄, 다른 설명 X:\n` +
    `{"Aaron Judge": "에런 저지", "Shohei Ohtani": "오타니 쇼헤이", ...}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) { console.warn(`! Haiku ${res.status}`); return {}; }
  const data = (await res.json()) as AnthropicResp;
  const text = data?.content?.[0]?.text?.trim() ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) { console.warn(`! no JSON: ${text.slice(0, 160)}`); return {}; }
  try {
    const obj = JSON.parse(m[0]) as Record<string, string>;
    const cleaned: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const koStr = ko.trim();
      if (!koStr) continue;
      if (!/[가-힣]/.test(koStr)) continue; // 한글 없으면 버림
      cleaned[en] = koStr;
    }
    return cleaned;
  } catch (e) { console.warn(`! JSON parse fail: ${(e as Error).message}`); return {}; }
}

async function main() {
  const all = await collectInjuredNames();
  console.log(`▶ MLB 부상자 union 수집: ${all.length}명`);

  const outPath = resolve(OUT);
  let existing: Record<string, string> = {};
  if (existsSync(outPath)) {
    try { existing = JSON.parse(readFileSync(outPath, "utf8")) as Record<string, string>; } catch {}
  }
  let todo = all.filter((en) => toKoreanPlayerName(en) === en && !(en in existing));
  console.log(`▶ 기존 커버 제외 → 신규 음역 대상 ${todo.length} (json 기존 ${Object.keys(existing).length})`);
  if (LIMIT > 0 && todo.length > LIMIT) { todo = todo.slice(0, LIMIT); console.log(`  LIMIT=${LIMIT}`); }
  if (todo.length === 0) { console.log("✓ 신규 대상 없음 — 종료"); return; }

  const merged: Record<string, string> = { ...existing };
  let added = 0;
  const totalBatch = Math.ceil(todo.length / BATCH);
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    process.stdout.write(`▶ batch ${i / BATCH + 1}/${totalBatch} (${chunk.length}명) `);
    const enToKo = await haikuTranslate(chunk);
    let batchUp = 0;
    for (const en of chunk) {
      const ko = enToKo[en];
      if (!ko) continue;
      merged[en] = ko;
      added++;
      batchUp++;
    }
    console.log(`+${batchUp} (누적 ${added})`);
    await new Promise((r) => setTimeout(r, 500));
  }

  const sortedObj = Object.fromEntries(Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0])));
  writeFileSync(outPath, JSON.stringify(sortedObj, null, 2) + "\n");
  console.log(`\n✓ wrote ${OUT} — total ${Object.keys(sortedObj).length} entries (+${added})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
