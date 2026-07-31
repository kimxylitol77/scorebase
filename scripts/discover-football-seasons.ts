// 새 시즌 후보 발견 CLI — TheSports diary/match list 조회 + 후보 집계.
//
//   npm run discover:football-seasons                     # 전 리그, dry-run
//   npm run discover:football-seasons -- --league EPL      # 특정 리그
//   npm run discover:football-seasons -- --days 30         # 미래 sweep 일수 (기본 21)
//   npm run discover:football-seasons -- --json
//   npm run discover:football-seasons -- --write           # ⚠ DISCOVERED row 기록 (명시적 옵션 없이는 불가)
//
// 기본은 dry-run 이다. --write 없이는 DB 를 절대 건드리지 않는다.
// ⚠ TheSports 는 IP whitelist 라 워커/화이트리스트된 호스트에서만 동작한다.
//   호출 간 250ms 간격 — 버스트로 방화벽에 걸리지 않게 한다.

import { prisma } from "../src/lib/db";
import {
  collectSeasonCandidates,
  type DiscoveryMatch,
  type SeasonCandidate,
} from "../src/lib/sports/thesports/season-discovery";
import {
  PROVIDER_TS,
  getActiveSeason,
  legacyTsSeasonId,
  recordDiscoveredSeason,
  staticTsTournamentId,
} from "../src/lib/sports/season-registry";
import { computeSeasonYear, seasonLabelFor } from "../src/lib/sports/season-calendar";
import { SOCCER_LEAGUES } from "../src/lib/sports/sport-leagues";
import tsLeagueMap from "../src/lib/sports/thesports/league-id-mapping.json";

const TS_BASE = "https://api.thesports.com";
const CALL_GAP_MS = 250;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tsGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const user = process.env.THESPORTS_USER;
  const secret = process.env.THESPORTS_SECRET;
  if (!user || !secret) throw new Error("THESPORTS_USER / THESPORTS_SECRET 미설정");
  const url = new URL(TS_BASE + path);
  url.searchParams.set("user", user);
  url.searchParams.set("secret", secret);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface TsMatch {
  id?: string;
  competition_id?: string;
  season_id?: string;
  match_time?: number;
  home_team_id?: string;
  away_team_id?: string;
}

function toDiscovery(rows: TsMatch[]): DiscoveryMatch[] {
  return rows
    .filter((m) => m.competition_id && m.season_id && m.match_time)
    .map((m) => ({
      id: m.id,
      competition_id: m.competition_id!,
      season_id: m.season_id!,
      match_time: m.match_time!,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
    }));
}

async function main() {
  const dryRun = !has("write");
  const days = Number(arg("days") ?? 21);
  const leaguesArg = arg("league");
  const only = leaguesArg ? new Set(leaguesArg.split(",").map((s) => s.trim().toUpperCase())) : null;

  const entries = (tsLeagueMap as Array<{ code: string; tsId: string }>).filter(
    (e) => SOCCER_LEAGUES.has(e.code) && (!only || only.has(e.code)),
  );
  if (entries.length === 0) {
    console.error("대상 리그 없음 — --league 값을 확인하라");
    process.exitCode = 1;
    return;
  }
  console.log(
    `시즌 후보 발견 — 대상 ${entries.length}리그 · sweep ${days}일 · ${dryRun ? "DRY-RUN (DB 미변경)" : "⚠ WRITE 모드"}`,
  );

  // 1) 매치 수집 — recent/list 한 번 + diary 일자별 sweep.
  const matches: DiscoveryMatch[] = [];
  try {
    const d = await tsGet<{ code: number; results?: TsMatch[] }>("/v1/football/match/recent/list");
    matches.push(...toDiscovery(d.results ?? []));
    console.log(`  recent/list: ${d.results?.length ?? 0}건`);
  } catch (e) {
    console.warn(`  recent/list 실패: ${(e as Error).message}`);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  for (let offset = -3; offset <= days; offset++) {
    try {
      const d = await tsGet<{ code: number; results?: TsMatch[] }>("/v1/football/match/diary", {
        tsp: nowSec + offset * DAY,
      });
      const rows = toDiscovery(d.results ?? []);
      matches.push(...rows);
      if (offset % 7 === 0) console.log(`  diary offset=${offset}: 누적 ${matches.length}건`);
    } catch (e) {
      console.warn(`  diary offset=${offset} 실패: ${(e as Error).message}`);
    }
    await sleep(CALL_GAP_MS);
  }

  // 2) 후보 집계
  const byCompetition = collectSeasonCandidates(matches, nowSec);

  interface Out {
    league: string;
    competitionId: string;
    candidates: Array<
      SeasonCandidate & { isCurrentActive: boolean; isRepoSeason: boolean; seasonYear: number; seasonLabel: string }
    >;
  }
  const out: Out[] = [];
  for (const e of entries) {
    const cands = byCompetition.get(e.tsId) ?? [];
    if (cands.length === 0) continue;
    const active = await getActiveSeason(e.code, PROVIDER_TS);
    const repo = legacyTsSeasonId(e.code);
    out.push({
      league: e.code,
      competitionId: e.tsId,
      candidates: cands.map((c) => {
        const seasonYear = computeSeasonYear(e.code, new Date(c.firstMatchTime * 1000));
        return {
          ...c,
          isCurrentActive: active?.providerSeasonId === c.seasonId,
          isRepoSeason: repo === c.seasonId,
          seasonYear,
          seasonLabel: seasonLabelFor(e.code, seasonYear),
        };
      }),
    });
  }

  if (has("json")) {
    console.log(JSON.stringify({ dryRun, days, results: out }, null, 2));
  } else {
    console.log(`\n=== 후보 (${out.length}리그) ===`);
    for (const r of out) {
      console.log(`\n${r.league} (competition ${r.competitionId})`);
      for (const c of r.candidates) {
        const tag = c.isCurrentActive ? " [현재 ACTIVE]" : c.isRepoSeason ? " [저장소 값]" : " ← 신규 후보";
        console.log(
          `  season=${c.seasonId} ${c.seasonLabel} 경기 ${c.matchCount}건(향후 ${c.futureMatchCount}) ` +
            `팀 ${c.teamIds.length} 첫경기 ${new Date(c.firstMatchTime * 1000).toISOString().slice(0, 10)}${tag}`,
        );
      }
    }
    const unresolved = entries.filter((e) => !byCompetition.has(e.tsId));
    console.log(
      `\n매치를 못 찾은 리그 ${unresolved.length}개 (비수기 가능): ${unresolved.map((e) => e.code).slice(0, 30).join(", ")}`,
    );
  }

  // 3) 기록 — --write 일 때만.
  if (dryRun) {
    console.log(`\nDRY-RUN 이라 DB 를 건드리지 않았다. 기록하려면 --write 를 붙여라.`);
    return;
  }
  let written = 0;
  for (const r of out) {
    for (const c of r.candidates) {
      if (c.isCurrentActive) continue;
      await recordDiscoveredSeason({
        league: r.league,
        provider: PROVIDER_TS,
        providerLeagueId: staticTsTournamentId(r.league) ?? r.competitionId,
        providerSeasonId: c.seasonId,
        seasonYear: c.seasonYear,
        seasonLabel: c.seasonLabel,
        startsAt: new Date(c.firstMatchTime * 1000),
        endsAt: new Date(c.lastMatchTime * 1000),
        teamCount: c.teamIds.length,
        metadata: {
          discoveredBy: "discover-football-seasons",
          matchCount: c.matchCount,
          futureMatchCount: c.futureMatchCount,
          sampleMatchIds: c.sampleMatchIds,
        },
      });
      written++;
    }
  }
  console.log(`\nDISCOVERED 기록 ${written}건. 다음: npm run verify:football-season -- --league <CODE>`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
