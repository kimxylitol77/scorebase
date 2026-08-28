// 우리 DB 상위 몸값 EPL 선수 → TheStatsAPI 선수 id 매핑 발굴 → data/thestatsapi-player-map.json
// API 검색은 다중 단어 불가 → 성(마지막 토큰)으로 조회 후 2단 확정.
//   1) 전체 이름 정규화 일치 (동명 다수면 소속팀으로 판별)
//   2) 이름 부분 일치 + 소속팀 일치 (우리 season-stats 의 영문 팀명 vs API current_team)
//      — "Estêvão"(API) vs 풀네임(우리), "João Pedro" 동명 7명 같은 케이스를 자동 해결
// 그래도 애매하면 매핑하지 않고 로그만 (틀린 매핑 < 누락).
//   실행: THESTATSAPI_KEY=... npx tsx scripts/discover-thestatsapi-players.ts [리그=EPL] [상위N=25] [--season=25/26]
// 시즌 주의: 히트맵 커버리지가 리그마다 다르다 (2026-08-14 실측 — 25/26 은 EPL·SERIE_A 만, LALIGA·BUNDESLIGA·
// LIGUE_1 은 404 이고 24/25 는 정상). 기존 매핑은 시즌이 다르면 statsId 를 재사용해 콜 없이 시즌만 갈아끼운다.
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, existsSync } from "fs";

const KEY = process.env.THESTATSAPI_KEY;
if (!KEY) { console.error("THESTATSAPI_KEY 필요"); process.exit(1); }
const BASE = "https://api.thestatsapi.com/api";
const OUT = new URL("../data/thestatsapi-player-map.json", import.meta.url).pathname;

// 5대 리그 TheStatsAPI 대회 id (2026-07-13 competitions 실측). 시즌 id 는 실행 시 조회.
const LEAGUE_CFG: Record<string, { competitionId: string }> = {
  EPL: { competitionId: "comp_3039" },
  LALIGA: { competitionId: "comp_8814" },
  SERIE_A: { competitionId: "comp_5840" },
  BUNDESLIGA: { competitionId: "comp_4643" },
  LIGUE_1: { competitionId: "comp_0256" },
  // 빅5 밖에서 히트맵이 실제로 나오는 리그 (2026-08-28 전수 확인).
  // ⚠ 대회 목록에 있는 것과 히트맵을 주는 것은 다르다 — MLS·사우디·UCL·유로파·챔피언십·
  //   에레디비시·프리메이라·쉬페르리그·브라질·리가MX·K리그1·J1 은 전부 404 였다.
  SPL: { competitionId: "comp_6387" },
  BUNDESLIGA_2: { competitionId: "comp_0406" },
  SERIE_B: { competitionId: "comp_5450" },
};
// 하위 호환: 첫 인자가 숫자면 EPL 상위 N
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const argLeague = positional[0] && !/^\d+$/.test(positional[0]) ? positional[0] : "EPL";
const TOP_N = Number((/^\d+$/.test(positional[0] ?? "") ? positional[0] : positional[1]) || 25);
const SEASON_TAG = process.argv.find((a) => a.startsWith("--season="))?.slice(9) ?? "25/26"; // "24/25" 형태
const SEASON_PREFIX = `20${SEASON_TAG.split("/")[0]}-${SEASON_TAG.split("/")[1]}`; // "2024-25"
const CFG = LEAGUE_CFG[argLeague];
if (!CFG) { console.error(`지원 리그: ${Object.keys(LEAGUE_CFG).join(", ")}`); process.exit(1); }

const prisma = new PrismaClient();

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
}

async function api(path: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    // 네트워크 오류(EHOSTUNREACH 등)도 재시도한다 — 감싸지 않으면 fetch 의 throw 가 이 루프를
    // 뚫고 나가 스크립트가 통째로 죽는다 (2026-08-15 맥미니 IPv6 경로 끊김으로 발굴 321건 소실).
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${KEY}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
      continue;
    }
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 20_000 * (attempt + 1))); continue; }
    if (res.status === 404) return null;
    // 5xx 는 공급자 일시 오류 — 429 처럼 물러섰다 재시도 (2026-08-27 라리가 500 으로 스테이지 전멸).
    if (res.status >= 500) {
      if (attempt < 3) { await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1))); continue; }
    }
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
  }
  throw new Error(`429 지속 ${path}`);
}

interface ApiPlayer { id: string; name: string; current_team: { id: string; name: string } | null }

async function main() {
  // 시즌 id 는 실행 시 조회 (리그마다 다름)
  const seasonsRes = (await api(`/football/competitions/${CFG.competitionId}/seasons`)) as
    | { data: Array<{ id: string; name: string }> }
    | null;
  const season = seasonsRes?.data?.find((s) => s.name.includes(SEASON_TAG));
  if (!season) { console.error(`${argLeague} ${SEASON_TAG} 시즌을 찾을 수 없음`); process.exit(1); }
  const COMP = { competitionId: CFG.competitionId, seasonId: season.id, seasonLabel: `${SEASON_PREFIX} ${argLeague}` };
  console.log(`${argLeague} → ${CFG.competitionId} / ${season.id} (${season.name})`);

  let mv: { id: string }[] = await prisma.playerMarketValue.findMany({
    where: { league: argLeague },
    orderBy: { currentValue: "desc" },
    take: TOP_N,
    select: { id: true, currentValue: true },
  });
  // 몸값 유니버스가 없는 리그는 우리 DB 팀 스쿼드로 대신한다.
  // PlayerMarketValue 는 빅5·MLS·사우디·K리그만 채워져 있어(2026-08-28 실측) 그 밖의 리그는
  // 이 폴백이 없으면 대상 0명으로 조용히 끝난다. 몸값순 정렬이 없으니 TOP_N 은 "상위"가
  // 아니라 "앞에서 N명"이 되는데, 하위 리그는 어차피 전원 대상이라 무해하다.
  if (mv.length === 0) {
    const teams = await prisma.team.findMany({ where: { league: argLeague }, select: { id: true } });
    const src = await prisma.teamSourceId.findMany({
      where: { teamId: { in: teams.map((t) => t.id) }, source: "thesports" },
      select: { externalId: true },
    });
    mv = src.length
      ? await prisma.theSportsPlayer.findMany({
          where: { teamId: { in: src.map((x) => x.externalId) } },
          take: TOP_N,
          select: { id: true },
        })
      : [];
    console.log(`${argLeague} 몸값 유니버스 없음 → 팀 스쿼드에서 ${mv.length}명`);
  }
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
  console.log(`${argLeague} 상위 ${rows.length}명 (몸값순)`);

  const out: Record<string, { statsId: string; teamId: string; teamName: string; name: string } & typeof COMP> =
    existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

  let mapped = 0, skipped = 0, reseasoned = 0;
  for (const r of rows) {
    const prev = out[r.id];
    if (prev?.seasonId === COMP.seasonId) { console.log(`  = ${r.name} (기존 매핑)`); continue; }
    if (prev) {
      out[r.id] = { ...prev, ...COMP };
      reseasoned++;
      console.log(`  ↻ ${r.name} — 시즌 교체 ${COMP.seasonLabel}`);
      // 교체는 콜 없이 루프 앞쪽에서 몰아 끝난다 — 뒤이은 첫 API 콜에서 죽으면 통째로 날아가니 함께 저장.
      if (reseasoned % 10 === 0) writeFileSync(OUT, JSON.stringify(out, null, 1));
      continue;
    }
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
    // 10명마다 저장 — 마지막에만 쓰면 중간에 죽을 때 전부 날아간다
    // (2026-08-15 맥미니: EHOSTUNREACH 로 죽으면서 발굴 321건이 통째로 소실).
    if (mapped % 10 === 0) writeFileSync(OUT, JSON.stringify(out, null, 1));
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`매핑 ${mapped} 신규 / 시즌교체 ${reseasoned} / 스킵 ${skipped} / 총 ${Object.keys(out).length} → ${OUT}`);
}
main().finally(() => prisma.$disconnect());
