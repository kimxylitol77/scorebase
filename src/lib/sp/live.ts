// sportspredictions.live 라이브 스코어 — Match 테이블(점수·상태) + TheSports 캐시(축구 진행분)만 읽는다. 외부 API 호출 없음.
// 창 = 지금 기준 -30h ~ +30h. live / upcoming / results 세 묶음으로 나눠 리그·허브 페이지가 같은 함수를 쓴다.
import { prisma } from "@/lib/db";
import { toEnglishTeamName } from "@/lib/i18n/en";
import { tsFootballLiveState } from "@/lib/sports/ts-football-live-label";
import { SP_LEAGUE_CODES, leagueByCode } from "./leagues";
import type { Side } from "./data";

export interface LiveRow {
  id: number;
  league: string;
  status: "LIVE" | "SCHEDULED" | "FINISHED" | "POSTPONED";
  startTime: string;
  home: { id: number; name: string; logo: string | null };
  away: { id: number; name: string; logo: string | null };
  homeScore: number | null;
  awayScore: number | null;
  /** 진행 라벨 — "1H 38'", "HT", "2H 71'", "ET 98'", "Pens", "Inn 6". 없으면 null */
  liveLabel: string | null;
  pick: Side | null;
  pickProb: number | null;
  correct: boolean | null;
}

export interface LiveBoard {
  live: LiveRow[];
  upcoming: LiveRow[];
  results: LiveRow[];
  generatedAt: string;
}

const H = 3600_000;

/** TheSports status_id → 영어 진행 라벨. ts-football-live-label.ts(한국어)와 같은 코드표. */
export function enFootballLiveLabel(statusId: number, phaseStartTs: number, nowMs: number): string | null {
  if (statusId === 3) return "HT";
  if (statusId === 7) return "Pens";
  if (!(phaseStartTs > 0)) return null;
  const elapsed = Math.max(0, Math.floor((nowMs / 1000 - phaseStartTs) / 60)) + 1;
  switch (statusId) {
    case 2: return `1H ${Math.min(elapsed, 45)}${elapsed > 45 ? "+" : ""}'`;
    case 4: { const t = 45 + elapsed; return `2H ${Math.min(t, 90)}${t > 90 ? "+" : ""}'`; }
    case 5: case 6: { const t = 90 + elapsed; return `ET ${Math.min(t, 120)}${t > 120 ? "+" : ""}'`; }
    default: return null;
  }
}

function baseballInning(detailLive: unknown): string | null {
  const dl = detailLive as { score?: unknown[] } | null;
  if (!Array.isArray(dl?.score) || dl!.score.length < 4) return null;
  const s = dl!.score[3] as Record<string, unknown> | undefined;
  let inning = 0;
  for (let i = 1; i <= 12; i++) if (Array.isArray(s?.["p" + i])) inning = i;
  return inning ? `Inn ${inning}` : null;
}

export async function fetchLiveBoard(opts: { league?: string } = {}): Promise<LiveBoard> {
  const now = Date.now();
  const rows = await prisma.match.findMany({
    where: {
      league: opts.league ? opts.league : { in: SP_LEAGUE_CODES },
      status: { in: ["LIVE", "SCHEDULED", "FINISHED", "POSTPONED"] },
      startTime: { gte: new Date(now - 30 * H), lte: new Date(now + 30 * H) },
    },
    select: {
      id: true, league: true, status: true, startTime: true, homeScore: true, awayScore: true,
      predWinner: true, predHome: true, predDraw: true, predAway: true, predCorrect: true,
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
    },
    orderBy: { startTime: "asc" },
    take: 400,
  });
  const liveIds = rows.filter((r) => r.status === "LIVE").map((r) => r.id);
  const labels = new Map<number, string>();
  if (liveIds.length) {
    const caches = await prisma.theSportsMatchCache.findMany({ where: { matchId: { in: liveIds } }, select: { matchId: true, detailLive: true } });
    for (const c of caches) {
      const lg = leagueByCode(rows.find((r) => r.id === c.matchId)?.league ?? "");
      let label: string | null = null;
      if (lg?.sport === "football") { const st = tsFootballLiveState(c.detailLive); if (st) label = enFootballLiveLabel(st.sid, st.pts, now); }
      else if (lg?.sport === "baseball") label = baseballInning(c.detailLive);
      if (label) labels.set(c.matchId, label);
    }
  }
  const toRow = (r: (typeof rows)[number]): LiveRow => {
    const probs = r.predHome != null && r.predAway != null ? { HOME: r.predHome, DRAW: r.predDraw ?? 0, AWAY: r.predAway } : null;
    const pick = (r.predWinner as Side | null) ?? null;
    return {
      id: r.id, league: r.league, status: r.status as LiveRow["status"], startTime: r.startTime.toISOString(),
      home: { id: r.homeTeam.id, name: toEnglishTeamName(r.homeTeam.name), logo: r.homeTeam.logoUrl },
      away: { id: r.awayTeam.id, name: toEnglishTeamName(r.awayTeam.name), logo: r.awayTeam.logoUrl },
      homeScore: r.homeScore, awayScore: r.awayScore, liveLabel: labels.get(r.id) ?? null,
      pick, pickProb: probs && pick ? probs[pick] : null, correct: r.predCorrect,
    };
  };
  const all = rows.map(toRow);
  return {
    live: all.filter((m) => m.status === "LIVE"),
    // 시작 시각이 3시간 넘게 지난 SCHEDULED 는 소스 간 중복·갱신 누락 행이라 뺀다 — 같은 경기가 Live 와 Upcoming 에 동시에 보이던 것(10-01 실측).
    upcoming: all.filter((m) => (m.status === "SCHEDULED" && new Date(m.startTime).getTime() >= now - 3 * H) || m.status === "POSTPONED"),
    results: all.filter((m) => m.status === "FINISHED").sort((a, b) => b.startTime.localeCompare(a.startTime)),
    generatedAt: new Date(now).toISOString(),
  };
}
