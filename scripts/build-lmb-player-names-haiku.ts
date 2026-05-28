// LMB (멕시칸 리그, Liga Mexicana de Béisbol) TheSports player id → 한국어 이름 사전 (Haiku 음역).
// 흐름:
//   1) 우리 DB LMB Match (최근 N일) → theSportsCache.detailLive.players 의 모든 unique ts player_id 수집
//   2) TheSports /v1/baseball/player/list?uuid=X → 영문 이름 (Jhan Marinez 등)
//   3) Haiku batch 50명 → 한국어 음역 (스페인어 발음 기준)
//   4) DB TheSportsPlayer upsert { id, name, nameKo, sport: "LMB" }
//
// 실행: tsx scripts/build-lmb-player-names-haiku.ts 30
// 환경변수: ANTHROPIC_API_KEY, THESPORTS_USER, THESPORTS_SECRET (필수)

import { PrismaClient } from "@prisma/client";

const DAYS = parseInt(process.argv[2] ?? "30", 10);
const BATCH = 50;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;

if (!ANTHROPIC_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 미설정");
  process.exit(1);
}
if (!TS_USER || !TS_SECRET) {
  console.error("❌ THESPORTS_USER / THESPORTS_SECRET 미설정");
  process.exit(1);
}

interface TsPlayerResp {
  code?: number;
  results?: Array<{
    id?: string;
    name?: string;
    short_name?: string;
    country_id?: string;
    type?: number;
  }>;
}

interface AnthropicResp {
  content?: Array<{ text?: string }>;
}

async function collectPlayerIds(): Promise<Set<string>> {
  const prisma = new PrismaClient();
  const since = new Date(Date.now() - DAYS * 86400 * 1000);
  const matches = await prisma.match.findMany({
    where: {
      league: "LMB",
      startTime: { gte: since },
      theSportsCache: { detailLive: { not: undefined } },
    },
    include: { theSportsCache: { select: { detailLive: true } } },
  });
  console.log(`▶ LMB ${matches.length} 매치 detailLive.players 수집`);

  const ids = new Set<string>();
  for (const m of matches) {
    const dl = m.theSportsCache?.detailLive as
      | { players?: { home?: Array<{ id?: string }>; away?: Array<{ id?: string }> } }
      | null;
    if (!dl?.players) continue;
    for (const side of ["home", "away"] as const) {
      const arr = dl.players[side] ?? [];
      for (const p of arr) {
        if (p?.id && typeof p.id === "string") ids.add(p.id);
      }
    }
  }
  await prisma.$disconnect();
  console.log(`수집된 unique ts player_id: ${ids.size}`);
  return ids;
}

async function fetchEnglishName(pid: string): Promise<string | null> {
  const url = `https://api.thesports.com/v1/baseball/player/list?uuid=${pid}&user=${TS_USER}&secret=${TS_SECRET}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as TsPlayerResp;
    const p = data.results?.[0];
    return p?.name?.trim() || null;
  } catch {
    return null;
  }
}

async function haikuTranslate(
  batch: Array<{ id: string; en: string }>,
): Promise<Record<string, string>> {
  // en → ko 매핑. 우리는 ts id → ko 가 필요한데 batch 안 영문 이름이 unique 하지 않을 수 있어
  // 따로 id ↔ en 매핑 후 결과 적용.
  const prompt =
    `다음 LMB (멕시칸 리그, 멕시코 프로야구) 영문 선수 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `참고: 멕시코 프로야구 선수, 대부분 스페인어/영어 이름.\n` +
    `- 스페인어 발음 기준 한글 음역 (예: Jhan Marinez → 얀 마리네스, Hector Perez → 엑토르 페레스, Carlos Munoz → 카를로스 무뇨스)\n` +
    `- 외래어 표기법 스페인어 규정 우선 (j → 발음 안 함 또는 ㅎ, ll → ㅇ/ㅈ, ñ → 뇨/냐, h → 묵음, v → ㅂ)\n` +
    `- 표기 가이드: 이름+성 사이 띄어쓰기 1개 (엑토르 페레스, 카를로스 무뇨스)\n` +
    `- 영어권 외국인 선수는 영어 음역 (예: Trevor Bauer → 트레버 바워)\n` +
    `- 자신없는 선수는 결과에서 제외 (잘못된 음역보다 누락이 나음)\n\n` +
    `선수 list:\n` +
    batch.map((b, i) => `${i + 1}. "${b.en}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄 (다른 설명 X):\n` +
    `{"Jhan Marinez": "얀 마리네스", "Hector Perez": "엑토르 페레스", ...}`;

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
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.warn(`! no JSON: ${text.slice(0, 200)}`);
    return {};
  }
  try {
    const obj = JSON.parse(match[0]) as Record<string, string>;
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
  const ids = await collectPlayerIds();

  // 이미 DB 에 nameKo 있는 player 는 skip
  const prisma = new PrismaClient();
  const existing = await prisma.theSportsPlayer.findMany({
    where: { id: { in: Array.from(ids) }, nameKo: { not: null } },
    select: { id: true },
  });
  const alreadyMapped = new Set(existing.map((e) => e.id));
  const todo = Array.from(ids).filter((id) => !alreadyMapped.has(id));
  console.log(`▶ 이미 매핑 ${alreadyMapped.size}, 신규 매핑 대상 ${todo.length}`);

  // 1) 영문 이름 fetch (TheSports player/list)
  console.log(`▶ TheSports player/list 영문 이름 fetch (${todo.length}건)`);
  const records: Array<{ id: string; en: string }> = [];
  let okCount = 0;
  for (let i = 0; i < todo.length; i++) {
    const id = todo[i];
    const en = await fetchEnglishName(id);
    if (en) {
      records.push({ id, en });
      okCount++;
    }
    if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1}/${todo.length} (en hit ${okCount})\n`);
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`✓ 영문 이름 hit: ${records.length}/${todo.length}`);

  if (records.length === 0) {
    await prisma.$disconnect();
    console.log("매핑할 선수 없음");
    return;
  }

  // 2) Haiku 음역 — en → ko 매핑 dictionary
  const enToKo: Record<string, string> = {};
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    process.stdout.write(`▶ Haiku batch ${i / BATCH + 1}/${Math.ceil(records.length / BATCH)} (${chunk.length}명) `);
    const result = await haikuTranslate(chunk);
    Object.assign(enToKo, result);
    console.log(`+${Object.keys(result).length}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`총 영문 → 한글 매핑: ${Object.keys(enToKo).length}/${records.length}`);

  // 3) DB upsert — id + en + ko
  let upserted = 0;
  for (const { id, en } of records) {
    const ko = enToKo[en];
    if (!ko) continue;
    try {
      await prisma.theSportsPlayer.upsert({
        where: { id },
        update: { name: en, nameKo: ko },
        create: { id, name: en, nameKo: ko, sport: "LMB" },
      });
      upserted++;
    } catch (e) {
      console.warn(`! upsert fail ${id}: ${(e as Error).message}`);
    }
  }
  await prisma.$disconnect();
  console.log(`✓ DB upsert: ${upserted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
