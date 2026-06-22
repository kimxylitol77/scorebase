// NHL 부상자 영문 → 한국어 선수명 사전 (Haiku 음역) — ESPN injuries 등재 선수 보강.
// 라이브 사전(nhl-player-names-haiku.json)은 player_id 키라 영문 기반 부상자엔 못 씀 → 별도.
// 소스: ESPN NHL 부상자 (NHL 은 BALLDONTLIE 미지원 → ESPN 유일). toKoreanPlayerName 미커버만 음역.
// 출력: data/nhl-injury-names-haiku.json (멱등 머지) → player-names.ts 에서 import.
//   data/*.json 이라 mac-mini weekly-static-refresh.sh 가 자동 갱신·push.
//   실행: env -u ANTHROPIC_API_KEY npx tsx scripts/build-nhl-injury-names-haiku.ts [LIMIT]
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config();
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchEspnInjuries } from "../src/lib/sports/espn-injuries";
import { toKoreanPlayerName } from "../src/lib/player-names";
import nhlPlayersRaw from "../data/nhl-players.json";

const BATCH = 50;
const OUT = "data/nhl-injury-names-haiku.json";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const LIMIT = parseInt(process.argv[2] ?? "0", 10);

if (!ANTHROPIC_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 미설정 (env -u ANTHROPIC_API_KEY 로 실행했는지 확인)");
  process.exit(1);
}

interface AnthropicResp {
  content?: Array<{ text?: string }>;
}

async function collectInjuredNames(): Promise<string[]> {
  const names = new Set<string>();
  try {
    const espn = await fetchEspnInjuries("NHL");
    for (const i of espn) if (i.playerName?.trim()) names.add(i.playerName.trim());
  } catch (e) {
    console.warn("! ESPN 실패:", (e as Error).message);
  }
  return [...names];
}

async function haikuTranslate(batch: string[]): Promise<Record<string, string>> {
  const prompt =
    `다음 아이스하키(NHL) 선수 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `- 풀네임(이름 성). "Connor McDavid"→코너 맥데이비드, "Sidney Crosby"→시드니 크로스비\n` +
    `- 유럽·국제 선수는 현지 발음 관용. "Nikolaj Ehlers"→니콜라이 엘러스, "Leon Draisaitl"→레온 드라이자이틀, "Roman Josi"→로만 요시\n` +
    `- 접미사 "Jr."→주니어. 이니셜은 그대로.\n` +
    `- 자신없으면 그 entry 제외 (틀린 음역보다 누락이 나음).\n\n` +
    `선수 list:\n` +
    batch.map((en, i) => `${i + 1}. "${en}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄 (다른 설명 X). key 는 위 영문 이름 그대로:\n` +
    `{"Connor McDavid": "코너 맥데이비드", "Sidney Crosby": "시드니 크로스비", ...}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    console.warn(`! Haiku ${res.status}`);
    return {};
  }
  const data = (await res.json()) as AnthropicResp;
  const text = data?.content?.[0]?.text?.trim() ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {
    console.warn(`! no JSON: ${text.slice(0, 160)}`);
    return {};
  }
  try {
    const obj = JSON.parse(m[0]) as Record<string, string>;
    const cleaned: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const koStr = ko.trim();
      if (!koStr || !/[가-힣]/.test(koStr)) continue;
      cleaned[en] = koStr;
    }
    return cleaned;
  } catch (e) {
    console.warn(`! JSON parse fail: ${(e as Error).message}`);
    return {};
  }
}

async function main() {
  const all = await collectInjuredNames();
  // nhl-players.json 전체 로스터(875)도 음역 대상에 포함 — build-nhl-players 가 Haiku 음역을
  // 안 해서 ko 가 영문 fallback 인 선수(702명)를 toKoreanPlayerName 미커버로 잡아 보강.
  const idx = nhlPlayersRaw as Record<string, { name?: string }>;
  for (const e of Object.values(idx)) if (e.name && !all.includes(e.name)) all.push(e.name);
  console.log(`▶ NHL ESPN 부상자 + nhl-players.json 로스터: ${all.length}명`);

  const outPath = resolve(OUT);
  let existing: Record<string, string> = {};
  if (existsSync(outPath)) {
    try {
      existing = JSON.parse(readFileSync(outPath, "utf8")) as Record<string, string>;
    } catch {}
  }
  let todo = all.filter((en) => toKoreanPlayerName(en) === en && !(en in existing));
  console.log(`▶ 기존 커버 제외 → 신규 음역 대상 ${todo.length} (haiku 파일 기존 ${Object.keys(existing).length})`);
  if (LIMIT > 0 && todo.length > LIMIT) {
    todo = todo.slice(0, LIMIT);
    console.log(`  LIMIT=${LIMIT}`);
  }
  if (todo.length === 0) {
    console.log("✓ 신규 대상 없음 — 종료");
    return;
  }

  const merged: Record<string, string> = { ...existing };
  let added = 0;
  const totalBatch = Math.ceil(todo.length / BATCH);
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    process.stdout.write(`▶ batch ${i / BATCH + 1}/${totalBatch} (${chunk.length}명) `);
    const enToKo = await haikuTranslate(chunk);
    let up = 0;
    for (const en of chunk) {
      const ko = enToKo[en];
      if (!ko) continue;
      merged[en] = ko;
      added++;
      up++;
    }
    console.log(`+${up} (누적 ${added})`);
    await new Promise((r) => setTimeout(r, 500));
  }

  const sorted = Object.fromEntries(Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0])));
  writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\n✓ wrote ${OUT} — total ${Object.keys(sorted).length} entries (+${added})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
