// 홈 「오늘 주요 경기」 순위·쿼터 — 순수 함수와 타입만(prisma 없음). 클라이언트 컴포넌트가 관심팀·현재 시각으로
// 재정렬할 때 이 모듈만 가져간다(로더가 있는 today-matches.ts 를 클라이언트가 import 하면 PrismaClient 가 브라우저 번들에 들어가 죽는다).
// 순위: 관심팀 → 킥오프 ±3h(LIVE 는 "지금") → 리그 티어(빅5·K리그1·UCL) → 시각 근접. 축구 후보 3개 이상이면 6개 중 축구 3개 보장.

/** 카드 렌더에 필요한 최소 필드 — 클라이언트로 JSON 직렬화되므로 Date 대신 ms. */
export interface HomeMatch {
  id: number;
  league: string;
  href: string;
  status: string; // SCHEDULED | LIVE | FINISHED | POSTPONED
  startMs: number;
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** 표시용 원배당(vig 포함). 없으면 null */
  odds: { home: number; draw: number | null; away: number } | null;
  /** 모델 1X2 확률. 없으면 null */
  prob: { home: number; draw: number | null; away: number } | null;
  soccer: boolean;
}

export const HOME_MATCH_COUNT = 6;
export const HOME_SOCCER_MIN = 3;
/** 클라이언트에 넘기는 후보 상한 — 재정렬·by-ids 갱신(최대 50) 재료 */
export const HOME_CANDIDATE_LIMIT = 30;
const NEAR_MS = 3 * 3600 * 1000;

// 티어 0 = 지시서 "빅5·K리그·UCL 우선", 1 = 나머지 주요 리그, 2 = 화이트리스트 잔여
const TIER0 = new Set(["UCL", "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "K_LEAGUE_1"]);
const TIER1 = new Set(["KBO", "MLB", "NPB", "NBA", "NHL", "UEL", "UECL", "WORLD_CUP", "MLS", "J1_LEAGUE"]);
export function leagueTier(league: string): number {
  return TIER0.has(league) ? 0 : TIER1.has(league) ? 1 : 2;
}

/** 정렬 키 — 작을수록 앞. [관심팀 아님, ±3h 밖, 티어, |Δt|] */
function rankKey(m: HomeMatch, nowMs: number, fav: ReadonlySet<number>): [number, number, number, number] {
  const isFav = fav.has(m.homeTeamId) || fav.has(m.awayTeamId) ? 0 : 1;
  // 진행 중 경기는 "지금" 으로 본다 — 킥오프가 몇 시간 전이어도 방문자가 먼저 찾는 건 라이브다.
  const dt = m.status === "LIVE" ? 0 : Math.abs(m.startMs - nowMs);
  const near = dt <= NEAR_MS ? 0 : 1;
  return [isFav, near, leagueTier(m.league), dt];
}

/**
 * 후보를 순위대로 정렬하고 축구 쿼터를 적용해 count 개를 고른다.
 * 축구 후보가 HOME_SOCCER_MIN 미만이면 있는 만큼만(지시서 예외).
 */
export function rankTodayMatches(
  cands: readonly HomeMatch[],
  nowMs: number,
  favTeamIds: readonly number[] = [],
  count = HOME_MATCH_COUNT,
): HomeMatch[] {
  const fav = new Set(favTeamIds);
  const sorted = [...cands]
    .filter((m) => m.status !== "POSTPONED")
    .sort((a, b) => {
      const ka = rankKey(a, nowMs, fav);
      const kb = rankKey(b, nowMs, fav);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return a.id - b.id;
    });
  const picked: HomeMatch[] = [];
  const taken = new Set<number>();
  for (const m of sorted) {
    if (picked.length >= Math.min(HOME_SOCCER_MIN, count)) break;
    if (m.soccer) { picked.push(m); taken.add(m.id); }
  }
  for (const m of sorted) {
    if (picked.length >= count) break;
    if (!taken.has(m.id)) { picked.push(m); taken.add(m.id); }
  }
  // 쿼터로 끌어올린 축구도 표시 순서는 다시 순위대로 — sorted 가 이미 그 순서다.
  return sorted.filter((m) => taken.has(m.id));
}

