// 리그별 순위표 페이지 — 36개 축구 리그 + 야구/농구/하키 일부 지원.
// /standings/EPL, /standings/K_LEAGUE_1 등.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { calcStandings } from "@/lib/predict/standings";
import { getRecentForm } from "@/lib/predict/recent-form";
import RecentFormDots from "@/components/scores/RecentFormDots";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { SOCCER_LEAGUES } from "@/lib/sports/types";
import { fetchStandingsForLeague } from "@/lib/sports/thesports/standings-fetch";
import { fetchBaseballTable } from "@/lib/sports/thesports/baseball-table";
import { getTeamGroup } from "@/lib/predict/world-cup-elos";
import { VOLLEYBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import { fetchVolleyballTable } from "@/lib/sports/thesports/volleyball-table";
import { fetchNhlStandings } from "@/lib/sports/nhl-api";
import LeagueLeaderBoard from "@/components/LeagueLeaderBoard";
import LolStandings from "@/components/LolStandings";
import LolSimpleStandings from "@/components/LolSimpleStandings";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import AmbientGlow from "@/components/AmbientGlow";
import { Trophy, HeartPulse } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ league: string }>;
}

const VALID = new Set<string>([
  ...SOCCER_LEAGUES,
  ...VOLLEYBALL_LEAGUES,
  "NBA",
  "WNBA",
  "NHL",
  "KBO",
  "NPB",
  "MLB",
  "CPBL",
  "LOL",
  "LEC",
  "LCS",
]);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase();
  const name = LEAGUE_DISPLAY[upper] ?? upper;
  if (upper === "NHL") {
    return {
      title: "NHL 순위표 — 동·서부 컨퍼런스 전체 순위 | 스코어베이스",
      description:
        "NHL 정규시즌 순위표. 동부·서부 컨퍼런스 32팀의 경기·승·패·연장패·승점 전체 순위를 NHL 공식 기록으로 매일 자동 갱신.",
      alternates: { canonical: "https://www.scorebase.kr/standings/NHL" },
    };
  }
  return {
    title: `${name} 순위표 — 스코어베이스`,
    description: `${name} 시즌 순위표. 승점·승무패·골득실·득점·실점 한눈에. 매일 자동 갱신.`,
    alternates: { canonical: `https://www.scorebase.kr/standings/${upper}` },
  };
}

export default async function StandingsPage({ params }: Props) {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!VALID.has(upper)) notFound();
  const name = LEAGUE_DISPLAY[upper] ?? upper;

  // 월드컵은 단일표가 아니라 12개 조(A~L) 분리 표 — 전용 렌더로 분기
  if (upper === "WORLD_CUP") return <WorldCupStandings name={name} />;

  // 배구는 세트 득실 컬럼 + 조별(Pool) 다중 테이블 — 전용 렌더로 분기
  if (VOLLEYBALL_LEAGUES.has(upper)) return <VolleyballStandings league={upper} name={name} />;

  // NHL 은 승점 체계(승 2·연장패 1) + OTL 컬럼이 축구식과 달라 — 공식 순위 전용 렌더
  if (upper === "NHL") return <NhlStandings name={name} />;

  // LOL(LCK) — ts table/list JSON 백필(data/lol-standings.json) 정적 렌더
  if (upper === "LOL") return <LolStandings name={name} />;

  // 해외 LoL(LEC/LCS) — 순위 + 로스터만(매치 미수집이라 KDA·통계 탭 없음)
  if (upper === "LEC" || upper === "LCS") return <LolSimpleStandings league={upper} name={name} />;

  // 1차: ts season standings 시도 (78개 축구 리그 cover, 자체 계산보다 정확)
  // 2차: DB FINISHED 매치 기반 calcStandings fallback
  const isSoccerLeague = (SOCCER_LEAGUES as readonly string[]).includes(upper);
  const tsStandings = isSoccerLeague ? await fetchStandingsForLeague(upper) : null;
  // 야구(KBO/NPB) 순위는 TheSports season/table/detail 공식 순위 사용 (DB 매치 계산보다 정확).
  const baseballTable =
    upper === "KBO" || upper === "NPB" ? await fetchBaseballTable(upper) : null;

  // 시즌 매치 (recent form dots 용 + fallback 계산용)
  const matches = await prisma.match.findMany({
    where: { league: upper },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
    },
  });

  // 데이터 source 분기
  let rows: Array<{
    position: number;
    teamId: number;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDiff: number;
    points: number;
    promotionColor?: string;
    promotionName?: string;
  }>;
  let source: "ts" | "calc" = "calc";

  if (tsStandings && tsStandings.tables.length > 0) {
    // ts 결과 사용 — 첫 번째 table (일반 리그) 의 rows
    const promoMap = new Map(tsStandings.promotions.map((p) => [p.id, p]));
    const tsRows = tsStandings.tables[0].rows
      .filter((r) => r.ourTeamId != null) // 미매핑 ts 팀 제거
      .map((r) => {
        const promo = r.promotion_id ? promoMap.get(r.promotion_id) : undefined;
        return {
          position: r.position,
          teamId: r.ourTeamId!,
          played: r.total,
          wins: r.won,
          draws: r.draw,
          losses: r.loss,
          goalsFor: r.goals,
          goalsAgainst: r.goals_against,
          goalDiff: r.goal_diff,
          points: r.points,
          promotionColor: promo?.color,
          promotionName: promo?.name,
        };
      })
      .sort((a, b) => a.position - b.position);
    if (tsRows.length > 0) {
      rows = tsRows;
      source = "ts";
    }
  }

  // 야구(KBO/NPB) — TheSports 공식 순위 (season/table/detail). 미매핑/실패 시 calc fallback.
  if (source === "calc" && baseballTable && baseballTable.length > 0) {
    rows = baseballTable.map((r) => ({
      position: r.position,
      teamId: r.ourTeamId,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDiff: r.goalsFor - r.goalsAgainst,
      points: r.wins * 3,
      promotionColor: undefined,
      promotionName: undefined,
    }));
    source = "ts";
  }

  if (source === "calc") {
    if (matches.length === 0) {
      return (
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <AmbientGlow />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 순위표</h1>
          <p className="mt-3 text-sm text-neutral-500 break-keep">시즌 매치 데이터가 아직 수집되지 않았습니다.</p>
        </div>
      );
    }
    const calc = calcStandings(matches);
    rows = calc.rows.map((r) => ({ ...r, promotionColor: undefined, promotionName: undefined }));
  }

  // 팀 DB lookup
  const teamIds = rows!.map((r) => r.teamId);
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, shortName: true, logoUrl: true },
  });
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // 시즌 리더보드 (득점왕·도움왕 등) — DB cron 이 매일 채움. 데이터 있는 리그만 노출.
  const { rowsByCategory: leaderRows, season: leaderSeason } = await loadLeagueLeaderboard(upper);
  const hasLeaders = Object.keys(leaderRows).length > 0;

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
        <span className="text-neutral-700 dark:text-neutral-300">순위표</span>
      </nav>

      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 순위표</h1>
        <p className="text-sm text-neutral-500 mt-2 break-keep">
          {rows!.length}팀 · 시즌 진행 중 · {source === "ts" ? "TheSports 실시간 갱신" : "FINISHED 매치 기반 계산"}
        </p>
      </header>

      <div className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10">
              <th className="text-right py-2 pl-3 pr-2 font-semibold">#</th>
              <th className="text-left py-2 px-2 font-semibold">팀</th>
              <th className="text-center py-2 px-2 font-semibold w-10">경기</th>
              <th className="text-center py-2 px-2 font-semibold w-10">승</th>
              <th className="text-center py-2 px-2 font-semibold w-10">무</th>
              <th className="text-center py-2 px-2 font-semibold w-10">패</th>
              <th className="text-center py-2 px-2 font-semibold w-12">득점</th>
              <th className="text-center py-2 px-2 font-semibold w-12">실점</th>
              <th className="text-center py-2 px-2 font-semibold w-12">득실</th>
              <th className="text-center py-2 px-2 font-semibold w-20 hidden sm:table-cell">최근 5</th>
              <th className="text-right py-2 pr-3 pl-2 font-semibold w-12">승점</th>
            </tr>
          </thead>
          <tbody>
            {rows!.map((r) => {
              const t = teamMap.get(r.teamId);
              if (!t) return null;
              const ko = toKoreanTeamName(t.name, upper);
              const gd = r.goalDiff;
              return (
                <tr
                  key={r.teamId}
                  id={`team-${r.teamId}`}
                  className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] target:bg-amber-50 dark:target:bg-amber-500/10 scroll-mt-24 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={r.promotionColor ? { boxShadow: `inset 3px 0 0 0 ${r.promotionColor}` } : undefined}
                  title={r.promotionName || undefined}
                >
                  <td className="text-right py-2 pl-3 pr-2 tabular-nums text-neutral-500 font-bold">
                    {r.position}
                  </td>
                  <td className="py-2 px-2">
                    <Link
                      href={`/teams/${t.id}`}
                      prefetch={false}
                      className="flex items-center gap-2 hover:underline"
                    >
                      {t.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                      )}
                      <span className="font-semibold truncate max-w-[160px] sm:max-w-none">{ko}</span>
                    </Link>
                  </td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-500">{r.draws}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-rose-500">{r.losses}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300">{r.goalsFor}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300">{r.goalsAgainst}</td>
                  <td className={`text-center py-2 px-2 tabular-nums font-semibold ${gd > 0 ? "text-emerald-600 dark:text-emerald-400" : gd < 0 ? "text-rose-500" : "text-neutral-500"}`}>
                    {gd > 0 ? `+${gd}` : gd}
                  </td>
                  <td className="text-center py-2 px-2 hidden sm:table-cell">
                    <RecentFormDots form={getRecentForm(matches, r.teamId, 5)} size="sm" />
                  </td>
                  <td className="text-right py-2 pr-3 pl-2 tabular-nums font-black text-base">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <div className="text-[11px] text-neutral-400 text-center pt-2">
        ⓘ FINISHED 매치만 집계. SCHEDULED/POSTPONED 제외.
      </div>

      {hasLeaders && (
        <section className="space-y-3 pt-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">{name} 시즌 리더보드</h2>
          <LeagueLeaderBoard league={upper} season={leaderSeason} rowsByCategory={leaderRows} />
        </section>
      )}
    </div>
  );
}

// ── FIFA 월드컵 2026 조별 순위 — 48개국 12개 조, FINISHED 매치 기반 자체 집계 ──
// 조 1·2위 32강 직행 + 3위 중 상위 8팀 추가 진출 (48팀 신규 포맷).
// 정렬: 승점 > 득실 > 다득점 (동률 세부 규칙(H2H·페어플레이)은 조별 종료 시점에만 의미 — 생략).
async function WorldCupStandings({ name }: { name: string }) {
  const [teams, matches] = await Promise.all([
    prisma.team.findMany({
      where: { league: "WORLD_CUP" },
      select: { id: true, name: true, logoUrl: true },
    }),
    prisma.match.findMany({
      where: { league: "WORLD_CUP" },
      select: { status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    }),
  ]);

  interface Row {
    teamId: number; name: string; logo: string | null;
    played: number; wins: number; draws: number; losses: number;
    gf: number; ga: number; pts: number;
  }
  const rowByTeam = new Map<number, Row>();
  const groupOf = new Map<number, string>();
  for (const t of teams) {
    const g = getTeamGroup(t.name);
    if (!g) continue; // 조 매핑 안 되는 row (중복/비본선) 제외
    groupOf.set(t.id, g);
    rowByTeam.set(t.id, { teamId: t.id, name: t.name, logo: t.logoUrl, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0 });
  }
  for (const m of matches) {
    if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
    const h = rowByTeam.get(m.homeTeamId);
    const a = rowByTeam.get(m.awayTeamId);
    if (!h || !a) continue;
    // 32강 이후 토너먼트 매치 제외 — 같은 조 팀끼리의 경기만 조별 집계
    if (groupOf.get(m.homeTeamId) !== groupOf.get(m.awayTeamId)) continue;
    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    if (m.homeScore > m.awayScore) { h.wins++; h.pts += 3; a.losses++; }
    else if (m.homeScore < m.awayScore) { a.wins++; a.pts += 3; h.losses++; }
    else { h.draws++; h.pts++; a.draws++; a.pts++; }
  }

  const groups = new Map<string, Row[]>();
  for (const [teamId, g] of groupOf) {
    const arr = groups.get(g) || [];
    arr.push(rowByTeam.get(teamId)!);
    groups.set(g, arr);
  }
  for (const arr of groups.values()) {
    arr.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name));
  }
  const groupKeys = [...groups.keys()].sort();
  const playedTotal = matches.filter((m) => m.status === "FINISHED").length;

  return (
    <div className="relative max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">라이브 스코어</Link>
        <span>›</span>
        <Link href="/leagues/WORLD_CUP" className="hover:underline">{name}</Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">조별 순위</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 조별 순위
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 조별 순위</h1>
          <p className="text-sm text-neutral-500 mt-2 break-keep">
            48개국 12개 조 · 조별리그 {playedTotal}경기 종료 · 경기 종료 시 자동 갱신
          </p>
        </div>
        <Link
          href="/predictions/WORLD_CUP"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-600 dark:text-amber-400 hover:underline shrink-0"
        >
          <Trophy className="h-4 w-4" aria-hidden /> 우승 확률 시뮬레이션 →
        </Link>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {groupKeys.map((g) => (
          <section key={g} className="rounded-2xl border border-neutral-200 dark:border-white/10 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:hover:bg-white/[0.02]">
            <h2 className="px-4 py-2.5 text-sm font-black bg-neutral-50 dark:bg-white/[0.04] border-b border-neutral-200 dark:border-white/10">
              {g}조
            </h2>
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-neutral-400">
                  <th className="text-right py-1.5 pl-3 pr-1 font-semibold w-7">#</th>
                  <th className="text-left py-1.5 px-1.5 font-semibold">팀</th>
                  <th className="text-center py-1.5 px-1 font-semibold w-8">경기</th>
                  <th className="text-center py-1.5 px-1 font-semibold w-7">승</th>
                  <th className="text-center py-1.5 px-1 font-semibold w-7">무</th>
                  <th className="text-center py-1.5 px-1 font-semibold w-7">패</th>
                  <th className="text-center py-1.5 px-1 font-semibold w-10">득실</th>
                  <th className="text-right py-1.5 pr-3 pl-1 font-semibold w-10">승점</th>
                </tr>
              </thead>
              <tbody>
                {(groups.get(g) || []).map((r, i) => {
                  const gd = r.gf - r.ga;
                  // 1·2위 = 32강 직행(emerald), 3위 = 상위 8팀 와일드카드 가능(amber)
                  const stripe = i < 2 ? "#10b981" : i === 2 ? "#f59e0b" : undefined;
                  return (
                    <tr
                      key={r.teamId}
                      className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={stripe ? { boxShadow: `inset 3px 0 0 0 ${stripe}` } : undefined}
                      title={i < 2 ? "32강 직행권" : i === 2 ? "3위 — 상위 8팀 32강 진출 가능" : undefined}
                    >
                      <td className="text-right py-2 pl-3 pr-1 tabular-nums text-neutral-500 font-bold">{i + 1}</td>
                      <td className="py-2 px-1.5">
                        <Link href={`/national-teams/${r.teamId}`} prefetch={false} className="flex items-center gap-2 hover:underline">
                          {r.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                          )}
                          <span className="font-semibold truncate max-w-[120px] sm:max-w-[150px]">
                            {toKoreanTeamName(r.name, "WORLD_CUP")}
                          </span>
                        </Link>
                      </td>
                      <td className="text-center py-2 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                      <td className="text-center py-2 px-1 tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                      <td className="text-center py-2 px-1 tabular-nums text-neutral-500">{r.draws}</td>
                      <td className="text-center py-2 px-1 tabular-nums text-rose-500">{r.losses}</td>
                      <td className={`text-center py-2 px-1 tabular-nums font-semibold ${gd > 0 ? "text-emerald-600 dark:text-emerald-400" : gd < 0 ? "text-rose-500" : "text-neutral-500"}`}>
                        {gd > 0 ? `+${gd}` : gd}
                      </td>
                      <td className="text-right py-2 pr-3 pl-1 tabular-nums font-black">{r.pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <div className="text-[11px] text-neutral-400 text-center pt-2 space-y-0.5">
        <p>
          <span className="inline-block w-2.5 h-2.5 rounded-sm align-[-1px] mr-1" style={{ background: "#10b981" }} />
          조 1·2위 32강 직행
          <span className="inline-block w-2.5 h-2.5 rounded-sm align-[-1px] mx-1 ml-3" style={{ background: "#f59e0b" }} />
          3위는 12개 조 중 상위 8팀이 32강 진출
        </p>
        <p>ⓘ FINISHED 매치만 집계 · 동률 시 승점→득실→다득점 순.</p>
      </div>
    </div>
  );
}


// ── 배구 순위 (VNL/AVC/유럽리그) — TheSports season/table/detail cache 기반 ──
// 승점·승패·세트 득실. AVC/유럽리그는 조별(Pool) 다중 테이블 그대로 렌더.
async function VolleyballStandings({ league, name }: { league: string; name: string }) {
  const groups = await fetchVolleyballTable(league);
  const teamIds = groups.flatMap((g) => g.rows.map((r) => r.ourTeamId));
  const [teams, vbMatches] = await Promise.all([
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true, logoUrl: true },
    }),
    // 최근 5 도트용 — 대회 FINISHED 매치 (세트 스코어 기준 W/L)
    prisma.match.findMany({
      where: { league },
      select: { status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true },
    }),
  ]);
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const multi = groups.length > 1;

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=volleyball" className="hover:underline">배구 라이브 스코어</Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{name} 순위표</span>
      </nav>

      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 순위표</h1>
        <p className="text-sm text-neutral-500 mt-2 break-keep">
          승점 · 승패 · 세트 득실 — TheSports 공식 순위, 경기 종료 후 자동 갱신
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 dark:border-white/10 px-5 py-10 text-center text-sm text-neutral-500 break-keep">
          순위 데이터 수집 중입니다. 잠시 후 다시 확인해주세요.
        </p>
      ) : (
        <div className={multi ? "grid sm:grid-cols-2 gap-4" : "space-y-4"}>
          {groups.map((g) => (
            <section key={g.name} className="rounded-2xl border border-neutral-200 dark:border-white/10 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:hover:bg-white/[0.02]">
              {multi && (
                <h2 className="px-4 py-2.5 text-sm font-black bg-neutral-50 dark:bg-white/[0.04] border-b border-neutral-200 dark:border-white/10">
                  {g.name}
                </h2>
              )}
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-neutral-400">
                    <th className="text-right py-2 pl-3 pr-2 font-semibold w-8">#</th>
                    <th className="text-left py-2 px-2 font-semibold">팀</th>
                    <th className="text-center py-2 px-1 font-semibold w-10">경기</th>
                    <th className="text-center py-2 px-1 font-semibold w-8">승</th>
                    <th className="text-center py-2 px-1 font-semibold w-8">패</th>
                    <th className="text-center py-2 px-1 font-semibold w-14">세트 +/-</th>
                    <th className="text-center py-2 px-1 font-semibold w-16 hidden sm:table-cell">최근 5</th>
                    <th className="text-right py-2 pr-3 pl-1 font-semibold w-12">승점</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const t = teamMap.get(r.ourTeamId);
                    if (!t) return null;
                    const sd = r.setsWin - r.setsLoss;
                    return (
                      <tr key={r.ourTeamId} className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                        <td className="text-right py-2 pl-3 pr-2 tabular-nums text-neutral-500 font-bold">{r.position}</td>
                        <td className="py-2 px-2">
                          <span className="flex items-center gap-2">
                            {t.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                            )}
                            <span className="font-semibold truncate max-w-[150px] sm:max-w-none">
                              {toKoreanTeamName(t.name, league)}
                            </span>
                          </span>
                        </td>
                        <td className="text-center py-2 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                        <td className="text-center py-2 px-1 tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                        <td className="text-center py-2 px-1 tabular-nums text-rose-500">{r.losses}</td>
                        <td className={`text-center py-2 px-1 tabular-nums font-semibold ${sd > 0 ? "text-emerald-600 dark:text-emerald-400" : sd < 0 ? "text-rose-500" : "text-neutral-500"}`}>
                          {r.setsWin}:{r.setsLoss}
                        </td>
                        <td className="text-center py-2 px-1 hidden sm:table-cell">
                          <RecentFormDots form={getRecentForm(vbMatches, r.ourTeamId, 5)} size="sm" />
                        </td>
                        <td className="text-right py-2 pr-3 pl-1 tabular-nums font-black text-base">{r.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      <div className="text-[11px] text-neutral-400 text-center pt-2">
        ⓘ 세트 +/- = 세트 득실 (승:패). 순위 산정은 대회 규정(승점→승수→세트율) 기준.
      </div>
    </div>
  );
}


// ── NHL 순위 — NHL 공식 API /standings/now (정규시즌, 승 2점·연장패 1점) ──
// 축구식 calcStandings(승×3·무×1)와 승점 체계가 달라 공식 기록을 그대로 렌더.
// 표 컬럼도 NHL 식: 경기·승·패·연장패(OTL)·득점·실점·득실·승점 ('무' 없음).
function nhlNormName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatNhlSeason(s: string): string {
  // "20252026" → "2025-26"
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
  return s;
}

async function NhlStandings({ name }: { name: string }) {
  const std = await fetchNhlStandings();
  if (!std || std.rows.length === 0) {
    return (
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <AmbientGlow />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 순위표</h1>
        <p className="mt-3 text-sm text-neutral-500 break-keep">
          순위 데이터 수집 중입니다. 잠시 후 다시 확인해주세요.
        </p>
      </div>
    );
  }
  const seasonLabel = formatNhlSeason(std.season);

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

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "라이브 스코어", item: "https://www.scorebase.kr/scores" },
      { "@type": "ListItem", position: 2, name: "NHL", item: "https://www.scorebase.kr/leagues/NHL" },
      { "@type": "ListItem", position: 3, name: "순위표", item: "https://www.scorebase.kr/standings/NHL" },
    ],
  };

  // 시즌 리더보드 (골·어시·포인트·세이브%) — 데이터 있을 때만.
  const { rowsByCategory: nhlLeaders, season: nhlLeaderSeason } = await loadLeagueLeaderboard("NHL");
  const hasNhlLeaders = Object.keys(nhlLeaders).length > 0;

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=hockey" className="hover:underline">
          라이브 스코어
        </Link>
        <span>›</span>
        <Link href="/leagues/NHL" className="hover:underline">
          {name}
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">순위표</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">NHL 순위표</h1>
          <p className="text-sm text-neutral-500 mt-2 break-keep">
            {seasonLabel} 정규시즌 · 32팀 · NHL 공식 기록 (승 2점 · 연장패 1점)
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/predictions/NHL"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-600 dark:text-amber-400 hover:underline"
          >
            <Trophy className="h-4 w-4" aria-hidden /> AI 예측 →
          </Link>
          <Link
            href="/injuries/NHL"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-600 dark:text-rose-400 hover:underline"
          >
            <HeartPulse className="h-4 w-4" aria-hidden /> 부상자 →
          </Link>
        </div>
      </header>

      <div className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10">
              <th className="text-right py-2 pl-3 pr-2 font-semibold">#</th>
              <th className="text-left py-2 px-2 font-semibold">팀</th>
              <th className="text-center py-2 px-2 font-semibold w-10">경기</th>
              <th className="text-center py-2 px-2 font-semibold w-10">승</th>
              <th className="text-center py-2 px-2 font-semibold w-10">패</th>
              <th className="text-center py-2 px-2 font-semibold w-12">연장패</th>
              <th className="text-center py-2 px-2 font-semibold w-12 hidden sm:table-cell">득점</th>
              <th className="text-center py-2 px-2 font-semibold w-12 hidden sm:table-cell">실점</th>
              <th className="text-center py-2 px-2 font-semibold w-12">득실</th>
              <th className="text-right py-2 pr-3 pl-2 font-semibold w-12">승점</th>
            </tr>
          </thead>
          <tbody>
            {std.rows.map((r, i) => {
              const db = findTeam(r);
              const ko = db ? toKoreanTeamName(db.name, "NHL") : r.name;
              const gd = r.goalDiff;
              return (
                <tr
                  key={r.abbrev}
                  className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                >
                  <td className="text-right py-2 pl-3 pr-2 tabular-nums text-neutral-500 font-bold">
                    {i + 1}
                  </td>
                  <td className="py-2 px-2">
                    {db ? (
                      <Link
                        href={`/teams/${db.id}`}
                        prefetch={false}
                        className="flex items-center gap-2 hover:underline"
                      >
                        {db.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={db.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                        )}
                        <span className="font-semibold truncate max-w-[160px] sm:max-w-none">{ko}</span>
                      </Link>
                    ) : (
                      <span className="font-semibold">{ko}</span>
                    )}
                  </td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-600 dark:text-neutral-400">{r.gamesPlayed}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-rose-500">{r.losses}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-500">{r.otLosses}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300 hidden sm:table-cell">{r.goalFor}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300 hidden sm:table-cell">{r.goalAgainst}</td>
                  <td className={`text-center py-2 px-2 tabular-nums font-semibold ${gd > 0 ? "text-emerald-600 dark:text-emerald-400" : gd < 0 ? "text-rose-500" : "text-neutral-500"}`}>
                    {gd > 0 ? `+${gd}` : gd}
                  </td>
                  <td className="text-right py-2 pr-3 pl-2 tabular-nums font-black text-base">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <div className="text-[11px] text-neutral-400 text-center pt-2">
        ⓘ 승점 = 승 2점 + 연장·슛아웃 패 1점. NHL 공식 기록 기준 · 경기 종료 후 자동 갱신.
      </div>

      {hasNhlLeaders && (
        <section className="space-y-3 pt-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">NHL 시즌 리더보드</h2>
          <LeagueLeaderBoard league="NHL" season={nhlLeaderSeason} rowsByCategory={nhlLeaders} />
        </section>
      )}
    </div>
  );
}
