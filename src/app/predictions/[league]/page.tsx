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
import { toKoreanPlayerName } from "@/lib/player-names";
import LeagueLeaderBoard, { type LeaderRow } from "@/components/LeagueLeaderBoard";

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
  // 2026-05-17 — 한국·아시아 5개 리그 추가 (DB 50건+)
  "K_LEAGUE_1",
  "K_LEAGUE_2",
  "J1_LEAGUE",
  "J2_LEAGUE",
  "AFC_CL",
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
    subtitle: "잉글랜드 프리미어리그 — 시즌 시뮬레이션",
    gradient: "from-purple-600 via-fuchsia-500 to-pink-500",
    relegationCount: 3,
    showDraw: true,
  },
  NBA: {
    name: "NBA",
    subtitle: "미국 프로농구 — 시즌 시뮬레이션",
    gradient: "from-orange-500 via-amber-500 to-yellow-500",
    relegationCount: 0,
    showDraw: false,
  },
  NHL: {
    name: "NHL",
    subtitle: "북미 아이스하키 — 시즌 시뮬레이션",
    gradient: "from-cyan-500 via-blue-600 to-indigo-700",
    relegationCount: 0,
    showDraw: false,
  },
  MLB: {
    name: "MLB",
    subtitle: "메이저리그 베이스볼 — 시즌 시뮬레이션",
    gradient: "from-emerald-500 via-green-600 to-teal-700",
    relegationCount: 0,
    showDraw: false,
  },
  LALIGA: {
    name: "라리가",
    subtitle: "스페인 라리가 — 시즌 시뮬레이션",
    gradient: "from-amber-500 via-red-600 to-yellow-500",
    relegationCount: 3,
    showDraw: true,
  },
  BUNDESLIGA: {
    name: "분데스리가",
    subtitle: "독일 분데스리가 — 시즌 시뮬레이션",
    gradient: "from-yellow-400 via-red-600 to-slate-900",
    relegationCount: 3,
    showDraw: true,
  },
  SERIE_A: {
    name: "세리에 A",
    subtitle: "이탈리아 세리에 A — 시즌 시뮬레이션",
    gradient: "from-sky-500 via-blue-700 to-emerald-600",
    relegationCount: 3,
    showDraw: true,
  },
  LIGUE_1: {
    name: "리그 1",
    subtitle: "프랑스 리그 1 — 시즌 시뮬레이션",
    gradient: "from-blue-700 via-rose-600 to-indigo-600",
    relegationCount: 2,
    showDraw: true,
  },
  MLS: {
    name: "MLS",
    subtitle: "미국·캐나다 메이저리그 사커 — 시즌 시뮬레이션",
    gradient: "from-red-600 via-slate-900 to-blue-700",
    relegationCount: 0,
    showDraw: true,
  },
  UCL: {
    name: "챔피언스리그",
    subtitle: "유럽 챔피언스리그 — 시즌 시뮬레이션",
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
  K_LEAGUE_1: {
    name: "K리그1",
    subtitle: "한국 프로축구 1부 — 시즌 시뮬레이션",
    gradient: "from-red-600 via-blue-600 to-slate-900",
    relegationCount: 1,
    showDraw: true,
  },
  K_LEAGUE_2: {
    name: "K리그2",
    subtitle: "한국 프로축구 2부 — 시즌 시뮬레이션",
    gradient: "from-slate-600 via-blue-700 to-red-600",
    relegationCount: 0,
    showDraw: true,
  },
  J1_LEAGUE: {
    name: "J1리그",
    subtitle: "일본 프로축구 1부 — 시즌 시뮬레이션",
    gradient: "from-red-600 via-rose-500 to-pink-500",
    relegationCount: 3,
    showDraw: true,
  },
  J2_LEAGUE: {
    name: "J2리그",
    subtitle: "일본 프로축구 2부 — 시즌 시뮬레이션",
    gradient: "from-pink-500 via-rose-400 to-amber-400",
    relegationCount: 2,
    showDraw: true,
  },
  AFC_CL: {
    name: "AFC 챔피언스리그 엘리트",
    subtitle: "아시아 챔피언스리그 엘리트 — Elo 기반 매치 승률",
    gradient: "from-emerald-600 via-teal-600 to-cyan-500",
    relegationCount: 0,
    showDraw: true,
  },
};

interface Props {
  params: Promise<{ league: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!VALID.includes(upper as ValidLeague)) return { title: "찾을 수 없음" };
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
  // NBA — 정규 30팀만 화이트리스트 (DB 에 친선·올스타·국제 팀 9개 섞여 있어 시뮬 노이즈 제거)
  const NBA_REGULAR_30 = new Set([
    "TOR","MIA","NY","CHI","BKN","IND","BOS","HOU","PHI","GS",
    "LAL","CHA","DET","WSH","ATL","CLE","NO","ORL","MIL","SA",
    "DAL","DEN","OKC","MIN","UTAH","MEM","POR","LAC","SAC","PHX",
  ]);
  const rawTeams = await prisma.team.findMany({ where: { league: upper } });
  const teams =
    upper === "NBA"
      ? rawTeams.filter((t) => t.shortName && NBA_REGULAR_30.has(t.shortName))
      : rawTeams;
  // NBA 매치도 30팀 간 매치만 (올스타전·국제 친선 제외)
  const validTeamIds = new Set(teams.map((t) => t.id));
  const matches: PredictMatch[] =
    upper === "NBA"
      ? dbMatches
          .filter((m) => validTeamIds.has(m.homeTeamId) && validTeamIds.has(m.awayTeamId))
          .map((m) => ({ ...m }))
      : dbMatches.map((m) => ({ ...m }));
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const teamLogoById = new Map<number, string | null>(
    teams.map((t) => [t.id, t.logoUrl ?? null]),
  );
  // 표시용 한글 이름 (월드컵 시드/Elo lookup 은 영문 그대로 써야 하므로 분리).
  const teamKoNameById = new Map(
    teams.map((t) => [t.id, toKoreanTeamName(t.name, upper)]),
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

  // 시즌 리더보드 (DB cron 잡이 매일 채움). 카테고리별 그룹화.
  // 한 리그에 여러 시즌 데이터가 누적될 수 있어 최신 시즌만 표시 (중복 노출 방지 — 예: MLS L. Messi 2025-26 + 2026 두 번).
  const allLeaderRows = await prisma.leagueLeader.findMany({
    where: { league: upper },
    orderBy: [{ season: "desc" }, { category: "asc" }, { rank: "asc" }],
    take: 400,
  });
  const latestSeason = allLeaderRows[0]?.season ?? "";
  const leaderRowsRaw = allLeaderRows.filter((r) => r.season === latestSeason);
  const leaderSeason = latestSeason;
  const leaderRowsByCategory: Record<string, LeaderRow[]> = {};
  for (const r of leaderRowsRaw) {
    if (!leaderRowsByCategory[r.category]) leaderRowsByCategory[r.category] = [];
    // 한글 변환 — DB 에 영문으로 들어와 있는 행은 사전 lookup. 이미 한글이면 그대로.
    const localizedPlayer = toKoreanPlayerName(r.playerName);
    const localizedTeam = toKoreanTeamName(r.teamName, upper);
    leaderRowsByCategory[r.category].push({
      rank: r.rank,
      playerName: localizedPlayer,
      playerNameEn: r.playerNameEn ?? r.playerName,
      teamName: localizedTeam,
      teamShort: r.teamShort,
      value: r.value,
      unit: r.unit,
      appearances: r.appearances,
      photoUrl: r.photoUrl,
      externalId: r.externalId,
    });
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

      {/* 리그 탭 — 한 화면에 모두 보이게 flex-wrap (모바일도 옆으로 스크롤 없이) */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 sm:gap-x-1.5 sm:gap-y-2">
          <PredTab l="WORLD_CUP" active={"WORLD_CUP" === upper} />
          <CategoryDot />
          {/* 축구 — 한국 시청자 우선 (한국·아시아 → 유럽 → 북미) */}
          {(
            [
              "K_LEAGUE_1", "K_LEAGUE_2",
              "J1_LEAGUE", "J2_LEAGUE",
              "AFC_CL",
              "UCL", "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS",
            ] as const
          ).map((l) => (
            <PredTab key={l} l={l} active={l === upper} />
          ))}
          <CategoryDot />
          <PredTab l="NBA" active={"NBA" === upper} />
          <CategoryDot />
          <PredTab l="KBO" active={"KBO" === upper} />
          <PredTab l="NPB" active={"NPB" === upper} />
          <PredTab l="MLB" active={"MLB" === upper} />
          <CategoryDot />
          <PredTab l="NHL" active={"NHL" === upper} />
          <CategoryDot />
          <PredTab l="LOL" active={"LOL" === upper} />
        </div>
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
              <div className="sm:max-w-xl">
                <MonteCarloBar
                  data={wc
                    .filter((r) => r.champion >= 0.001)
                    .slice(0, 14)
                    .map((r) => ({
                      name: toKoreanTeamName(r.teamName, upper),
                      value: r.champion * 100,
                    }))}
                />
              </div>
            </section>

            <section>
              <Heading
                title="결승 진출 확률"
                subtitle="우승 또는 준우승할 가능성"
              />
              <div className="sm:max-w-xl">
                <MonteCarloBar
                  data={wc
                    .filter((r) => r.final >= 0.005)
                    .sort((a, b) => b.final - a.final)
                    .slice(0, 14)
                    .map((r) => ({ name: toKoreanTeamName(r.teamName, upper), value: r.final * 100 }))}
                />
              </div>
            </section>

            <section>
              <Heading
                title="4강 진출 확률"
                subtitle="준결승 진출 가능성"
              />
              <div className="sm:max-w-xl">
                <MonteCarloBar
                  data={wc
                    .filter((r) => r.sf >= 0.01)
                    .sort((a, b) => b.sf - a.sf)
                    .slice(0, 16)
                    .map((r) => ({ name: toKoreanTeamName(r.teamName, upper), value: r.sf * 100 }))}
                />
              </div>
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
                        <Link
                          href={`/teams/${p.teamId}`}
                          className="truncate font-medium hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition"
                        >
                          {p.shortName || toKoreanTeamName(p.teamName, upper)}
                        </Link>
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
              <div className="sm:max-w-xl">
                <MonteCarloBar
                  data={mc
                    .filter((r) => r.champion >= 0.001)
                    .slice(0, 12)
                    .map((r) => ({
                      name: teamKoNameById.get(r.teamId) ?? `Team ${r.teamId}`,
                      value: r.champion * 100,
                    }))}
                />
              </div>
            </section>

            {/* 챔스(Top 4) 확률 */}
            {info.relegationCount > 0 && (
              <section>
                <Heading
                  title="Top 4 (UCL) 진출 확률"
                  subtitle="시즌 종료 시점 4위 이상"
                />
                <div className="sm:max-w-xl">
                  <MonteCarloBar
                    data={mc
                      .filter((r) => r.top4 >= 0.01)
                      .slice(0, 14)
                      .map((r) => ({
                        name: teamKoNameById.get(r.teamId) ?? `Team ${r.teamId}`,
                        value: r.top4 * 100,
                      }))}
                  />
                </div>
              </section>
            )}

            {/* 강등 확률 */}
            {info.relegationCount > 0 && (
              <section>
                <Heading
                  title={`강등 확률 (하위 ${info.relegationCount}팀)`}
                  subtitle="시즌 종료 시점 강등권"
                />
                <div className="sm:max-w-xl">
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
                </div>
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
            {/* 데스크탑: 테이블 — table-fixed + 컬럼 너비 재분배로 좌우 벌어짐 fix */}
            <div className="hidden sm:block rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-32" />
                  <col />
                  <col className="w-10" />
                  <col />
                  <col className="w-[44%]" />
                </colgroup>
                <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">일시</th>
                    <th className="text-right px-2 py-2.5 font-medium">홈</th>
                    <th className="text-center px-1 py-2.5 font-medium"></th>
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
                        <td className="px-4 py-2.5 text-xs text-neutral-500 tabular-nums whitespace-nowrap">
                          {m.startTime.toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Seoul",
                          })}
                        </td>
                        <td className="px-2 py-2.5 font-medium">
                          <Link
                            href={`/teams/${m.homeTeam.id}`}
                            className="flex items-center gap-2 justify-end hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition min-w-0"
                          >
                            <span className="truncate">
                              {toKoreanTeamName(m.homeTeam.name, upper)}
                            </span>
                            <PredTeamLogo
                              src={m.homeTeam.logoUrl}
                              name={m.homeTeam.name}
                            />
                          </Link>
                        </td>
                        <td className="text-center text-xs text-neutral-400">vs</td>
                        <td className="px-2 py-2.5 font-medium">
                          <Link
                            href={`/teams/${m.awayTeam.id}`}
                            className="flex items-center gap-2 hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition min-w-0"
                          >
                            <PredTeamLogo
                              src={m.awayTeam.logoUrl}
                              name={m.awayTeam.name}
                            />
                            <span className="truncate">
                              {toKoreanTeamName(m.awayTeam.name, upper)}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <ProbBar wp={wp} hideDraw={!info.showDraw} fullWidth />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일: 카드 layout */}
            <div className="sm:hidden rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 overflow-hidden">
              {upcoming.map((m) => {
                const homeElo = getElo(elo, m.homeTeamId);
                const awayElo = getElo(elo, m.awayTeamId);
                const wp = calcWinProbability(homeElo, awayElo, upper);
                const kst = new Date(m.startTime.getTime() + 9 * 3600 * 1000);
                const dateLabel = `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
                const timeLabel = `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
                return (
                  <div key={m.id} className="px-3 py-3 space-y-2">
                    <div className="text-[11px] text-neutral-500 tabular-nums whitespace-nowrap">
                      {dateLabel} · {timeLabel}
                    </div>
                    {/* 홈팀(왼쪽 끝) - vs(가운데) - 원정팀(오른쪽 끝) — ProbBar 좌우 끝과 정렬 */}
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                      <Link
                        href={`/teams/${m.homeTeam.id}`}
                        className="flex items-center gap-1.5 min-w-0 font-medium hover:text-blue-600 dark:hover:text-blue-400 transition justify-start"
                      >
                        <PredTeamLogo
                          src={m.homeTeam.logoUrl}
                          name={m.homeTeam.name}
                        />
                        <span className="truncate">
                          {toKoreanTeamName(m.homeTeam.name, upper)}
                        </span>
                      </Link>
                      <span className="text-[10px] text-neutral-400 shrink-0 px-1">
                        vs
                      </span>
                      <Link
                        href={`/teams/${m.awayTeam.id}`}
                        className="flex items-center gap-1.5 min-w-0 font-medium hover:text-blue-600 dark:hover:text-blue-400 transition justify-end text-right"
                      >
                        <span className="truncate">
                          {toKoreanTeamName(m.awayTeam.name, upper)}
                        </span>
                        <PredTeamLogo
                          src={m.awayTeam.logoUrl}
                          name={m.awayTeam.name}
                        />
                      </Link>
                    </div>
                    <ProbBar wp={wp} hideDraw={!info.showDraw} fullWidth />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 시즌 리더보드 — 득점/도움/카드 (축구), 향후 종목별 카테고리 확장 */}
        {leaderRowsRaw.length > 0 && (
          <section>
            <Heading
              title="시즌 리더보드"
              subtitle={`${leaderSeason} 시즌 · TOP 10 (매일 자동 갱신)`}
            />
            <LeagueLeaderBoard
              league={upper}
              season={leaderSeason}
              rowsByCategory={leaderRowsByCategory}
            />
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
  K_LEAGUE_1: "K리그1",
  K_LEAGUE_2: "K리그2",
  J1_LEAGUE: "J1",
  J2_LEAGUE: "J2",
  AFC_CL: "ACL 엘리트",
};

function PredTab({ l, active }: { l: string; active: boolean }) {
  return (
    <Link
      href={`/predictions/${l}`}
      className={`shrink-0 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
      }`}
    >
      {TAB_LABEL[l] ?? l}
    </Link>
  );
}

// 카테고리 (축구/농구/야구/하키/이스포츠) 간 시각적 구분자 — 작은 점
function CategoryDot() {
  return (
    <span
      aria-hidden
      className="shrink-0 mx-1 inline-block w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700"
    />
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
  fullWidth,
}: {
  wp: { home: number; draw: number; away: number };
  hideDraw: boolean;
  /** true 면 max-width 제거 — 모바일 카드에서 카드 전체 너비 사용 */
  fullWidth?: boolean;
}) {
  const h = Math.round(wp.home * 100);
  const d = hideDraw ? 0 : Math.round(wp.draw * 100);
  const a = 100 - h - d;
  return (
    <div
      className={`flex h-5 rounded overflow-hidden ring-1 ring-neutral-200 dark:ring-neutral-700 ${
        fullWidth ? "w-full" : "max-w-[280px]"
      }`}
    >
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
            <th className="text-right px-3 py-2 font-medium">승점</th>
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
                    {toKoreanTeamName(r.teamName, "WORLD_CUP")}
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
