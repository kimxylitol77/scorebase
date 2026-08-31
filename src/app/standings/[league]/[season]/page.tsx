// 시즌별 최종 순위 아카이브 페이지 — /standings/EPL/2025-26. SeasonStandingsArchive 정본 렌더.
// 현재 시즌은 /standings/[league] 담당 — 현재 라벨로 들어오면 그쪽으로 redirect.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import TeamBadge from "@/components/TeamBadge";
import AmbientGlow from "@/components/AmbientGlow";
import CollapseSection from "@/components/CollapseSection";
import StandingsSeasonNav from "@/components/standings/StandingsSeasonNav";
import LeagueLeaderBoard from "@/components/LeagueLeaderBoard";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import { seasonLabelFor } from "@/lib/sports/season-calendar";
import { resolveSeasonYear } from "@/lib/sports/season-registry";

export const revalidate = 86400; // 완료 시즌 아카이브 — 사실상 동결 데이터

const SEASON_RE = /^\d{4}(-\d{2})?$/; // "2025-26"(유럽형) | "2026"(달력형)

interface Props {
  params: Promise<{ league: string; season: string }>;
}

// SeasonStandingsArchive.rows 원소 — LeagueHistory 의 ArchRow 와 동일 형태
interface ArchRow {
  teamId: number | null;
  name: string;
  ko?: string;
  logo?: string | null;
  position: number;
  played: number;
  won: number;
  draw?: number;
  loss: number;
  gf?: number;
  ga?: number;
  points?: number;
  group?: string | null;
}

async function loadArchive(league: string, season: string) {
  if (!SEASON_RE.test(season) || !LEAGUE_DISPLAY[league]) return null;
  const arch = await prisma.seasonStandingsArchive.findUnique({
    where: { league_seasonLabel: { league, seasonLabel: season } },
    select: { rows: true, updatedAt: true },
  });
  const rows = ((arch?.rows as unknown as ArchRow[]) ?? []).slice();
  if (rows.length === 0) return null;
  rows.sort((x, y) => (x.group ?? "").localeCompare(y.group ?? "") || x.position - y.position);
  return { rows, updatedAt: arch!.updatedAt };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, season: rawSeason } = await params;
  const upper = league.toUpperCase();
  const season = decodeURIComponent(rawSeason);
  const name = LEAGUE_DISPLAY[upper] ?? upper;
  return {
    title: `${name} ${season} 시즌 최종 순위`,
    description: `${name} ${season} 시즌 최종 순위표. 우승팀과 전체 팀의 승·무·패·득실·승점 최종 기록 아카이브.`,
    alternates: { canonical: `https://www.scorebase.kr/standings/${upper}/${season}` },
  };
}

export default async function SeasonArchivePage({ params }: Props) {
  const { league, season: rawSeason } = await params;
  const upper = league.toUpperCase();
  const season = decodeURIComponent(rawSeason);
  const name = LEAGUE_DISPLAY[upper] ?? upper;

  const arch = await loadArchive(upper, season);
  if (!arch) notFound();

  // 현재 시즌 라벨로 들어오면 본 순위표로 — 진행 중 표는 저쪽이 실시간 정본.
  // redirect() 는 throw 로 동작하므로 try 밖에서 호출 (시즌 판정 실패만 삼킨다).
  let currentLabel: string | null = null;
  try {
    currentLabel = seasonLabelFor(upper, await resolveSeasonYear(upper));
  } catch {
    // 시즌 판정 실패 — 아카이브 렌더는 유지
  }
  if (currentLabel === season) redirect(`/standings/${upper}`);

  const { rows } = arch;
  const hasGroup = rows.some((r) => r.group);
  const hasGoals = rows.some((r) => r.gf != null);
  const hasPoints = rows.some((r) => r.points != null);
  const hasDraw = rows.some((r) => (r.draw ?? 0) > 0) || hasPoints; // 야구(무 거의 0·승점 없음)는 무 열 생략
  const champ = rows.find((r) => r.position === 1 && !r.group);

  // 그 시즌 리더보드(득점왕 등) — 과거 시즌 백필분이 있으면 함께 노출
  let leaderRows: Awaited<ReturnType<typeof loadLeagueLeaderboard>>["rowsByCategory"] = {};
  try {
    leaderRows = (await loadLeagueLeaderboard(upper, season)).rowsByCategory;
  } catch {
    // 리더보드 실패는 순위표를 죽이지 않는다
  }

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">
          라이브 스코어
        </Link>
        <span>›</span>
        <Link href={`/leagues/${upper}`} className="hover:underline">
          {name}
        </Link>
        <span>›</span>
        <Link href={`/standings/${upper}`} className="hover:underline">
          순위표
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{season}</span>
      </nav>

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          {name} {season} 시즌 최종 순위
        </h1>
        <p className="text-sm text-neutral-500 break-keep">
          {rows.length}팀 · 시즌 종료 최종 기록
          {champ && (
            <>
              {" "}
              · 우승 <span className="font-semibold text-neutral-700 dark:text-neutral-300">{champ.ko ?? toKoreanTeamName(champ.name, upper)}</span>
            </>
          )}
        </p>
        <StandingsSeasonNav league={upper} active={season} />
      </header>

      <div className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10">
                <th className="text-right py-2 pl-3 pr-2 font-semibold">#</th>
                {hasGroup && <th className="text-left py-2 px-2 font-semibold">조</th>}
                <th className="text-left py-2 px-2 font-semibold">팀</th>
                <th className="text-center py-2 px-2 font-semibold w-10">경기</th>
                <th className="text-center py-2 px-2 font-semibold w-10">승</th>
                {hasDraw && <th className="text-center py-2 px-2 font-semibold w-10">무</th>}
                <th className="text-center py-2 px-2 font-semibold w-10">패</th>
                {hasGoals && <th className="text-center py-2 px-2 font-semibold w-16 hidden sm:table-cell">득실</th>}
                {hasPoints && <th className="text-right py-2 pr-3 pl-2 font-semibold w-12">승점</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.position}-${r.group ?? ""}-${i}`}
                  className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                >
                  <td className="text-right py-2 pl-3 pr-2 tabular-nums text-neutral-500 font-bold">{r.position}</td>
                  {hasGroup && <td className="py-2 px-2 text-xs text-neutral-400">{r.group ?? ""}</td>}
                  <td className="py-2 px-2">
                    {r.teamId ? (
                      <Link href={`/teams/${r.teamId}`} prefetch={false} className="flex items-center gap-2 hover:underline">
                        <TeamBadge logoUrl={r.logo ?? null} size={20} className="bg-white rounded-sm shrink-0" />
                        <span className="font-semibold truncate max-w-[160px] sm:max-w-none">
                          {r.ko ?? toKoreanTeamName(r.name, upper)}
                        </span>
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2">
                        <TeamBadge logoUrl={r.logo ?? null} size={20} className="bg-white rounded-sm shrink-0" />
                        <span className="font-semibold truncate max-w-[160px] sm:max-w-none">
                          {r.ko ?? toKoreanTeamName(r.name, upper)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-emerald-600 dark:text-emerald-400">{r.won}</td>
                  {hasDraw && <td className="text-center py-2 px-2 tabular-nums text-neutral-500">{r.draw ?? 0}</td>}
                  <td className="text-center py-2 px-2 tabular-nums text-rose-500">{r.loss}</td>
                  {hasGoals && (
                    <td className="text-center py-2 px-2 tabular-nums text-neutral-500 hidden sm:table-cell">
                      {r.gf != null && r.ga != null ? `${r.gf}-${r.ga}` : "-"}
                    </td>
                  )}
                  {hasPoints && (
                    <td className="text-right py-2 pr-3 pl-2 tabular-nums font-black text-base">{r.points ?? "-"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11px] text-neutral-400 text-center pt-2">
        ⓘ {season} 시즌 종료 시점에 동결된 최종 순위입니다. 현재 시즌은{" "}
        <Link href={`/standings/${upper}`} className="underline hover:text-neutral-600 dark:hover:text-neutral-300">
          {name} 순위표
        </Link>
        에서 확인하세요.
      </div>

      {Object.keys(leaderRows).length > 0 && (
        <CollapseSection title={`${name} ${season} 시즌 리더보드`}>
          <LeagueLeaderBoard league={upper} season={season} rowsByCategory={leaderRows} footer={`${season} 시즌 최종 기록`} />
        </CollapseSection>
      )}
    </div>
  );
}
