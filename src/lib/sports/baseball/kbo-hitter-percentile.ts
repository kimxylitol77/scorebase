// KBO·NPB 타자 시즌 스탯 리그 백분위 계산 — Baseball Savant 비교 툴의 한국어 대안.
// 데이터 소스는 BaseballPlayerSeasonStats(daily fetch-baseball-season-stats 적재).
// 규정 표본 = 시즌 최다 출장 경기수의 60% 이상 출장한 타자. 미달 선수는 null (섹션 숨김).
// 이름 매칭: 한글 표시명 exact 우선, NPB 는 일본어 원명(playerNameEn) 공백 제거 비교 병행.

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

export type PercentileMetric = {
  key: "avg" | "ops" | "hr" | "rbi" | "hits";
  label: string;
  display: string; // 화면 표기값 (타율/OPS 는 소수 3자리)
  pct: number; // 0~100 백분위 (높을수록 리그 상위)
};

export type KboHitterPercentiles = {
  league: string;
  playerName: string;
  teamName: string;
  season: string;
  sample: number; // 규정 표본 인원
  minGames: number; // 규정 기준 경기수
  games: number;
  metrics: PercentileMetric[];
};

type Row = {
  playerName: string;
  playerNameEn: string | null;
  teamName: string;
  games: number | null;
  avg: number | null;
  ops: number | null;
  homeRuns: number | null;
  rbi: number | null;
  hits: number | null;
};

// 같은 스탯을 가진 규정 타자들 사이에서 "나보다 낮은 값의 비율" = 백분위.
function percentile(values: number[], v: number): number {
  if (values.length <= 1) return 50;
  const below = values.filter((x) => x < v).length;
  return Math.round((below / (values.length - 1)) * 100);
}

// 全角/半角 공백 제거 — NPB 일본어 이름 비교용 ("村上　宗隆" == "村上 宗隆")
const compact = (s: string | null | undefined) => (s ?? "").replace(/[\s　]+/g, "");

function nameMatches(r: { playerName: string; playerNameEn: string | null }, input: string): boolean {
  return r.playerName === input || (!!r.playerNameEn && compact(r.playerNameEn) === compact(input));
}

async function compute(
  league: "KBO" | "NPB",
  playerName: string,
  teamHint: string | null,
): Promise<KboHitterPercentiles | null> {
  // 최신 시즌 문자열 확보 (season 은 String 컬럼)
  const latest = await prisma.baseballPlayerSeasonStats.findFirst({
    where: { league },
    orderBy: { season: "desc" },
    select: { season: true },
  });
  if (!latest) return null;

  const rows: Row[] = await prisma.baseballPlayerSeasonStats.findMany({
    where: { league, season: latest.season, avg: { not: null }, ops: { not: null } },
    select: {
      playerName: true, playerNameEn: true, teamName: true, games: true,
      avg: true, ops: true, homeRuns: true, rbi: true, hits: true,
    },
  });
  if (rows.length < 30) return null; // 시즌 초 표본 부족 — 백분위 무의미

  const maxGames = Math.max(...rows.map((r) => r.games ?? 0));
  const minGames = Math.ceil(maxGames * 0.6);
  const qualified = rows.filter((r) => (r.games ?? 0) >= minGames);
  if (qualified.length < 20) return null;

  // 동명이인 대비: 팀 힌트가 있으면 팀 일치(축약형 'LG' ⊂ 'LG 트윈스' 양방향) 우선
  const byName = qualified.filter((r) => nameMatches(r, playerName));
  const me =
    byName.length <= 1
      ? byName[0]
      : byName.find(
          (r) => teamHint && (teamHint.startsWith(r.teamName) || r.teamName.startsWith(teamHint)),
        ) ?? byName[0];
  if (!me) return null;

  const num = (v: number | null) => v ?? 0;
  const defs: Array<{ key: PercentileMetric["key"]; label: string; get: (r: Row) => number; fmt: (v: number) => string }> = [
    { key: "avg", label: "타율", get: (r) => num(r.avg), fmt: (v) => v.toFixed(3) },
    { key: "ops", label: "OPS", get: (r) => num(r.ops), fmt: (v) => v.toFixed(3) },
    { key: "hr", label: "홈런", get: (r) => num(r.homeRuns), fmt: (v) => String(v) },
    { key: "rbi", label: "타점", get: (r) => num(r.rbi), fmt: (v) => String(v) },
    { key: "hits", label: "안타", get: (r) => num(r.hits), fmt: (v) => String(v) },
  ];

  return {
    league,
    playerName: me.playerName,
    teamName: me.teamName,
    season: latest.season,
    sample: qualified.length,
    minGames,
    games: me.games ?? 0,
    metrics: defs.map((d) => {
      const v = d.get(me);
      return {
        key: d.key,
        label: d.label,
        display: d.fmt(v),
        pct: percentile(qualified.map(d.get), v),
      };
    }),
  };
}

// 선수 페이지·OG 카드 양쪽에서 쓰므로 1시간 캐시 (원본이 daily 갱신이라 충분)
export const getKboHitterPercentiles = unstable_cache(
  (playerName: string, teamHint: string | null) => compute("KBO", playerName, teamHint),
  ["kbo-hitter-percentile"],
  { revalidate: 3600 },
);

export const getNpbHitterPercentiles = unstable_cache(
  (playerName: string, teamHint: string | null) => compute("NPB", playerName, teamHint),
  ["npb-hitter-percentile"],
  { revalidate: 3600 },
);
