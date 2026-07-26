// KBO·NPB 투수 시즌 스탯 리그 백분위 계산 — kbo-hitter-percentile 의 투수판.
// 데이터 소스는 BaseballPlayerSeasonStats 의 투수 row ({Kbo Pitcher,npb pit_*}Basic 스크랩, era not null).
// 규정 표본 = 시즌 최다 이닝의 50% 이상 투구한 투수 (사실상 선발 + 다이닝 불펜). 미달 시 null.
// ERA/WHIP 는 낮을수록 좋으므로 백분위를 반전한다.

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

export type PitcherPercentileMetric = {
  key: "era" | "whip" | "so" | "k9" | "wins";
  label: string;
  display: string;
  pct: number; // 0~100 백분위 (높을수록 리그 상위 = 좋음)
};

export type KboPitcherPercentiles = {
  league: string;
  playerName: string;
  teamName: string;
  season: string;
  sample: number; // 규정 표본 인원
  minIp: number; // 규정 기준 이닝
  ip: number;
  metrics: PitcherPercentileMetric[];
};

type Row = {
  playerName: string;
  playerNameEn: string | null;
  teamName: string;
  era: number | null;
  whip: number | null;
  ip: number | null;
  so: number | null;
  wins: number | null;
};

// 규정 투수들 사이에서 "나보다 낮은 값의 비율" = 백분위. lowerIsBetter 면 반전.
function percentile(values: number[], v: number, lowerIsBetter = false): number {
  if (values.length <= 1) return 50;
  const below = values.filter((x) => x < v).length;
  const pct = Math.round((below / (values.length - 1)) * 100);
  return lowerIsBetter ? 100 - pct : pct;
}

// 全角/半角 공백 제거 — NPB 일본어 이름 비교용
const compact = (s: string | null | undefined) => (s ?? "").replace(/[\s　]+/g, "");

function nameMatches(r: { playerName: string; playerNameEn: string | null }, input: string): boolean {
  return r.playerName === input || (!!r.playerNameEn && compact(r.playerNameEn) === compact(input));
}

async function compute(
  league: "KBO" | "NPB",
  playerName: string,
  teamHint: string | null,
): Promise<KboPitcherPercentiles | null> {
  const latest = await prisma.baseballPlayerSeasonStats.findFirst({
    where: { league },
    orderBy: { season: "desc" },
    select: { season: true },
  });
  if (!latest) return null;

  const rows: Row[] = await prisma.baseballPlayerSeasonStats.findMany({
    where: { league, season: latest.season, era: { not: null }, ip: { not: null } },
    select: {
      playerName: true, playerNameEn: true, teamName: true,
      era: true, whip: true, ip: true, so: true, wins: true,
    },
  });
  // 시즌 초 표본 부족 가드. NPB 는 공식 페이지가 규정 투수만 노출(리그당 ~12명)이라 문턱을 낮게 잡는다.
  if (rows.length < 15) return null;

  const maxIp = Math.max(...rows.map((r) => r.ip ?? 0));
  const minIp = Math.ceil(maxIp * 0.5);
  const qualified = rows.filter((r) => (r.ip ?? 0) >= minIp);
  if (qualified.length < 15) return null;

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
  const k9 = (r: Row) => (r.ip && r.ip > 0 ? (num(r.so) * 9) / r.ip : 0);
  const defs: Array<{
    key: PitcherPercentileMetric["key"];
    label: string;
    get: (r: Row) => number;
    fmt: (v: number) => string;
    lowerIsBetter?: boolean;
  }> = [
    { key: "era", label: "ERA", get: (r) => num(r.era), fmt: (v) => v.toFixed(2), lowerIsBetter: true },
    { key: "whip", label: "WHIP", get: (r) => num(r.whip), fmt: (v) => v.toFixed(2), lowerIsBetter: true },
    { key: "k9", label: "K/9", get: k9, fmt: (v) => v.toFixed(1) },
    { key: "so", label: "탈삼진", get: (r) => num(r.so), fmt: (v) => String(v) },
    { key: "wins", label: "승리", get: (r) => num(r.wins), fmt: (v) => String(v) },
  ];

  return {
    league,
    playerName: me.playerName,
    teamName: me.teamName,
    season: latest.season,
    sample: qualified.length,
    minIp,
    ip: me.ip ?? 0,
    metrics: defs.map((d) => {
      const v = d.get(me);
      return {
        key: d.key,
        label: d.label,
        display: d.fmt(v),
        pct: percentile(qualified.map(d.get), v, d.lowerIsBetter),
      };
    }),
  };
}

// 선수 페이지·OG 카드 양쪽에서 쓰므로 1시간 캐시 (원본이 daily cron 이라 충분)
export const getKboPitcherPercentiles = unstable_cache(
  (playerName: string, teamHint: string | null) => compute("KBO", playerName, teamHint),
  ["kbo-pitcher-percentile"],
  { revalidate: 3600 },
);

export const getNpbPitcherPercentiles = unstable_cache(
  (playerName: string, teamHint: string | null) => compute("NPB", playerName, teamHint),
  ["npb-pitcher-percentile"],
  { revalidate: 3600 },
);
