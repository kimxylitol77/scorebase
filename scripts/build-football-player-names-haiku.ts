// 축구 TheSports player id → 한국어 이름 사전 (Haiku 음역).
//
// 야구 build-{lg}-player-names-haiku.ts 와 핵심 차이:
//   - 축구 라인업 cache (theSportsCache.lineup.lineup.home/away[]) 안에 영문 name 이 이미 있음
//     → TheSports player/list API fetch 단계 불필요 (야구는 detailLive.players 가 id 만 줘서 fetch 필요)
//   - 국제 선수 (한/일/중/유럽/남미) → 국적 다양, 음역 프롬프트도 다양
//   - DB TheSportsPlayer upsert { id, name, nameKo, sport: "FOOTBALL" }
//
// 실행: env -u ANTHROPIC_API_KEY npx tsx scripts/build-football-player-names-haiku.ts [LIMIT]
//   (Claude Code 가 빈 ANTHROPIC_API_KEY="" 주입 → dotenv override 못함. env -u 로 제거 필수.
//    override:true 도 넣었지만 표준 패턴 따름. baseball-player-names backfill 메모리 참조.)
// 환경변수: ANTHROPIC_API_KEY (필수, .env.local). THESPORTS 불필요 (API fetch 안 함).
// LIMIT: 이번 실행 최대 신규 선수 수 (0/생략 = 무제한)
//
// --from-db: 라인업 대신 **DB 의 nameKo 빈칸**을 대상으로 삼는다(2026-08-07 추가).
//   라인업 캐시만 보던 탓에 출전 기록이 없는 선수 3,885명이 구조적 사각지대였다 —
//   대부분 몸값·이적 데이터가 있어 /transfers 에 영문 그대로 노출되던 선수들이다.
//   이 모드에서는 name 을 건드리지 않고 nameKo 만 채운다.
// --wiki: haiku 앞에 en위키 ko langlink 정본을 먼저 조회한다(--from-db 와 함께 쓴다).
//
//   전량: env -u ANTHROPIC_API_KEY npx tsx scripts/build-football-player-names-haiku.ts --from-db --wiki

import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config(); // .env fallback (override 안 함 — .env.local 우선)
import { PrismaClient } from "@prisma/client";

const BATCH = 50;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const FROM_DB = process.argv.includes("--from-db");
const DO_WIKI = process.argv.includes("--wiki");
const LIMIT = parseInt(process.argv.find((a) => /^\d+$/.test(a)) ?? "0", 10);

// UA 없는 요청은 Wikipedia 가 조용히 막는다(빈 응답 — 예외가 아니다).
const WIKI_UA = "scorebase-bot/1.0 (+https://scorebase.kr)";

/** ts 가 일부 이름을 중국식 가운뎃점으로 준다(`Khvicha·Kvaratskhelia`) — 음역·위키 조회 전에 편다. */
const normalizeEn = (s: string) => s.replace(/·/g, " ").replace(/\s+/g, " ").trim();

/**
 * 음역 결과 정제. 통과 못 하면 null = 그 선수는 영문으로 표시된다(틀린 한글보다 낫다).
 * 2026-08-07 강화 — 기존 검사는 "한글 한 글자라도 있으면 통과"라 아래가 전부 새어 들어왔다.
 *   탭 혼입("후르칸\t조르바"), 가나 잔여("벤ヴェ누티"), 원문 잔여("니콜라 부야디노비치ć",
 *   "레오 Ø스티가르드"), 끝 쉼표("셰일론,"), 영문 미변환("raffaele 루비노"), 1글자("홀"·"바").
 */
function sanitizeKo(raw: string): string | null {
  let s = raw.replace(/[\t\n\r]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/[,.]+$/, "").trim();
  if (!/[가-힣]/.test(s)) return null;
  if (/[^가-힣 ·-]/.test(s)) return null; // 라틴·가나·한자 잔여 = 음역 실패
  if (s.replace(/[ ·-]/g, "").length < 2) return null; // 성 한 글자만 남은 것
  return s;
}

/** en위키 표제어 → ko langlink 정본. 무명 선수는 대개 문서가 없어 null 이 정상. */
async function fetchWikiKo(enName: string): Promise<string | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", enName);
  url.searchParams.set("prop", "langlinks");
  url.searchParams.set("lllang", "ko");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("format", "json");
  try {
    const d = (await (
      await fetch(url, { headers: { "User-Agent": WIKI_UA }, signal: AbortSignal.timeout(15000) })
    ).json()) as { query?: { pages?: Record<string, { langlinks?: Array<{ "*": string }> }> } };
    for (const page of Object.values(d.query?.pages ?? {})) {
      const ko = page.langlinks?.[0]?.["*"];
      // "무릴루 (2002년)" 같은 동음이의 꼬리는 떼고 쓴다.
      if (ko) return ko.replace(/\s*\([^)]*\)\s*$/, "").trim();
    }
  } catch {
    /* 조회 실패는 haiku 로 넘긴다 */
  }
  return null;
}

/** nameKo 가 빈 축구 선수 { id → 영문 name }. 라인업에 없어 기존 수집이 못 보던 대상. */
async function collectFromDb(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.theSportsPlayer.findMany({
    where: { sport: "FOOTBALL", nameKo: null },
    select: { id: true, name: true },
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    const en = normalizeEn(r.name ?? "");
    if (en && /[A-Za-z]/.test(en)) map.set(r.id, en);
  }
  return map;
}

if (!ANTHROPIC_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 미설정 (env -u ANTHROPIC_API_KEY 로 실행했는지 확인)");
  process.exit(1);
}

interface LineupPlayer {
  id?: string;
  name?: string;
}
interface AnthropicResp {
  content?: Array<{ text?: string }>;
}

/** 모든 축구 매치 cache.lineup 에서 { id → 영문 name } 수집 (최신 name 우선). */
async function collectPlayers(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.theSportsMatchCache.findMany({
    where: { lineup: { not: undefined } },
    select: { lineup: true },
    orderBy: { updatedAt: "asc" }, // 최신이 뒤 → Map 에 나중 덮어써 최신 name 유지
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    const lu = (r.lineup as { lineup?: { home?: LineupPlayer[]; away?: LineupPlayer[] } } | null)
      ?.lineup;
    if (!lu) continue;
    for (const side of [lu.home, lu.away]) {
      if (!Array.isArray(side)) continue;
      for (const p of side) {
        const id = typeof p?.id === "string" ? p.id : null;
        const name = typeof p?.name === "string" ? p.name.trim() : "";
        if (id && name) map.set(id, name);
      }
    }
  }
  return map;
}

async function haikuTranslate(
  batch: Array<{ id: string; en: string }>,
): Promise<Record<string, string>> {
  const prompt =
    `다음 축구 선수 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `국적이 다양합니다 (한국·일본·중국·유럽·남미 등) — 각 국적의 한국어 관용 표기를 따르세요.\n` +
    `- 한국 선수: 두음법칙 적용. Lee→이, Ryu→류, Roh→노, Lim→임, Na→나, Yoo→유.\n` +
    `  예: "Son Heung-Min"→손흥민, "Lee Kang-In"→이강인, "Jo Hyeon-woo"→조현우 (띄어쓰기 X)\n` +
    `- 일본 선수: 일본어 발음. "Minamino"→미나미노, "Kubo"→쿠보, "Mitoma"→미토마\n` +
    `- 남미(브라질/아르헨 등): 현지 발음. "Vinicius"→비니시우스, "Rodrygo"→호드리구\n` +
    `- 유럽: 관용 표기. "Mbappe"→음바페, "Haaland"→홀란드, "De Bruyne"→더브라위너, "Kane"→케인\n` +
    `- 풀네임이면 한국 미디어가 부르는 핵심 표기로 (보통 성 위주, 흔한 성은 풀네임).\n` +
    `- 자신없으면 그 entry 제외 (틀린 음역보다 누락이 나음).\n\n` +
    `선수 list:\n` +
    batch.map((b, i) => `${i + 1}. "${b.en}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄 (다른 설명 X). key 는 위 영문 이름 그대로:\n` +
    `{"Son Heung-Min": "손흥민", "Mbappe": "음바페", ...}`;

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
      const koStr = sanitizeKo(ko);
      if (koStr) cleaned[en] = koStr;
    }
    return cleaned;
  } catch (e) {
    console.warn(`! JSON parse fail: ${(e as Error).message}`);
    return {};
  }
}

async function main() {
  const prisma = new PrismaClient();
  const all = FROM_DB ? await collectFromDb(prisma) : await collectPlayers(prisma);
  console.log(
    FROM_DB
      ? `▶ DB nameKo 빈칸 수집: ${all.size}명`
      : `▶ 축구 라인업 cache 수집: unique player ${all.size}명`,
  );

  const existing = await prisma.theSportsPlayer.findMany({
    where: { id: { in: Array.from(all.keys()) }, nameKo: { not: null } },
    select: { id: true },
  });
  const mapped = new Set(existing.map((e) => e.id));
  let todo = Array.from(all.entries())
    .filter(([id]) => !mapped.has(id))
    .map(([id, en]) => ({ id, en }));
  console.log(`▶ 이미 매핑 ${mapped.size}, 신규 대상 ${todo.length}`);
  if (LIMIT > 0 && todo.length > LIMIT) {
    todo = todo.slice(0, LIMIT);
    console.log(`  LIMIT=${LIMIT} → 이번 실행 ${todo.length}명만`);
  }
  if (todo.length === 0) {
    await prisma.$disconnect();
    console.log("✓ 신규 매핑 대상 없음 — 종료");
    return;
  }

  // 위키 정본 우선 — haiku 음역보다 확실하다. 문서가 없는 무명 선수는 그대로 haiku 로 넘어간다.
  let wikiHit = 0;
  if (DO_WIKI) {
    console.log(`▶ 위키 정본 조회 ${todo.length}건 (약 ${Math.ceil((todo.length * 0.2) / 60)}분)`);
    const rest: typeof todo = [];
    for (const [i, t] of todo.entries()) {
      const ko = await fetchWikiKo(t.en);
      if (ko && /[가-힣]/.test(ko)) {
        await prisma.theSportsPlayer
          .update({ where: { id: t.id }, data: { nameKo: ko } })
          .then(() => wikiHit++)
          .catch(() => rest.push(t));
      } else rest.push(t);
      if ((i + 1) % 250 === 0) console.log(`  위키 ${i + 1}/${todo.length} (정본 ${wikiHit})`);
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log(`▶ 위키 정본 ${wikiHit}건 적용 · haiku 로 넘길 ${rest.length}건`);
    todo = rest;
  }

  let upserted = 0;
  const totalBatch = Math.ceil(todo.length / BATCH);
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    process.stdout.write(`▶ batch ${i / BATCH + 1}/${totalBatch} (${chunk.length}명) `);
    const enToKo = await haikuTranslate(chunk);
    let batchUp = 0;
    for (const { id, en } of chunk) {
      const ko = enToKo[en];
      if (!ko) continue;
      try {
        // --from-db 는 이미 있는 행의 빈칸만 채운다 — name 은 정규화 전 원본을 그대로 둔다.
        if (FROM_DB) await prisma.theSportsPlayer.update({ where: { id }, data: { nameKo: ko } });
        else
          await prisma.theSportsPlayer.upsert({
            where: { id },
            update: { name: en, nameKo: ko },
            create: { id, name: en, nameKo: ko, sport: "FOOTBALL" },
          });
        batchUp++;
        upserted++;
      } catch (e) {
        console.warn(`! upsert fail ${id}: ${(e as Error).message}`);
      }
    }
    console.log(`+${batchUp} (누적 ${upserted})`);
    await new Promise((r) => setTimeout(r, 500));
  }

  const left = FROM_DB
    ? await prisma.theSportsPlayer.count({ where: { sport: "FOOTBALL", nameKo: null } })
    : null;
  await prisma.$disconnect();
  console.log(
    `\n✓ 완료 — haiku ${upserted}/${todo.length}` +
      (DO_WIKI ? ` · 위키 정본 ${wikiHit}` : "") +
      (left !== null ? ` · 남은 빈칸 ${left}` : ""),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
