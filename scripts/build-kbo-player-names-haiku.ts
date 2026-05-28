// KBO TheSports player id → 한국어 이름 사전 (Haiku 음역).
// 흐름:
//   1) 우리 DB KBO Match (최근 N일) → theSportsCache.detailLive.players 의 모든 unique ts player_id 수집
//   2) TheSports /v1/baseball/player/list?uuid=X → 영문 이름 (Lee Hyung-Jong 등)
//   3) Haiku batch 50명 → 한국어 음역
//   4) DB TheSportsPlayer upsert { id, name, nameKo }
//
// 실행: tsx scripts/build-kbo-player-names-haiku.ts 30
// 환경변수: ANTHROPIC_API_KEY, THESPORTS_USER, THESPORTS_SECRET (필수)
// mac-mini cron 은 weekly-player-names.sh 가 .env.local 미리 source 후 호출하므로 자동 inherit.
// 로컬/Vercel function 직접 실행시도 cover 하도록 dotenv 명시 — .env.local 우선, fallback .env.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config(); // .env fallback (override 안 함)
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
      league: "KBO",
      startTime: { gte: since },
      theSportsCache: { detailLive: { not: undefined } },
    },
    include: { theSportsCache: { select: { detailLive: true } } },
  });
  console.log(`▶ KBO ${matches.length} 매치 detailLive.players 수집`);

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
    `다음 KBO (한국 프로야구) 영문 선수 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `참고: 네이버/다음 스포츠 KBO 페이지의 한국어 표기 기준.\n` +
    `- 한국 선수 (대다수): Lee Hyung-Jong → 이형종, Kim Do-yeong → 김도영, Choi Joo-hwan → 최주환 같은 직접 매핑\n` +
    `- ⚠ 두음법칙 (KBO 는 대부분 한국 선수 → 매우 중요): 한국 성씨는 로마자가 ㄹ/ㄴ 로 시작해도 두음법칙으로 표기가 바뀝니다.\n` +
    `  · Roh → 노 (로 아님!), Lee → 이 (리 아님), Lim → 임 (림 아님), Ryu → 류, Na → 나 (라 아님), Ra → 나, Yoo/Ryoo → 유\n` +
    `  · 예: "Si-hwan Roh" → 노시환 ("로시환" 절대 아님), "Hyun-jin Ryu" → 류현진\n` +
    `  · 성이 이름 뒤에 오는 어순(이름-성)도 흔하니 어느 토큰이 성인지 판단해 한국식 성-이름 순으로 표기하세요.\n` +
    `- 외국인 용병 (간혹): Aderlin Rodriguez → 아데를린 로드리게스 같은 음역 (용병에는 두음법칙 미적용)\n` +
    `- 표기 가이드: 모든 단어 합쳐서 한국식 표기 (Lee Jong-bum → 이종범, 띄어쓰기 X)\n` +
    `- 자신없으면 그 entry 제외\n\n` +
    `선수 list:\n` +
    batch.map((b, i) => `${i + 1}. "${b.en}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄 (다른 설명 X):\n` +
    `{"Lee Hyung-Jong": "이형종", "Kim Do-yeong": "김도영", ...}`;

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
        create: { id, name: en, nameKo: ko, sport: "KBO" },
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
