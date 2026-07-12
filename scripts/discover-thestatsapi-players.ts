// 우리 DB 상위 몸값 EPL 선수 → TheStatsAPI 선수 id 매핑 발굴 → data/thestatsapi-player-map.json
// API 검색은 다중 단어 불가 → 성(마지막 토큰)으로 조회 후 2단 확정.
//   1) 전체 이름 정규화 일치 (동명 다수면 소속팀으로 판별)
//   2) 이름 부분 일치 + 소속팀 일치 (우리 season-stats 의 영문 팀명 vs API current_team)
//      — "Estêvão"(API) vs 풀네임(우리), "João Pedro" 동명 7명 같은 케이스를 자동 해결
// 그래도 애매하면 매핑하지 않고 로그만 (틀린 매핑 < 누락).
//   실행: THESTATSAPI_KEY=... npx tsx scripts/discover-thestatsapi-players.ts [상위N=25]
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, existsSync } from "fs";

const KEY = process.env.THESTATSAPI_KEY;
if (!KEY) { console.error("THESTATSAPI_KEY 필요"); process.exit(1); }
const BASE = "https://api.thestatsapi.com/api";
const OUT = new URL("../data/thestatsapi-player-map.json", import.meta.url).pathname;
const TOP_N = Number(process.argv[2] || 25);
const COMP = { competitionId: "comp_3039", seasonId: "sn_6125938", seasonLabel: "2025-26 EPL" };

const prisma = new PrismaClient();

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
}

async function api(path: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 20_000 * (attempt + 1))); continue; }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
  }
  throw new Error(`429 지속 ${path}`);
}

interface ApiPlayer { id: string; name: string; current_team: { id: string; name: string } | null }

async function main() {
  const mv = await prisma.playerMarketValue.findMany({
    where: { league: "EPL" },
    orderBy: { currentValue: "desc" },
    take: TOP_N,
    select: { id: true, currentValue: true },
  });
  // 이름은 TheSportsPlayer 에서 (PlayerMarketValue 에는 이름 필드 없음)
  const names = new Map(
    (await prisma.theSportsPlayer.findMany({
      where: { id: { in: mv.map((r) => r.id) } },
      select: { id: true, name: true },
    })).map((p) => [p.id, p.name]),
  );
  // 소속팀 (영문) — 팀 기반 자동 판별용
  const seasonStats = JSON.parse(
    readFileSync(new URL("../data/player-season-stats.json", import.meta.url).pathname, "utf8"),
  ) as Record<string, { team: string | null }>;
  const rows = mv
    .map((r) => ({ id: r.id, name: names.get(r.id) ?? "", team: seasonStats[r.id]?.team ?? null }))
    .filter((r) => r.name && /^[A-Za-zÀ-ž' .-]+$/.test(r.name)); // 로마자 이름만 (검색 가능 형태)
  console.log(`EPL 상위 ${rows.length}명 (몸값순)`);

  const out: Record<string, { statsId: string; teamId: string; teamName: string; name: string } & typeof COMP> =
    existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

  let mapped = 0, skipped = 0;
  for (const r of rows) {
    if (out[r.id]) { console.log(`  = ${r.name} (기존 매핑)`); continue; }
    const token = norm(r.name).split(" ").pop()!; // 검색어도 악센트 제거 (Fernández → fernandez)
    const res = (await api(`/football/players?search=${encodeURIComponent(token)}&per_page=50`)) as { data: ApiPlayer[] } | null;
    await new Promise((s) => setTimeout(s, 6000)); // trial 분당 12회
    const all = res?.data ?? [];
    const sameTeam = (p: ApiPlayer) => {
      if (!r.team || !p.current_team) return false;
      const a = norm(p.current_team.name), b = norm(r.team);
      return a === b || a.includes(b) || b.includes(a);
    };
    // 1단: 전체 이름 일치 (동명 다수면 팀으로 판별)
    let cands = all.filter((p) => norm(p.name) === norm(r.name));
    if (cands.length > 1) cands = cands.filter(sameTeam);
    // 2단: 이름 부분 일치(후보 이름 토큰이 우리 이름에 모두 포함) + 팀 일치
    if (cands.length !== 1) {
      const ourTokens = new Set(norm(r.name).split(" "));
      cands = all.filter((p) => sameTeam(p) && norm(p.name).split(" ").every((t) => ourTokens.has(t)));
    }
    const c = cands[0];
    const team = c?.current_team;
    if (cands.length !== 1 || !team) {
      console.log(`  ✗ ${r.name}${r.team ? ` (${r.team})` : ""} — 후보 ${cands.length}${cands.length > 1 ? " (판별 불가)" : ""}`);
      skipped++;
      continue;
    }
    out[r.id] = { statsId: c.id, teamId: team.id, teamName: team.name, name: r.name, ...COMP };
    mapped++;
    console.log(`  ✓ ${r.name} → ${c.id} (${team.name})`);
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`매핑 ${mapped} 신규 / 스킵 ${skipped} / 총 ${Object.keys(out).length} → ${OUT}`);
}
main().finally(() => prisma.$disconnect());
