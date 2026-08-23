// 축구 주심별 카드(옐로) 성향 집계 — 매치 상세의 "주심 {이름}" 줄에 붙일 경기당 평균 옐로.
//
// 데이터는 전부 우리 DB 다 (Match.referee + MatchStats.homeYellow/awayYellow). 외부 API 호출 0.
//
// 설계 결정 (2026-08-23 실측 근거).
//   - 경기 전 패널은 만들지 않는다. 미래 SCHEDULED 매치 8,897건 중 referee 보유는 31건(0.3%)뿐이고,
//     그마저 킥오프 임박분에 몰려 있다 (향후 7일 1,436건 중 30건 · D+3 이후는 1건 — CHILE_PD 9/03).
//     소스가 킥오프 한참 전에는 주심을 주지 않는다는 뜻이라 라이브·종료 화면에만 붙인다.
//   - 리그 안에서만 집계한다. 같은 주심이라도 리그마다 카드 기준이 달라 리그 평균과 나란히
//     읽혀야 뜻이 있다.
//   - 표본 하한 10경기. 실측상 n=10 이면 옐로 평균의 95% CI 반폭이 0.9~1.5장,
//     하한을 12·15 로 올리면 EPL 자격 주심이 17→14→11명으로 줄어 커버리지 손실이 크다.
//   - 레드는 뺐다. 리그 평균이 경기당 0.0~0.3장이라 n=10~24 표본에서 표준오차가 값 자체와
//     같은 크기다(카드 1장에 0.1장씩 움직인다). 옐로만 노출한다.
//   - 주심 이름 표기가 소스마다 다르다. 25/26 EPL 은 "Thomas Bramall", 26/27 은 "T. Bramall"
//     (ts 표기)이라 원문 그대로 대조하면 현재 시즌 매치가 전부 표본 0 으로 떨어진다.
//     이름 정규화 키(첫 글자 이니셜 + 나머지 토큰)로 묶는다.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";

/** 배지를 그리기 위한 주심 최소 표본. */
export const MIN_REFEREE_MATCHES = 10;
/** 리그 평균을 함께 보여주기 위한 리그 최소 표본. 미달이면 비교값 없이 주심 값만 낸다. */
const MIN_LEAGUE_MATCHES = 30;
/** 집계 창 — 대략 2시즌. 더 늘려도 우리 DB 에 referee+카드가 이보다 오래된 게 없다.
 *  실제 구성은 시즌 경계에서 크게 기운다. 2026-08-23 기준 EPL 재료 314경기 중 313건이 25/26,
 *  26/27 은 1건뿐이다. 그래서 화면 문구는 시즌을 단정하지 않고 "최근 N경기 평균"으로 쓴다. */
const WINDOW_DAYS = 400;

/** 집계 로직을 바꾸면 올린다 — unstable_cache 는 배포 사이에도 살아남는다. */
const CACHE_V = "v1";
const REVALIDATE_SEC = 21600; // 6h — 종료 경기만 쓰므로 자주 바뀌지 않는다.

export interface RefereeCardTendency {
  /** 표시용 원본 이름 (DB Match.referee 그대로) */
  referee: string;
  /** 표본 경기 수 */
  matches: number;
  /** 경기당 평균 옐로 (소수 1자리) */
  avgYellow: number;
  /** 같은 리그 평균 옐로 (소수 1자리). 리그 표본 부족이면 null */
  leagueAvgYellow: number | null;
}

interface RefereeAgg {
  matches: number;
  yellow: number;
}

interface LeagueRefereeCards {
  leagueMatches: number;
  leagueYellow: number;
  /** 정규화 키 → 집계 */
  byReferee: Record<string, RefereeAgg>;
}

/**
 * 주심 이름 정규화 키. "Thomas Bramall" 과 "T. Bramall" 을 같은 키로 묶는다.
 * 뒤에 붙는 국가 표기("Sam Allison, England")는 잘라낸다.
 * 성이 여러 토큰이면 전부 남긴다("A. Al Ali" → "a al ali") — 과다 병합보다 미병합이 안전하다.
 */
export function refereeKey(name: string): string {
  const base = name.split(",")[0];
  const cleaned = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s.]/g, " ")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].replace(/\./g, "");
  const initial = parts[0].replace(/\./g, "").slice(0, 1);
  const rest = parts
    .slice(1)
    .map((p) => p.replace(/\./g, ""))
    .filter(Boolean)
    .join(" ");
  return rest ? `${initial} ${rest}` : initial;
}

async function computeLeagueRefereeCards(league: string): Promise<LeagueRefereeCards> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  const rows = await prisma.matchStats.findMany({
    where: {
      homeYellow: { not: null },
      awayYellow: { not: null },
      match: { league, status: "FINISHED", referee: { not: null }, startTime: { gte: since } },
    },
    select: {
      homeYellow: true,
      awayYellow: true,
      match: { select: { referee: true } },
    },
  });

  const byReferee: Record<string, RefereeAgg> = {};
  let leagueMatches = 0;
  let leagueYellow = 0;
  for (const r of rows) {
    const name = r.match.referee;
    if (!name) continue;
    const yellow = (r.homeYellow ?? 0) + (r.awayYellow ?? 0);
    leagueMatches += 1;
    leagueYellow += yellow;
    const key = refereeKey(name);
    if (!key) continue;
    const agg = byReferee[key] ?? { matches: 0, yellow: 0 };
    agg.matches += 1;
    agg.yellow += yellow;
    byReferee[key] = agg;
  }
  return { leagueMatches, leagueYellow, byReferee };
}

const getLeagueRefereeCards = (league: string) =>
  unstable_cache(
    () => computeLeagueRefereeCards(league),
    ["referee-cards-league", CACHE_V, league],
    { revalidate: REVALIDATE_SEC },
  )();

/**
 * 이 주심의 카드 성향. 축구가 아니거나 표본이 하한 미만이면 null — 호출부는 아무것도 그리지 않는다.
 * DB 접근 실패는 null 로 삼킨다(주심 이름 자체는 계속 보여야 한다).
 */
export async function getRefereeCardTendency(
  league: string,
  referee: string | null | undefined,
): Promise<RefereeCardTendency | null> {
  if (!referee || !SOCCER_LEAGUES.has(league)) return null;
  const key = refereeKey(referee);
  if (!key) return null;
  try {
    const data = await getLeagueRefereeCards(league);
    const agg = data.byReferee[key];
    if (!agg || agg.matches < MIN_REFEREE_MATCHES) return null;
    return {
      referee,
      matches: agg.matches,
      avgYellow: Math.round((agg.yellow / agg.matches) * 10) / 10,
      leagueAvgYellow:
        data.leagueMatches >= MIN_LEAGUE_MATCHES
          ? Math.round((data.leagueYellow / data.leagueMatches) * 10) / 10
          : null,
    };
  } catch {
    return null;
  }
}
