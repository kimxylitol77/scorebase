// /api/live/mlb/[gameId] — ESPN MLB summary 정규화 endpoint.
// 이닝별 linescore + 베이스 상황 + B/S/O + 투수/타자 + 마지막 플레이.
// Edge runtime · 캐시 10초 + SWR 30 · ETag 지원.

import { NextResponse, type NextRequest } from "next/server";
import { fetchLiveOdds, type LiveOddsSnapshot } from "@/lib/odds/live-odds";
import { computeBaseballWpa, type WpaPoint } from "@/lib/live/baseball-wpa";

// nodejs runtime — fetchLiveOdds (fetch 기반) 통합용
export const runtime = "nodejs";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb";
const TIMEOUT = 8000;

export interface MlbLive {
  status: string; // "PRE" | "LIVE" | "FINAL" | "DELAY"
  statusLabel: string; // "Top 5th" 등 원문
  /** 이닝별 점수 (1~9, 연장 포함). away 가 항상 먼저. */
  linescore: { home: (number | null)[]; away: (number | null)[] } | null;
  homeTeam: { id: string; name: string; abbreviation: string; score: number; logo?: string };
  awayTeam: { id: string; name: string; abbreviation: string; score: number; logo?: string };
  liveOdds?: LiveOddsSnapshot | null;
  wpaSeries?: WpaPoint[] | null;
  situation: {
    balls: number | null;
    strikes: number | null;
    outs: number | null;
    onFirst: boolean;
    onSecond: boolean;
    onThird: boolean;
    batterName: string | null;
    pitcherName: string | null;
    lastPlay: string | null;
  } | null;
  /** 선발 라인업 1~9번 타순 (홈/원정) */
  lineups?: {
    home: MlbBatter[];
    away: MlbBatter[];
  } | null;
  /** 양 팀 통계 비교 (안타/홈런/실책/병살 등) */
  teamStats?: {
    home: MlbTeamStats;
    away: MlbTeamStats;
  } | null;
}

export interface MlbBatter {
  /** 1~9 타순 */
  order: number;
  name: string;
  position: string; // "C", "1B", "2B", "SS" 등
  /** "1-3" (3타수 1안타) */
  hitsAtBats: string;
  runs: number;
  hits: number;
  rbis: number;
  homeRuns: number;
  walks: number;
  strikeouts: number;
  avg: string;
}

export interface MlbTeamStats {
  /** 안타 */
  hits: number;
  /** 홈런 */
  homeRuns: number;
  /** 실책 */
  errors: number;
  /** 병살 */
  doublePlays: number;
  /** 삼진 (타격) */
  strikeouts: number;
  /** 볼넷 */
  walks: number;
  /** 잔루 */
  leftOnBase: number;
  /** 사구 */
  hitByPitch: number;
  /** 도루실패 */
  caughtStealing: number;
  /** 어시 */
  assists: number;
}

// ESPN summary는 매우 큰 응답이지만 우리가 필요한 필드는 한정 — 좁은 타입 선언.
interface EspnSummary {
  header?: {
    competitions?: Array<{
      status?: {
        type?: { name?: string; shortDetail?: string; state?: string };
      };
      situation?: {
        balls?: number;
        strikes?: number;
        outs?: number;
        onFirst?: boolean;
        onSecond?: boolean;
        onThird?: boolean;
        batter?: { athlete?: { displayName?: string } };
        pitcher?: { athlete?: { displayName?: string } };
        lastPlay?: { text?: string };
      };
      competitors?: Array<{
        id: string;
        homeAway: "home" | "away";
        score: string | number;
        team?: {
          id?: string;
          displayName?: string;
          abbreviation?: string;
          logo?: string;
        };
        // ESPN 은 displayValue (string) 로 제공. value 필드는 보통 없음.
        linescores?: Array<{ value?: number; displayValue?: string }>;
      }>;
    }>;
  };
  boxscore?: {
    /** 팀별 통계 그룹 (batting/pitching/fielding) */
    teams?: Array<{
      homeAway: "home" | "away";
      team?: { abbreviation?: string };
      statistics?: Array<{
        name?: string; // "batting", "pitching", "fielding"
        stats?: Array<{ name?: string; displayValue?: string }>;
      }>;
      details?: Array<{
        name?: string; // "battingDetails", "pitchingDetails", "baserunningDetails"
        stats?: Array<{ name?: string; displayValue?: string }>;
      }>;
    }>;
    /** 팀별 선수 통계 (batting/pitching 그룹) */
    players?: Array<{
      team?: { abbreviation?: string; id?: string };
      homeAway?: "home" | "away";
      statistics?: Array<{
        type?: string; // "batting", "pitching"
        keys?: string[];
        athletes?: Array<{
          athlete?: {
            id?: string;
            shortName?: string;
            displayName?: string;
            position?: { abbreviation?: string };
          };
          stats?: string[]; // keys 와 동일 순서
          starter?: boolean;
          batterRotation?: number; // 타순 (1~9)
        }>;
      }>;
    }>;
  };
}

function normalize(data: EspnSummary): MlbLive | null {
  const comp = data.header?.competitions?.[0];
  if (!comp || !comp.competitors) return null;
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const stateName = comp.status?.type?.name ?? "";
  // "STATUS_IN_PROGRESS" → "LIVE", "STATUS_FINAL" → "FINAL", "STATUS_SCHEDULED" → "PRE"
  let status: MlbLive["status"] = "PRE";
  if (/IN_PROGRESS/.test(stateName)) status = "LIVE";
  else if (/FINAL/.test(stateName)) status = "FINAL";
  else if (/DELAY|POSTPONED|RAIN/.test(stateName)) status = "DELAY";

  // ESPN linescore: { displayValue: "3", hits, errors } — value 필드는 없음.
  const toInning = (l: { value?: number; displayValue?: string }) => {
    if (typeof l.value === "number") return l.value;
    if (l.displayValue !== undefined) {
      const n = Number(l.displayValue);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const lsHome = home.linescores?.map(toInning) ?? null;
  const lsAway = away.linescores?.map(toInning) ?? null;

  const s = comp.situation;
  const situation: MlbLive["situation"] = s
    ? {
        balls: s.balls ?? null,
        strikes: s.strikes ?? null,
        outs: s.outs ?? null,
        onFirst: !!s.onFirst,
        onSecond: !!s.onSecond,
        onThird: !!s.onThird,
        batterName: s.batter?.athlete?.displayName ?? null,
        pitcherName: s.pitcher?.athlete?.displayName ?? null,
        lastPlay: s.lastPlay?.text ?? null,
      }
    : null;

  // boxscore → lineups + teamStats 추출
  const lineups = extractLineups(data.boxscore, home.team?.abbreviation, away.team?.abbreviation);
  const teamStats = extractTeamStats(data.boxscore, home.team?.abbreviation, away.team?.abbreviation);

  return {
    status,
    statusLabel: comp.status?.type?.shortDetail ?? "",
    linescore:
      lsHome && lsAway
        ? {
            home: lsHome,
            away: lsAway,
          }
        : null,
    homeTeam: {
      id: home.team?.id ?? "",
      name: home.team?.displayName ?? "",
      abbreviation: home.team?.abbreviation ?? "",
      score: Number(home.score) || 0,
      logo: home.team?.logo,
    },
    awayTeam: {
      id: away.team?.id ?? "",
      name: away.team?.displayName ?? "",
      abbreviation: away.team?.abbreviation ?? "",
      score: Number(away.score) || 0,
      logo: away.team?.logo,
    },
    situation,
    lineups,
    teamStats,
  };
}

/** boxscore.players → 선발 라인업 (1~9번 타순) 양 팀 */
function extractLineups(
  boxscore: EspnSummary["boxscore"],
  homeAbbr?: string,
  awayAbbr?: string,
): MlbLive["lineups"] {
  if (!boxscore?.players || !homeAbbr || !awayAbbr) return null;
  const extract = (abbr: string): MlbBatter[] => {
    const teamSection = boxscore.players?.find((p) => p.team?.abbreviation === abbr);
    if (!teamSection) return [];
    const batting = teamSection.statistics?.find((g) => g.type === "batting");
    if (!batting?.athletes || !batting.keys) return [];
    const keys = batting.keys;
    // keys: ['hits-atBats', 'atBats', 'runs', 'hits', 'RBIs', 'homeRuns', 'walks', 'strikeouts', 'pitches', 'avg']
    const idx = (k: string) => keys.indexOf(k);
    const iHA = idx("hits-atBats");
    const iR = idx("runs");
    const iH = idx("hits");
    const iRBI = idx("RBIs");
    const iHR = idx("homeRuns");
    const iBB = idx("walks");
    const iK = idx("strikeouts");
    const iAvg = idx("avg");
    const starters = batting.athletes
      .filter((a) => a.starter !== false) // starter true 또는 undefined (기본)
      .slice(0, 9);
    return starters.map((a, i) => ({
      order: a.batterRotation ?? i + 1,
      name: a.athlete?.shortName ?? a.athlete?.displayName ?? "?",
      position: a.athlete?.position?.abbreviation ?? "",
      hitsAtBats: a.stats?.[iHA] ?? "0-0",
      runs: Number(a.stats?.[iR]) || 0,
      hits: Number(a.stats?.[iH]) || 0,
      rbis: Number(a.stats?.[iRBI]) || 0,
      homeRuns: Number(a.stats?.[iHR]) || 0,
      walks: Number(a.stats?.[iBB]) || 0,
      strikeouts: Number(a.stats?.[iK]) || 0,
      avg: a.stats?.[iAvg] ?? ".000",
    }));
  };
  return { home: extract(homeAbbr), away: extract(awayAbbr) };
}

/** boxscore.teams → 양 팀 통계 (안타/홈런/실책/병살 등) */
function extractTeamStats(
  boxscore: EspnSummary["boxscore"],
  homeAbbr?: string,
  awayAbbr?: string,
): MlbLive["teamStats"] {
  if (!boxscore?.teams || !homeAbbr || !awayAbbr) return null;
  const extract = (side: "home" | "away"): MlbTeamStats => {
    const team = boxscore.teams?.find((t) => t.homeAway === side);
    if (!team) {
      return {
        hits: 0, homeRuns: 0, errors: 0, doublePlays: 0,
        strikeouts: 0, walks: 0, leftOnBase: 0, hitByPitch: 0,
        caughtStealing: 0, assists: 0,
      };
    }
    const findStat = (groupName: string, statName: string): number => {
      const g = team.statistics?.find((s) => s.name === groupName);
      const v = g?.stats?.find((s) => s.name === statName)?.displayValue;
      return Number(v) || 0;
    };
    const findDetail = (detailName: string, statName: string): number => {
      const d = team.details?.find((x) => x.name === detailName);
      const v = d?.stats?.find((s) => s.name === statName)?.displayValue;
      // displayValue 가 "3" 같은 숫자 or "Baldwin (1, 2nd...)" 같은 텍스트일 수 있음
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      hits: findStat("batting", "hits"),
      homeRuns: findStat("batting", "homeRuns") || (findStat("pitching", "homeRuns")), // batting 우선
      errors: findStat("fielding", "errors"),
      doublePlays: findStat("fielding", "doublePlays"),
      strikeouts: findStat("batting", "strikeouts"),
      walks: findStat("batting", "walks") || findStat("batting", "baseOnBalls"),
      leftOnBase: findDetail("battingDetails", "teamLOB"),
      hitByPitch: findStat("batting", "hitByPitch"),
      caughtStealing: 0,
      assists: findStat("fielding", "assists"),
    };
  };
  return { home: extract("home"), away: extract("away") };
}

async function hashLive(live: MlbLive): Promise<string> {
  const o = live.liveOdds;
  const oddsSig = o
    ? `${o.h2h?.home ?? ""}/${o.h2h?.away ?? ""}/${o.totals?.line ?? ""}/${o.totals?.over ?? ""}/${o.spread?.line ?? ""}`
    : "";
  const sig = [
    live.status,
    live.statusLabel,
    live.homeTeam.score,
    live.awayTeam.score,
    live.situation?.balls,
    live.situation?.strikes,
    live.situation?.outs,
    live.situation?.onFirst,
    live.situation?.onSecond,
    live.situation?.onThird,
    live.situation?.batterName,
    live.situation?.pitcherName,
    live.situation?.lastPlay,
    oddsSig,
    live.wpaSeries?.[live.wpaSeries.length - 1]?.homeWP?.toFixed(3),
  ].join("|");
  const buf = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(sig),
  );
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await ctx.params;
  if (!/^\d+$/.test(gameId)) {
    return NextResponse.json(
      { error: "invalid game id" },
      { status: 400 },
    );
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${ESPN_BASE}/summary?event=${gameId}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as EspnSummary;
    const live = normalize(data);
    if (!live) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    // 라이브 odds — MLB 활성 active=true
    live.liveOdds = await fetchLiveOdds("MLB", live.awayTeam.name, live.homeTeam.name);
    // WPA 곡선 — MLB 평균 이닝 득점 ~0.49
    if (live.linescore) {
      live.wpaSeries = computeBaseballWpa(live.linescore.away, live.linescore.home, {
        lambdaPerInning: 0.49,
      });
    }
    const etag = `W/"${await hashLive(live)}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      });
    }
    return NextResponse.json(
      { live, fetchedAt: new Date().toISOString() },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 200 },
    );
  } finally {
    clearTimeout(t);
  }
}
