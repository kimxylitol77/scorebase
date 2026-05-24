// H2H 카드 — TheSports analysis.history.vs (양 팀 최근 직접 대결).
// 각 매치 array: [stage_id, competition_id, status_id, match_time, neutral, home_team[8], away_team[8], odds, _, [season_id, season]]
//   home_team: [team_id, position, ft_score, ht_score, ...]
// 우리 양 팀의 tsTeamId 알면 매치별 누가 우리 home 인지 식별 가능.

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  homeTsTeamId: string | null;
  awayTsTeamId: string | null;
  /** analysis.history.vs (raw array list) */
  history: unknown[];
}

interface ParsedMatch {
  matchTime: number;
  homeId: string;
  homeScore: number;
  awayId: string;
  awayScore: number;
  season: string;
}

function parseMatch(raw: unknown): ParsedMatch | null {
  if (!Array.isArray(raw) || raw.length < 10) return null;
  const home = raw[5];
  const away = raw[6];
  const season = raw[9];
  if (!Array.isArray(home) || !Array.isArray(away)) return null;
  return {
    matchTime: typeof raw[3] === "number" ? raw[3] : 0,
    homeId: typeof home[0] === "string" ? home[0] : "",
    homeScore: typeof home[2] === "number" ? home[2] : 0,
    awayId: typeof away[0] === "string" ? away[0] : "",
    awayScore: typeof away[2] === "number" ? away[2] : 0,
    season: Array.isArray(season) && typeof season[1] === "string" ? season[1] : "",
  };
}

function formatDate(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export default function SoccerH2HCard({
  homeNameKo,
  awayNameKo,
  homeTsTeamId,
  awayTsTeamId,
  history,
}: Props) {
  const parsed = history
    .map(parseMatch)
    .filter((m): m is ParsedMatch => m !== null)
    .slice(0, 10);

  if (parsed.length === 0) return null;

  // 우리 home/away 승패 집계
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  for (const m of parsed) {
    const ourHomeWasHome = m.homeId === homeTsTeamId;
    const ourHomeScore = ourHomeWasHome ? m.homeScore : m.awayScore;
    const ourAwayScore = ourHomeWasHome ? m.awayScore : m.homeScore;
    if (ourHomeScore > ourAwayScore) homeWins++;
    else if (ourHomeScore < ourAwayScore) awayWins++;
    else draws++;
  }

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">맞대결 히스토리 (H2H)</h2>
        <span className="text-[11px] text-neutral-500">최근 {parsed.length}경기</span>
      </header>

      {/* 승패 요약 */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center text-xs">
        <div className="rounded-md bg-blue-50 dark:bg-blue-500/10 py-2">
          <div className="text-blue-600 dark:text-blue-400 font-bold text-lg">{homeWins}</div>
          <div className="text-neutral-500 truncate px-1">{homeNameKo}</div>
        </div>
        <div className="rounded-md bg-neutral-100 dark:bg-neutral-900 py-2">
          <div className="text-neutral-700 dark:text-neutral-300 font-bold text-lg">{draws}</div>
          <div className="text-neutral-500">무</div>
        </div>
        <div className="rounded-md bg-rose-50 dark:bg-rose-500/10 py-2">
          <div className="text-rose-600 dark:text-rose-400 font-bold text-lg">{awayWins}</div>
          <div className="text-neutral-500 truncate px-1">{awayNameKo}</div>
        </div>
      </div>

      {/* 매치 list */}
      <ul className="divide-y divide-neutral-100 dark:divide-white/5">
        {parsed.map((m, i) => {
          const ourHomeWasHome = m.homeId === homeTsTeamId;
          const leftName = ourHomeWasHome ? homeNameKo : awayNameKo;
          const rightName = ourHomeWasHome ? awayNameKo : homeNameKo;
          const leftScore = ourHomeWasHome ? m.homeScore : m.awayScore;
          const rightScore = ourHomeWasHome ? m.awayScore : m.homeScore;
          const leftWin = leftScore > rightScore;
          const rightWin = rightScore > leftScore;
          return (
            <li key={i} className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 py-2 text-[12px] sm:text-sm">
              <span className="text-[10px] text-neutral-500 tabular-nums w-20">
                {formatDate(m.matchTime)}
              </span>
              <span className={`text-right truncate ${leftWin ? "font-bold text-neutral-900 dark:text-neutral-100" : "text-neutral-500"}`}>
                {leftName}
              </span>
              <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-900 tabular-nums text-[12px] font-bold whitespace-nowrap">
                {leftScore} - {rightScore}
              </span>
              <span className={`truncate ${rightWin ? "font-bold text-neutral-900 dark:text-neutral-100" : "text-neutral-500"}`}>
                {rightName}
              </span>
              <span className="text-[10px] text-neutral-400 tabular-nums w-10 text-right">
                {m.season || ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
