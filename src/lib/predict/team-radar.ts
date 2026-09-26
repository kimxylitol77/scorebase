// 팀 능력치 레이더 — 같은 리그·같은 시즌 팀들 사이 순위를 0~100 백분위로 바꾼 5축(공격·수비·전력·폼·원정).
// 절대값(경기당 2.1골)은 종목·리그마다 크기가 달라 비교가 안 되지만 리그 안 순위는 어디서나 같은 뜻이다.
// 재료는 팀 페이지가 이미 불러온 리그 경기뿐 — DB 조회 없는 순수 함수.
import type { PredictMatch } from "./types";
import type { RadarAxis } from "@/lib/player-radar";

/** 레이더를 그리는 최소 조건 — 팀 리그 경기 수·백분위를 낼 리그 팀 수 */
export const RADAR_MIN_PLAYED = 5;
export const RADAR_MIN_TEAMS = 8;
const FORM_N = 5;
const AWAY_MIN_PLAYED = 2;

export interface RadarRow {
  axis: string;
  /** 0~100 — 리그 1위 100, 꼴찌 0 */
  value: number;
  /** 실제 값 문구 */
  raw: string;
  /** 1-based 순위와 순위 매긴 팀 수 — 표본 부족 축은 null */
  rank: number | null;
  of: number;
  /** 같은 값의 다른 팀이 있다(공동 순위) */
  tied: boolean;
}

export interface TeamRadar {
  rows: RadarRow[];
  /** 차트용 — rows 와 같은 순서 */
  axes: RadarAxis[];
  played: number;
}

export interface RadarOptions {
  /** 무승부가 정규 결과인 종목(축구) — 폼·원정을 승점으로, 아니면 승률로 적는다 */
  hasDraw: boolean;
  /** 득점 단위 — 골·점·세트 */
  unit: string;
}

interface Tally {
  played: number;
  gf: number;
  ga: number;
  awayPlayed: number;
  awayPts: number;
  awayWins: number;
  /** 최신순 결과 */
  recent: Array<"W" | "D" | "L">;
}

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/**
 * 좋은 순서로 정렬했을 때의 순위(동률은 같은 순위)와 백분위. 값이 없는 팀은 순위에서 빠진다.
 */
function rankBy(ids: number[], get: (id: number) => number | null, higherIsBetter: boolean) {
  const vals = ids.flatMap((id) => {
    const v = get(id);
    return v == null || !Number.isFinite(v) ? [] : [{ id, v }];
  });
  vals.sort((a, b) => (higherIsBetter ? b.v - a.v : a.v - b.v));
  const n = vals.length;
  const out = new Map<number, { rank: number; pct: number; tied: boolean }>();
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && vals[j + 1].v === vals[i].v) j++;
    // 동률 묶음은 같은 순위·같은 백분위 — 화면의 "N위" 와 그래프 값이 어긋나지 않게 순위 자리 기준
    const pct = n > 1 ? Math.round(((n - 1 - i) / (n - 1)) * 100) : 50;
    for (let k = i; k <= j; k++) out.set(vals[k].id, { rank: i + 1, pct, tied: j > i });
    i = j + 1;
  }
  return { of: n, get: (id: number) => out.get(id) ?? null };
}

/**
 * 리그 전 팀의 레이더. 리그 경기 RADAR_MIN_PLAYED 이상 팀만, 그런 팀이 RADAR_MIN_TEAMS 미만이면 빈 Map.
 * @param elo teamId → Elo (시즌 누적 레이팅)
 */
export function computeLeagueRadars(
  seasonMatches: PredictMatch[],
  elo: (teamId: number) => number,
  opts: RadarOptions,
): Map<number, TeamRadar> {
  const tallies = new Map<number, Tally>();
  const t = (id: number) => {
    let x = tallies.get(id);
    if (!x) {
      x = { played: 0, gf: 0, ga: 0, awayPlayed: 0, awayPts: 0, awayWins: 0, recent: [] };
      tallies.set(id, x);
    }
    return x;
  };
  const finished = seasonMatches
    .filter((m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null)
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  for (const m of finished) {
    const hs = m.homeScore!;
    const as = m.awayScore!;
    const h = t(m.homeTeamId);
    const a = t(m.awayTeamId);
    h.played++; h.gf += hs; h.ga += as;
    a.played++; a.gf += as; a.ga += hs;
    const hr = hs > as ? "W" : hs < as ? "L" : "D";
    const ar = hr === "W" ? "L" : hr === "L" ? "W" : "D";
    if (h.recent.length < FORM_N) h.recent.push(hr);
    if (a.recent.length < FORM_N) a.recent.push(ar);
    a.awayPlayed++;
    a.awayPts += ar === "W" ? 3 : ar === "D" ? 1 : 0;
    if (ar === "W") a.awayWins++;
  }

  const ids = [...tallies.entries()].filter(([, x]) => x.played >= RADAR_MIN_PLAYED).map(([id]) => id);
  if (ids.length < RADAR_MIN_TEAMS) return new Map();

  const formPts = (x: Tally) => x.recent.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0) / x.recent.length;
  const attack = rankBy(ids, (id) => tallies.get(id)!.gf / tallies.get(id)!.played, true);
  const defense = rankBy(ids, (id) => tallies.get(id)!.ga / tallies.get(id)!.played, false);
  const power = rankBy(ids, (id) => elo(id), true);
  const form = rankBy(ids, (id) => formPts(tallies.get(id)!), true);
  const away = rankBy(
    ids,
    (id) => {
      const x = tallies.get(id)!;
      return x.awayPlayed >= AWAY_MIN_PLAYED ? x.awayPts / x.awayPlayed : null;
    },
    true,
  );

  const out = new Map<number, TeamRadar>();
  for (const id of ids) {
    const x = tallies.get(id)!;
    const w = x.recent.filter((r) => r === "W").length;
    const d = x.recent.filter((r) => r === "D").length;
    const l = x.recent.length - w - d;
    const awayRaw =
      x.awayPlayed < AWAY_MIN_PLAYED
        ? "원정 표본 부족"
        : opts.hasDraw
          ? `원정 경기당 ${(x.awayPts / x.awayPlayed).toFixed(2)}점`
          : `원정 승률 ${Math.round((x.awayWins / x.awayPlayed) * 100)}%`;
    const row = (axis: string, r: { of: number; get: (id: number) => { rank: number; pct: number; tied: boolean } | null }, raw: string): RadarRow => {
      const got = r.get(id);
      return { axis, value: got?.pct ?? 0, raw, rank: got?.rank ?? null, of: r.of, tied: got?.tied ?? false };
    };
    const rows = [
      row("공격력", attack, `경기당 ${fmt1(x.gf / x.played)}${opts.unit}`),
      row("수비력", defense, `경기당 실점 ${fmt1(x.ga / x.played)}${opts.unit}`),
      row("전력", power, `Elo ${Math.round(elo(id))}`),
      row("최근 폼", form, `최근 ${x.recent.length}경기 ${w}승${opts.hasDraw ? ` ${d}무` : ""} ${l}패`),
      row("원정", away, awayRaw),
    ];
    out.set(id, { rows, axes: rows.map((r) => ({ axis: r.axis, value: r.value, raw: r.raw })), played: x.played });
  }
  return out;
}

/** 레이더 요약 한 줄 — 축별 리그 순위(검색·AI 인용용). */
export function radarSummary(r: TeamRadar): string {
  return r.rows
    .filter((x) => x.rank != null)
    .map((x) => `${x.axis} ${x.of}팀 중 ${x.tied ? "공동 " : ""}${x.rank}위`)
    .join(" · ");
}
