// EPL 25/26 전 경기 라인업(포메이션·감독·선발 XI·grid)을 af 히스토리에서 백필해 data/ JSON 으로 저장.
// 감독 전술 연구 아티클용. DB 무접촉(읽기만). af 콜 = fixtures 1 + lineups 380 (페이싱 300ms).
//   npx tsx --env-file=.env.local scripts/backfill-af-lineups.ts [--league=EPL] [--limit=N]
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
const prisma = new PrismaClient();

const AF = "https://v3.football.api-sports.io";
const headers = { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" };
const AF_LEAGUE_ID: Record<string, number> = { EPL: 39, CHAMPIONSHIP: 40, LALIGA: 140 };
const SEASON = 2025;

// af 팀명 → 우리 Team.name 별칭 (정규화 후에도 다른 것만)
const ALIAS: Record<string, string> = {
  wolves: "wolverhampton",
  newcastleunited: "newcastle",
  leedsunited: "leeds",
  westhamunited: "westham",
  tottenhamhotspur: "tottenham",
  oviedo: "realoviedo", // af "Oviedo" vs 우리 "Real Oviedo" (LALIGA)
};
const norm = (s: string) => {
  const n = s.toLowerCase().replace(/[^a-z]/g, "");
  return ALIAS[n] ?? n;
};

type AfPlayer = { player: { id: number; name: string; number: number; pos: string; grid: string | null } };
type AfSide = {
  team: { id: number; name: string };
  formation: string | null;
  coach: { id: number; name: string } | null;
  startXI: AfPlayer[];
  substitutes: AfPlayer[];
};

export type BackfilledLineup = {
  matchId: number;
  afFixtureId: number;
  date: string; // kickoff ISO
  home: { team: string; formation: string | null; coach: string | null; startXI: { id: number; name: string; number: number; pos: string; grid: string | null }[] };
  away: { team: string; formation: string | null; coach: string | null; startXI: { id: number; name: string; number: number; pos: string; grid: string | null }[] };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 키가 Vultr 프로덕션 수집기와 공유 — rateLimit 은 던지지 말고 65초 백오프 후 재시도.
async function afGet<T = unknown>(path: string, attempt = 0): Promise<T[]> {
  const res = await fetch(`${AF}${path}`, { headers });
  const j = await res.json();
  if (j.errors && Object.keys(j.errors).length) {
    if (j.errors.rateLimit && attempt < 5) {
      console.log(`  rateLimit — 65초 대기 (${attempt + 1}/5)`);
      await sleep(65_000);
      return afGet<T>(path, attempt + 1);
    }
    throw new Error(`af 에러 ${path}: ${JSON.stringify(j.errors)}`);
  }
  return j.response ?? [];
}

function sideOut(s: AfSide) {
  return {
    team: s.team.name,
    formation: s.formation,
    coach: s.coach?.name ?? null,
    startXI: (s.startXI ?? []).map((p) => p.player),
  };
}

async function main() {
  const league = process.argv.find((a) => a.startsWith("--league="))?.split("=")[1] ?? "EPL";
  const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);
  // --teams=Coventry,Hull,Ipswich — 이 팀들이 낀 경기만 백필 (승격팀 3팀에 리그 전체 550콜을 안 쓰기 위함)
  const teamTokens = process.argv.find((a) => a.startsWith("--teams="))?.split("=")[1]?.split(",").map(norm) ?? null;
  const afLeague = AF_LEAGUE_ID[league];
  if (!afLeague) throw new Error(`af 리그 id 미등록: ${league}`);

  // 1) 우리 매치 — 팀 쌍(home|away 정규화)으로 인덱스. 한 시즌에 같은 홈-원정 쌍은 1회뿐.
  const ours = await prisma.match.findMany({
    where: { league, status: "FINISHED", startTime: { gte: new Date("2025-08-01"), lte: new Date("2026-06-15") } },
    select: { id: true, startTime: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  // 같은 홈-원정 쌍이 시즌에 두 번 나올 수 있다(정규 + 플레이오프 — 2026-08-15 헐-밀월 실측:
  // 단일 키 가정 탓에 플레이오프 라인업이 정규 경기 id 에 붙고 정규 2경기는 누락됐다).
  // 쌍당 배열로 들고, 매칭은 킥오프 ±3일 근접으로 고른다.
  const byPair = new Map<string, { id: number; startTime: Date }[]>();
  for (const m of ours) {
    const k = `${norm(m.homeTeam.name)}|${norm(m.awayTeam.name)}`;
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k)!.push({ id: m.id, startTime: m.startTime });
  }
  console.log(`우리 ${league} 25/26 FINISHED: ${ours.length}경기`);

  // 2) af 시즌 전체 fixtures → 쌍 매핑
  interface AfFixtureItem {
    fixture: { id: number; date: string; status?: { short?: string } };
    teams: { home: { name: string }; away: { name: string } };
  }
  const fixtures = await afGet<AfFixtureItem>(`/fixtures?league=${afLeague}&season=${SEASON}`);
  const done = new Set(["FT", "AET", "PEN"]);
  const mapped: { afId: number; matchId: number; date: string; pair: string }[] = [];
  const unmatched: string[] = [];
  for (const f of fixtures) {
    if (!done.has(f.fixture?.status?.short ?? "")) continue;
    const hn = norm(f.teams.home.name), an = norm(f.teams.away.name);
    if (teamTokens && !teamTokens.some((t) => hn.includes(t) || an.includes(t))) continue;
    const pair = `${hn}|${an}`;
    const cands = byPair.get(pair) ?? [];
    const afTime = new Date(f.fixture.date).getTime();
    const our = cands.find((c) => Math.abs(c.startTime.getTime() - afTime) < 3 * 864e5);
    if (!our) { unmatched.push(`${f.fixture.id} ${f.teams.home.name} vs ${f.teams.away.name}`); continue; }
    mapped.push({ afId: f.fixture.id, matchId: our.id, date: f.fixture.date, pair });
  }
  console.log(`af 종료 fixtures 매핑: ${mapped.length} / 미매칭 ${unmatched.length}`);
  for (const u of unmatched.slice(0, 10)) console.log("  미매칭:", u);
  if (unmatched.length) throw new Error("미매칭 존재 — ALIAS 보강 필요");

  // 3) lineups 백필 (기존 파일 있으면 이어받기 = 멱등)
  const outPath = `data/manager-lineups-${league.toLowerCase()}-2526.json`;
  const existing: BackfilledLineup[] = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : [];
  const have = new Set(existing.map((e) => e.afFixtureId));
  const out = [...existing];
  const targets = mapped.filter((m) => !have.has(m.afId));
  const todo = limit > 0 ? targets.slice(0, limit) : targets;
  console.log(`백필 대상: ${todo.length} (기보유 ${existing.length})`);

  let ok = 0, empty = 0;
  for (const [i, t] of todo.entries()) {
    const sides: AfSide[] = await afGet(`/fixtures/lineups?fixture=${t.afId}`);
    if (sides.length < 2) { empty++; console.log(`  라인업 없음: ${t.afId} ${t.pair}`); await sleep(300); continue; }
    // af lineups 응답의 팀 순서는 홈 먼저가 보장되지 않는다 — fixture 의 홈팀명으로 정렬.
    // (2026-08-15 실측: 챔피언십 Watford vs Coventry 에서 원정이 먼저 와 승패가 뒤집혀 저장됐다)
    const homeName = t.pair.split("|")[0];
    const homeSide = sides.find((s) => norm(s.team.name) === homeName);
    const awaySide = sides.find((s) => s !== homeSide);
    if (!homeSide || !awaySide) { empty++; console.log(`  홈팀 식별 실패: ${t.afId} ${t.pair}`); await sleep(300); continue; }
    out.push({ matchId: t.matchId, afFixtureId: t.afId, date: t.date, home: sideOut(homeSide), away: sideOut(awaySide) });
    ok++;
    if ((i + 1) % 40 === 0) {
      fs.writeFileSync(outPath, JSON.stringify(out));
      console.log(`  진행 ${i + 1}/${todo.length} (중간 저장)`);
    }
    await sleep(2000);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`완료: 신규 ${ok}, 라인업 없음 ${empty}, 총 ${out.length} → ${outPath}`);
}

main().finally(() => prisma.$disconnect());
