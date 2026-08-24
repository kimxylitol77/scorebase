// 개막 임박인데 레지스트리 행이 없는 리그를 자동으로 발견해 DISCOVERED 로 남긴다.
//
// 배경. CompetitionSeason 을 쓰는 건 수동 CLI(discover-football-seasons --write) 하나뿐이라,
// 레지스트리는 사람이 CLI 를 돌린 날에만 자랐다. 그 사이 개막한 리그는 시즌 기준이 없어
// af 시즌 게이트가 통째로 꺼지고, provider 캐시의 지난 시즌 표가 그대로 새어 나간다
// (2026-08-24 실측 — THAI_L1 등 4개 리그가 91일 묵은 af 2025 표를 들고 9월 개막 대기 중이었다).
//
// season-watch 는 이 상태를 이미 `no-season-before-open` 으로 잡아내고 알림만 하고 있었다.
// 여기서는 그 감지에 행동을 붙인다 — 감지 자체는 season-watch 가 단일 판정으로 유지한다.
//
// 비용. 필요한 리그가 없으면 ts 호출 0. 있을 때만 그 리그의 개막일 근처 diary 만 조회한다
// (리그당 3일, 중복 제거 후 상한). 눈먼 전체 sweep 을 매 주기 돌지 않는다.

import { thesportsGet } from "./client";
import { collectSeasonCandidates, type DiscoveryMatch, type SeasonCandidate } from "./season-discovery";
import { PROVIDER_TS, recordDiscoveredSeason, staticTsTournamentId } from "../season-registry";
import { computeSeasonYear, seasonLabelFor } from "../season-calendar";
import tsLeagueMap from "./league-id-mapping.json";

const DAY_SEC = 86400;
/** 개막일 하루만 보면 팀 수가 적게 잡힌다 — 개막 라운드가 흩어지는 만큼만 넓힌다. */
const DAYS_PER_LEAGUE = 3;
/** 한 주기에 낼 수 있는 diary 호출 상한 — 프록시 한 홉을 공유하므로 버스트를 만들지 않는다. */
export const MAX_SWEEP_DAYS = 8;
const CALL_GAP_MS = 250;
/**
 * 스윕 전체 시간 예산. 라우트 maxDuration 이 60초인데 ts 클라이언트 타임아웃이 30초라,
 * 느린 응답 두 번이면 감시 본류까지 함께 죽는다. 예산을 넘기면 남은 날짜를 버리고
 * 지금까지 모은 것으로 판정한다 — 못 찾은 리그는 다음 주기에 자연 재시도된다.
 */
const SWEEP_BUDGET_MS = 20_000;

/** season-watch 감사 결과 중 이 모듈이 쓰는 최소 필드. */
export interface AutoDiscoverTarget {
  league: string;
  firstFixtureAt: Date | null;
  issues: Array<{ code: string }>;
}

/**
 * 발견이 필요한 리그 — season-watch 가 "개막 임박인데 쓸 시즌이 없다"고 판정한 것만.
 * 판정을 여기서 다시 만들지 않는다(임계가 두 벌이 되면 반드시 어긋난다).
 */
export function needsDiscovery<T extends AutoDiscoverTarget>(audits: readonly T[]): T[] {
  return audits.filter(
    (a) => a.firstFixtureAt != null && a.issues.some((i) => i.code === "no-season-before-open"),
  );
}

/**
 * 조회할 날짜 offset(일) 목록. 각 리그 개막일부터 DAYS_PER_LEAGUE 일.
 * 과거는 보지 않는다 — 개막 전 리그라 지난 경기가 없다.
 */
export function sweepDayOffsets(
  targets: readonly AutoDiscoverTarget[],
  now: Date,
  maxDays: number = MAX_SWEEP_DAYS,
): number[] {
  const offsets = new Set<number>();
  for (const t of targets) {
    if (!t.firstFixtureAt) continue;
    // 각 offset 을 따로 clamp 하면 개막일이 지난 리그에서 3일치가 0 하나로 뭉개진다 —
    // 시작점을 먼저 오늘로 당겨 span 을 보존한다.
    const base = Math.max(
      0,
      Math.floor((t.firstFixtureAt.getTime() - now.getTime()) / (DAY_SEC * 1000)),
    );
    for (let i = 0; i < DAYS_PER_LEAGUE; i++) offsets.add(base + i);
  }
  return [...offsets].sort((a, b) => a - b).slice(0, maxDays);
}

/**
 * 리그의 신시즌 후보 — collectSeasonCandidates 가 이미 "미래 경기 많은 순"으로 정렬해 두므로
 * 맨 앞이 신시즌이다. 여기서 다시 정렬하지 않는다.
 */
export function pickNewSeason(
  byCompetition: ReadonlyMap<string, SeasonCandidate[]>,
  tsCompetitionId: string,
): SeasonCandidate | null {
  return byCompetition.get(tsCompetitionId)?.[0] ?? null;
}

function tsCompetitionIdFor(league: string): string | null {
  const e = (tsLeagueMap as Array<{ code: string; tsId?: string }>).find((x) => x.code === league);
  return e?.tsId ?? null;
}

interface TsDiaryMatch {
  id?: string;
  competition_id?: string;
  season_id?: string;
  match_time?: number;
  home_team_id?: string;
  away_team_id?: string;
}

export interface AutoDiscoverResult {
  /** 발견이 필요하다고 판정된 리그 */
  targets: string[];
  /** 실제로 DISCOVERED 를 기록한 리그 */
  recorded: Array<{ league: string; seasonId: string; seasonLabel: string; teamCount: number }>;
  /** 후보를 못 찾은 리그 (ts 가 아직 일정을 안 내놓음 — 다음 주기에 자연 재시도) */
  notFound: string[];
  diaryCalls: number;
  error?: string;
}

/**
 * 대상 리그의 개막일 근처 diary 를 조회해 신시즌 후보를 DISCOVERED 로 기록한다.
 * ACTIVE 로 올리지 않는다 — 전환은 여전히 별도 검증 단계다.
 */
export async function autoDiscoverSeasons(
  audits: readonly AutoDiscoverTarget[],
  now: Date = new Date(),
): Promise<AutoDiscoverResult> {
  const targets = needsDiscovery(audits);
  const result: AutoDiscoverResult = {
    targets: targets.map((t) => t.league),
    recorded: [],
    notFound: [],
    diaryCalls: 0,
  };
  if (targets.length === 0) return result;

  const offsets = sweepDayOffsets(targets, now);
  const nowSec = Math.floor(now.getTime() / 1000);
  const matches: DiscoveryMatch[] = [];
  const deadline = Date.now() + SWEEP_BUDGET_MS;
  for (const off of offsets) {
    if (Date.now() > deadline) break;
    try {
      const d = await thesportsGet<{ code: number; results?: TsDiaryMatch[] }>(
        "/v1/football/match/diary",
        { tsp: nowSec + off * DAY_SEC },
      );
      result.diaryCalls++;
      for (const m of d.results ?? []) {
        if (!m.competition_id || !m.season_id || !m.match_time) continue;
        matches.push({
          id: m.id,
          competition_id: m.competition_id,
          season_id: m.season_id,
          match_time: m.match_time,
          home_team_id: m.home_team_id,
          away_team_id: m.away_team_id,
        });
      }
    } catch (e) {
      // 한 날짜가 실패해도 나머지로 후보를 만든다. 전부 실패하면 아래에서 notFound 로 남는다.
      result.error = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, CALL_GAP_MS));
  }

  const byCompetition = collectSeasonCandidates(matches, nowSec);
  for (const t of targets) {
    const tsId = tsCompetitionIdFor(t.league);
    const cand = tsId ? pickNewSeason(byCompetition, tsId) : null;
    if (!tsId || !cand) {
      result.notFound.push(t.league);
      continue;
    }
    const seasonYear = computeSeasonYear(t.league, new Date(cand.firstMatchTime * 1000));
    const seasonLabel = seasonLabelFor(t.league, seasonYear);
    await recordDiscoveredSeason({
      league: t.league,
      provider: PROVIDER_TS,
      providerLeagueId: staticTsTournamentId(t.league) ?? cand.competitionId,
      providerSeasonId: cand.seasonId,
      seasonYear,
      seasonLabel,
      startsAt: new Date(cand.firstMatchTime * 1000),
      endsAt: new Date(cand.lastMatchTime * 1000),
      // 개막 근처 3일만 본 부분 관측이라 전체 참가팀보다 적을 수 있다. 전환 검증
      // (verify-football-season)은 이 값을 읽지 않고 자체 스윕으로 다시 재므로 게이트에 영향 없다.
      teamCount: cand.teamIds.length,
      metadata: {
        discoveredBy: "football-season-watch",
        partialObservation: true,
        matchCount: cand.matchCount,
        futureMatchCount: cand.futureMatchCount,
        sampleMatchIds: cand.sampleMatchIds,
      },
    });
    result.recorded.push({ league: t.league, seasonId: cand.seasonId, seasonLabel, teamCount: cand.teamIds.length });
  }
  return result;
}
