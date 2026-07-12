// 선수 한글 표기를 한국어 위키백과 표제어(=구글·나무위키와 사실상 일치하는 관용 표기)로 동기화.
// 영어 이름으로 ko.wikipedia 검색 → 표제어 추출 → 현재 nameKo 와 다르면 교정 후보로.
//   dry-run: npx tsx --env-file=.env.local scripts/sync-player-ko-wikipedia.ts --team 3711
//   apply:   ... --team 3711 --apply   (DB 수정 + data/player-ko-locks.json 잠금 등재)
// 잠금된 선수는 공식명 봇(apply-thesports-official-korean)이 덮어쓰지 않는다.
// 안전장치: 표제어가 순한글이 아니거나, 검색 결과 설명에 축구 맥락이 없으면 "불확실"로 보류.
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const teamArg = process.argv.indexOf("--team");
const TEAM_ID = teamArg >= 0 ? process.argv[teamArg + 1] : null;

const LOCKS_PATH = path.resolve(__dirname, "../data/player-ko-locks.json");
const SQUADS_PATH = path.resolve(__dirname, "../data/wc-national-squads.json");

interface WikiHit {
  title: string;
  snippet: string;
}

// ko.wikipedia 검색 — Wikimedia REST API(api.wikimedia.org, 익명 500req/h)로 조회.
// 구 액션 API(ko.wikipedia.org/w/api.php)는 익명 쿼터가 매우 박해 429 차단이 잦았음.
// 429(레이트리밋)면 즉시 throw — "결과 없음" 오탐으로 조용히 넘어가면 안 됨.
async function searchKoWiki(name: string): Promise<WikiHit | null> {
  const url = `https://api.wikimedia.org/core/v1/wikipedia/ko/search/page?q=${encodeURIComponent(name)}&limit=3`;
  const res = await fetch(url, { headers: { "User-Agent": "scorebase-ko-name-sync/1.0 (scorebase.kr)" } });
  if (res.status === 429) throw new Error("위키 API 레이트리밋(429) — 잠시 후 재시도하세요");
  if (!res.ok) return null;
  const j = (await res.json()) as { pages?: { title: string; excerpt?: string; description?: string }[] };
  const hits = j.pages ?? [];
  if (hits.length === 0) return null;
  const h = hits[0];
  const snippet = `${h.excerpt ?? ""} ${h.description ?? ""}`.replace(/<[^>]+>/g, "");
  return { title: h.title, snippet };
}

// 표제어 정리: "마크 게히 (축구 선수)" → "마크 게히". 순한글(공백 포함) 아니면 null.
function cleanTitle(title: string): string | null {
  const s = title.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!/^[가-힣][가-힣\s·-]*$/.test(s)) return null;
  return s;
}

// 축구 선수 문서인지 — 제목 괄호나 스니펫에 축구 맥락이 있어야 확신.
function isFootballContext(title: string, snippet: string): boolean {
  return /축구|풋볼/.test(title + " " + snippet);
}

async function main() {
  if (!TEAM_ID) {
    console.error("사용법: --team <tsId> [--apply]");
    process.exit(1);
  }
  const squads = JSON.parse(readFileSync(SQUADS_PATH, "utf8")) as Record<
    string,
    { name?: string; tsId: string; squad: { id: string; name: string }[] }
  >;
  // /national-teams/<id> 의 id 가 최상위 키. tsId 로도 조회 허용.
  const team = squads[TEAM_ID] ?? Object.values(squads).find((t) => t.tsId === TEAM_ID);
  if (!team) {
    console.error(`tsId=${TEAM_ID} 스쿼드 없음`);
    process.exit(1);
  }

  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: team.squad.map((p) => p.id) } },
    select: { id: true, name: true, nameKo: true },
  });
  const byId = new Map(players.map((p) => [p.id, p]));
  console.log(`스쿼드 ${team.squad.length}명 / DB 매칭 ${players.length}명\n`);

  // 사용자 확정 잠금은 위키보다 우선 — 위키 표제어가 달라도 안 건드림(예: 위키 "마크 게이" vs 확정 "마크 게히").
  const existingLocks: Record<string, unknown> = existsSync(LOCKS_PATH)
    ? JSON.parse(readFileSync(LOCKS_PATH, "utf8"))
    : {};

  const changes: { id: string; en: string; from: string | null; to: string }[] = [];
  const uncertain: string[] = [];
  for (const sp of team.squad) {
    const p = byId.get(sp.id);
    if (!p) continue;
    if (existingLocks[p.id]) continue; // 확정 표기 — 위키 조회조차 안 함
    const hit = await searchKoWiki(p.name);
    await new Promise((r) => setTimeout(r, 2000)); // 위키 API 예의(레이트리밋 회피)
    if (!hit) { uncertain.push(`${p.name} — 위키 결과 없음 (현행 유지: ${p.nameKo})`); continue; }
    const ko = cleanTitle(hit.title);
    if (!ko || !isFootballContext(hit.title, hit.snippet)) {
      uncertain.push(`${p.name} — 불확실 "${hit.title}" (현행 유지: ${p.nameKo})`);
      continue;
    }
    if (p.nameKo === ko) continue; // 이미 일치
    changes.push({ id: p.id, en: p.name, from: p.nameKo, to: ko });
  }

  console.log(`=== 교정 후보 ${changes.length}건 ===`);
  for (const c of changes) console.log(`  ${c.en}: "${c.from}" → "${c.to}"`);
  console.log(`\n=== 보류(불확실) ${uncertain.length}건 ===`);
  for (const u of uncertain) console.log(`  ${u}`);

  if (!APPLY) { console.log("\n[DRY-RUN] --apply 로 적용 + 잠금"); await prisma.$disconnect(); return; }

  const locks: Record<string, { en: string; ko: string }> = existsSync(LOCKS_PATH)
    ? JSON.parse(readFileSync(LOCKS_PATH, "utf8"))
    : {};
  for (const c of changes) {
    await prisma.theSportsPlayer.update({ where: { id: c.id }, data: { nameKo: c.to } });
    locks[c.id] = { en: c.en, ko: c.to };
  }
  writeFileSync(LOCKS_PATH, JSON.stringify(locks, null, 1) + "\n");
  console.log(`\n적용 ${changes.length}건 + 잠금 등재 → ${LOCKS_PATH}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
