// 축구 LIVE 통계 비교 — TheSports match/team_stats/list 응답 (named fields).
// 입력: teamStats[] = [home, away] 각 row {team_id, goals, shots, passes, ...}
// 이전 SoccerLiveStatsCard 의 type-coded stats 보다 정확/명확.

interface TeamStatsRow {
  team_id?: string;
  goals?: number;
  penalty?: number;
  assists?: number;
  red_cards?: number;
  yellow_cards?: number;
  shots?: number;
  shots_on_target?: number;
  dribble?: number;
  dribble_succ?: number;
  clearances?: number;
  blocked_shots?: number;
  interceptions?: number;
  tackles?: number;
  passes?: number;
  passes_accuracy?: number;
  key_passes?: number;
  crosses?: number;
  crosses_accuracy?: number;
  long_balls?: number;
  long_balls_accuracy?: number;
  duels?: number;
  duels_won?: number;
  possession?: number;
  ball_possession?: number;
  fouls?: number;
  offsides?: number;
  corners?: number;
  corner_kicks?: number;
  [key: string]: string | number | undefined;
}

interface Props {
  teamStats: TeamStatsRow[];
  homeNameKo: string;
  awayNameKo: string;
  /** home/away 판별용 — 우리 team-id-mapping 의 tsTeamId */
  homeTsTeamId?: string | null;
  awayTsTeamId?: string | null;
}

const DISPLAY_FIELDS: Array<{ key: keyof TeamStatsRow; alt?: keyof TeamStatsRow; label: string; isPct?: boolean }> = [
  { key: "possession", alt: "ball_possession", label: "점유율 (%)", isPct: true },
  { key: "shots", label: "슈팅" },
  { key: "shots_on_target", label: "유효 슈팅" },
  { key: "corners", alt: "corner_kicks", label: "코너킥" },
  { key: "passes", label: "패스" },
  { key: "passes_accuracy", label: "패스 성공률 (%)", isPct: true },
  { key: "key_passes", label: "키패스" },
  { key: "crosses", label: "크로스" },
  { key: "dribble_succ", label: "드리블 성공" },
  { key: "tackles", label: "태클" },
  { key: "interceptions", label: "인터셉트" },
  { key: "fouls", label: "파울" },
  { key: "offsides", label: "오프사이드" },
  { key: "yellow_cards", label: "옐로카드" },
  { key: "red_cards", label: "레드카드" },
];

function Bar({ home, away, max }: { home: number; away: number; max: number }) {
  const homePct = max > 0 ? (home / max) * 100 : 0;
  const awayPct = max > 0 ? (away / max) * 100 : 0;
  return (
    <div className="flex items-center gap-1 h-1.5">
      <div className="flex-1 flex justify-end">
        <div
          className="bg-rose-500 h-full rounded-l"
          style={{ width: `${homePct}%`, transition: "width 0.4s" }}
        />
      </div>
      <div className="w-px h-3 bg-neutral-700" />
      <div className="flex-1">
        <div
          className="bg-blue-500 h-full rounded-r"
          style={{ width: `${awayPct}%`, transition: "width 0.4s" }}
        />
      </div>
    </div>
  );
}

export default function SoccerTeamStatsCard({
  teamStats,
  homeNameKo,
  awayNameKo,
  homeTsTeamId,
  awayTsTeamId,
}: Props) {
  if (!Array.isArray(teamStats) || teamStats.length < 2) return null;

  // home/away 판별: team_id 매핑 우선, 실패 시 index 순서 (0=home 가정)
  let homeRow: TeamStatsRow | undefined;
  let awayRow: TeamStatsRow | undefined;
  if (homeTsTeamId && awayTsTeamId) {
    homeRow = teamStats.find((s) => s.team_id === homeTsTeamId);
    awayRow = teamStats.find((s) => s.team_id === awayTsTeamId);
  }
  if (!homeRow || !awayRow) {
    homeRow = teamStats[0];
    awayRow = teamStats[1];
  }

  const rows = DISPLAY_FIELDS.map((f) => {
    const h = Number(homeRow![f.key] ?? (f.alt ? homeRow![f.alt] : undefined) ?? 0);
    const a = Number(awayRow![f.key] ?? (f.alt ? awayRow![f.alt] : undefined) ?? 0);
    return { ...f, home: h, away: a };
  }).filter((r) => r.home + r.away > 0);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-3">
      <div className="text-xs font-bold tracking-wider uppercase text-neutral-500">
        매치 통계
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 text-xs">
        <div className="text-right text-rose-600 dark:text-rose-400 font-bold">{homeNameKo}</div>
        <div className="text-[10px] text-neutral-400 px-1">vs</div>
        <div className="text-blue-600 dark:text-blue-400 font-bold">{awayNameKo}</div>
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const max = Math.max(r.home, r.away, 1);
          return (
            <div key={String(r.key)} className="space-y-1">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 text-[12px] tabular-nums">
                <div className="text-right font-bold">{r.isPct ? `${r.home}%` : r.home}</div>
                <div className="text-[10px] text-neutral-500 px-2 whitespace-nowrap">{r.label}</div>
                <div className="font-bold">{r.isPct ? `${r.away}%` : r.away}</div>
              </div>
              <Bar home={r.home} away={r.away} max={max} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
