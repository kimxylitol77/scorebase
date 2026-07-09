// 새 시즌 전체 일정 backfill — api-football fixtures?league&season 전량 fetch → upsertMatch.
// cron collect 는 날짜 기반(+7일 창)이라 개막 수주 전 발표되는 시즌 일정을 못 당김 —
// 시즌 발표 시점(6~7월)에 이 스크립트를 1회 실행해 전 라운드를 미리 적재한다.
// 실행: npx tsx scripts/backfill-season-fixtures.ts [--season=2026] [--leagues=EPL,CHAMPIONSHIP]
import "dotenv/config";
import axios from "axios";
import { API_FOOTBALL_LEAGUE_ID } from "../src/lib/sports/api-football-pro";
import { upsertMatch } from "../src/jobs/collect";
import type { League, MatchStatus, NormalizedMatch } from "../src/lib/sports/types";

const KEY = process.env.API_FOOTBALL_KEY;
if (!KEY) { console.error("API_FOOTBALL_KEY 없음"); process.exit(1); }

// 8~5월 유럽 시즌 리그 (달력연도 리그 K/J/MLS 등은 cron 이 순차 수집 — 제외)
const DEFAULT_LEAGUES: League[] = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "UCL", "UEL", "UECL",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL", "SAUDI_PL",
];

const seasonArg = process.argv.find((a) => a.startsWith("--season="));
const SEASON = seasonArg ? parseInt(seasonArg.split("=")[1], 10) : 2026;
const leaguesArg = process.argv.find((a) => a.startsWith("--leagues="));
const LEAGUES = leaguesArg
  ? (leaguesArg.split("=")[1].split(",") as League[])
  : DEFAULT_LEAGUES;

// api-football-collector.ts 의 mapStatus 와 동일 (단일 진실은 그쪽 — 변경 시 동기)
function mapStatus(short: string): MatchStatus {
  if (["FT", "AET", "PEN"].includes(short)) return "FINISHED";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(short)) return "LIVE";
  if (["PST", "CANC", "ABD", "AWD", "WO"].includes(short)) return "POSTPONED";
  return "SCHEDULED";
}

interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string }; referee?: string | null };
  teams: { home: { id: number; name: string; logo?: string }; away: { id: number; name: string; logo?: string } };
  goals: { home: number | null; away: number | null };
}

async function main() {
  console.log(`[backfill-season] season=${SEASON}, leagues=${LEAGUES.length}개`);
  const report: { league: string; af: number; upserted: number; failed: number }[] = [];
  for (const league of LEAGUES) {
    const leagueId = API_FOOTBALL_LEAGUE_ID[league];
    if (!leagueId) { console.log(`  ${league}: af id 미등록 — skip`); continue; }
    let fixtures: ApiFixture[] = [];
    try {
      const { data } = await axios.get("https://v3.football.api-sports.io/fixtures", {
        params: { league: leagueId, season: SEASON },
        headers: { "x-apisports-key": KEY },
        timeout: 30_000,
      });
      fixtures = (data?.response ?? []) as ApiFixture[];
    } catch (e) {
      console.log(`  ${league}: fetch 실패 ${(e as Error).message}`);
      continue;
    }
    if (fixtures.length === 0) {
      console.log(`  ${league}: af 미발표 (0건) — skip`);
      report.push({ league, af: 0, upserted: 0, failed: 0 });
      continue;
    }
    let up = 0, fail = 0;
    for (const f of fixtures) {
      const m: NormalizedMatch = {
        league,
        externalId: String(f.fixture.id),
        homeTeam: { externalId: String(f.teams.home.id), name: f.teams.home.name, logoUrl: f.teams.home.logo },
        awayTeam: { externalId: String(f.teams.away.id), name: f.teams.away.name, logoUrl: f.teams.away.logo },
        homeScore: f.goals?.home ?? undefined,
        awayScore: f.goals?.away ?? undefined,
        status: mapStatus(f.fixture?.status?.short ?? ""),
        startTime: new Date(f.fixture.date),
        referee: f.fixture.referee ?? undefined,
        raw: f,
      };
      // source 명시 필수 — af 데이터를 리그 기본 source(fd 등)로 resolve 하면 팀 오염 (EPL 사고)
      try { await upsertMatch(m, { source: "api-football" }); up++; }
      catch (e) { fail++; if (fail <= 3) console.log(`    ✗ ${league} fix=${f.fixture.id}: ${(e as Error).message.slice(0, 80)}`); }
    }
    console.log(`  ${league}: af ${fixtures.length}건 → upserted ${up}, failed ${fail}`);
    report.push({ league, af: fixtures.length, upserted: up, failed: fail });
    await new Promise((r) => setTimeout(r, 2000)); // Neon pool 회복
  }
  console.log("\n=== 요약 ===");
  for (const r of report) console.log(`  ${r.league.padEnd(14)} af=${r.af} upserted=${r.upserted} failed=${r.failed}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
