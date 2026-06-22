// NBA·NHL·LOL 선수 시즌 레이더 축 0~100 정규화 — 선수페이지 *SeasonOverview 와 선수비교(/compare) 공용 단일 출처.
// 각 함수는 해당 컴포넌트의 기존 축 정의를 그대로 옮긴 것(출력 동일). 축구는 player-radar.ts(toRadarAxes).
import type { RadarAxis } from "./player-radar";
import type { NbaSeasonAverages } from "./sports/balldontlie";
import type { NhlPlayerLanding } from "./sports/nhl-api";
import type { LolPlayerAgg } from "./sports/lol-player-stats";

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const cap = (v: number, c: number) => clamp((v / c) * 100);
const num = (v: number | undefined | null) => v ?? 0;

// ── NBA — 7축 (엘리트 시즌 평균 상한 cap) ──
const NBA_AXES: { label: string; cap: number; pick: (a: NbaSeasonAverages) => number; fmt: (v: number) => string }[] = [
  { label: "득점", cap: 30, pick: (a) => a.pts, fmt: (v) => v.toFixed(1) },
  { label: "리바운드", cap: 12, pick: (a) => a.reb, fmt: (v) => v.toFixed(1) },
  { label: "어시스트", cap: 10, pick: (a) => a.ast, fmt: (v) => v.toFixed(1) },
  { label: "스틸", cap: 2.2, pick: (a) => a.stl, fmt: (v) => v.toFixed(1) },
  { label: "블록", cap: 2.2, pick: (a) => a.blk, fmt: (v) => v.toFixed(1) },
  { label: "야투%", cap: 60, pick: (a) => a.fgPct * 100, fmt: (v) => `${v.toFixed(1)}%` },
  { label: "3점%", cap: 45, pick: (a) => a.fg3Pct * 100, fmt: (v) => `${v.toFixed(1)}%` },
];
export function toNbaRadarAxes(avg: NbaSeasonAverages): RadarAxis[] {
  return NBA_AXES.map((a) => {
    const v = a.pick(avg);
    return { axis: a.label, value: Math.round(cap(v, a.cap)), raw: a.fmt(v) };
  });
}

// ── NHL — 포지션 분기 (스케이터 6축 / 골리 5축). 골리는 SV%·GAA 선형변환. ──
export type NhlRadarKind = "skater" | "goalie";
export function toNhlRadarAxes(profile: NhlPlayerLanding): { kind: NhlRadarKind; axes: RadarAxis[] } {
  const f = profile.featured ?? {};
  if (profile.position === "G") {
    const w = num(f.wins);
    const sv = num(f.savePctg);
    const gaa = num(f.goalsAgainstAvg);
    const so = num(f.shutouts);
    const gp = num(f.gamesPlayed);
    return {
      kind: "goalie",
      axes: [
        { axis: "승", value: Math.round(cap(w, 40)), raw: String(w) },
        { axis: "SV%", value: Math.round(clamp(((sv - 0.88) / 0.05) * 100)), raw: sv.toFixed(3) },
        { axis: "방어", value: Math.round(clamp(((3.5 - gaa) / 1.5) * 100)), raw: gaa.toFixed(2) },
        { axis: "완봉", value: Math.round(cap(so, 8)), raw: String(so) },
        { axis: "출전", value: Math.round(cap(gp, 60)), raw: String(gp) },
      ],
    };
  }
  const g = num(f.goals);
  const a = num(f.assists);
  const pts = num(f.points);
  const sog = num(f.shots);
  const ppg = num(f.powerPlayGoals);
  const gp = num(f.gamesPlayed);
  return {
    kind: "skater",
    axes: [
      { axis: "골", value: Math.round(cap(g, 50)), raw: String(g) },
      { axis: "어시스트", value: Math.round(cap(a, 70)), raw: String(a) },
      { axis: "포인트", value: Math.round(cap(pts, 120)), raw: String(pts) },
      { axis: "슈팅", value: Math.round(cap(sog, 350)), raw: String(sog) },
      { axis: "PP골", value: Math.round(cap(ppg, 18)), raw: String(ppg) },
      { axis: "출전", value: Math.round(cap(gp, 82)), raw: String(gp) },
    ],
  };
}

// ── LOL — 6축 (생존=데스 역산) ──
export function toLolRadarAxes(agg: LolPlayerAgg): RadarAxis[] {
  const g = agg.games || 1;
  const kpg = agg.kills / g;
  const dpg = agg.deaths / g;
  const apg = agg.assists / g;
  const winPctNum = agg.winRate * 100;
  return [
    { axis: "KDA", value: Math.round(cap(agg.kda, 5)), raw: agg.kda.toFixed(2) },
    { axis: "킬", value: Math.round(cap(kpg, 5)), raw: kpg.toFixed(1) },
    { axis: "어시스트", value: Math.round(cap(apg, 12)), raw: apg.toFixed(1) },
    { axis: "CS/분", value: Math.round(cap(agg.csPerMin, 10)), raw: agg.csPerMin.toFixed(1) },
    { axis: "승률", value: Math.round(clamp(winPctNum)), raw: `${Math.round(winPctNum)}%` },
    { axis: "생존", value: Math.round(clamp(((8 - dpg) / 8) * 100)), raw: `데스 ${dpg.toFixed(1)}` },
  ];
}
