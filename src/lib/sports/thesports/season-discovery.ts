// 새 시즌 후보 발견 + 전환 검증 — 순수 함수 계층 (네트워크·DB 접근 없음).
//
// 입력은 TheSports diary / match list 응답의 매치 배열({competition_id, season_id, ...})과
// 우리 쪽 매핑 정보. 출력은 후보 목록과 "전환해도 되는가" 판정이다.
// 네트워크 호출부(워커·CLI)와 분리해 두어 실제 API 없이 규칙을 테스트할 수 있다.
//
// 판정 원칙.
//   - 자동 발견만으로 ACTIVE 로 올리지 않는다. 여기서는 통과/불통과와 사유만 만든다.
//   - 친선은 순위표를 요구하지 않는다.
//   - 컵대회는 단계(예선·조별·리그페이즈·녹아웃)로 나뉘어 팀 수·순위표 기준을 리그와 다르게 본다.

import {
  NO_STANDINGS_LEAGUES,
  STAGED_COMPETITIONS,
  computeSeasonYear,
  seasonLabelFor,
} from "../season-calendar";

/** TheSports 매치에서 후보 추출에 필요한 최소 필드. */
export interface DiscoveryMatch {
  id?: string;
  competition_id: string;
  season_id: string;
  /** unix seconds */
  match_time: number;
  home_team_id?: string;
  away_team_id?: string;
}

/** competition_id 하나에 대해 관측된 season_id 후보. */
export interface SeasonCandidate {
  competitionId: string;
  seasonId: string;
  matchCount: number;
  futureMatchCount: number;
  /** 관측된 첫 경기 (unix seconds) */
  firstMatchTime: number;
  lastMatchTime: number;
  teamIds: string[];
  sampleMatchIds: string[];
}

/**
 * 매치 목록 → competition_id × season_id 별 후보 집계.
 * diary sweep(과거 며칠 + 미래 45일)을 그대로 넣으면 된다.
 */
export function collectSeasonCandidates(
  matches: DiscoveryMatch[],
  nowSec: number,
): Map<string, SeasonCandidate[]> {
  const byKey = new Map<string, SeasonCandidate>();
  for (const m of matches) {
    if (!m.competition_id || !m.season_id || !m.match_time) continue;
    const k = `${m.competition_id}::${m.season_id}`;
    let c = byKey.get(k);
    if (!c) {
      c = {
        competitionId: m.competition_id,
        seasonId: m.season_id,
        matchCount: 0,
        futureMatchCount: 0,
        firstMatchTime: m.match_time,
        lastMatchTime: m.match_time,
        teamIds: [],
        sampleMatchIds: [],
      };
      byKey.set(k, c);
    }
    c.matchCount++;
    if (m.match_time >= nowSec) c.futureMatchCount++;
    if (m.match_time < c.firstMatchTime) c.firstMatchTime = m.match_time;
    if (m.match_time > c.lastMatchTime) c.lastMatchTime = m.match_time;
    for (const t of [m.home_team_id, m.away_team_id]) {
      if (t && !c.teamIds.includes(t)) c.teamIds.push(t);
    }
    if (m.id && c.sampleMatchIds.length < 5) c.sampleMatchIds.push(m.id);
  }

  const byCompetition = new Map<string, SeasonCandidate[]>();
  for (const c of byKey.values()) {
    const list = byCompetition.get(c.competitionId) ?? [];
    list.push(c);
    byCompetition.set(c.competitionId, list);
  }
  // 미래 경기 많은 순 → 전체 경기 많은 순. 새 시즌이 앞에 오도록.
  for (const list of byCompetition.values()) {
    list.sort((a, b) => b.futureMatchCount - a.futureMatchCount || b.matchCount - a.matchCount);
  }
  return byCompetition;
}

// ── 검증 ───────────────────────────────────────────────────────

export interface VerifyInput {
  league: string;
  /** 우리가 아는 이 리그의 고정 tournament id */
  expectedCompetitionId: string;
  candidate: SeasonCandidate;
  /** 현재 ACTIVE season uuid (없으면 null) */
  currentActiveSeasonId: string | null;
  /** team-id-mapping 에 있는 이 리그의 ts team id 집합 */
  knownTeamIds: Set<string>;
  /** 순위 API 응답 상태. "OK"=표 있음, "EMPTY"=응답은 정상인데 표 없음, "ERROR"=조회 실패, "SKIPPED"=조회 안 함 */
  standingsProbe: "OK" | "EMPTY" | "ERROR" | "SKIPPED";
  nowSec: number;
  /** 팀 매핑률 하한 (기본 0.95) */
  minMappingRate?: number;
}

export interface VerifyCheck {
  name: string;
  ok: boolean;
  /** 통과 못 해도 전환을 막지 않는 정보성 항목 */
  advisory?: boolean;
  detail: string;
}

export interface VerifyResult {
  ok: boolean;
  seasonYear: number;
  seasonLabel: string;
  teamCount: number;
  mappedTeamCount: number;
  mappingRate: number;
  checks: VerifyCheck[];
  /** 통과 못 한 필수 항목 이름 */
  blockers: string[];
}

/** 리그/대회 성격별 최소 참가팀 수 — 컵·단계 대회는 라운드마다 팀 수가 달라 느슨하게 본다. */
function minTeamCount(league: string): number {
  if (NO_STANDINGS_LEAGUES.has(league)) return 2;
  if (STAGED_COMPETITIONS.has(league)) return 4;
  return 8;
}

const DAY = 86400;

/**
 * 시즌 전환 후보 검증. 통과(ok=true) 여야 VERIFIED 로 올릴 수 있다.
 * ACTIVE 전환은 여전히 별도 단계다(activateSeason).
 */
export function verifySeasonCandidate(input: VerifyInput): VerifyResult {
  const {
    league, expectedCompetitionId, candidate, currentActiveSeasonId,
    knownTeamIds, standingsProbe, nowSec,
  } = input;
  const minRate = input.minMappingRate ?? 0.95;
  const checks: VerifyCheck[] = [];

  // 1) 기존 ACTIVE 와 다른 시즌인가
  checks.push({
    name: "new-season-id",
    ok: candidate.seasonId !== currentActiveSeasonId,
    detail:
      candidate.seasonId === currentActiveSeasonId
        ? `이미 ACTIVE 인 시즌(${candidate.seasonId})`
        : `새 season uuid ${candidate.seasonId} (기존 ${currentActiveSeasonId ?? "없음"})`,
  });

  // 2) 대회 id 정확 일치 — 이름이 비슷한 다른 대회를 잡지 않도록
  checks.push({
    name: "competition-match",
    ok: candidate.competitionId === expectedCompetitionId,
    detail:
      candidate.competitionId === expectedCompetitionId
        ? `competition_id 일치 (${expectedCompetitionId})`
        : `competition_id 불일치 — 기대 ${expectedCompetitionId}, 관측 ${candidate.competitionId}`,
  });

  // 3) 향후 경기 존재
  checks.push({
    name: "future-fixtures",
    ok: candidate.futureMatchCount > 0,
    detail: `향후 경기 ${candidate.futureMatchCount}건 / 관측 ${candidate.matchCount}건`,
  });

  // 4) 참가팀 수가 비정상적으로 적지 않은가
  const need = minTeamCount(league);
  const teamCount = candidate.teamIds.length;
  checks.push({
    name: "team-count",
    ok: teamCount >= need,
    detail: `참가팀 ${teamCount}팀 (최소 ${need}팀)`,
  });

  // 5) 팀 매핑률
  const mapped = candidate.teamIds.filter((t) => knownTeamIds.has(t)).length;
  const rate = teamCount === 0 ? 0 : mapped / teamCount;
  checks.push({
    name: "team-mapping-rate",
    ok: rate >= minRate,
    detail: `매핑 ${mapped}/${teamCount} = ${(rate * 100).toFixed(0)}% (기준 ${(minRate * 100).toFixed(0)}%)`,
  });

  // 6) 시즌 시작일과 첫 경기 날짜가 합리적으로 맞는가.
  //    diary 창이 좁으면 첫 경기가 실제 개막일보다 뒤일 수 있어 상한만 본다(45일).
  const seasonYear = computeSeasonYear(league, new Date(candidate.firstMatchTime * 1000));
  const firstFromNowDays = (candidate.firstMatchTime - nowSec) / DAY;
  checks.push({
    name: "season-start-sanity",
    ok: firstFromNowDays <= 120,
    detail: `첫 관측 경기까지 ${firstFromNowDays.toFixed(0)}일 (개막 120일 이상 앞이면 다음 시즌 선취로 의심)`,
  });

  // 7) 순위 소스 — 개막 전 "표 없음"은 정상. 친선은 아예 요구하지 않는다.
  const preSeason = candidate.firstMatchTime > nowSec;
  if (NO_STANDINGS_LEAGUES.has(league)) {
    checks.push({
      name: "standings",
      ok: true,
      detail: "친선 — 순위표 검증 대상 아님",
    });
  } else if (standingsProbe === "OK") {
    checks.push({ name: "standings", ok: true, detail: "순위표 응답 정상" });
  } else if (standingsProbe === "EMPTY") {
    checks.push({
      name: "standings",
      ok: preSeason || STAGED_COMPETITIONS.has(league),
      detail: preSeason
        ? "개막 전 — 순위표 없음이 정상"
        : STAGED_COMPETITIONS.has(league)
          ? "단계 대회 — 현재 단계에 순위표 없음(녹아웃 등)이 정상"
          : "개막했는데 순위표가 비어 있음",
    });
  } else if (standingsProbe === "SKIPPED") {
    checks.push({ name: "standings", ok: true, advisory: true, detail: "순위 조회 생략(--no-probe)" });
  } else {
    checks.push({ name: "standings", ok: false, detail: "순위 API 조회 실패" });
  }

  const blockers = checks.filter((c) => !c.ok && !c.advisory).map((c) => c.name);
  return {
    ok: blockers.length === 0,
    seasonYear,
    seasonLabel: seasonLabelFor(league, seasonYear),
    teamCount,
    mappedTeamCount: mapped,
    mappingRate: rate,
    checks,
    blockers,
  };
}
