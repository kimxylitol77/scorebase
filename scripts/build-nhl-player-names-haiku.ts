// NHL player_id → 한국어 선수명 사전 (Haiku 음역) — 라이브/종료 매치 골 타임라인·박스스코어용.
// 소스: NHL 매치 cache(detailLive.incidents/players)에 등장한 player_id
//   → TheSports player/list?uuid 영문 → Haiku 한글.
// 출력: data/nhl-player-names-haiku.json { player_id: { ko, en, pos } } (멱등 머지).
//   data/*.json 이라 mac-mini weekly-static-refresh 가 자동 갱신·push (코드 사전과 달리 무인 자동화).
//   라이브페이지(Vercel)는 이 json 만 읽음 — TheSports 호출 불필요(IP whitelist 회피).
//   실행: env -u ANTHROPIC_API_KEY npx tsx scripts/build-nhl-player-names-haiku.ts [LIMIT]
//   (Claude Code 가 빈 ANTHROPIC_API_KEY="" 주입 → env -u 로 제거. dotenv override 보강.)
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config();
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/db";

const BATCH = 50;
const OUT = "data/nhl-player-names-haiku.json";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const TS_USER = process.env.THESPORTS_USER || "";
const TS_SECRET = process.env.THESPORTS_SECRET || "";
const LIMIT = parseInt(process.argv[2] ?? "0", 10);

if (!ANTHROPIC_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 미설정 (env -u ANTHROPIC_API_KEY 로 실행했는지 확인)");
  process.exit(1);
}
if (!TS_USER || !TS_SECRET) {
  console.error("❌ THESPORTS_USER / THESPORTS_SECRET 미설정");
  process.exit(1);
}

interface Entry {
  ko: string;
  en: string;
  pos?: string;
}
interface AnthropicResp {
  content?: Array<{ text?: string }>;
}

/** player_id → 영문 이름·포지션 (TheSports ice_hockey player/list?uuid) */
async function tsPlayer(uuid: string): Promise<{ name: string; pos?: string } | null> {
  const u = new URL("https://api.thesports.com/v1/ice_hockey/player/list");
  u.searchParams.set("user", TS_USER);
  u.searchParams.set("secret", TS_SECRET);
  u.searchParams.set("uuid", uuid);
  try {
    const r = await fetch(u.toString(), { signal: AbortSignal.timeout(15000) });
    const d = (await r.json()) as { results?: Array<{ name?: string; position?: string }> };
    const p = d.results?.[0];
    return p?.name ? { name: p.name, pos: p.position } : null;
  } catch {
    return null;
  }
}

/** NHL 매치 cache 의 incidents/players 에 등장한 모든 player_id 수집 */
async function collectPlayerIds(): Promise<Set<string>> {
  const ms = await prisma.match.findMany({
    where: { league: "NHL", theSportsCache: { isNot: null } },
    include: { theSportsCache: { select: { detailLive: true } } },
  });
  const ids = new Set<string>();
  for (const m of ms) {
    const dl = m.theSportsCache?.detailLive as {
      incidents?: Array<Record<string, string>>;
      players?: { home?: Array<{ id?: string }>; away?: Array<{ id?: string }> };
    } | null;
    if (!dl) continue;
    for (const inc of dl.incidents ?? []) {
      for (const k of ["player_id", "assists1_id", "assists2_id"]) {
        if (inc[k]) ids.add(inc[k]);
      }
    }
    for (const p of dl.players?.home ?? []) if (p.id) ids.add(p.id);
    for (const p of dl.players?.away ?? []) if (p.id) ids.add(p.id);
  }
  return ids;
}

async function haikuTranslate(batch: Array<{ id: string; en: string }>): Promise<Record<string, string>> {
  const prompt =
    `다음 아이스하키(NHL) 선수 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `- 풀네임(이름 성). "Connor McDavid"→코너 맥데이비드, "Sidney Crosby"→시드니 크로스비\n` +
    `- 유럽·국제 선수는 현지 발음 관용 표기. "Nikolaj Ehlers"→니콜라이 엘러스, "Roman Josi"→로만 요시, "Leon Draisaitl"→레온 드라이자이틀\n` +
    `- 자신없으면 그 entry 제외 (틀린 음역보다 누락이 나음).\n\n` +
    `선수 list:\n` +
    batch.map((b, i) => `${i + 1}. "${b.en}"`).join("\n") +
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
      if (!koStr || !/[가-힣]/.test(koStr)) continue; // 한글 없으면 버림
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
  console.log(`▶ NHL cache 등장 player_id: ${ids.size}`);

  const outPath = resolve(OUT);
  let existing: Record<string, Entry> = {};
  if (existsSync(outPath)) {
    try {
      existing = JSON.parse(readFileSync(outPath, "utf8")) as Record<string, Entry>;
    } catch {}
  }
  let todo = [...ids].filter((id) => !(id in existing));
  console.log(`▶ 신규 대상 ${todo.length} (기존 ${Object.keys(existing).length})`);
  if (LIMIT > 0 && todo.length > LIMIT) {
    todo = todo.slice(0, LIMIT);
    console.log(`  LIMIT=${LIMIT}`);
  }
  if (todo.length === 0) {
    console.log("✓ 신규 대상 없음 — 종료");
    return;
  }

  // 1. player_id → 영문 이름·포지션 (TheSports, rate limit ~230/min)
  console.log("▶ TheSports 영문 이름 조회...");
  const enList: Array<{ id: string; en: string; pos?: string }> = [];
  for (const id of todo) {
    const p = await tsPlayer(id);
    if (p) enList.push({ id, en: p.name, pos: p.pos });
    await new Promise((r) => setTimeout(r, 260));
  }
  console.log(`  영문 확보 ${enList.length}/${todo.length}`);

  // 2. 영문 → Haiku 한글
  const merged: Record<string, Entry> = { ...existing };
  let added = 0;
  const totalBatch = Math.ceil(enList.length / BATCH);
  for (let i = 0; i < enList.length; i += BATCH) {
    const chunk = enList.slice(i, i + BATCH);
    process.stdout.write(`▶ batch ${i / BATCH + 1}/${totalBatch} (${chunk.length}명) `);
    const enToKo = await haikuTranslate(chunk);
    let up = 0;
    for (const e of chunk) {
      const ko = enToKo[e.en];
      if (!ko) continue;
      merged[e.id] = { ko, en: e.en, pos: e.pos };
      added++;
      up++;
    }
    console.log(`+${up} (누적 ${added})`);
    await new Promise((r) => setTimeout(r, 500));
  }

  const sorted = Object.fromEntries(
    Object.entries(merged).sort((a, b) => (a[1].ko || "").localeCompare(b[1].ko || "")),
  );
  writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\n✓ wrote ${OUT} — total ${Object.keys(sorted).length} entries (+${added})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
