// NhlStandingsTable (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toEnglishTeamName } from "@/lib/i18n/en";
import { fetchNhlStandings } from "@/lib/sports/nhl-api";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import LeagueLeaderBoard from "@/components/en/LeagueLeaderBoard";

type Std = NonNullable<Awaited<ReturnType<typeof fetchNhlStandings>>>;

function nhlNormName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** withLastLeaders — 개막 전 접기 안에 지난 시즌 리더보드를 같이 넣는다. 리그 탭 전용 opt-in:
 *  /standings/NHL 은 페이지가 자체 "시즌 리더보드" 섹션을 이미 렌더해 같은 표가 두 번 나온다. */
export default async function NhlStandingsTable({
  std: stdProp,
  withLastLeaders = false,
}: { std?: Std | null; withLastLeaders?: boolean }) {
  const std = stdProp ?? (await fetchNhlStandings());
  if (!std || std.rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">Collecting standings data. Please check back shortly.</p>
    );
  }

  // NHL API 팀 ↔ DB Team 매핑 (한글명·로고·팀 링크). 풀네임 일치 우선.
  const dbTeams = await prisma.team.findMany({
    where: { league: "NHL" },
    select: { id: true, name: true, shortName: true, logoUrl: true },
  });
  const findTeam = (row: { name: string; placeName: string; abbrev: string }) => {
    const an = nhlNormName(row.name);
    const common = nhlNormName(row.name.replace(row.placeName, ""));
    const aa = (row.abbrev || "").toLowerCase();
    return dbTeams.find((db) => {
      const dn = nhlNormName(db.name);
      if (dn === an) return true;
      if (common.length > 2 && (dn.includes(common) || common.includes(dn))) return true;
      if (db.shortName && nhlNormName(db.shortName) === nhlNormName(row.abbrev)) return true;
      if (aa && dn.endsWith(aa)) return true;
      return false;
    });
  };

  // 오프시즌 감지 + 개막 일정. 지난 경기 후 14일+ 경과 & 지난 시즌 정규 완료(최대 82경기)면 전환기.
  const now = new Date();
  const [lastFin, upcoming] = await Promise.all([
    prisma.match.findFirst({
      where: { league: "NHL", status: "FINISHED" },
      orderBy: { startTime: "desc" },
      select: { startTime: true },
    }),
    prisma.match.findMany({
      where: { league: "NHL", status: "SCHEDULED" },
      orderBy: { startTime: "asc" },
      take: 6,
      select: {
        id: true,
        startTime: true,
        homeTeam: { select: { name: true, logoUrl: true } },
        awayTeam: { select: { name: true, logoUrl: true } },
      },
    }),
  ]);
  const daysSinceLast = lastFin ? (now.getTime() - lastFin.startTime.getTime()) / 86400_000 : 0;
  const maxGamesPlayed = Math.max(...std.rows.map((r) => r.gamesPlayed));
  const inTransition = daysSinceLast >= 14 && maxGamesPlayed >= 80;

  // 시즌 라벨 — season 은 raw 8자리("20252026"). 없으면 마지막 경기 연도로 폴백.
  const s = std.season;
  const endYear = /^\d{8}$/.test(s)
    ? Number(s.slice(4, 8))
    : lastFin
      ? lastFin.startTime.getUTCFullYear()
      : now.getUTCFullYear();
  const oldLabel = `${endYear - 1}-${pad(endYear % 100)}`;
  const nextLabel = `${endYear}-${pad((endYear + 1) % 100)}`;

  // 순위표(방금 축구 리그와 통일한 스타일) — 평시 본문 + 전환기 접기에서 재사용.
  const tableEl = (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-x-auto dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.06] text-xs text-neutral-500">
          <tr>
            <th className="text-right px-3 py-2 font-medium w-10">#</th>
            <th className="text-left px-3 py-2 font-medium">Team</th>
            <th className="text-right px-2 py-2 font-medium">GP</th>
            <th className="text-right px-2 py-2 font-medium">W</th>
            <th className="text-right px-2 py-2 font-medium">L</th>
            <th className="text-right px-2 py-2 font-medium">OTL</th>
            <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">GF</th>
            <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">GA</th>
            <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">GD</th>
            <th className="text-right px-3 py-2 font-medium">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {std.rows.map((r, i) => {
            const db = findTeam(r);
            const ko = db ? toEnglishTeamName(db.name) : r.name;
            const gd = r.goalDiff;
            return (
              <tr key={r.abbrev} className="hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-500">{i + 1}</td>
                <td className="px-3 py-2 truncate">
                  {db ? (
                    <Link href={`/teams/${db.id}`} prefetch={false} className="group flex items-center gap-2 min-w-0">
                      {db.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={db.logoUrl} alt="" width={24} height={24} loading="lazy" className="w-6 h-6 object-contain shrink-0 bg-white rounded-sm" />
                      ) : (
                        <div className="w-6 h-6 rounded-sm bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                      )}
                      <span className="truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{ko}</span>
                    </Link>
                  ) : (
                    <span className="truncate">{ko}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.gamesPlayed}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.wins}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.losses}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.otLosses}</td>
                <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{r.goalFor}</td>
                <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{r.goalAgainst}</td>
                <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{gd > 0 ? `+${gd}` : gd}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // 평시 — 시즌 진행 중이면 현재 순위 그대로.
  if (!inTransition) {
    return (
      <div className="space-y-2">
        {tableEl}
        <p className="text-[11px] text-neutral-400">Points = 2 for a win, 1 for an overtime or shootout loss · official NHL records · updated after each game</p>
      </div>
    );
  }

  // 지난 시즌 리더보드 — 접기 안에서 최종 순위와 함께 본다(축구 리그와 동일 처리).
  const lastLeaders = withLastLeaders ? await loadLeagueLeaderboard("NHL", oldLabel) : null;
  const hasLastLeaders = Object.keys(lastLeaders?.rowsByCategory ?? {}).length > 0;

  // 전환기 — 다음 시즌 개막 대기. 개막 일정(있으면) + 지난 시즌 최종 순위 접기.
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 ring-1 ring-blue-500/20 dark:text-blue-400">
          {nextLabel} season
        </span>
        <span className="text-xs text-neutral-400">Awaiting the new season · last season complete</span>
      </div>

      {upcoming.length > 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-hidden dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <div className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 border-b border-neutral-100 dark:border-white/10">Season opener</div>
          <ul className="divide-y divide-neutral-100 dark:divide-white/5">
            {upcoming.map((m) => {
              const kst = new Date(m.startTime.getTime() + 9 * 3600_000);
              const away = toEnglishTeamName(m.awayTeam.name);
              const home = toEnglishTeamName(m.homeTeam.name);
              return (
                <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="truncate">
                    {away} <span className="text-neutral-400">vs</span> {home}
                  </span>
                  <span className="shrink-0 ml-2 text-[11px] tabular-nums text-neutral-400">
                    {kst.getUTCMonth() + 1}/{kst.getUTCDate()} {kst.getUTCHours()}:{pad(kst.getUTCMinutes())}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-5 text-center text-xs text-neutral-500">
          {nextLabel} The opening fixture appears once confirmed.
        </div>
      )}

      <details className="group rounded-2xl bg-white/60 ring-1 ring-black/5 dark:bg-white/[0.02] dark:ring-white/10">
        <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 px-4 py-3 text-xs font-bold text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-300">
          <span className="text-[10px] transition group-open:rotate-90" aria-hidden>▶</span>
          Last season's final table{hasLastLeaders ? " · record" : ""}{" "}
          <span className="font-normal text-neutral-400">({oldLabel})</span>
        </summary>
        <div className="px-2 pb-3 pt-1 space-y-4">
          {tableEl}
          {hasLastLeaders && (
            <LeagueLeaderBoard
              league="NHL"
              season={oldLabel}
              rowsByCategory={lastLeaders!.rowsByCategory}
              footer={`${oldLabel} final record`}
            />
          )}
        </div>
      </details>

      <p className="text-[11px] text-neutral-400">{nextLabel} This switches to the live table once the season starts.</p>
    </div>
  );
}
