// 분석 게시판 폼(작성·수정)용 예정 경기 목록 — 종목별 MatchOption 배열.
// 작성 페이지에 있던 로더를 수정 페이지에서도 쓰려고 추출했다.
import { getUpcomingMatchesForSport } from "@/lib/analysis/matches";
import { kstDateKey, kstDateLabel, kstTimeLabel } from "@/lib/analysis/format";

export interface MatchOption {
  id: number;
  league: string;
  leagueLabel: string;
  home: string;
  away: string;
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
  hcLine: number | null;
  ouLine: number | null;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  oddsHcHome: number | null;
  oddsHcAway: number | null;
  oddsOver: number | null;
  oddsUnder: number | null;
}

const SPORTS = ["soccer", "baseball", "basketball", "hockey", "esports", "volleyball", "mma"] as const;

/** 종목별 예정 경기 — 배구는 수집 합류 전이라 빈 목록(작성 페이지와 동일 정책). */
export async function loadMatchOptionsBySport(): Promise<Record<string, MatchOption[]>> {
  const lists = await Promise.all(
    SPORTS.map((s) =>
      s === "volleyball" ? Promise.resolve([]) : getUpcomingMatchesForSport(s, 120),
    ),
  );
  const out: Record<string, MatchOption[]> = {};
  SPORTS.forEach((s, i) => {
    out[s] = lists[i].map((m) => ({
      id: m.id,
      league: m.league,
      leagueLabel: m.leagueLabel,
      home: m.home,
      away: m.away,
      dateKey: kstDateKey(m.startTime),
      dateLabel: kstDateLabel(m.startTime),
      timeLabel: kstTimeLabel(m.startTime),
      hcLine: m.hcLine,
      ouLine: m.ouLine,
      oddsHome: m.oddsHome,
      oddsDraw: m.oddsDraw,
      oddsAway: m.oddsAway,
      oddsHcHome: m.oddsHcHome,
      oddsHcAway: m.oddsHcAway,
      oddsOver: m.oddsOver,
      oddsUnder: m.oddsUnder,
    }));
  });
  return out;
}
