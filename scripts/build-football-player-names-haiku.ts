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

import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config(); // .env fallback (override 안 함 — .env.local 우선)
import { PrismaClient } from "@prisma/client";

const BATCH = 50;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const LIMIT = parseInt(process.argv[2] ?? "0", 10);

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
      const koStr = ko.trim();
      if (!koStr) continue;
      if (!/[가-힣]/.test(koStr)) continue; // 한글 없으면 버림
      const cjk = koStr.match(/[一-鿿]/g);
      if (cjk && cjk.length >= 2) continue; // 중국어 혼입 방어
      cleaned[en] = koStr;
    }
    return cleaned;
  } catch (e) {
    console.warn(`! JSON parse fail: ${(e as Error).message}`);
    return {};
  }
}

async function main() {
  const prisma = new PrismaClient();
  const all = await collectPlayers(prisma);
  console.log(`▶ 축구 라인업 cache 수집: unique player ${all.size}명`);

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

  await prisma.$disconnect();
  console.log(`\n✓ 완료 — DB upsert ${upserted}/${todo.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
