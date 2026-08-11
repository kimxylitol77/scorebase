import { afFetch } from "@/lib/sports/af-track";
import { afQuotaOk } from "@/lib/sports/af-quota";
// api-football 의 /predictions + /teams/statistics endpoint wrapper.
// /live/[league]/[gameId] 의 라이브 매치 카드 보강용. INTL_FRIENDLY 처럼
// 리그 standings 가 없는 매치에서 특히 의미 큼.
//
// 캐싱: Next.js fetch native cache (revalidate 1800~3600s) — 매치 시작 직전엔
//       자주 갱신될 필요 없고 stale 수십 분 무방.
//
// 쿼터 가드: 이 경로는 페이지 렌더에 비례해 af 를 소비한다(봇 크롤 포함) — 2026-08-11
// 하루 한도 75,000 을 이 태그가 소진한 사고. 실패 응답은 Next 캐시에 안 남아 한도 소진
// 후엔 렌더마다 재시도 폭주까지 겹친다. 장식성 데이터이므로 optional 티어로 가장 먼저
// 양보한다(afQuotaOk 는 무료 /status + 5분 캐시라 비용 없음).

const BASE_URL = "https://v3.football.api-sports.io";
const EXTRAS_TAG = "af-extras";

/**
 * api-football /fixtures?id=X — fixture 메타 (round 등) 만 추출.
 * cache: 3600s (round 는 변동 없음).
 */
export async function fetchFixtureRound(fixtureId: string | number): Promise<string | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  if (!(await afQuotaOk("optional"))) return null;
  try {
    const res = await afFetch(EXTRAS_TAG, `${BASE_URL}/fixtures?id=${fixtureId}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: Array<{ league?: { round?: string } }> };
    return data.response?.[0]?.league?.round ?? null;
  } catch {
    return null;
  }
}

interface AfPredictionsResponse {
  response: Array<{
    predictions: {
      winner: { id: number | null; name: string | null; comment: string | null };
      win_or_draw: boolean;
      under_over: string | null;
      goals: { home: string | null; away: string | null };
      advice: string | null;
      percent: { home: string; draw: string; away: string };
    };
    comparison: {
      form: { home: string; away: string };
      att: { home: string; away: string };
      def: { home: string; away: string };
      poisson_distribution: { home: string; away: string };
      h2h: { home: string; away: string };
      goals: { home: string; away: string };
      total: { home: string; away: string };
    };
    teams: {
      home: { id: number; name: string };
      away: { id: number; name: string };
    };
  }>;
}

export interface MatchPrediction {
  winnerName: string | null;
  advice: string | null;
  percent: { home: number; draw: number; away: number };
  comparison: {
    form: { home: number; away: number };
    att: { home: number; away: number };
    def: { home: number; away: number };
    h2h: { home: number; away: number };
    goals: { home: number; away: number };
  };
}

function pct(s: string): number {
  return parseInt(s.replace("%", "").trim(), 10) || 0;
}

/**
 * api-football /predictions — 매치별 winner 예측 + 확률 + 팀 비교 메트릭.
 * cache: 1800s (600→1800, 8/11 쿼터 절감 — 예측치는 라이브 중 크게 안 변함). 응답 없거나 키 미설정 시 null.
 */
export async function fetchMatchPrediction(
  fixtureId: string | number,
): Promise<MatchPrediction | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  if (!(await afQuotaOk("optional"))) return null;
  try {
    const res = await afFetch(EXTRAS_TAG, 
      `${BASE_URL}/predictions?fixture=${fixtureId}`,
      {
        headers: { "x-apisports-key": key },
        next: { revalidate: 1800 },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as AfPredictionsResponse;
    const r = data.response?.[0];
    if (!r) return null;
    const p = r.predictions;
    const c = r.comparison;
    return {
      winnerName: p.winner?.name ?? null,
      advice: p.advice ?? null,
      percent: { home: pct(p.percent.home), draw: pct(p.percent.draw), away: pct(p.percent.away) },
      comparison: {
        form: { home: pct(c.form.home), away: pct(c.form.away) },
        att: { home: pct(c.att.home), away: pct(c.att.away) },
        def: { home: pct(c.def.home), away: pct(c.def.away) },
        h2h: { home: pct(c.h2h.home), away: pct(c.h2h.away) },
        goals: { home: pct(c.goals.home), away: pct(c.goals.away) },
      },
    };
  } catch {
    return null;
  }
}

interface AfTeamStatsResponse {
  response: {
    league?: { id: number; name: string; season: number };
    team?: { id: number; name: string };
    form?: string | null;
    fixtures?: {
      played: { home: number; away: number; total: number };
      wins: { home: number; away: number; total: number };
      draws: { home: number; away: number; total: number };
      loses: { home: number; away: number; total: number };
    };
    goals?: {
      for: { total: { home: number; away: number; total: number } };
      against: { total: { home: number; away: number; total: number } };
    };
    clean_sheet?: { home: number; away: number; total: number };
    failed_to_score?: { home: number; away: number; total: number };
  };
}

export interface TeamSeasonStats {
  teamName: string;
  leagueName: string;
  season: number;
  played: number;
  wins: number;
  draws: number;
  loses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheet: number;
  failedToScore: number;
  form: string | null; // "WDLWW" 등 (최근 5경기 기준 약 30자)
}

/**
 * api-football /teams/statistics — 팀의 특정 리그·시즌 통계.
 * Friendlies(league=10), WORLD_CUP_QUAL 등 모두 동일 endpoint.
 */
export async function fetchTeamSeasonStats(
  teamId: number,
  leagueId: number,
  season: number,
): Promise<TeamSeasonStats | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  if (!(await afQuotaOk("optional"))) return null;
  try {
    const res = await afFetch(EXTRAS_TAG, 
      `${BASE_URL}/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`,
      {
        headers: { "x-apisports-key": key },
        next: { revalidate: 1800 },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as AfTeamStatsResponse;
    const r = data.response;
    if (!r?.team || !r.league || !r.fixtures) return null;
    return {
      teamName: r.team.name,
      leagueName: r.league.name,
      season: r.league.season,
      played: r.fixtures.played.total,
      wins: r.fixtures.wins.total,
      draws: r.fixtures.draws.total,
      loses: r.fixtures.loses.total,
      goalsFor: r.goals?.for.total.total ?? 0,
      goalsAgainst: r.goals?.against.total.total ?? 0,
      cleanSheet: r.clean_sheet?.total ?? 0,
      failedToScore: r.failed_to_score?.total ?? 0,
      form: r.form ?? null,
    };
  } catch {
    return null;
  }
}
