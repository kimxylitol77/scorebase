// 감독 과거 시즌 전술 대시보드 빌더 — DB 에 없는 옛 시즌을 af 히스토리로 집계해
// data/coach-tactical-extras.json 에 저장한다. /coaches/[id] 가 "○○ 시절" 대시보드로 렌더.
//
// 왜 af 인가. ts lineup/detail 은 최근 30일 매치만 제공(2026-08-15 실측 405) — 과거 시즌
// 라인업은 af 가 유일 소스다 (ts 1순위 원칙의 정당한 fallback). xG·샷맵은 이 시즌에
// 없으므로 0/None 으로 두고, 렌더가 hasXg 게이트로 숨긴다.
//
//   npx tsx --env-file=.env.local scripts/build-coach-tactical-extra.ts \
//     --coach-id=9dn1m1ghg5xmoep --league=BUNDESLIGA --af-league=78 --season=2023 \
//     --af-team=168 --team-id=96 --label=2023-24
//
// af 콜 = fixtures 1 + standings 1 + lineups ~34 (300ms 페이싱, 키는 프로덕션 수집기와 공유).
import "../src/lib/env";
import * as fs from "fs";
import * as path from "path";
import { aggregateTeamSeason, type BackfilledLineup } from "../src/lib/tactical/manager-aggregate";
import { enrichForRender } from "../src/lib/tactical/manager-article";

const AF = "https://v3.football.api-sports.io";
const headers = { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string {
  const v = process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (!v) throw new Error(`--${name}= 필요`);
  return v;
}

async function afGet<T = unknown>(p: string, attempt = 0): Promise<T[]> {
  const res = await fetch(`${AF}${p}`, { headers });
  const j = (await res.json()) as { errors?: Record<string, string>; response?: T[] };
  if (j.errors && Object.keys(j.errors).length) {
    if (j.errors.rateLimit && attempt < 5) {
      console.log(`  rateLimit — 65초 대기 (${attempt + 1}/5)`);
      await sleep(65_000);
      return afGet<T>(p, attempt + 1);
    }
    throw new Error(`af 에러 ${p}: ${JSON.stringify(j.errors)}`);
  }
  return j.response ?? [];
}

interface AfFixture {
  fixture: { id: number; date: string; status: { short: string } };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
}
interface AfLineupSide {
  team: { id: number; name: string };
  formation: string | null;
  coach: { id: number; name: string } | null;
  startXI: Array<{ player: { id: number; name: string; number: number; pos: string; grid: string | null } }>;
}
interface AfStandingRow { rank: number; team: { id: number } }

async function main() {
  const coachId = arg("coach-id");
  const league = arg("league");
  const afLeague = Number(arg("af-league"));
  const season = Number(arg("season"));
  const afTeam = Number(arg("af-team"));
  const teamId = Number(arg("team-id"));
  const label = arg("label");

  // 1) 시즌 fixtures (리그전만 — af league 파라미터가 대회 단위라 컵 미포함)
  const fixtures = (await afGet<AfFixture>(`/fixtures?league=${afLeague}&season=${season}&team=${afTeam}`))
    .filter((f) => f.fixture.status.short === "FT" && f.goals.home != null && f.goals.away != null)
    .sort((a, b) => a.fixture.date.localeCompare(b.fixture.date));
  if (!fixtures.length) throw new Error("af fixtures 0건");
  console.log(`fixtures: ${fixtures.length}경기 (${fixtures[0].fixture.date.slice(0, 10)} ~ ${fixtures[fixtures.length - 1].fixture.date.slice(0, 10)})`);

  // 2) 최종 순위 (af standings 실측 — DB 로 리그 테이블을 못 만드는 시즌)
  const standings = await afGet<{ league: { standings: AfStandingRow[][] } }>(`/standings?league=${afLeague}&season=${season}`);
  const rank = standings[0]?.league?.standings?.[0]?.find((r) => r.team.id === afTeam)?.rank ?? 0;
  console.log(`최종 순위: ${rank}위`);

  // 3) 경기별 라인업 (grid 포함)
  const lineups: BackfilledLineup[] = [];
  const scores: Record<number, { home: number; away: number }> = {};
  for (const f of fixtures) {
    const sides = await afGet<AfLineupSide>(`/fixtures/lineups?fixture=${f.fixture.id}`);
    await sleep(300);
    const home = sides.find((s) => s.team.id === f.teams.home.id);
    const away = sides.find((s) => s.team.id === f.teams.away.id);
    if (!home || !away || home.startXI.length < 11 || away.startXI.length < 11) {
      console.log(`  라인업 결손 skip: fixture ${f.fixture.id}`);
      continue;
    }
    const conv = (s: AfLineupSide) => ({
      team: s.team.name,
      formation: s.formation,
      coach: s.coach?.name ?? null,
      startXI: s.startXI.map((p) => p.player),
    });
    lineups.push({
      matchId: f.fixture.id, // DB 매치 없음 — af fixture id 를 키로 쓴다 (scores 주입과 짝)
      afFixtureId: f.fixture.id,
      date: f.fixture.date,
      home: conv(home),
      away: conv(away),
    });
    scores[f.fixture.id] = { home: f.goals.home!, away: f.goals.away! };
    process.stdout.write(`\r  lineups: ${lineups.length}/${fixtures.length}`);
  }
  console.log();

  // 4) 집계 + 렌더 보강 (선수 사진·전술판 코드 — af→ts 정본 매핑 경유)
  const seasonFrom = new Date(fixtures[0].fixture.date);
  const seasonTo = new Date(fixtures[fixtures.length - 1].fixture.date);
  const ctx = await aggregateTeamSeason({
    league,
    teamId,
    from: new Date(seasonFrom.getTime() - 86400_000),
    to: new Date(seasonTo.getTime() + 86400_000),
    seasonLabel: label,
    lineups,
    scores,
    rankOverride: rank,
  });
  await enrichForRender(ctx);
  console.log(`집계: ${ctx.record.played}경기 ${ctx.record.w}승 ${ctx.record.d}무 ${ctx.record.l}패, 주 포메이션 ${ctx.mostUsedXi.formation}`);
  console.log(`XI 한글화: ${ctx.mostUsedXi.players.filter((p) => /[가-힣]/.test(p.nameKo)).length}/11`);

  // 5) 저장 — 같은 감독의 같은 팀·시즌 항목은 교체
  const out = path.join(process.cwd(), "data/coach-tactical-extras.json");
  const all: Record<string, unknown[]> = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
  const list = (all[coachId] ?? []) as Array<{ team: { tsId: string | null }; seasonLabel: string }>;
  all[coachId] = [...list.filter((x) => !(x.team.tsId === ctx.team.tsId && x.seasonLabel === label)), ctx];
  fs.writeFileSync(out, JSON.stringify(all) + "\n");
  console.log(`저장: ${out} (coach ${coachId}, ${label})`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("실패:", (e as Error).message); process.exit(1); });
