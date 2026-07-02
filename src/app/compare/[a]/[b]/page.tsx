// 선수 비교 결과 — sport 디스패처. 축구·NBA·NHL·LOL 은 RadarCompareView(레이더+표). a,b = 종목별 선수 id.
//   ?sport 없음=축구(ts id), NBA/NHL/LOL=각 종목 id. 야구는 별도 BaseballCompareView(추가 예정).
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import RadarCompareView, { type CmpHead, type CmpStatRow } from "@/components/RadarCompareView";
import BaseballCompareView, { type PctSide } from "@/components/BaseballCompareView";
import { toRadarAxes } from "@/lib/player-radar";
import { loadComparePlayer, type SeasonStat } from "../../loadComparePlayer";
import {
  loadLol, loadNba, loadNhl,
  LOL_ROWS, NBA_ROWS, NHL_SKATER_ROWS, NHL_GOALIE_ROWS,
  type RadarComparePlayer, type StatRowDef,
} from "../../loaders";
import { loadBaseball, BAT_ROWS, PIT_ROWS, type BatPit, type BaseballComparePlayer } from "../../baseball";

export const dynamic = "force-dynamic";

const RADAR_SPORTS = ["NBA", "NHL", "LOL"] as const;
type RadarSport = (typeof RADAR_SPORTS)[number];
const isRadarSport = (s: string): s is RadarSport => (RADAR_SPORTS as readonly string[]).includes(s);
const BASEBALL_SPORTS = ["MLB", "KBO", "NPB"];
const isBaseball = (s: string): boolean => BASEBALL_SPORTS.includes(s);

function normSport(s?: string): string {
  return (s || "SOCCER").toUpperCase();
}
function normType(t?: string): BatPit {
  return t === "p" ? "p" : "b";
}
function canonicalPair(a: string, b: string, sport: string, t?: string): string {
  const [x, y] = [a, b].sort();
  if (sport === "SOCCER") return `/compare/${x}/${y}`;
  return `/compare/${x}/${y}?sport=${sport}${isBaseball(sport) ? `&t=${normType(t)}` : ""}`;
}

const num = (v: number | null | undefined) => v ?? 0;

// 스탯 행 비교 — 우위(lowerBetter 반영) 판정 + 포맷.
function buildRows(defs: StatRowDef[], a: Record<string, number>, b: Record<string, number>, hasA: boolean, hasB: boolean): CmpStatRow[] {
  return defs.map((d) => {
    const va = a[d.key] ?? 0;
    const vb = b[d.key] ?? 0;
    let aBetter = false;
    let bBetter = false;
    if (hasA && hasB && va !== vb) {
      const aWin = d.lowerBetter ? va < vb : va > vb;
      aBetter = aWin;
      bBetter = !aWin;
    }
    return { label: d.label, a: hasA ? d.fmt(va) : "—", b: hasB ? d.fmt(vb) : "—", aBetter, bBetter };
  });
}

// ── 축구 ──
const sInt = (v: number) => Math.round(v).toLocaleString();
const SOCCER_ROWS: StatRowDef[] = [
  { label: "경기", key: "matches", fmt: sInt },
  { label: "선발", key: "starts", fmt: sInt },
  { label: "골", key: "goals", fmt: sInt },
  { label: "도움", key: "assists", fmt: sInt },
  { label: "출전 시간(분)", key: "minutes", fmt: sInt },
  { label: "슛", key: "shots", fmt: sInt },
  { label: "유효슛", key: "sot", fmt: sInt },
  { label: "키패스", key: "keyPasses", fmt: sInt },
  { label: "패스 정확도", key: "passAcc", fmt: (v) => `${Math.round(v)}%` },
  { label: "태클", key: "tackles", fmt: sInt },
  { label: "인터셉트", key: "interceptions", fmt: sInt },
  { label: "세이브", key: "saves", fmt: sInt },
  { label: "경고", key: "yellow", lowerBetter: true, fmt: sInt },
  { label: "퇴장", key: "red", lowerBetter: true, fmt: sInt },
];
function soccerStats(s: SeasonStat | null): Record<string, number> {
  if (!s) return {};
  return {
    matches: num(s.matches), starts: num(s.starts), goals: num(s.goals), assists: num(s.assists),
    minutes: num(s.minutes), shots: num(s.shots), sot: num(s.sot), keyPasses: num(s.keyPasses),
    passAcc: num(s.passAcc), tackles: num(s.tackles), interceptions: num(s.interceptions),
    saves: num(s.saves), yellow: num(s.yellow), red: num(s.red),
  };
}

async function renderSoccer(a: string, b: string) {
  const [pa, pb] = await Promise.all([loadComparePlayer(a), loadComparePlayer(b)]);
  if (!pa || !pb) notFound();
  const sa = pa.season;
  const sb = pb.season;
  const both = !!sa && !!sb && num(sa.minutes) > 0 && num(sb.minutes) > 0;
  const hasGk = num(sa?.saves) > 0 || num(sb?.saves) > 0;
  const rows = buildRows(SOCCER_ROWS, soccerStats(sa), soccerStats(sb), !!sa, !!sb).filter(
    (r) => r.label !== "세이브" || num(sa?.saves) > 0 || num(sb?.saves) > 0,
  );
  const head = (p: typeof pa): CmpHead => ({
    id: p.id, name: p.name, photo: p.photo,
    sub: [p.posLabel, p.team, p.leagueLabel].filter(Boolean).join(" · ") || null,
    valueEurM: p.value, href: `/transfers/${p.id}`,
  });
  return (
    <RadarCompareView
      sport="SOCCER"
      a={head(pa)} b={head(pb)}
      axesA={both ? toRadarAxes(sa!) : null} axesB={both ? toRadarAxes(sb!) : null}
      radarNote={hasGk ? "골키퍼는 필드플레이어 지표 기준이라 레이더가 낮게 보일 수 있습니다 — 세이브는 아래 표 참고." : null}
      rows={rows}
      caption="ⓘ 이번 시즌 성적 = 스코어베이스 데이터(TheSports). 레이더는 90분당·정확도 지표를 0~100 으로 정규화한 상대 비교용. 리그가 다르면 난이도 차이는 반영되지 않습니다."
      swapHref={`/compare/${b}/${a}`}
    />
  );
}

// ── 레이더 종목 (NBA·NHL·LOL) ──
async function renderRadarSport(a: string, b: string, sport: RadarSport) {
  const load = sport === "NBA" ? loadNba : sport === "NHL" ? loadNhl : loadLol;
  const [pa, pb] = await Promise.all([load(a), load(b)]);
  if (!pa || !pb) notFound();

  let defs: StatRowDef[];
  let radarNote: string | null = null;
  if (sport === "NHL") {
    defs = pa.radarKind === "goalie" ? NHL_GOALIE_ROWS : NHL_SKATER_ROWS;
    if (pa.radarKind !== pb.radarKind) radarNote = "포지션(스케이터/골리)이 달라 같은 축으로 비교할 수 없습니다.";
  } else {
    defs = sport === "NBA" ? NBA_ROWS : LOL_ROWS;
  }
  const sameKind = sport !== "NHL" || pa.radarKind === pb.radarKind;
  const hasA = Object.keys(pa.stats).length > 0;
  const hasB = Object.keys(pb.stats).length > 0;
  const rows = sameKind ? buildRows(defs, pa.stats, pb.stats, hasA, hasB) : [];
  const head = (p: RadarComparePlayer): CmpHead => ({
    id: p.id, name: p.name, photo: p.photo, sub: p.sub, href: `/players/${p.id}?league=${sport}`,
  });
  return (
    <RadarCompareView
      sport={sport}
      a={head(pa)} b={head(pb)}
      axesA={sameKind ? pa.axes : null} axesB={sameKind ? pb.axes : null}
      radarNote={radarNote}
      rows={rows}
      caption="ⓘ 이번 시즌 기록 = 스코어베이스 데이터. 레이더는 종목별 엘리트 시즌 상한으로 0~100 정규화한 상대 비교용."
      swapHref={`/compare/${b}/${a}?sport=${sport}`}
    />
  );
}

// ── 야구 (MLB·KBO·NPB) — 표 + MLB 퍼센타일, 레이더 없음 ──
async function renderBaseball(a: string, b: string, sport: string, type: BatPit) {
  const [pa, pb] = await Promise.all([loadBaseball(a, sport, type), loadBaseball(b, sport, type)]);
  if (!pa || !pb) notFound();
  const defs = type === "p" ? PIT_ROWS : BAT_ROWS;
  const rows = buildRows(defs, pa.stats, pb.stats, true, true);
  const head = (p: BaseballComparePlayer): CmpHead => ({ id: p.id, name: p.name, photo: p.photo, sub: p.sub, href: `/players/${p.id}?league=${sport}` });
  const pct: PctSide | null = pa.percentiles || pb.percentiles ? { type: type === "p" ? "pitcher" : "batter", a: pa.percentiles, b: pb.percentiles } : null;
  return (
    <BaseballCompareView
      sport={sport}
      a={head(pa)} b={head(pb)}
      rows={rows}
      pct={pct}
      swapHref={`/compare/${b}/${a}?sport=${sport}&t=${type}`}
      caption="ⓘ 이번 시즌 성적 = 스코어베이스 데이터. 같은 보직(타자·투수)끼리 비교. MLB 는 Baseball Savant 퍼센타일(리그 백분위) 제공."
    />
  );
}

async function namesFor(a: string, b: string, sport: string, type: BatPit): Promise<[string, string] | null> {
  if (sport === "SOCCER") {
    const [pa, pb] = await Promise.all([loadComparePlayer(a), loadComparePlayer(b)]);
    return pa && pb ? [pa.name, pb.name] : null;
  }
  if (isRadarSport(sport)) {
    const load = sport === "NBA" ? loadNba : sport === "NHL" ? loadNhl : loadLol;
    const [pa, pb] = await Promise.all([load(a), load(b)]);
    return pa && pb ? [pa.name, pb.name] : null;
  }
  if (isBaseball(sport)) {
    const [pa, pb] = await Promise.all([loadBaseball(a, sport, type), loadBaseball(b, sport, type)]);
    return pa && pb ? [pa.name, pb.name] : null;
  }
  return null;
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ a: string; b: string }>; searchParams: Promise<{ sport?: string; t?: string }> }): Promise<Metadata> {
  const { a, b } = await params;
  const sp = await searchParams;
  const sport = normSport(sp.sport);
  const names = await namesFor(a, b, sport, normType(sp.t));
  if (!names) return { title: "선수 비교" };
  const [na, nb] = names;
  const title = `${na} vs ${nb} 비교 · 시즌 스탯`;
  const description = `${na}과(와) ${nb}의 이번 시즌 지표를 레이더와 표로 한눈에 비교. 스코어베이스 선수 비교.`;
  return {
    title, description,
    keywords: [`${na} ${nb}`, `${na} 비교`, "선수 비교", "스탯 비교", "스코어베이스"],
    openGraph: { title, description, type: "website" },
    alternates: { canonical: canonicalPair(a, b, sport, sp.t) },
  };
}

export default async function ComparePage({ params, searchParams }: { params: Promise<{ a: string; b: string }>; searchParams: Promise<{ sport?: string; t?: string }> }) {
  const { a, b } = await params;
  const sp = await searchParams;
  const sport = normSport(sp.sport);
  if (sport === "SOCCER") return renderSoccer(a, b);
  if (isRadarSport(sport)) return renderRadarSport(a, b, sport);
  if (isBaseball(sport)) return renderBaseball(a, b, sport, normType(sp.t));
  notFound();
}
