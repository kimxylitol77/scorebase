// 시즌 후보 검증 + 전환 CLI.
//
//   npm run verify:football-season -- --league EPL --dry-run     # 기본값(dry-run)
//   npm run verify:football-season -- --league EPL --write       # ⚠ VERIFIED 기록
//   npm run verify:football-season -- --league EPL --write --activate  # ⚠ ACTIVE 전환
//   npm run verify:football-season -- --league EPL --season <uuid>     # 후보 직접 지정
//   npm run verify:football-season -- --league EPL --no-probe          # 순위 API 조회 생략
//
// 기본은 dry-run. --write 없이는 DB 를 건드리지 않는다.
// --activate 는 --write 와 함께여야 하고, 검증을 통과한 후보에만 적용된다
// (activateSeason 자체도 DISCOVERED 상태의 시즌은 거부한다).

import { prisma } from "../src/lib/db";
import {
  collectSeasonCandidates,
  keepOwnStageMatches,
  verifySeasonCandidate,
  type DiscoveryMatch,
  type SeasonCandidate,
} from "../src/lib/sports/thesports/season-discovery";
import {
  PROVIDER_TS,
  activateSeason,
  getActiveSeason,
  markSeasonVerified,
  recordDiscoveredSeason,
  staticTsTournamentId,
} from "../src/lib/sports/season-registry";
import {
  TS_SHARED_SEASON_LEAGUES,
  computeSeasonYear,
  seasonLabelFor,
} from "../src/lib/sports/season-calendar";
import teamIdMapping from "../src/lib/sports/thesports/team-id-mapping.json";

const TS_BASE = "https://api.thesports.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

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
  round?: { stage_id?: string };
}

/** 순위 API 상태 확인 — 개막 전 "표 없음"은 정상으로 구분해 돌려준다. */
async function probeStandings(seasonId: string): Promise<"OK" | "EMPTY" | "ERROR"> {
  try {
    const d = await tsGet<{ code: number; results?: { tables?: unknown[] } }>(
      "/v1/football/season/recent/table/detail",
      { uuid: seasonId },
    );
    if (d.code !== 0) return "ERROR";
    const tables = d.results?.tables;
    if (!Array.isArray(tables) || tables.length === 0) return "EMPTY";
    return "OK";
  } catch {
    return "ERROR";
  }
}

async function main() {
  const league = (arg("league") ?? "").toUpperCase();
  if (!league) {
    console.error("사용법: npm run verify:football-season -- --league EPL [--write] [--activate]");
    process.exitCode = 1;
    return;
  }
  const write = has("write");
  const activate = has("activate");
  if (activate && !write) {
    console.error("--activate 는 --write 와 함께 써야 한다 (실수 방지).");
    process.exitCode = 1;
    return;
  }
  const minRate = arg("min-mapping-rate") ? Number(arg("min-mapping-rate")) : undefined;
  const competitionId = staticTsTournamentId(league);
  if (!competitionId) {
    console.error(`${league}: TheSports 대회 매핑(tsId) 이 없다 — league-id-mapping.json 먼저 보강하라.`);
    process.exitCode = 1;
    return;
  }

  console.log(`시즌 검증 — ${league} (competition ${competitionId}) · ${write ? "⚠ WRITE" : "DRY-RUN"}`);

  // 1) 후보 수집 (diary sweep)
  const nowSec = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  const matches: DiscoveryMatch[] = [];
  const days = Number(arg("days") ?? 21);
  for (let offset = -3; offset <= days; offset++) {
    try {
      const d = await tsGet<{ code: number; results?: TsMatch[] }>("/v1/football/match/diary", {
        tsp: nowSec + offset * DAY,
      });
      for (const m of d.results ?? []) {
        if (m.competition_id !== competitionId || !m.season_id || !m.match_time) continue;
        matches.push({
          id: m.id,
          competition_id: m.competition_id,
          season_id: m.season_id,
          match_time: m.match_time,
          home_team_id: m.home_team_id,
          away_team_id: m.away_team_id,
          stage_id: m.round?.stage_id,
        });
      }
    } catch (e) {
      console.warn(`  diary offset=${offset} 실패: ${(e as Error).message}`);
    }
    await sleep(250);
  }

  // 팀 매핑은 두 곳에 산다 — 저장소 JSON 과 DB TeamSourceId. 수집 라우트는 DB 를 먼저
  // 보고(backfill:cup-teams 는 DB 에만 기록한다) JSON 은 뒤이므로, JSON 만 세면 이미
  // 메워진 갭을 여전히 미매핑으로 읽는다. 2026-08-20 DFB_POKAL — 백필로 32경기가
  // skippedNoTeam 0 으로 수집되는데도 검증은 0/64 불통과였다. 실제 동작과 같은 출처를 본다.
  const knownTeamIds = new Set(
    (teamIdMapping as Array<{ tsId: string; ourLeague: string }>)
      .filter((t) => t.ourLeague === league)
      .map((t) => t.tsId),
  );
  const dbMapped = await prisma.teamSourceId.findMany({
    where: { league, source: PROVIDER_TS },
    select: { externalId: true },
  });
  for (const row of dbMapped) knownTeamIds.add(row.externalId);

  // ts 한 시즌에 다른 티어 대회까지 담기는 리그는 우리 stage 의 매치만 남긴다 — 안 그러면
  // 남의 티어 팀이 분모에 들어가 매핑률이 영원히 기준 미달이 된다(YKKONEN + Kakkonen).
  const scoped = TS_SHARED_SEASON_LEAGUES.has(league)
    ? keepOwnStageMatches(matches, knownTeamIds)
    : matches;
  if (scoped.length !== matches.length) {
    console.log(`  다른 티어 stage 매치 ${matches.length - scoped.length}건 제외 (우리 stage ${scoped.length}건)`);
  }

  const byCompetition = collectSeasonCandidates(scoped, nowSec);
  let candidates: SeasonCandidate[] = byCompetition.get(competitionId) ?? [];
  const pinned = arg("season");
  if (pinned) candidates = candidates.filter((c) => c.seasonId === pinned);
  if (candidates.length === 0) {
    console.log(`후보 없음 — ${league} 는 현재 diary 창(${days}일)에 매치가 없다(비수기 가능).`);
    return;
  }

  const active = await getActiveSeason(league, PROVIDER_TS);

  // 2) 후보별 검증
  for (const c of candidates) {
    const probe = has("no-probe") ? "SKIPPED" : await probeStandings(c.seasonId);
    const v = verifySeasonCandidate({
      league,
      expectedCompetitionId: competitionId,
      candidate: c,
      currentActiveSeasonId: active?.providerSeasonId ?? null,
      knownTeamIds,
      standingsProbe: probe,
      nowSec,
      minMappingRate: minRate,
    });

    console.log(`\n── season ${c.seasonId} (${v.seasonLabel}) ${v.ok ? "✅ 통과" : "❌ 불통과"}`);
    for (const chk of v.checks) {
      console.log(`   ${chk.ok ? "✓" : "✗"} ${chk.name}: ${chk.detail}${chk.advisory ? " (참고)" : ""}`);
    }
    if (!v.ok) console.log(`   차단 사유: ${v.blockers.join(", ")}`);

    if (!write) continue;

    const seasonYear = computeSeasonYear(league, new Date(c.firstMatchTime * 1000));
    const row = await recordDiscoveredSeason({
      league,
      provider: PROVIDER_TS,
      providerLeagueId: competitionId,
      providerSeasonId: c.seasonId,
      seasonYear,
      seasonLabel: seasonLabelFor(league, seasonYear),
      startsAt: new Date(c.firstMatchTime * 1000),
      endsAt: new Date(c.lastMatchTime * 1000),
      teamCount: v.teamCount,
      mappedTeamCount: v.mappedTeamCount,
      metadata: { standingsProbe: probe, sampleMatchIds: c.sampleMatchIds },
    });

    if (!v.ok) {
      console.log(`   → DISCOVERED 로만 기록 (id=${row.id}). 검증 미통과라 VERIFIED 로 올리지 않는다.`);
      continue;
    }
    const verified = await markSeasonVerified(row.id, {
      checks: v.checks,
      mappingRate: v.mappingRate,
      at: new Date().toISOString(),
    });
    console.log(`   → VERIFIED (id=${verified.id})`);

    if (activate) {
      const act = await activateSeason(
        verified.id,
        `verify-football-season CLI · 매핑률 ${(v.mappingRate * 100).toFixed(0)}% · 향후 경기 ${c.futureMatchCount}건`,
      );
      console.log(`   → ACTIVE 전환 완료 (id=${act.id}, ${act.seasonLabel})`);
    }
  }

  if (!write) console.log(`\nDRY-RUN 이라 DB 를 건드리지 않았다. 기록하려면 --write, 전환은 --write --activate.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
