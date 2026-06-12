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

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ league: string }>;
}

const VALID = new Set<string>([
  ...SOCCER_LEAGUES,
  "NBA",
  "WNBA",
  "NHL",
  "KBO",
  "NPB",
  "MLB",
  "CPBL",
]);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase();
  const name = LEAGUE_DISPLAY[upper] ?? upper;
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <h1 className="text-2xl font-black tracking-tight mb-2">{name} 순위표</h1>
          <p className="text-sm text-neutral-500">시즌 매치 데이터가 아직 수집되지 않았습니다.</p>
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

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
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
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{name} 순위표</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {rows!.length}팀 · 시즌 진행 중 · {source === "ts" ? "TheSports 실시간 갱신" : "FINISHED 매치 기반 계산"}
        </p>
      </header>

      <div className="overflow-x-auto -mx-3 sm:mx-0">
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
                  className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] target:bg-amber-50 dark:target:bg-amber-500/10 scroll-mt-24 transition"
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

      <div className="text-[11px] text-neutral-400 text-center pt-2">
        ⓘ FINISHED 매치만 집계. SCHEDULED/POSTPONED 제외.
      </div>
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
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">라이브 스코어</Link>
        <span>›</span>
        <Link href="/leagues/WORLD_CUP" className="hover:underline">{name}</Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">조별 순위</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{name} 조별 순위</h1>
          <p className="text-sm text-neutral-500 mt-1">
            48개국 12개 조 · 조별리그 {playedTotal}경기 종료 · 경기 종료 시 자동 갱신
          </p>
        </div>
        <Link
          href="/predictions/WORLD_CUP"
          className="text-sm font-bold text-amber-600 dark:text-amber-400 hover:underline shrink-0"
        >
          🏆 우승 확률 시뮬레이션 →
        </Link>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {groupKeys.map((g) => (
          <section key={g} className="rounded-2xl border border-neutral-200 dark:border-white/10 overflow-hidden">
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
                      className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition"
                      style={stripe ? { boxShadow: `inset 3px 0 0 0 ${stripe}` } : undefined}
                      title={i < 2 ? "32강 직행권" : i === 2 ? "3위 — 상위 8팀 32강 진출 가능" : undefined}
                    >
                      <td className="text-right py-2 pl-3 pr-1 tabular-nums text-neutral-500 font-bold">{i + 1}</td>
                      <td className="py-2 px-1.5">
                        <Link href={`/teams/${r.teamId}`} prefetch={false} className="flex items-center gap-2 hover:underline">
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
