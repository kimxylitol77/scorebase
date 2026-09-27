// 2026 아시안게임 허브 데이터 — 우리가 수집하는 7개 대회 경기를 한 번에 읽어 한국 성적·대회별 요약으로 묶는다.
import { prisma } from "@/lib/db";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";

export const AG_EVENTS = [
  { league: "ASIAN_GAMES_FB", sport: "축구", scoreUnit: "" },
  { league: "ASIAN_GAMES_FB_W", sport: "축구", scoreUnit: "" },
  { league: "ASIAN_GAMES_BK", sport: "농구", scoreUnit: "" },
  { league: "ASIAN_GAMES_BK_W", sport: "농구", scoreUnit: "" },
  { league: "VB_ASIAN_GAMES", sport: "배구", scoreUnit: "세트" },
  { league: "VB_ASIAN_GAMES_W", sport: "배구", scoreUnit: "세트" },
  { league: "ASIAN_GAMES_BB", sport: "야구", scoreUnit: "" },
] as const;

export type AgLeague = (typeof AG_EVENTS)[number]["league"];

export interface AgTeam { name: string; nameKo: string; logoUrl: string | null; isKorea: boolean }
export interface AgMatch {
  id: number;
  league: AgLeague;
  externalId: string;
  startTime: Date;
  status: string;
  home: AgTeam;
  away: AgTeam;
  homeScore: number | null;
  awayScore: number | null;
  isKorea: boolean;
}
export interface AgEventSummary {
  league: AgLeague;
  label: string;
  sport: string;
  scoreUnit: string;
  total: number;
  finished: number;
  live: number;
  first: Date | null;
  last: Date | null;
  korea: { w: number; d: number; l: number; played: number; next: AgMatch | null; recent: AgMatch[] } | null;
}

// 대회별 Team row 가 따로라(U23·Women 포함) id 로는 못 묶는다 — 팀명 접두로 판정.
const isKoreaName = (n: string) => /^South Korea\b/.test(n);

function teamOf(t: { name: string; nameKo: string | null; logoUrl: string | null }, league: string): AgTeam {
  const dict = toKoreanTeamName(t.name, league);
  // 여자농구 공식 한국어명은 "대한민국 위민" 형태 — 대회명이 이미 성별을 말하므로 국명만 남긴다.
  const nameKo = (dict && dict !== t.name ? dict : t.nameKo ?? t.name).replace(/\s*(위민|여자)$/, "");
  return { name: t.name, nameKo, logoUrl: t.logoUrl, isKorea: isKoreaName(t.name) };
}

export async function getAgMatches(): Promise<AgMatch[]> {
  const rows = await prisma.match.findMany({
    where: { league: { in: AG_EVENTS.map((e) => e.league) } },
    select: {
      id: true, league: true, externalId: true, startTime: true, status: true, homeScore: true, awayScore: true,
      homeTeam: { select: { name: true, nameKo: true, logoUrl: true } },
      awayTeam: { select: { name: true, nameKo: true, logoUrl: true } },
    },
    orderBy: { startTime: "asc" },
  });
  return rows.map((r) => {
    const home = teamOf(r.homeTeam, r.league);
    const away = teamOf(r.awayTeam, r.league);
    return {
      id: r.id, league: r.league as AgLeague, externalId: r.externalId, startTime: r.startTime, status: r.status,
      home, away, homeScore: r.homeScore, awayScore: r.awayScore, isKorea: home.isKorea || away.isKorea,
    };
  });
}

export function summarizeAg(matches: AgMatch[]): AgEventSummary[] {
  return AG_EVENTS.map((e) => {
    const ms = matches.filter((m) => m.league === e.league);
    const kor = ms.filter((m) => m.isKorea);
    let w = 0, d = 0, l = 0;
    const done = kor.filter((m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null);
    for (const m of done) {
      const us = m.home.isKorea ? m.homeScore! : m.awayScore!;
      const them = m.home.isKorea ? m.awayScore! : m.homeScore!;
      if (us > them) w++; else if (us < them) l++; else d++;
    }
    const next = kor.find((m) => m.status === "LIVE") ?? kor.find((m) => m.status === "SCHEDULED") ?? null;
    return {
      league: e.league,
      label: LEAGUE_DISPLAY[e.league] ?? e.league,
      sport: e.sport,
      scoreUnit: e.scoreUnit,
      total: ms.length,
      finished: ms.filter((m) => m.status === "FINISHED").length,
      live: ms.filter((m) => m.status === "LIVE").length,
      first: ms[0]?.startTime ?? null,
      last: ms.at(-1)?.startTime ?? null,
      korea: kor.length ? { w, d, l, played: done.length, next, recent: done.slice(-3).reverse() } : null,
    };
  });
}
