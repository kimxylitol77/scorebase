// 팀별 최근 N경기 결과 (W/D/L) — 매치 카드·순위표·팀 페이지 dot 표시용.
// 호출 단순화: matches 와 teamId 받아 최신 N경기 결과 시간순 (오래된 → 최근) 반환.

export type FormResult = "W" | "D" | "L";

export interface FormSlim {
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  startTime: Date | string;
}

/**
 * 팀의 최근 N경기 (FINISHED 만) W/D/L 시퀀스.
 * 시간 오래된 순 → 최근 순. UI 에선 최근을 오른쪽에 둠.
 */
export function getRecentForm(
  matches: FormSlim[],
  teamId: number,
  n: number = 5,
): FormResult[] {
  const finished = matches
    .filter(
      (m) =>
        m.status === "FINISHED" &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId) &&
        m.homeScore != null &&
        m.awayScore != null,
    )
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, n);

  return finished
    .map((m): FormResult => {
      const isHome = m.homeTeamId === teamId;
      const my = isHome ? m.homeScore! : m.awayScore!;
      const opp = isHome ? m.awayScore! : m.homeScore!;
      if (my > opp) return "W";
      if (my < opp) return "L";
      return "D";
    })
    .reverse(); // 오래된 → 최근 순으로
}
