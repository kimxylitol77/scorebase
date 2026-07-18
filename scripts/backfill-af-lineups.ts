// EPL 25/26 전 경기 라인업(포메이션·감독·선발 XI·grid)을 af 히스토리에서 백필해 data/ JSON 으로 저장.
// 감독 전술 연구 아티클용. DB 무접촉(읽기만). af 콜 = fixtures 1 + lineups 380 (페이싱 300ms).
//   npx tsx --env-file=.env.local scripts/backfill-af-lineups.ts [--league=EPL] [--limit=N]
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
const prisma = new PrismaClient();

const AF = "https://v3.football.api-sports.io";
const headers = { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" };
const AF_LEAGUE_ID: Record<string, number> = { EPL: 39 };
const SEASON = 2025;

// af 팀명 → 우리 Team.name 별칭 (정규화 후에도 다른 것만)
const ALIAS: Record<string, string> = {
  wolves: "wolverhampton",
  newcastleunited: "newcastle",
  leedsunited: "leeds",
  westhamunited: "westham",
  tottenhamhotspur: "tottenham",
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
async function afGet(path: string, attempt = 0): Promise<any[]> {
  const res = await fetch(`${AF}${path}`, { headers });
  const j = await res.json();
  if (j.errors && Object.keys(j.errors).length) {
    if (j.errors.rateLimit && attempt < 5) {
      console.log(`  rateLimit — 65초 대기 (${attempt + 1}/5)`);
      await sleep(65_000);
      return afGet(path, attempt + 1);
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
  const afLeague = AF_LEAGUE_ID[league];
  if (!afLeague) throw new Error(`af 리그 id 미등록: ${league}`);

  // 1) 우리 매치 — 팀 쌍(home|away 정규화)으로 인덱스. 한 시즌에 같은 홈-원정 쌍은 1회뿐.
  const ours = await prisma.match.findMany({
    where: { league, status: "FINISHED", startTime: { gte: new Date("2025-08-01"), lte: new Date("2026-06-15") } },
    select: { id: true, startTime: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  const byPair = new Map<string, { id: number; startTime: Date }>();
  for (const m of ours) byPair.set(`${norm(m.homeTeam.name)}|${norm(m.awayTeam.name)}`, { id: m.id, startTime: m.startTime });
  console.log(`우리 ${league} 25/26 FINISHED: ${ours.length}경기`);

  // 2) af 시즌 전체 fixtures → 쌍 매핑
  const fixtures = await afGet(`/fixtures?league=${afLeague}&season=${SEASON}`);
  const done = new Set(["FT", "AET", "PEN"]);
  const mapped: { afId: number; matchId: number; date: string; pair: string }[] = [];
  const unmatched: string[] = [];
  for (const f of fixtures) {
    if (!done.has(f.fixture?.status?.short)) continue;
    const pair = `${norm(f.teams.home.name)}|${norm(f.teams.away.name)}`;
    const our = byPair.get(pair);
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
    out.push({ matchId: t.matchId, afFixtureId: t.afId, date: t.date, home: sideOut(sides[0]), away: sideOut(sides[1]) });
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
