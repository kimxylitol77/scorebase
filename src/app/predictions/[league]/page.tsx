import { prisma } from "@/lib/db";
import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcWinProbability } from "@/lib/predict/win-probability";
import { runMonteCarlo } from "@/lib/predict/monte-carlo";
import { simulateWorldCup } from "@/lib/predict/world-cup-simulation";
import { buildWorldCupSeedTable } from "@/lib/predict/world-cup-elos";
import type { PredictMatch } from "@/lib/predict/types";
import MonteCarloBar from "@/components/charts/MonteCarloBar";
import LeagueBadge from "@/components/LeagueBadge";
import UclBracket from "@/components/UclBracket";
import { buildUclBracket } from "@/lib/predict/ucl-bracket";
import NbaPlayoffBracket from "@/components/NbaPlayoffBracket";
import { getNbaPlayoffBracket } from "@/lib/predict/nba-playoffs";
import { simulatePlayoff } from "@/lib/predict/playoff-mc";
import { toKoreanTeamName } from "@/lib/team-names";

export const dynamic = "force-dynamic";

const VALID = [
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
  "NBA",
  "NHL",
  "MLB",
  "KBO",
  "NPB",
  "LOL",
] as const;
type ValidLeague = (typeof VALID)[number];

const LEAGUE_INFO: Record<
  ValidLeague,
  {
    name: string;
    subtitle: string;
    gradient: string;
    relegationCount: number;
    showDraw: boolean;
  }
> = {
  EPL: {
    name: "프리미어리그",
    subtitle: "English Premier League — 시즌 시뮬레이션",
    gradient: "from-purple-600 via-fuchsia-500 to-pink-500",
    relegationCount: 3,
    showDraw: true,
  },
  NBA: {
    name: "NBA",
    subtitle: "National Basketball Association — 시즌 시뮬레이션",
    gradient: "from-orange-500 via-amber-500 to-yellow-500",
    relegationCount: 0,
    showDraw: false,
  },
  NHL: {
    name: "NHL",
    subtitle: "National Hockey League — 시즌 시뮬레이션",
    gradient: "from-cyan-500 via-blue-600 to-indigo-700",
    relegationCount: 0,
    showDraw: false,
  },
  MLB: {
    name: "MLB",
    subtitle: "Major League Baseball — 시즌 시뮬레이션",
    gradient: "from-emerald-500 via-green-600 to-teal-700",
    relegationCount: 0,
    showDraw: false,
  },
  LALIGA: {
    name: "라리가",
    subtitle: "La Liga — 시즌 시뮬레이션",
    gradient: "from-amber-500 via-red-600 to-yellow-500",
    relegationCount: 3,
    showDraw: true,
  },
  BUNDESLIGA: {
    name: "분데스리가",
    subtitle: "Bundesliga — 시즌 시뮬레이션",
    gradient: "from-yellow-400 via-red-600 to-slate-900",
    relegationCount: 3,
    showDraw: true,
  },
  SERIE_A: {
    name: "세리에 A",
    subtitle: "Serie A — 시즌 시뮬레이션",
    gradient: "from-sky-500 via-blue-700 to-emerald-600",
    relegationCount: 3,
    showDraw: true,
  },
  LIGUE_1: {
    name: "리그 1",
    subtitle: "Ligue 1 — 시즌 시뮬레이션",
    gradient: "from-blue-700 via-rose-600 to-indigo-600",
    relegationCount: 2,
    showDraw: true,
  },
  MLS: {
    name: "MLS",
    subtitle: "Major League Soccer — 시즌 시뮬레이션",
    gradient: "from-red-600 via-slate-900 to-blue-700",
    relegationCount: 0,
    showDraw: true,
  },
  UCL: {
    name: "챔피언스리그",
    subtitle: "UEFA Champions League — 시즌 시뮬레이션",
    gradient: "from-indigo-700 via-blue-600 to-cyan-500",
    relegationCount: 0,
    showDraw: true,
  },
  WORLD_CUP: {
    name: "FIFA 월드컵 2026",
    subtitle: "북중미 월드컵 — 토너먼트 시뮬레이션",
    gradient: "from-amber-500 via-rose-500 to-fuchsia-600",
    relegationCount: 0,
    showDraw: true,
  },
  KBO: {
    name: "KBO",
    subtitle: "한국프로야구 — 시즌 시뮬레이션",
    gradient: "from-blue-600 via-indigo-600 to-rose-500",
    relegationCount: 0,
    showDraw: false,
  },
  NPB: {
    name: "NPB",
    subtitle: "일본프로야구 — 시즌 시뮬레이션",
    gradient: "from-red-600 via-rose-500 to-pink-500",
    relegationCount: 0,
    showDraw: false,
  },
  LOL: {
    name: "LCK",
    subtitle: "리그 오브 레전드 한국 — Elo 기반 매치 승률",
    gradient: "from-rose-500 via-fuchsia-600 to-indigo-600",
    relegationCount: 0,
    showDraw: false,
  },
};

interface Props {
  params: Promise<{ league: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!VALID.includes(upper as ValidLeague)) return { title: "Not Found" };
  const info = LEAGUE_INFO[upper as ValidLeague];
  return {
    title: `${info.name} 예측`,
    description: `${info.subtitle}. Monte Carlo 시즌 시뮬레이션 + 다가오는 경기 승률.`,
  };
}

export default async function LeaguePredictions({ params }: Props) {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!VALID.includes(upper as ValidLeague)) notFound();
  const info = LEAGUE_INFO[upper as ValidLeague];

  const dbMatches = await prisma.match.findMany({
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
  const matches: PredictMatch[] = dbMatches.map((m) => ({ ...m }));
  const teams = await prisma.team.findMany({ where: { league: upper } });
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const teamLogoById = new Map<number, string | null>(
    teams.map((t) => [t.id, t.logoUrl ?? null]),
  );
  // 표시용 한글 이름 (월드컵 시드/Elo lookup 은 영문 그대로 써야 하므로 분리).
  const teamKoNameById = new Map(
    teams.map((t) => [t.id, toKoreanTeamName(t.name)]),
  );

  // 시뮬레이션 실행
  const finishedCount = matches.filter((m) => m.status === "FINISHED").length;
  const scheduledCount = matches.filter((m) => m.status === "SCHEDULED").length;

  // 월드컵은 외부 시드 Elo 를 쓰므로 finished 0 이어도 시뮬 가능
  const isWorldCup = upper === "WORLD_CUP";
  const canSimulate = isWorldCup ? teams.length >= 32 : finishedCount >= 20;

  let mc: ReturnType<typeof runMonteCarlo> = [];
  let wc: ReturnType<typeof simulateWorldCup> = [];
  if (canSimulate) {
    if (isWorldCup) {
      wc = simulateWorldCup(teamNameById, 5000);
    } else {
      mc = runMonteCarlo(matches, upper, {
        iterations: 5000,
        relegationCount: info.relegationCount,
      });
    }
  }

  // 다가오는 경기 (다음 7일 — 월드컵은 개막까지 한 달 가까이 남아 14일로 확장)
  const now = new Date();
  const horizonDays = isWorldCup ? 14 : 7;
  const horizon = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const upcoming = await prisma.match.findMany({
    where: {
      league: upper,
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
    take: 12,
  });

  // 월드컵은 클럽 매치 데이터가 없으니 시드 Elo 를 직접 사용
  const elo = isWorldCup
    ? buildWorldCupSeedTable(teamNameById)
    : calcEloTable(matches);

  // UCL — knockout-stage 브래킷 빌드 (raw 필요해 별도 fetch)
  const isUcl = upper === "UCL";
  let uclBracket: ReturnType<typeof buildUclBracket> = [];
  if (isUcl) {
    const knockoutMatches = await prisma.match.findMany({
      where: { league: "UCL" },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { startTime: "asc" },
    });
    uclBracket = buildUclBracket(knockoutMatches);
  }

  // NBA/NHL — 플레이오프 브라켓 (raw 의 series.type='playoff' 매치만)
  const isNba = upper === "NBA";
  const isNhl = upper === "NHL";
  const isUsPlayoff = isNba || isNhl;
  let playoffBracket: ReturnType<typeof getNbaPlayoffBracket> = [];
  let playoffWinProbs: ReturnType<typeof simulatePlayoff> = [];
  if (isUsPlayoff) {
    const recentMatches = await prisma.match.findMany({
      where: {
        league: upper,
        startTime: { gte: new Date(Date.now() - 60 * 24 * 3600 * 1000) }, // 최근 60일
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { startTime: "asc" },
    });
    playoffBracket = getNbaPlayoffBracket(recentMatches);
    // 플레이오프 우승 시뮬레이션 — 진행 중 시리즈 잔여 + 미시작 라운드 5000회 Monte Carlo
    if (playoffBracket.length > 0 && !isWorldCup) {
      const eloMap: Record<number, number> = {};
      for (const [tid, rating] of elo.ratings) eloMap[tid] = rating;
      playoffWinProbs = simulatePlayoff(playoffBracket, eloMap, {
        iterations: 5000,
      });
    }
  }

  return (
    <div>
      {/* 히어로 */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
        <div
          className={`absolute inset-0 -z-10 bg-gradient-to-br ${info.gradient} opacity-10 dark:opacity-15`}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="text-[11px] font-bold tracking-[0.2em] uppercase text-neutral-500 mb-2">
            Predictions · Monte Carlo Simulation
          </div>
          <div className="flex items-center gap-3 mb-2">
            <LeagueBadge league={upper} size="md" />
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              {info.name} 예측
            </h1>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 max-w-xl">
            {info.subtitle}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-500">
            <span>완료 {finishedCount}경기</span>
            <span className="text-neutral-300">·</span>
            <span>예정 {scheduledCount}경기</span>
            {canSimulate && (
              <>
                <span className="text-neutral-300">·</span>
                <span>5,000회 시뮬레이션 기반</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 리그 탭 (카테고리별 그룹) */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center gap-x-2 gap-y-2">
        <PredTab l="WORLD_CUP" active={"WORLD_CUP" === upper} />
        <span className="mx-2 text-neutral-300 dark:text-neutral-700">|</span>
        {(
          ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL"] as const
        ).map((l) => (
          <PredTab key={l} l={l} active={l === upper} />
        ))}
        <span className="mx-2 text-neutral-300 dark:text-neutral-700">|</span>
        <PredTab l="NBA" active={"NBA" === upper} />
        <span className="mx-2 text-neutral-300 dark:text-neutral-700">|</span>
        <PredTab l="MLB" active={"MLB" === upper} />
        <PredTab l="KBO" active={"KBO" === upper} />
        <PredTab l="NPB" active={"NPB" === upper} />
        <span className="mx-2 text-neutral-300 dark:text-neutral-700">|</span>
        <PredTab l="NHL" active={"NHL" === upper} />
        <span className="mx-2 text-neutral-300 dark:text-neutral-700">|</span>
        <PredTab l="LOL" active={"LOL" === upper} />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 space-y-12">
        {/* 데이터 부족 안내 */}
        {!canSimulate && (
          <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-12 text-center">
            <p className="text-lg font-semibold">
              시뮬레이션에 필요한 데이터가 부족합니다
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              현재 완료된 매치 {finishedCount}경기. 시즌이 진행될수록 정확도가
              올라갑니다.
            </p>
          </div>
        )}

        {/* 월드컵 — 토너먼트 시뮬레이션 결과 */}
        {canSimulate && isWorldCup && wc.length > 0 && (
          <>
            <section>
              <Heading
                title="우승 확률"
                subtitle="48개국 5,000회 토너먼트 시뮬레이션 (시드 Elo 기반)"
              />
              <MonteCarloBar
                data={wc
                  .filter((r) => r.champion >= 0.001)
                  .slice(0, 14)
                  .map((r) => ({
                    name: toKoreanTeamName(r.teamName),
                    value: r.champion * 100,
                  }))}
              />
            </section>

            <section>
              <Heading
                title="결승 진출 확률"
                subtitle="우승 또는 준우승할 가능성"
              />
              <MonteCarloBar
                data={wc
                  .filter((r) => r.final >= 0.005)
                  .sort((a, b) => b.final - a.final)
                  .slice(0, 14)
                  .map((r) => ({ name: toKoreanTeamName(r.teamName), value: r.final * 100 }))}
              />
            </section>

            <section>
              <Heading
                title="4강 진출 확률"
                subtitle="준결승 진출 가능성"
              />
              <MonteCarloBar
                data={wc
                  .filter((r) => r.sf >= 0.01)
                  .sort((a, b) => b.sf - a.sf)
                  .slice(0, 16)
                  .map((r) => ({ name: toKoreanTeamName(r.teamName), value: r.sf * 100 }))}
              />
            </section>

            <section>
              <Heading
                title="조별예선 통과 확률 (32강)"
                subtitle="각 조 1·2위 + 3위 중 상위 8팀 진출"
              />
              <WorldCupGroupTable rows={wc} />
            </section>
          </>
        )}

        {/* UCL — knockout 브래킷 */}
        {isUcl && (
          <section>
            <Heading
              title="UCL 토너먼트 브래킷"
              subtitle="16강 → 8강 → 4강 → 결승 (2-leg 합산 진출)"
            />
            <UclBracket series={uclBracket} />
          </section>
        )}

        {/* NBA/NHL — 플레이오프 브라켓 */}
        {isUsPlayoff && playoffBracket.length > 0 && (
          <section>
            <Heading
              title={isNhl ? "NHL 플레이오프 브라켓" : "NBA 플레이오프 브라켓"}
              subtitle={
                isNhl
                  ? "1라운드 → 2라운드 → 컨퍼런스 파이널 → 스탠리컵 파이널 (BO7, 4선승)"
                  : "1라운드 → 컨퍼런스 세미 → 컨퍼런스 파이널 → 파이널 (BO7, 4선승)"
              }
            />
            <NbaPlayoffBracket
              series={playoffBracket}
              league={isNhl ? "NHL" : "NBA"}
            />
          </section>
        )}

        {/* NBA/NHL — 플레이오프 우승 시뮬레이션 (Monte Carlo 5000회) */}
        {isUsPlayoff && playoffWinProbs.length > 0 && (
          <section>
            <Heading
              title={isNhl ? "스탠리컵 우승 확률" : "NBA 우승 확률"}
              subtitle="진행 중 시리즈 잔여 + 미시작 라운드 Monte Carlo 5,000회 (Elo 기반)"
            />
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400">
                  <tr className="border-b border-neutral-200 dark:border-neutral-800">
                    <th className="text-left px-3 py-2 font-medium">팀</th>
                    <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">컨파</th>
                    <th className="text-right px-2 py-2 font-medium">결승</th>
                    <th className="text-right px-3 py-2 font-medium">우승</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {playoffWinProbs.filter((p) => p.champion >= 0.001 || p.confFinals >= 0.05).map((p) => (
                    <tr key={p.teamId} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition">
                      <td className="px-3 py-2 flex items-center gap-2 min-w-0">
                        <span
                          className={`text-[9px] font-bold px-1 rounded ${
                            p.conference === "EAST"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                          }`}
                        >
                          {p.conference === "EAST" ? "동" : "서"}
                        </span>
                        {p.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                        )}
                        <span className="truncate font-medium">
                          {p.shortName || toKoreanTeamName(p.teamName)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">
                        {(p.confFinals * 100).toFixed(0)}%
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                        {(p.finals * 100).toFixed(0)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`inline-block tabular-nums font-bold ${
                            p.champion >= 0.2
                              ? "text-emerald-600 dark:text-emerald-400"
                              : p.champion >= 0.05
                                ? "text-neutral-900 dark:text-white"
                                : "text-neutral-400"
                          }`}
                        >
                          {(p.champion * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 일반 리그 — Monte Carlo 결과 (UCL 제외) */}
        {canSimulate && !isWorldCup && !isUcl && (
          <>
            {/* 우승 확률 */}
            <section>
              <Heading title="우승 확률" subtitle="시즌 종료 시점 1위 차지 가능성" />
              <MonteCarloBar
                data={mc
                  .filter((r) => r.champion >= 0.001)
                  .slice(0, 12)
                  .map((r) => ({
                    name: teamKoNameById.get(r.teamId) ?? `Team ${r.teamId}`,
                    value: r.champion * 100,
                  }))}
              />
            </section>

            {/* 챔스(Top 4) 확률 */}
            {info.relegationCount > 0 && (
              <section>
                <Heading
                  title="Top 4 (UCL) 진출 확률"
                  subtitle="시즌 종료 시점 4위 이상"
                />
                <MonteCarloBar
                  data={mc
                    .filter((r) => r.top4 >= 0.01)
                    .slice(0, 14)
                    .map((r) => ({
                      name: teamKoNameById.get(r.teamId) ?? `Team ${r.teamId}`,
                      value: r.top4 * 100,
                    }))}
                />
              </section>
            )}

            {/* 강등 확률 */}
            {info.relegationCount > 0 && (
              <section>
                <Heading
                  title={`강등 확률 (하위 ${info.relegationCount}팀)`}
                  subtitle="시즌 종료 시점 강등권"
                />
                <MonteCarloBar
                  data={mc
                    .filter((r) => r.relegation >= 0.005)
                    .sort((a, b) => b.relegation - a.relegation)
                    .slice(0, 8)
                    .map((r) => ({
                      name: teamKoNameById.get(r.teamId) ?? `Team ${r.teamId}`,
                      value: r.relegation * 100,
                    }))}
                  variant="danger"
                />
              </section>
            )}

            {/* 예상 최종 순위 표 */}
            <section>
              <Heading
                title="예상 최종 순위"
                subtitle="평균 승점 · 평균 순위"
              />
              <ProjectionsTable
                rows={mc.map((r) => ({
                  name: teamKoNameById.get(r.teamId) ?? `Team ${r.teamId}`,
                  logoUrl: teamLogoById.get(r.teamId) ?? null,
                  ...r,
                }))}
              />
            </section>
          </>
        )}

        {/* 다가오는 경기 */}
        {upcoming.length > 0 && (
          <section>
            <Heading
              title="다가오는 경기 — 승률 추정"
              subtitle={`다음 ${horizonDays}일 SCHEDULED 매치`}
            />
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">일시</th>
                    <th className="text-right px-2 py-2.5 font-medium">홈</th>
                    <th className="text-center px-2 py-2.5 font-medium w-10"></th>
                    <th className="text-left px-2 py-2.5 font-medium">원정</th>
                    <th className="text-left px-4 py-2.5 font-medium">승률 (홈/무/원정)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {upcoming.map((m) => {
                    const homeElo = getElo(elo, m.homeTeamId);
                    const awayElo = getElo(elo, m.awayTeamId);
                    const wp = calcWinProbability(homeElo, awayElo, upper);
                    return (
                      <tr key={m.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                        <td className="px-4 py-2.5 text-xs text-neutral-500 tabular-nums">
                          {m.startTime.toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Seoul",
                          })}
                        </td>
                        <td className="px-2 py-2.5 text-right font-medium truncate">
                          <span className="inline-flex items-center gap-2 justify-end">
                            <span className="truncate">
                              {toKoreanTeamName(m.homeTeam.name)}
                            </span>
                            <PredTeamLogo
                              src={m.homeTeam.logoUrl}
                              name={m.homeTeam.name}
                            />
                          </span>
                        </td>
                        <td className="text-center text-xs text-neutral-400">vs</td>
                        <td className="px-2 py-2.5 font-medium truncate">
                          <span className="inline-flex items-center gap-2">
                            <PredTeamLogo
                              src={m.awayTeam.logoUrl}
                              name={m.awayTeam.name}
                            />
                            <span className="truncate">
                              {toKoreanTeamName(m.awayTeam.name)}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <ProbBar wp={wp} hideDraw={!info.showDraw} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="text-[11px] text-neutral-500 leading-relaxed">
          ⓘ Elo 레이팅 + 홈 어드밴티지 기반 통계 추정치 · Monte Carlo 5,000회
          시뮬레이션. 실제 경기 양상과 다를 수 있습니다.
        </div>
      </div>
    </div>
  );
}

const TAB_LABEL: Record<string, string> = {
  EPL: "EPL",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스",
  SERIE_A: "세리에A",
  LIGUE_1: "리그1",
  MLS: "MLS",
  UCL: "챔스",
  WORLD_CUP: "월드컵 2026",
  NBA: "NBA",
  MLB: "MLB",
  KBO: "KBO",
  NPB: "NPB",
  NHL: "NHL",
  LOL: "LCK",
};

function PredTab({ l, active }: { l: string; active: boolean }) {
  return (
    <Link
      href={`/predictions/${l}`}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
      }`}
    >
      {TAB_LABEL[l] ?? l}
    </Link>
  );
}

function Heading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3 mb-5">
      <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h2>
      <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function ProbBar({
  wp,
  hideDraw,
}: {
  wp: { home: number; draw: number; away: number };
  hideDraw: boolean;
}) {
  const h = Math.round(wp.home * 100);
  const d = hideDraw ? 0 : Math.round(wp.draw * 100);
  const a = 100 - h - d;
  return (
    <div className="flex h-5 rounded overflow-hidden ring-1 ring-neutral-200 dark:ring-neutral-700 max-w-[280px]">
      <div
        className="bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center"
        style={{ width: `${h}%` }}
      >
        {h >= 12 && `${h}%`}
      </div>
      {!hideDraw && (
        <div
          className="bg-neutral-400 dark:bg-neutral-600 text-white text-[10px] font-bold flex items-center justify-center"
          style={{ width: `${d}%` }}
        >
          {d >= 12 && `${d}%`}
        </div>
      )}
      <div
        className="bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center"
        style={{ width: `${a}%` }}
      >
        {a >= 12 && `${a}%`}
      </div>
    </div>
  );
}

interface ProjectionRow {
  teamId: number;
  name: string;
  logoUrl?: string | null;
  champion: number;
  top4: number;
  expectedPoints: number;
  expectedPosition: number;
  currentPoints: number;
  currentPosition: number;
}

function ProjectionsTable({ rows }: { rows: ProjectionRow[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium w-10">#</th>
            <th className="text-left px-3 py-2 font-medium">팀</th>
            <th className="text-right px-3 py-2 font-medium">현재 승점</th>
            <th className="text-right px-3 py-2 font-medium">예상 승점</th>
            <th className="text-right px-3 py-2 font-medium">우승 %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {rows.map((r, i) => (
            <tr
              key={r.teamId}
              className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
            >
              <td className="px-3 py-2 font-bold text-neutral-400 tabular-nums">
                {i + 1}
              </td>
              <td className="px-3 py-2 font-medium truncate">
                <span className="inline-flex items-center gap-2">
                  <PredTeamLogo src={r.logoUrl} name={r.name} />
                  <span className="truncate">{r.name}</span>
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                {r.currentPoints}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                {r.expectedPoints.toFixed(1)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.champion >= 0.001
                  ? `${(r.champion * 100).toFixed(1)}%`
                  : "<0.1%"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


interface WorldCupRow {
  teamName: string;
  group: string;
  groupPass: number;
  r16: number;
  qf: number;
  sf: number;
  final: number;
  champion: number;
  expectedPoints: number;
}

function PredTeamLogo({
  src,
  name,
}: {
  src?: string | null;
  name: string;
}) {
  if (!src) {
    return (
      <span
        aria-hidden
        className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[9px] font-bold text-neutral-500"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  // Liquipedia (LCK 로고) hotlink 차단 우회 — Next.js image optimizer 통과
  if (src.includes("liquipedia.net")) {
    return (
      <Image
        src={src}
        alt=""
        width={20}
        height={20}
        className="w-5 h-5 object-contain shrink-0"
      />
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      className="w-5 h-5 object-contain shrink-0"
      loading="lazy"
    />
  );
}

function WorldCupGroupTable({ rows }: { rows: WorldCupRow[] }) {
  // 조별로 묶고 조 내에서 통과 확률 내림차순
  const byGroup = new Map<string, WorldCupRow[]>();
  for (const r of rows) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group)!.push(r);
  }
  const groups = Array.from(byGroup.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [, list] of groups) {
    list.sort((a, b) => b.groupPass - a.groupPass);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {groups.map(([g, list]) => (
        <div
          key={g}
          className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden"
        >
          <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-900 text-xs font-bold tracking-[0.2em] uppercase text-neutral-500">
            Group {g}
          </div>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {list.map((r) => {
              const pct = Math.round(r.groupPass * 100);
              const isKorea =
                /korea/i.test(r.teamName) || r.teamName.includes("한국");
              return (
                <li
                  key={r.teamName}
                  className={`px-3 py-2 flex items-center gap-2 text-sm ${
                    isKorea ? "bg-amber-50 dark:bg-amber-900/20 font-bold" : ""
                  }`}
                >
                  <span className="flex-1 truncate">
                    {isKorea ? "🇰🇷 " : ""}
                    {toKoreanTeamName(r.teamName)}
                  </span>
                  <span className="text-xs tabular-nums text-neutral-500">
                    {r.expectedPoints.toFixed(1)}점
                  </span>
                  <span
                    className={`text-xs tabular-nums font-semibold w-12 text-right ${
                      pct >= 60
                        ? "text-emerald-600 dark:text-emerald-400"
                        : pct >= 30
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-neutral-400"
                    }`}
                  >
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
