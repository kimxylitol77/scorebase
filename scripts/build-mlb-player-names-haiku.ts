// MLB 영문 → 한국어 선수명 사전 (Haiku 음역 source).
// 흐름:
//   1) 우리 DB MLB Match (최근 N일) → ESPN summary boxscore 영문 선수명 전부 수집
//   2) 기존 사전 (RAW + wiki + naver) 에 이미 있는 선수 제외 (누락만 남김)
//   3) Haiku batch (50명씩) 음역 — JSON 응답
//   4) src/lib/sports/mlb-player-names-haiku.ts 사전 출력
//
// 실행: tsx scripts/build-mlb-player-names-haiku.ts 14
// 환경변수: ANTHROPIC_API_KEY (필수), ANTHROPIC_MODEL (기본 haiku-4-5-20251001)

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { toKoreanPlayerName } from "../src/lib/player-names";

const DAYS = parseInt(process.argv[2] ?? "14", 10);
const UA = "Mozilla/5.0";
const OUT = "src/lib/sports/mlb-player-names-haiku.ts";
const BATCH = 50;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

if (!ANTHROPIC_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 미설정");
  process.exit(1);
}

interface EspnSummary {
  boxscore?: {
    players?: Array<{
      statistics?: Array<{
        athletes?: Array<{
          athlete?: { displayName?: string };
        }>;
      }>;
    }>;
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function collectNames(): Promise<Set<string>> {
  const prisma = new PrismaClient();
  const since = new Date(Date.now() - DAYS * 86400 * 1000);
  const matches = await prisma.match.findMany({
    where: { league: "MLB", startTime: { gte: since } },
    select: { externalId: true },
    orderBy: { startTime: "desc" },
  });
  console.log(`▶ MLB ${matches.length} 매치 boxscore 수집`);
  const names = new Set<string>();
  for (const m of matches) {
    const sum = await fetchJson<EspnSummary>(
      `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${m.externalId}`,
    );
    if (!sum) continue;
    for (const team of sum.boxscore?.players ?? []) {
      for (const grp of team.statistics ?? []) {
        for (const a of grp.athletes ?? []) {
          const n = a.athlete?.displayName?.trim();
          if (n) names.add(n);
        }
      }
    }
    process.stdout.write(".");
  }
  await prisma.$disconnect();
  console.log(`\n수집된 영문 선수: ${names.size}명`);
  return names;
}

interface AnthropicResp {
  content?: Array<{ text?: string }>;
}

async function haikuTranslate(batch: string[]): Promise<Record<string, string>> {
  const prompt =
    `다음 MLB 영문 선수 이름을 한국 스포츠 미디어 표기로 음역해주세요.\n` +
    `참고: 위키피디아 한국어판 또는 네이버/다음 스포츠 표기 기준.\n` +
    `- 음역 정확성 우선 (Aaron Judge → 에런 저지, Shohei Ohtani → 오타니 쇼헤이)\n` +
    `- 풀네임 한국어 표기\n` +
    `- 자신없는 선수는 결과에서 제외해도 됨\n\n` +
    `선수 list:\n` +
    batch.map((n, i) => `${i + 1}. "${n}"`).join("\n") +
    `\n\n출력 형식 — JSON 객체 한 줄, 다른 설명 X:\n` +
    `{"Aaron Judge": "에런 저지", "Shohei Ohtani": "오타니 쇼헤이", ...}`;

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
  // JSON 추출 — 가끔 ```json wrap 또는 설명 prefix 있을 수 있음
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.warn(`! no JSON in response: ${text.slice(0, 200)}`);
    return {};
  }
  try {
    const obj = JSON.parse(match[0]) as Record<string, string>;
    // 한국어 검증 — 한글 포함 + 한자 5+ 없음
    const cleaned: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const koStr = ko.trim();
      if (!koStr) continue;
      if (!/[가-힣]/.test(koStr)) continue;
      const cjk = koStr.match(/[一-鿿]/g);
      if (cjk && cjk.length >= 3) continue;
      cleaned[en] = koStr;
    }
    return cleaned;
  } catch (e) {
    console.warn(`! JSON parse fail: ${(e as Error).message}`);
    return {};
  }
}

async function main() {
  const allNames = await collectNames();

  // 기존 사전에 이미 있는 선수 제외
  const missing: string[] = [];
  for (const en of allNames) {
    const ko = toKoreanPlayerName(en);
    if (ko === en) missing.push(en);
  }
  console.log(`\n사전 누락: ${missing.length}명 (이미 매핑된 ${allNames.size - missing.length}명 skip)`);

  if (missing.length === 0) {
    console.log("✓ 모든 선수 사전 cover — Haiku 호출 skip");
    return;
  }

  // Haiku batch
  const dict: Record<string, string> = {};
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    process.stdout.write(`▶ batch ${i / BATCH + 1}/${Math.ceil(missing.length / BATCH)} (${chunk.length}명) `);
    const result = await haikuTranslate(chunk);
    Object.assign(dict, result);
    console.log(`+${Object.keys(result).length}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`총 매핑: ${Object.keys(dict).length}/${missing.length}`);

  // 기존 출력 사전과 merge
  const outPath = resolve(OUT);
  const existing: Record<string, string> = {};
  if (existsSync(outPath)) {
    const m = readFileSync(outPath, "utf8").matchAll(/"([^"]+)":\s*"([^"]+)"/g);
    for (const x of m) existing[x[1]] = x[2];
  }
  const merged = { ...existing, ...dict };
  let added = 0;
  for (const en of Object.keys(dict)) if (!(en in existing)) added++;

  const sorted = Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0]));
  const body = sorted
    .map(([en, ko]) => `  "${en.replace(/"/g, '\\"')}": "${ko.replace(/"/g, '\\"')}",`)
    .join("\n");
  const file = `// MLB 선수 영문 → 한국어 사전 (Haiku 음역 source).
// 자동 생성: scripts/build-mlb-player-names-haiku.ts
// Wiki + Naver 사전에 없는 잔여 선수 → Anthropic Haiku 가 음역.

export const MLB_PLAYER_NAMES_HAIKU_KO: Record<string, string> = {
${body}
};
`;
  writeFileSync(outPath, file);
  console.log(`✓ wrote ${OUT} — total ${sorted.length} entries (+${added})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
