// /api/live/mlb/[gameId] — ESPN MLB summary 정규화 endpoint.
// 이닝별 linescore + 베이스 상황 + B/S/O + 투수/타자 + 마지막 플레이.
// Edge runtime · 캐시 10초 + SWR 30 · ETag 지원.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { fetchLiveOdds, type LiveOddsSnapshot } from "@/lib/odds/live-odds";
import { saveOddsSnapshot } from "@/lib/odds/snapshot-store";
import { computeBaseballWpa, type WpaPoint } from "@/lib/live/baseball-wpa";
import { toKoreanPlayerName } from "@/lib/player-names";

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
  /** 최근 pitch/at-bat plays — 마지막 50개. timeline UI 용 */
  plays?: MlbPlay[];
  /** 양 팀 선발 투수 (boxscore pitching.athletes 중 starter=true 첫 entry) */
  startingPitchers?: {
    home: string | null;
    away: string | null;
  };
}

export interface MlbPlay {
  id: string;
  /** "Ball" | "Foul Ball" | "Strike Looking" | "Single" | "Play Result" | "Start Inning" 등 */
  typeText: string;
  /** ESPN 의 type.type slug — "ball" | "foul-ball" | "play-result" 등 */
  typeSlug: string;
  /** 영문 원문 ("Pitch 1 : Strike 1 Foul" 또는 "Clement doubled to left.") */
  text: string;
  /** 우리가 변환한 한국어 (가능한 경우만, 없으면 null) */
  textKo: string | null;
  /** "1st Inning" → "1회 초/말" */
  periodLabel: string;
  awayScore: number;
  homeScore: number;
  scoringPlay: boolean;
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

interface EspnPlay {
  id?: string;
  type?: { id?: string; text?: string; type?: string };
  text?: string;
  awayScore?: number;
  homeScore?: number;
  period?: { type?: string; number?: number; displayValue?: string };
  scoringPlay?: boolean;
}

// ESPN summary는 매우 큰 응답이지만 우리가 필요한 필드는 한정 — 좁은 타입 선언.
interface EspnSummary {
  plays?: EspnPlay[];
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
        batterName: toKoreanPlayerName(s.batter?.athlete?.displayName) || null,
        pitcherName: toKoreanPlayerName(s.pitcher?.athlete?.displayName) || null,
        lastPlay: s.lastPlay?.text ?? null,
      }
    : null;

  // boxscore → lineups + teamStats 추출
  const lineups = extractLineups(data.boxscore, home.team?.abbreviation, away.team?.abbreviation);
  const teamStats = extractTeamStats(data.boxscore, home.team?.abbreviation, away.team?.abbreviation);
  const plays = extractPlays(data.plays);
  const startingPitchers = extractStartingPitchers(
    data,
    home.team?.abbreviation,
    away.team?.abbreviation,
  );

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
    plays,
    startingPitchers,
  };
}

/** ESPN summary → 양 팀 선발 투수.
 *  1순위: boxscore.players[].statistics[type=pitching].athletes[].starter=true 첫 entry
 *  2순위: header.competitions[0].competitors[].probables[].athlete.displayName (예정/조기 매치)
 */
function extractStartingPitchers(
  data: EspnSummary,
  homeAbbr?: string,
  awayAbbr?: string,
): { home: string | null; away: string | null } {
  const out = { home: null as string | null, away: null as string | null };
  // 1) boxscore
  for (const team of data.boxscore?.players ?? []) {
    const abbr = team.team?.abbreviation;
    const side: "home" | "away" | null =
      abbr && abbr === homeAbbr ? "home" : abbr && abbr === awayAbbr ? "away" : null;
    if (!side) continue;
    const pitching = team.statistics?.find((g) => g.type === "pitching");
    if (!pitching) continue;
    const starter = pitching.athletes?.find((a) => a.starter !== false);
    const name = starter?.athlete?.displayName?.trim();
    if (name) out[side] = toKoreanPlayerName(name);
  }
  // 2) probables fallback
  if (!out.home || !out.away) {
    type Probable = { athlete?: { displayName?: string } };
    type WithProbables = { homeAway?: "home" | "away"; probables?: Probable[] };
    const competitors = (data.header?.competitions?.[0]?.competitors ?? []) as WithProbables[];
    for (const c of competitors) {
      const side = c.homeAway;
      if (side !== "home" && side !== "away") continue;
      if (out[side]) continue;
      const name = c.probables?.[0]?.athlete?.displayName?.trim();
      if (name) out[side] = toKoreanPlayerName(name);
    }
  }
  return out;
}

/** ESPN plays → 한국어 라벨링 + 최근 N개. at-bat 결과·이닝 전환·득점 plays 중심.
 *  Ball/Strike/Foul 같은 pitch-by-pitch 도 포함 (전체 timeline). */
function extractPlays(raw: EspnPlay[] | undefined): MlbPlay[] {
  if (!raw || raw.length === 0) return [];
  // 빈 text 제외 (End Batter/Pitcher 등). 마지막 60개만 응답 — 응답 크기 절약.
  const filtered = raw.filter((p) => (p.text ?? "").trim().length > 0);
  return filtered.slice(-60).map((p) => ({
    id: String(p.id ?? ""),
    typeText: p.type?.text ?? "",
    typeSlug: p.type?.type ?? "",
    text: p.text ?? "",
    textKo: koreanizePlay(p),
    periodLabel: koreanPeriod(p.period),
    awayScore: p.awayScore ?? 0,
    homeScore: p.homeScore ?? 0,
    scoringPlay: !!p.scoringPlay,
  }));
}

/** "1st Inning Top" → "1회 초", "8th Inning" + period.type "Bottom" → "8회 말" */
function koreanPeriod(p: EspnPlay["period"]): string {
  if (!p) return "";
  const n = p.number;
  if (typeof n !== "number") return p.displayValue ?? "";
  const half = p.type === "Top" ? "초" : p.type === "Bottom" ? "말" : "";
  return half ? `${n}회 ${half}` : `${n}회`;
}

/** ESPN play 한국어 변환 — 핵심 동사/카운트 매핑. 매칭 실패 시 null. */
function koreanizePlay(p: EspnPlay): string | null {
  const text = (p.text ?? "").trim();
  if (!text) return null;
  const slug = p.type?.type ?? "";

  // pitch-by-pitch — "Pitch N : Strike 1 Foul" / "Ball 1" 형태
  const pitchMatch = text.match(/^Pitch\s+(\d+)\s*:\s*(.+)$/i);
  if (pitchMatch) {
    const n = pitchMatch[1];
    const rest = pitchMatch[2];
    let body = rest;
    body = body.replace(/Strike\s+(\d+)\s+Foul/i, "스트라이크 $1 파울");
    body = body.replace(/Strike\s+(\d+)\s+Looking/i, "스트라이크 $1 (선구)");
    body = body.replace(/Strike\s+(\d+)\s+Swinging/i, "스트라이크 $1 (헛스윙)");
    body = body.replace(/Ball\s+In\s+Play/i, "타격");
    body = body.replace(/Ball\s+(\d+)/i, "볼 $1");
    return `${n}구 · ${body}`;
  }

  // 이닝 전환
  if (slug === "start-inning") return text.replace(/Top of the (\d+).*/i, "$1회 초 시작").replace(/Bottom of the (\d+).*/i, "$1회 말 시작");
  if (slug === "end-inning") return null;

  // 새 타석 — "Pitcher X pitches to Y" → "투수 X → 타자 Y"
  const matchup = text.match(/^(.+?)\s+pitches to\s+(.+)$/i);
  if (matchup) return `투수 ${matchup[1]} → 타자 ${matchup[2]}`;

  // at-bat 결과 동사 매핑
  let r = text;
  r = r.replace(/struck out swinging/gi, "헛스윙 삼진");
  r = r.replace(/struck out looking/gi, "스탠딩 삼진");
  r = r.replace(/struck out/gi, "삼진");
  r = r.replace(/homered/gi, "홈런");
  r = r.replace(/tripled/gi, "3루타");
  r = r.replace(/doubled/gi, "2루타");
  r = r.replace(/singled/gi, "안타");
  r = r.replace(/walked/gi, "볼넷");
  r = r.replace(/hit by pitch/gi, "사구");
  r = r.replace(/grounded out/gi, "땅볼 아웃");
  r = r.replace(/flied out/gi, "플라이 아웃");
  r = r.replace(/lined out/gi, "라인드라이브 아웃");
  r = r.replace(/popped out/gi, "팝업 아웃");
  r = r.replace(/\sto left\b/gi, " (좌)");
  r = r.replace(/\sto right\b/gi, " (우)");
  r = r.replace(/\sto center\b/gi, " (중)");
  r = r.replace(/\sto shortstop\b/gi, " (유격수)");
  r = r.replace(/\sto first\b/gi, " (1루수)");
  r = r.replace(/\sto second\b/gi, " (2루수)");
  r = r.replace(/\sto third\b/gi, " (3루수)");
  r = r.replace(/\sto pitcher\b/gi, " (투수)");
  r = r.replace(/\sto catcher\b/gi, " (포수)");
  r = r.replace(/\sscored\b/gi, " 득점");
  r = r.replace(/\sadvanced to\s+/gi, " 진루 → ");
  if (r !== text) return r;
  return null;
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
      name: toKoreanPlayerName(a.athlete?.displayName) || a.athlete?.shortName || "?",
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
    live.plays?.length,
    live.plays?.[live.plays.length - 1]?.id,
    live.startingPitchers?.home,
    live.startingPitchers?.away,
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
    if (live.liveOdds) void saveOddsSnapshot(gameId, "MLB", live.liveOdds);
    // WPA 곡선 — MLB 평균 이닝 득점 ~0.49
    if (live.linescore) {
      live.wpaSeries = computeBaseballWpa(live.linescore.away, live.linescore.home, {
        lambdaPerInning: 0.49,
      });
    }
    // TheSports MQTT push cache — ESPN 5-15s 갱신 vs MQTT 1-2s push.
    // score: monotonic max(ESPN, MQTT) — 점수는 증가만 → 더 큰 값 사용 안전.
    // extra: base/out/balls/strikes — ESPN situation 보강 (없으면 default 채움).
    if (live.status === "LIVE") {
      try {
        const ourMatch = await prisma.match.findFirst({
          where: { externalId: gameId },
          select: { id: true },
        });
        if (ourMatch) {
          const cache = await prisma.theSportsMatchCache.findUnique({
            where: { matchId: ourMatch.id },
            select: { detailLive: true },
          });
          const dl = cache?.detailLive as {
            extra?: { base?: string; out?: number; good?: number; bad?: number };
            score?: unknown[];
          } | null;
          // score: ft = [home, away] — MQTT 가 ESPN 보다 fresh 시 max 갱신
          // (2026-05-24 네이버 KBO 5경기 검증으로 [home, away] 확정)
          const scoreObj = Array.isArray(dl?.score) && dl.score.length >= 4
            ? (dl.score[3] as { ft?: string[] } | undefined)
            : undefined;
          if (scoreObj?.ft && scoreObj.ft.length === 2) {
            const tsHome = parseInt(scoreObj.ft[0] ?? "0", 10);
            const tsAway = parseInt(scoreObj.ft[1] ?? "0", 10);
            if (Number.isFinite(tsAway) && tsAway > live.awayTeam.score) {
              live.awayTeam.score = tsAway;
            }
            if (Number.isFinite(tsHome) && tsHome > live.homeTeam.score) {
              live.homeTeam.score = tsHome;
            }
          }
          // extra: base/out/balls/strikes 보강
          if (dl?.extra) {
            const situ = live.situation ?? {
              balls: null,
              strikes: null,
              outs: null,
              onFirst: false,
              onSecond: false,
              onThird: false,
              batterName: null,
              pitcherName: null,
              lastPlay: null,
            };
            if (typeof dl.extra.base === "string" && dl.extra.base.length === 3) {
              situ.onFirst = dl.extra.base[0] === "1";
              situ.onSecond = dl.extra.base[1] === "1";
              situ.onThird = dl.extra.base[2] === "1";
            }
            if (typeof dl.extra.out === "number") situ.outs = dl.extra.out;
            if (typeof dl.extra.good === "number") situ.strikes = dl.extra.good;
            if (typeof dl.extra.bad === "number") situ.balls = dl.extra.bad;
            live.situation = situ;
          }
        }
      } catch {
        // cache 조회 실패는 ignore — ESPN 데이터만으로 응답
      }
    }
    // 라이브 점수 → DB upsert (cron 갭 회피, /scores 목록도 fresh)
    if (live.status === "LIVE" || live.status === "FINAL") {
      prisma.match
        .updateMany({
          where: { externalId: gameId },
          data: {
            homeScore: live.homeTeam.score,
            awayScore: live.awayTeam.score,
            status: live.status === "FINAL" ? "FINISHED" : "LIVE",
          },
        })
        .catch(() => {});
    }
    const etag = `W/"${await hashLive(live)}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=2, stale-while-revalidate=10",
          "Vercel-CDN-Cache-Control": "max-age=2",
        },
      });
    }
    return NextResponse.json(
      { live, fetchedAt: new Date().toISOString() },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=2, stale-while-revalidate=10",
          "Vercel-CDN-Cache-Control": "max-age=2",
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
