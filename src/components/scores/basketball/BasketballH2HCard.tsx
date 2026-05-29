// 농구 H2H 카드 — TheSports analysis.history (vs/home/away).
// 각 게임 array: [matchId, sportType, compId, statusId, matchTime, ?, teamA[7], teamB[7], [], [season]]
//   teamA/B = [teamId, "", q1, q2, q3, q4, ot] → 점수 = 쿼터 합.
//   statusId 10/14 = 종료 (종료 경기만 표시).

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  homeTsTeamId: string | null;
  awayTsTeamId: string | null;
  /** analysis.history */
  history: { vs?: unknown[]; home?: unknown[]; away?: unknown[] } | null;
  /** ts team id → 한국어 이름 (상대팀 해석용) */
  tsIdToName: Record<string, string>;
}

interface Game {
  matchTime: number;
  aId: string;
  aScore: number;
  bId: string;
  bScore: number;
}

const FINISHED = new Set([10, 14]);

function sumQ(team: unknown): number {
  if (!Array.isArray(team)) return 0;
  let s = 0;
  for (let i = 2; i < team.length; i++) {
    const n = Number(team[i]);
    if (Number.isFinite(n)) s += n;
  }
  return s;
}

function parseGame(raw: unknown): Game | null {
  if (!Array.isArray(raw) || raw.length < 8) return null;
  const status = Number(raw[3]);
  if (!FINISHED.has(status)) return null;
  const a = raw[6];
  const b = raw[7];
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const aId = typeof a[0] === "string" ? a[0] : "";
  const bId = typeof b[0] === "string" ? b[0] : "";
  if (!aId || !bId) return null;
  return {
    matchTime: Number(raw[4]) || 0,
    aId,
    aScore: sumQ(a),
    bId,
    bScore: sumQ(b),
  };
}

function formatDate(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 한 팀(ourTsId) 관점 최근 경기 list — W/L + 점수 + 상대. */
function RecentForm({
  title,
  games,
  ourTsId,
  tsIdToName,
}: {
  title: string;
  games: Game[];
  ourTsId: string | null;
  tsIdToName: Record<string, string>;
}) {
  if (!ourTsId || games.length === 0) return null;
  const rows = games.slice(0, 6).map((g) => {
    const ourIsA = g.aId === ourTsId;
    const ourScore = ourIsA ? g.aScore : g.bScore;
    const oppScore = ourIsA ? g.bScore : g.aScore;
    const oppId = ourIsA ? g.bId : g.aId;
    const win = ourScore > oppScore;
    return {
      date: formatDate(g.matchTime),
      opp: tsIdToName[oppId] ?? "상대",
      ourScore,
      oppScore,
      win,
    };
  });
  const wins = rows.filter((r) => r.win).length;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold truncate">{title}</h3>
        <span className="text-[10px] text-neutral-500 tabular-nums shrink-0 ml-1">
          {wins}승 {rows.length - wins}패
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-1.5 text-[11px]">
            <span
              className={`shrink-0 w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold ${
                r.win
                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
              }`}
            >
              {r.win ? "승" : "패"}
            </span>
            <span className="tabular-nums font-bold w-12 shrink-0">
              {r.ourScore}-{r.oppScore}
            </span>
            <span className="truncate text-neutral-500">{r.opp}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BasketballH2HCard({
  homeNameKo,
  awayNameKo,
  homeTsTeamId,
  awayTsTeamId,
  history,
  tsIdToName,
}: Props) {
  if (!history) return null;
  const vs = (history.vs ?? [])
    .map(parseGame)
    .filter((g): g is Game => g !== null)
    .slice(0, 10);
  const homeRecent = (history.home ?? [])
    .map(parseGame)
    .filter((g): g is Game => g !== null);
  const awayRecent = (history.away ?? [])
    .map(parseGame)
    .filter((g): g is Game => g !== null);

  if (vs.length === 0 && homeRecent.length === 0 && awayRecent.length === 0) {
    return null;
  }

  // vs 승패 — home 팀 관점
  let homeWins = 0;
  let awayWins = 0;
  for (const g of vs) {
    const homeIsA = g.aId === homeTsTeamId;
    const hs = homeIsA ? g.aScore : g.bScore;
    const as = homeIsA ? g.bScore : g.aScore;
    if (hs > as) homeWins++;
    else if (hs < as) awayWins++;
  }

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">맞대결 · 최근 폼</h2>
        <span className="text-[10px] text-neutral-400">TheSports</span>
      </header>

      {/* H2H 직접 대결 */}
      {vs.length > 0 && (
        <div>
          <div className="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
            <div className="rounded-md bg-blue-50 dark:bg-blue-500/10 py-2">
              <div className="text-blue-600 dark:text-blue-400 font-bold text-lg">{homeWins}</div>
              <div className="text-neutral-500 truncate px-1">{homeNameKo}</div>
            </div>
            <div className="rounded-md bg-neutral-100 dark:bg-neutral-900 py-2 flex flex-col justify-center">
              <div className="text-neutral-500 text-[10px]">맞대결</div>
              <div className="text-neutral-700 dark:text-neutral-300 font-bold tabular-nums">{vs.length}</div>
            </div>
            <div className="rounded-md bg-rose-50 dark:bg-rose-500/10 py-2">
              <div className="text-rose-600 dark:text-rose-400 font-bold text-lg">{awayWins}</div>
              <div className="text-neutral-500 truncate px-1">{awayNameKo}</div>
            </div>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-white/5">
            {vs.map((g, i) => {
              const homeIsA = g.aId === homeTsTeamId;
              const ls = homeIsA ? g.aScore : g.bScore;
              const rs = homeIsA ? g.bScore : g.aScore;
              return (
                <li key={i} className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 py-1.5 text-[12px] sm:text-sm">
                  <span className="text-[10px] text-neutral-500 tabular-nums w-10">{formatDate(g.matchTime)}</span>
                  <span className={`text-right truncate ${ls > rs ? "font-bold" : "text-neutral-500"}`}>{homeNameKo}</span>
                  <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-900 tabular-nums text-[12px] font-bold whitespace-nowrap">
                    {ls} - {rs}
                  </span>
                  <span className={`truncate ${rs > ls ? "font-bold" : "text-neutral-500"}`}>{awayNameKo}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 양 팀 최근 폼 */}
      {(homeRecent.length > 0 || awayRecent.length > 0) && (
        <div className="flex gap-4 border-t border-neutral-100 dark:border-white/5 pt-3">
          <RecentForm title={homeNameKo} games={homeRecent} ourTsId={homeTsTeamId} tsIdToName={tsIdToName} />
          <div className="w-px bg-neutral-100 dark:bg-white/5" />
          <RecentForm title={awayNameKo} games={awayRecent} ourTsId={awayTsTeamId} tsIdToName={tsIdToName} />
        </div>
      )}
    </section>
  );
}
