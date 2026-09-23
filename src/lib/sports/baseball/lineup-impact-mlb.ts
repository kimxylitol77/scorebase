// MLB 박스스코어 → 라인업 임팩트 입력 어댑터. 양 팀 타순 9명이 시즌 성분을 갖출 때만 계산(아니면 null → 탭 비활성).
import type { MlbFullBoxscore, MlbBoxBatter } from "@/lib/sports/mlb-stats-api";
import { computeLineupImpact, computeWowy, LEAGUE_FALLBACK, type LeagueContext, type LineupImpact, type WowyGame, type WowySplit } from "./lineup-impact";

export interface MlbLineupImpactResult {
  home: LineupImpact;
  away: LineupImpact;
  league: LeagueContext & { fallback: boolean };
  /** pid → 출전/결장 경기 팀 득점 (팀 스케줄이 있을 때만) */
  wowy?: Record<number, WowySplit>;
}

function starters(side: { batters: MlbBoxBatter[] }): MlbBoxBatter[] {
  return side.batters
    .filter((b) => b.isStarter && b.order != null && b.order >= 1 && b.order <= 9 && b.seasonComp)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function buildMlbLineupImpact(
  box: MlbFullBoxscore,
  lg: LeagueContext | null,
  games?: { home: WowyGame[]; away: WowyGame[] },
): MlbLineupImpactResult | null {
  const h = starters(box.home);
  const a = starters(box.away);
  if (h.length !== 9 || a.length !== 9) return null;
  const wowy = games
    ? { ...computeWowy(h.map((b) => b.pid), games.home), ...computeWowy(a.map((b) => b.pid), games.away) }
    : undefined;
  const league = lg ? { ...lg, fallback: false } : { ...LEAGUE_FALLBACK, fallback: true };
  const toLineup = (list: MlbBoxBatter[]) => list.map((b) => ({ pid: b.pid, name: b.name, slot: b.order as number, comp: b.seasonComp! }));
  const toBench = (side: { bench?: MlbBoxBatter[] }) => (side.bench ?? []).map((b) => b.seasonComp).filter((c): c is NonNullable<typeof c> => !!c);
  return {
    home: computeLineupImpact(toLineup(h), toBench(box.home), league),
    away: computeLineupImpact(toLineup(a), toBench(box.away), league),
    league,
    wowy,
  };
}
