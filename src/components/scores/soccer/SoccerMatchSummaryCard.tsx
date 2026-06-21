// 축구 매치 "한눈에" 요약 — 핵심 지표(xG·점유율·슈팅)만 크게. 탭 진입 전 글랜스용 상단 카드.
// 입력: teamStats(TheSports team_stats) + xG(af fixtureStats). 우세팀은 컬러, 열세팀은 회색 + 분할 막대.

interface TeamStatsRow {
  team_id?: string;
  shots?: number;
  shots_on_target?: number;
  ball_possession?: number;
  possession?: number;
  [key: string]: string | number | undefined;
}

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  teamStats?: TeamStatsRow[] | null;
  /** home/away 행 판별 — tsTeamId */
  homeTsTeamId?: string | null;
  awayTsTeamId?: string | null;
  xgHome?: number | null;
  xgAway?: number | null;
}

type Marquee = { label: string; home: number; away: number; homeText: string; awayText: string };

export default function SoccerMatchSummaryCard({
  homeNameKo,
  awayNameKo,
  teamStats,
  homeTsTeamId,
  awayTsTeamId,
  xgHome,
  xgAway,
}: Props) {
  // home/away 행 매칭 (SoccerTeamStatsCard 와 동일 규칙: team_id 우선, 실패 시 index 0=home)
  let homeRow: TeamStatsRow | undefined;
  let awayRow: TeamStatsRow | undefined;
  if (Array.isArray(teamStats) && teamStats.length >= 2) {
    if (homeTsTeamId && awayTsTeamId) {
      homeRow = teamStats.find((s) => s.team_id === homeTsTeamId);
      awayRow = teamStats.find((s) => s.team_id === awayTsTeamId);
    }
    if (!homeRow || !awayRow) {
      homeRow = teamStats[0];
      awayRow = teamStats[1];
    }
  }

  const marquees: Marquee[] = [];
  // 1) 기대득점 xG
  if (xgHome != null && xgAway != null && (xgHome > 0 || xgAway > 0)) {
    marquees.push({ label: "기대득점 xG", home: xgHome, away: xgAway, homeText: xgHome.toFixed(1), awayText: xgAway.toFixed(1) });
  }
  // 2) 점유율 (TheSports 키는 ball_possession, 일부 소스는 possession)
  const hp = Number(homeRow?.ball_possession ?? homeRow?.possession ?? 0);
  const ap = Number(awayRow?.ball_possession ?? awayRow?.possession ?? 0);
  if (hp > 0 || ap > 0) {
    marquees.push({ label: "점유율", home: hp, away: ap, homeText: `${hp}%`, awayText: `${ap}%` });
  }
  // 3) 슈팅 (유효)
  const hs = Number(homeRow?.shots ?? 0);
  const as_ = Number(awayRow?.shots ?? 0);
  const hsot = Number(homeRow?.shots_on_target ?? 0);
  const asot = Number(awayRow?.shots_on_target ?? 0);
  if (hs > 0 || as_ > 0) {
    marquees.push({ label: "슈팅 (유효)", home: hs, away: as_, homeText: `${hs} (${hsot})`, awayText: `${as_} (${asot})` });
  }

  if (marquees.length === 0) return null;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold tracking-wider uppercase text-neutral-500">매치 한눈에</div>
        <div className="flex items-center gap-2 text-[11px] font-bold min-w-0">
          <span className="text-rose-600 dark:text-rose-400 truncate">{homeNameKo}</span>
          <span className="text-neutral-400 shrink-0">·</span>
          <span className="text-blue-600 dark:text-blue-400 truncate">{awayNameKo}</span>
        </div>
      </div>
      <div className="space-y-3.5">
        {marquees.map((m) => {
          const total = m.home + m.away;
          const homePct = total > 0 ? (m.home / total) * 100 : 50;
          const homeLead = m.home > m.away;
          const awayLead = m.away > m.home;
          return (
            <div key={m.label} className="space-y-1.5">
              <div className="text-center text-[11px] text-neutral-500 font-medium">{m.label}</div>
              <div className="grid grid-cols-[3.25rem_1fr_3.25rem] sm:grid-cols-[4.5rem_1fr_4.5rem] items-center gap-2 sm:gap-3">
                <div className={`text-right text-lg sm:text-xl font-black tabular-nums ${homeLead ? "text-rose-600 dark:text-rose-400" : "text-neutral-400 dark:text-neutral-600"}`}>
                  {m.homeText}
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                  <div className="bg-rose-500 h-full" style={{ width: `${homePct}%` }} />
                  <div className="bg-blue-500 h-full" style={{ width: `${100 - homePct}%` }} />
                </div>
                <div className={`text-left text-lg sm:text-xl font-black tabular-nums ${awayLead ? "text-blue-600 dark:text-blue-400" : "text-neutral-400 dark:text-neutral-600"}`}>
                  {m.awayText}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
