// NbaStandingsTable (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toEnglishTeamName } from "@/lib/i18n/en";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import LeagueLeaderBoard from "@/components/en/LeagueLeaderBoard";

interface NbaRow {
  espnId: string;
  name: string;
  wins: number;
  losses: number;
  winPercent: string;
  gamesBehind: string;
  streak: string;
  seed: number;
  home: string;
  road: string;
  lastTen: string;
}
interface NbaStd {
  seasonEndYear: number;
  conferences: { name: string; rows: NbaRow[] }[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function fetchNbaStandings(): Promise<NbaStd | null> {
  // ESPN season 파라미터 = 시즌 종료 연도. 10월(개막)부터 다음 해 시즌으로 넘어간다.
  const kst = new Date(Date.now() + 9 * 3600_000);
  const seasonEndYear = kst.getUTCMonth() + 1 >= 10 ? kst.getUTCFullYear() + 1 : kst.getUTCFullYear();
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${seasonEndYear}`,
      { next: { revalidate: 1800 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const conferences = (data.children || []).map(
      (ch: { name: string; standings?: { entries?: unknown[] } }) => {
        const entries = (ch.standings?.entries || []) as Array<{
          team: { id: string; displayName: string };
          stats: Array<{ name: string; value?: number; displayValue?: string }>;
        }>;
        const rows: NbaRow[] = entries.map((e) => {
          const stat = (n: string) => e.stats.find((s) => s.name === n);
          return {
            espnId: String(e.team.id),
            name: e.team.displayName,
            wins: stat("wins")?.value ?? 0,
            losses: stat("losses")?.value ?? 0,
            winPercent: stat("winPercent")?.displayValue ?? "-",
            gamesBehind: stat("gamesBehind")?.displayValue ?? "-",
            streak: stat("streak")?.displayValue ?? "-",
            seed: stat("playoffSeed")?.value ?? 99,
            home: stat("Home")?.displayValue ?? "-",
            road: stat("Road")?.displayValue ?? "-",
            lastTen: stat("Last Ten Games")?.displayValue ?? "-",
          };
        });
        rows.sort((a, b) => a.seed - b.seed || b.wins - a.wins);
        return { name: ch.name as string, rows };
      },
    );
    if (conferences.length === 0 || conferences.every((c: { rows: NbaRow[] }) => c.rows.length === 0)) return null;
    return { seasonEndYear, conferences };
  } catch {
    return null;
  }
}

/** withLastLeaders — 개막 전 접기 안에 지난 시즌 리더보드를 같이 넣는다. 리그 탭 전용 opt-in:
 *  /standings/NBA 는 페이지가 자체 "시즌 리더보드" 섹션을 이미 렌더해 같은 표가 두 번 나온다. */
export default async function NbaStandingsTable({
  withLastLeaders = false,
}: { withLastLeaders?: boolean } = {}) {
  const std = await fetchNbaStandings();
  if (!std) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">Collecting standings data. Please check back shortly.</p>
    );
  }

  // ESPN 팀명 ↔ DB Team — NBA 30팀은 공식 풀네임이 동일해 정규화 이름 일치로 충분.
  // Team.externalId 는 소스별 id 체계가 섞여 있어(2026-08 정리 이력) 매핑 키로 쓰지 않는다.
  const dbTeams = await prisma.team.findMany({
    where: { league: "NBA" },
    select: { id: true, name: true, logoUrl: true },
  });
  const byName = new Map(dbTeams.map((t) => [norm(t.name), t]));

  // 오프시즌 전환 감지 — 마지막 완료 경기 14일+ 경과 & 정규시즌 소화(80경기+).
  const now = new Date();
  const [lastFin, upcoming] = await Promise.all([
    prisma.match.findFirst({
      where: { league: "NBA", status: "FINISHED" },
      orderBy: { startTime: "desc" },
      select: { startTime: true },
    }),
    prisma.match.findMany({
      where: { league: "NBA", status: "SCHEDULED", startTime: { gte: now } },
      orderBy: { startTime: "asc" },
      take: 6,
      select: {
        id: true,
        startTime: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    }),
  ]);
  const daysSinceLast = lastFin ? (now.getTime() - lastFin.startTime.getTime()) / 86400_000 : 0;
  const maxPlayed = Math.max(...std.conferences.flatMap((c) => c.rows.map((r) => r.wins + r.losses)));
  const inTransition = daysSinceLast >= 14 && maxPlayed >= 80;

  const oldLabel = `${std.seasonEndYear - 1}-${pad(std.seasonEndYear % 100)}`;
  const nextLabel = `${std.seasonEndYear}-${pad((std.seasonEndYear + 1) % 100)}`;

  const confKo = (n: string) => (n.startsWith("East") ? "Eastern Conference" : n.startsWith("West") ? "Western Conference" : n);

  const tablesEl = (
    <div className="space-y-4">
      {std.conferences.map((conf) => (
        <div key={conf.name}>
          <h3 className="px-1 pb-2 text-xs font-bold text-neutral-400">{confKo(conf.name)}</h3>
          <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-x-auto dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-white/[0.06] text-xs text-neutral-500">
                <tr>
                  <th className="text-right px-3 py-2 font-medium w-10">#</th>
                  <th className="text-left px-3 py-2 font-medium">Team</th>
                  <th className="text-right px-2 py-2 font-medium">W</th>
                  <th className="text-right px-2 py-2 font-medium">L</th>
                  <th className="text-right px-2 py-2 font-medium">PCT</th>
                  <th className="text-right px-2 py-2 font-medium">GB</th>
                  <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">Home</th>
                  <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">Away</th>
                  <th className="text-right px-2 py-2 font-medium hidden md:table-cell">L10</th>
                  <th className="text-right px-3 py-2 font-medium">Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {conf.rows.map((r, i) => {
                  const db = byName.get(norm(r.name));
                  const ko = db ? toEnglishTeamName(db.name) : r.name;
                  const rank = r.seed !== 99 ? r.seed : i + 1;
                  return (
                    <tr key={r.espnId} className="hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-500">{rank}</td>
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
                      <td className="px-2 py-2 text-right tabular-nums">{r.wins}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.losses}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.winPercent}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.gamesBehind}</td>
                      <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{r.home}</td>
                      <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{r.road}</td>
                      <td className="px-2 py-2 text-right tabular-nums hidden md:table-cell">{r.lastTen}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{r.streak}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );

  // 평시 — 시즌 진행 중이면 현재 순위 그대로.
  if (!inTransition) {
    return (
      <div className="space-y-2">
        {tablesEl}
        <p className="text-[11px] text-neutral-400">{oldLabel} Regular season · official NBA records (ESPN) · updated after each game</p>
      </div>
    );
  }

  // 지난 시즌 리더보드 — 접기 안에서 최종 순위와 함께 본다(축구 리그와 동일 처리).
  const lastLeaders = withLastLeaders ? await loadLeagueLeaderboard("NBA", oldLabel) : null;
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
          {tablesEl}
          {hasLastLeaders && (
            <LeagueLeaderBoard
              league="NBA"
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
