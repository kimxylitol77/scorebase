// 배구 국가대표 Elo — VNL/AVC 네이션스컵/유럽리그.
//
// 축구 elo.ts 와 분리한 이유:
//   ① 시드 주입 필요 — 대회당 팀별 4~12경기라 1500 균일 시작은 변별력이 늦음.
//      시드는 "대략적 티어"(FIVB 랭킹 영역 기반 상식 수준, 정밀 포인트 아님) — 간격을
//      보수적으로(±150) 잡고 K 를 약간 키워(24) 경기 결과로 빠르게 자가 보정.
//   ② 중립 코트 — VNL/AVC 는 주차 개최지 집중 개최라 홈 어드밴티지 0.
//   ③ 무승부 없음 — 승률은 2-way expectation 그대로.
//
// MoV = 세트차(1~3). ln(setDiff+1) 가중 — 3:0 압승은 3:2 신승보다 큰 변화,
// 강팀의 예상된 압승은 eloDiff 디스카운트(FiveThirtyEight 식 동일).

export const VB_STARTING_ELO = 1500;
const K_FACTOR = 24;

// ── 티어 시드 (DB 영문 팀명 키) — 2026-06 시점. 미등재 팀은 1500 ──
// 남자 VNL 18팀
const SEED_VNL: Record<string, number> = {
  Poland: 1790, Italy: 1780, France: 1770, Brazil: 1760, Japan: 1745, USA: 1735,
  Slovenia: 1720, Germany: 1690, Argentina: 1685, Cuba: 1675, Canada: 1665,
  Serbia: 1660, Ukraine: 1640, Turkey: 1620, Iran: 1615, Bulgaria: 1600,
  Belgium: 1590, China: 1580,
};
// 여자 AVC 네이션스컵 12팀 — 한국·베트남·대만이 시드 상위권
const SEED_AVC_W: Record<string, number> = {
  "South Korea Women": 1660, "Vietnam Women": 1645, "Chinese Taipei Women": 1620,
  "Kazakhstan Women": 1590, "Indonesia Women": 1570, "Philippines Women": 1545,
  "Australia Women": 1540, "Iran Women": 1530, "Hong Kong Women": 1490,
  "Uzbekistan Women": 1470, "Mongolia Women": 1450, "Kyrgyzstan Women": 1440,
  "Lebanon Women": 1450,
};
// 여자 유럽리그(골든+실버 통합) 26팀 — 골든리그권 상위, 실버리그권 하위
const SEED_EGL_W: Record<string, number> = {
  "Sweden Women": 1640, "Spain Women": 1630, "Greece Women": 1625, "Hungary Women": 1615,
  "Romania Women": 1610, "Croatia Women": 1600, "Slovakia Women": 1595, "Finland Women": 1585,
  "Switzerland Women": 1575, "Austria Women": 1560, "Portugal Women": 1555, "Israel Women": 1550,
  "Azerbaijan Women": 1545, "Estonia Women": 1520, "Denmark Women": 1515, "Latvia Women": 1505,
  "Georgia Women": 1495, "Lithuania Women": 1490, "Montenegro Women": 1485,
  "Bosnia & Herzegovina Women": 1480, "North Macedonia Women": 1465, "Albania Women": 1455,
  "Kosovo Women": 1450, "Iceland Women": 1445, "Luxembourg Women": 1430,
};

const SEED_BY_LEAGUE: Record<string, Record<string, number>> = {
  VNL: SEED_VNL,
  AVC_NATIONS_W: SEED_AVC_W,
  EGL_W: SEED_EGL_W,
};

export function volleyballSeedElo(league: string, teamName: string): number {
  const table = SEED_BY_LEAGUE[league];
  if (!table) return VB_STARTING_ELO;
  if (table[teamName] != null) return table[teamName];
  // 표기 차이 흡수 — 공백/특수문자 무시 비교
  const norm = (s: string) => s.toLowerCase().replace(/[\s.&-]/g, "");
  const target = norm(teamName);
  for (const [k, v] of Object.entries(table)) if (norm(k) === target) return v;
  return VB_STARTING_ELO;
}

export interface VbEloMatch {
  league: string;
  status: string;
  startTime: Date;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null; // 세트
  awayScore: number | null;
  homeTeamName: string;
  awayTeamName: string;
}

export function vbExpectedScore(eloSelf: number, eloOpp: number): number {
  return 1 / (1 + Math.pow(10, (eloOpp - eloSelf) / 400));
}

/**
 * FINISHED 매치를 시간순 처리한 Elo 테이블 (teamId → elo).
 * upToTime 지정 시 그 이전 경기만 반영 — 백테스트용(해당 시점 스냅샷).
 */
export function calcVolleyballElo(
  matches: VbEloMatch[],
  upToTime?: Date,
): Map<number, number> {
  const ratings = new Map<number, number>();
  const seedOf = (m: VbEloMatch, teamId: number, name: string) => {
    if (!ratings.has(teamId)) ratings.set(teamId, volleyballSeedElo(m.league, name));
    return ratings.get(teamId)!;
  };

  const sorted = [...matches].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  for (const m of sorted) {
    if (upToTime && m.startTime.getTime() >= upToTime.getTime()) break;
    if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
    if (m.homeScore === m.awayScore) continue; // 배구에 무승부 없음 — 데이터 오류 방어
    const rH = seedOf(m, m.homeTeamId, m.homeTeamName);
    const rA = seedOf(m, m.awayTeamId, m.awayTeamName);
    const eH = vbExpectedScore(rH, rA);
    const sH = m.homeScore > m.awayScore ? 1 : 0;
    const setDiff = Math.abs(m.homeScore - m.awayScore);
    const eloDiffWinner = sH === 1 ? rH - rA : rA - rH;
    const mov = Math.log(setDiff + 1) * (2.2 / (eloDiffWinner * 0.001 + 2.2));
    const delta = K_FACTOR * mov * (sH - eH);
    ratings.set(m.homeTeamId, rH + delta);
    ratings.set(m.awayTeamId, rA - delta);
  }
  return ratings;
}

/** 특정 매치의 Elo 승률 (홈 기준). 테이블에 없는 팀은 리그 시드. */
export function vbEloWinProb(
  ratings: Map<number, number>,
  m: Pick<VbEloMatch, "league" | "homeTeamId" | "awayTeamId" | "homeTeamName" | "awayTeamName">,
): number {
  const rH = ratings.get(m.homeTeamId) ?? volleyballSeedElo(m.league, m.homeTeamName);
  const rA = ratings.get(m.awayTeamId) ?? volleyballSeedElo(m.league, m.awayTeamName);
  return vbExpectedScore(rH, rA);
}
