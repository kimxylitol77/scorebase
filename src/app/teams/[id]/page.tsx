import { prisma } from "@/lib/db";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import LeagueBadge from "@/components/LeagueBadge";
import ArticleCard from "@/components/ArticleCard";
import { toKoreanTeamName } from "@/lib/team-names";
import { NATIONAL_TEAM_LEAGUES, SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { Prisma } from "@prisma/client";
import GoalHeatmap from "@/components/charts/GoalHeatmap";
import type { GoalLineGoal } from "@/components/charts/GoalSceneViz";
import TeamFollowButton from "@/components/teams/TeamFollowButton";
import TransfersSection from "@/components/teams/TransfersSection";
import { toKoreanPlayerName } from "@/lib/player-names";
import { resolvePlayerNames } from "@/lib/players/resolvePlayerName";
import { getSportFromLeague } from "@/lib/players/types";
import rawTOverrides from "../../../../data/player-overrides.json";
import rawTPhotos from "../../../../data/player-photos.json";
import rawTPos from "../../../../data/player-positions.json";
import rawClubRank from "../../../../data/club-rank-by-team.json";
import rawTeamStats from "../../../../data/team-season-stats.json";
import rawTSquads from "../../../../data/team-squads.json";
import { calcStandings } from "@/lib/predict/standings";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcForm } from "@/lib/predict/form";
import { calcStreaks } from "@/lib/predict/streak";
import { calcHomeAway } from "@/lib/predict/home-away";
import { calcWinProbability } from "@/lib/predict/win-probability";
import type { PredictMatch } from "@/lib/predict/types";
import {
  fetchSeasonInjuries,
  fetchSeasonTopScorers,
  getApiFootballSeason,
  getTeamInjuries,
  getTeamKeyPlayers,
  API_FOOTBALL_LEAGUE_ID,
} from "@/lib/sports/api-football-pro";
import FormDots from "@/components/FormDots";

export const dynamic = "force-dynamic";

// TheSports 선수단(이적시장 데이터) — 이름 → /transfers/{ts id} 링크용
const T_OVERRIDES = rawTOverrides as Record<string, { nameKo?: string; flag?: string }>;
const T_PHOTOS = rawTPhotos as Record<string, string>;
const T_POS = rawTPos as Record<string, string>;
// 세계 클럽 랭킹 (ts team id → 순위, 2729팀). 팀 헤더 배지용. [[club-ranking]]
const CLUB_RANK = rawClubRank as Record<string, number>;
// 팀 시즌 통계 (ts team id → 집계). TheSports season/recent/team/stat.
interface TeamStat { lg: string; name: string; matches: number | null; goals: number | null; against: number | null; poss: number | null; shots: number | null; sot: number | null; passAcc: number | null; dribbleSucc: number | null; tackles: number | null; corners: number | null; fouls: number | null; yellow: number | null; red: number | null }
const TEAM_STATS = rawTeamStats as Record<string, TeamStat>;
// 공식 스쿼드 (ts team/squad/list — 등번호·공식 coarse 포지션, 154팀). 생성: scripts/build-team-squads.ts [[transfers-league-expansion]]
const T_SQUADS = rawTSquads as Record<string, { updatedAt: string; squad: Array<{ id: string; name: string; position: string | null; number: number | null }> }>;
const squadPos = (id: string, coarse: string | null | undefined): string | null =>
  T_POS[id] || (coarse === "G" ? "GK" : coarse === "M" ? "MF" : coarse === "D" ? "DF" : coarse === "F" ? "FW" : null);

const LEAGUE_GRADIENT: Record<string, string> = {
  EPL: "from-purple-600 via-fuchsia-500 to-pink-500",
  LALIGA: "from-amber-500 via-red-600 to-yellow-500",
  BUNDESLIGA: "from-yellow-400 via-red-600 to-slate-900",
  SERIE_A: "from-sky-500 via-blue-700 to-emerald-600",
  LIGUE_1: "from-blue-700 via-rose-600 to-indigo-600",
  MLS: "from-red-600 via-slate-900 to-blue-700",
  UCL: "from-indigo-700 via-blue-600 to-cyan-500",
  NBA: "from-orange-500 via-amber-500 to-yellow-500",
  NHL: "from-cyan-500 via-blue-600 to-indigo-700",
  MLB: "from-emerald-500 via-green-600 to-teal-700",
  KBO: "from-blue-600 via-cyan-500 to-teal-500",
  NPB: "from-red-600 via-rose-500 to-pink-500",
  // 아시아 축구
  K_LEAGUE_1: "from-blue-700 via-blue-500 to-sky-400",
  K_LEAGUE_2: "from-blue-500 via-sky-400 to-cyan-300",
  J1_LEAGUE: "from-pink-600 via-rose-500 to-red-500",
  J2_LEAGUE: "from-pink-400 via-rose-300 to-red-300",
  AFC_CL: "from-orange-600 via-red-500 to-amber-500",
  SAUDI_PL: "from-emerald-700 via-green-600 to-lime-500",
  // 유럽 컵
  UEL: "from-orange-500 via-amber-500 to-yellow-400",
  UECL: "from-emerald-500 via-green-500 to-teal-400",
  // 유럽 2부
  CHAMPIONSHIP: "from-violet-700 via-purple-600 to-fuchsia-500",
  LALIGA_2: "from-red-700 via-orange-500 to-amber-400",
  BUNDESLIGA_2: "from-red-700 via-rose-600 to-slate-700",
  SERIE_B: "from-blue-500 via-sky-400 to-emerald-400",
  LIGUE_2: "from-blue-800 via-indigo-700 to-blue-500",
  CLUB_WORLD_CUP: "from-yellow-500 via-amber-400 to-orange-400",
  // 아시아 추가
  AFC_CL_TWO: "from-orange-400 via-amber-300 to-yellow-300",
  AFC_U23: "from-indigo-700 via-purple-600 to-violet-500",
  CSL: "from-red-700 via-rose-600 to-amber-400",
  A_LEAGUE: "from-yellow-500 via-amber-500 to-emerald-500",
  // 유럽 추가
  EREDIVISIE: "from-orange-600 via-amber-500 to-red-500", // 네덜란드 오렌지
  PRIMEIRA_LIGA: "from-emerald-700 via-green-600 to-red-600", // 포르투갈
  SUPER_LIG: "from-red-600 via-rose-500 to-red-700", // 터키
  JUPILER_PL: "from-yellow-500 via-black to-red-600", // 벨기에
  SPL: "from-blue-800 via-indigo-700 to-sky-600", // 스코틀랜드
  GREEK_SL: "from-blue-700 via-sky-500 to-blue-400", // 그리스
  // 북중남미 추가
  BRASILEIRAO: "from-yellow-500 via-emerald-500 to-blue-700", // 브라질
  LIGA_MX: "from-emerald-700 via-green-600 to-red-600", // 멕시코
  COPA_LIB: "from-blue-900 via-indigo-700 to-yellow-500",
  COPA_SUD: "from-orange-600 via-amber-500 to-yellow-400",
};

const REASON_KO: Record<string, string> = {
  Hamstring: "햄스트링",
  Knee: "무릎",
  Ankle: "발목",
  Foot: "발",
  Calf: "종아리",
  Thigh: "허벅지",
  Groin: "사타구니",
  Back: "허리",
  Shoulder: "어깨",
  Wrist: "손목",
  Hand: "손",
  Hip: "고관절",
  Concussion: "뇌진탕",
  Achilles: "아킬레스",
  Illness: "질병",
  Suspended: "출장 정지",
  Fitness: "컨디션",
  Muscle: "근육",
  "Broken Bone": "골절",
  "Cardiac problems": "심장 문제",
  Toe: "발가락",
};

function translateReason(en: string): string {
  if (!en) return "사유 미공개";
  for (const [k, v] of Object.entries(REASON_KO)) {
    if (en.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return en;
}

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id: Number(id) } });
  if (!team) return { title: "팀을 찾을 수 없습니다" };
  const ko = toKoreanTeamName(team.name, team.league);
  return {
    title: `${ko} — 시즌 통계·부상자·관련 기사`,
    description: `${team.league} ${ko}(${team.name}) 팀의 시즌 통계, 최근 폼, 부상자 명단, 관련 기사를 한 페이지에 모았습니다.`,
    alternates: { canonical: `/teams/${id}` },
  };
}

export default async function TeamPage({ params }: Props) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isFinite(teamId)) notFound();

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) notFound();

  // 국가대표팀은 /national-teams 가 단일 진실 — 클럽 페이지와 이원화 방지 (308)
  if (NATIONAL_TEAM_LEAGUES.has(team.league)) permanentRedirect(`/national-teams/${teamId}`);

  const gradient =
    LEAGUE_GRADIENT[team.league] ?? "from-neutral-700 to-neutral-900";

  // 같은 리그 매치 전체 (계산용)
  const dbMatches = await prisma.match.findMany({
    where: { league: team.league },
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

  // 통계
  const standings = calcStandings(matches);
  const row = standings.byTeam.get(teamId);
  const eloTable = calcEloTable(matches);
  const elo = getElo(eloTable, teamId);
  const recentForm = calcForm(matches, teamId, undefined, 5);
  const streak = calcStreaks(matches, teamId);
  const ha = calcHomeAway(matches, teamId);
  const attackRank = standings.attackRank.get(teamId);
  const defenseRank = standings.defenseRank.get(teamId);

  // 최근 5개 끝난 매치
  const recentMatches = await prisma.match.findMany({
    where: {
      league: team.league,
      status: "FINISHED",
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "desc" },
    take: 5,
  });

  // 다가오는 5개 매치
  const upcoming = await prisma.match.findMany({
    where: {
      league: team.league,
      status: "SCHEDULED",
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
    take: 5,
  });

  // 관련 기사
  const articles = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      league: team.league,
      OR: [
        { match: { homeTeamId: teamId } },
        { match: { awayTeamId: teamId } },
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: 9,
  });

  // 부상자 + 핵심 선수 (api-football Pro, 축구 리그만)
  let injuries: Awaited<ReturnType<typeof getTeamInjuries>> = [];
  let keyPlayers: Awaited<ReturnType<typeof getTeamKeyPlayers>> = [];
  if (process.env.API_FOOTBALL_KEY && API_FOOTBALL_LEAGUE_ID[team.league]) {
    try {
      const season = getApiFootballSeason(new Date(), team.league);
      const [allInj, allTop] = await Promise.all([
        fetchSeasonInjuries(team.league, season),
        fetchSeasonTopScorers(team.league, season),
      ]);
      injuries = getTeamInjuries(allInj, team.name, undefined, 12);
      keyPlayers = getTeamKeyPlayers(allTop, team.name, 5);
    } catch {}
  }

  // Supabase + 코드 fallback 으로 선수명 한글화
  const sport = (() => {
    try { return getSportFromLeague(team.league); } catch { return "soccer" as const; }
  })();
  const playerNameResolved = await resolvePlayerNames(
    [
      ...injuries.map((i) => ({ apiFootballId: i.playerId, nameEn: i.playerName })),
      ...keyPlayers.map((p) => ({ apiFootballId: p.playerId, nameEn: p.playerName })),
    ],
    sport,
    team.league,
  );
  const koName = (id: number, en: string) =>
    playerNameResolved.get(id)?.ko ?? toKoreanPlayerName(en);

  // TheSports 선수단 (PlayerMarketValue, ts player id) — 이름 클릭 → /transfers 상세
  const tsTeamRows = await prisma.teamSourceId.findMany({ where: { source: "thesports", teamId: team.id }, select: { externalId: true } });
  const clubRank = tsTeamRows.map((t) => CLUB_RANK[t.externalId]).filter((r): r is number => !!r).sort((a, b) => a - b)[0] ?? null;
  const teamStat = tsTeamRows.map((t) => TEAM_STATS[t.externalId]).find((s): s is TeamStat => !!s) || null;
  let squad: { id: string; name: string; photo: string | null; pos: string | null; value: number; number: number | null; flag: string | null }[] = [];
  if (tsTeamRows.length) {
    const extIds = tsTeamRows.map((t) => t.externalId);
    // 시장가치(PMV) — 공식 스쿼드 멤버에 join + fallback 용
    const pmvAll = await prisma.playerMarketValue.findMany({
      where: { teamId: { in: extIds }, currentValue: { not: null } },
      orderBy: { currentValue: "desc" }, select: { id: true, currentValue: true, history: true },
    });
    const valueOf = new Map(pmvAll.map((p) => [p.id, Math.round((p.currentValue || 0) / 1e6)]));

    // 공식 스쿼드(team/squad/list — 등번호 포함 정본) 우선. 없는 팀(154팀 외)은 PMV 18개월 컷오프 fallback.
    // PlayerMarketValue.teamId 는 "마지막 소속팀" 이라 은퇴 선수(칸·라암 등)가 영구 잔류 → 컷오프로만 거른다.
    const official = tsTeamRows.map((t) => T_SQUADS[t.externalId]?.squad).find((s) => Array.isArray(s) && s.length > 0);
    let members: { id: string; coarse: string | null; number: number | null }[];
    if (official) {
      members = official.map((m) => ({ id: m.id, coarse: m.position, number: m.number }));
    } else {
      const cutoff = Math.floor(Date.now() / 1000) - 18 * 30 * 86400;
      members = pmvAll
        .filter((p) => { const h = (p.history as { market_time?: number }[]) || []; return (h[h.length - 1]?.market_time ?? 0) >= cutoff; })
        .map((p) => ({ id: p.id, coarse: null, number: null }));
    }

    const sp = await prisma.theSportsPlayer.findMany({ where: { id: { in: members.map((m) => m.id) } }, select: { id: true, name: true, nameKo: true, photoUrl: true, position: true } });
    const spMap = new Map(sp.map((p) => [p.id, p]));
    const seen = new Set<string>();
    squad = members
      .map((m) => {
        const t = spMap.get(m.id); const ov = T_OVERRIDES[m.id];
        return { id: m.id, name: ov?.nameKo || t?.nameKo || t?.name || "선수", photo: T_PHOTOS[m.id] || t?.photoUrl || null, pos: squadPos(m.id, m.coarse ?? t?.position), value: valueOf.get(m.id) ?? 0, number: m.number, flag: ov?.flag || null };
      })
      // 이름없음("선수") 제외 + 동일 표시명 중복 제거
      .filter((p) => { if (p.name === "선수" || seen.has(p.name)) return false; seen.add(p.name); return true; })
      // 시장가치순, 동가면 등번호순
      .sort((a, b) => b.value - a.value || (a.number ?? 99) - (b.number ?? 99));
  }

  // 골 위치 히트맵 — 시즌 득점 슈터 좌표 누적 (축구만, away 골은 공격 방향 오른쪽으로 정규화)
  const goalSpots: { x: number; y: number }[] = [];
  if (SOCCER_LEAGUES.has(team.league)) {
    const goalMatches = await prisma.match.findMany({
      where: {
        league: team.league,
        status: "FINISHED",
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        theSportsCache: { goalLine: { not: Prisma.JsonNull } },
      },
      select: { homeTeamId: true, theSportsCache: { select: { goalLine: true } } },
    });
    for (const m of goalMatches) {
      const belong = m.homeTeamId === teamId ? 1 : 2;
      const goals = (m.theSportsCache?.goalLine as GoalLineGoal[] | null) ?? [];
      for (const g of goals) {
        const shooter = g.pass?.find((p) => p.shooter === 1);
        if (!shooter || shooter.belong !== belong) continue;
        let x = parseFloat(shooter.x);
        const y = parseFloat(shooter.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (belong === 2) x = 100 - x;
        goalSpots.push({ x, y });
      }
    }
  }

  return (
    <div>
      {/* 헤더 */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
        <div
          className={`absolute inset-0 -z-10 bg-gradient-to-br ${gradient} opacity-10 dark:opacity-15`}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex items-center gap-3 mb-3">
            <Link
              href={`/leagues/${team.league}`}
              className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
            >
              ← {team.league}
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {team.logoUrl &&
              (team.logoUrl.includes("liquipedia.net") ? (
                <Image
                  src={team.logoUrl}
                  alt={team.name}
                  width={64}
                  height={64}
                  className="rounded-md bg-white p-1 shadow-sm"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={team.logoUrl}
                  alt={team.name}
                  width={64}
                  height={64}
                  className="rounded-md bg-white p-1 shadow-sm"
                />
              ))}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <LeagueBadge league={team.league} />
                {team.shortName && (
                  <span className="text-xs text-neutral-500">
                    {team.shortName}
                  </span>
                )}
                {clubRank && (
                  <Link
                    href="/predictions/club-ranking"
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition"
                    title="세계 클럽 랭킹"
                  >
                    🌍 세계 {clubRank}위
                  </Link>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                {toKoreanTeamName(team.name, team.league)}
              </h1>
              <div className="text-xs text-neutral-500 mt-1">{team.name}</div>
              <div className="mt-3">
                <TeamFollowButton teamId={team.id} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* 시즌 통계 */}
        {row && (
          <section>
            <SectionH title="시즌 통계" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="순위" value={`${row.position}위`} subtle={`/ ${standings.rows.length}팀`} />
              <Stat
                label="승점"
                value={`${row.points}점`}
                subtle={`${row.wins}승 ${row.draws}무 ${row.losses}패`}
              />
              <Stat
                label="골득실"
                value={`${row.goalDiff > 0 ? "+" : ""}${row.goalDiff}`}
                subtle={`${row.goalsFor} - ${row.goalsAgainst}`}
              />
              <Stat
                label="Elo"
                value={Math.round(elo).toString()}
                subtle={`공격 ${attackRank ?? "-"}위 / 수비 ${defenseRank ?? "-"}위`}
              />
            </div>
          </section>
        )}

        {/* 폼 + Streak + 홈/원정 */}
        <section className="grid sm:grid-cols-3 gap-4">
          <Card title="최근 5경기 폼">
            {recentForm.results.length > 0 ? (
              <div className="space-y-2">
                <FormDots results={recentForm.results} />
                <div className="text-xs text-neutral-500 tabular-nums">
                  {recentForm.wins}승 {recentForm.draws}무 {recentForm.losses}패
                </div>
              </div>
            ) : (
              <div className="text-xs text-neutral-500">데이터 없음</div>
            )}
          </Card>
          <Card title="흐름 (Streak)">
            <StreakDisplay streak={streak} />
          </Card>
          <Card title="홈/원정 분리">
            <div className="space-y-1.5 text-sm">
              <div>
                🏠 <span className="font-semibold">{ha.home.wins}승 {ha.home.draws}무 {ha.home.losses}패</span>
                <span className="text-xs text-neutral-500 ml-2">경기당 {ha.home.ppg.toFixed(2)}점</span>
              </div>
              <div>
                ✈ <span className="font-semibold">{ha.away.wins}승 {ha.away.draws}무 {ha.away.losses}패</span>
                <span className="text-xs text-neutral-500 ml-2">경기당 {ha.away.ppg.toFixed(2)}점</span>
              </div>
            </div>
          </Card>
        </section>

        {/* 골 위치 히트맵 (축구, goal/line 누적) */}
        {goalSpots.length >= 3 && (
          <section>
            <SectionH title="⚽ 골 위치 히트맵" subtitle={`시즌 ${goalSpots.length}골의 슈팅 지점`} />
            <GoalHeatmap spots={goalSpots} teamName={toKoreanTeamName(team.name, team.league)} />
          </section>
        )}

        {/* 팀 시즌 통계 (TheSports season/recent/team/stat) */}
        {teamStat && (
          <section>
            <SectionH title="📊 팀 시즌 통계" subtitle={teamStat.matches ? `${teamStat.matches}경기 · 리그 집계` : "리그 집계"} />
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {([
                { label: "득점", v: teamStat.goals },
                { label: "실점", v: teamStat.against },
                { label: "점유율", v: teamStat.poss, suf: "%" },
                { label: "슈팅", v: teamStat.shots },
                { label: "유효슈팅", v: teamStat.sot },
                { label: "패스성공", v: teamStat.passAcc, suf: "%" },
                { label: "드리블성공", v: teamStat.dribbleSucc },
                { label: "태클", v: teamStat.tackles },
                { label: "코너", v: teamStat.corners },
                { label: "파울", v: teamStat.fouls },
                { label: "경고", v: teamStat.yellow },
                { label: "퇴장", v: teamStat.red },
              ] as { label: string; v: number | null; suf?: string }[])
                .filter((t) => t.v != null)
                .map((t) => (
                  <div key={t.label} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-center">
                    <div className="text-xl font-black tabular-nums">{t.v}{t.suf || ""}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">{t.label}</div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* TheSports 선수단 — 이름 클릭 → 이적시장 상세(/transfers) */}
        {squad.length > 0 && (
          <section>
            <SectionH title="👥 선수단" subtitle={`시장가치순 · ${squad.length}명 · 클릭 시 상세`} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {squad.map((p) => (
                <Link
                  key={p.id}
                  href={`/transfers/${p.id}`}
                  className="flex items-center gap-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-neutral-500">{p.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate flex items-center gap-1">
                      {p.name}
                      {p.flag && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.flag} alt="" className="w-3.5 h-2.5 object-cover rounded-[1px] shrink-0" />
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">{p.number ? `#${p.number} · ` : ""}{p.pos ? `${p.pos} · ` : ""}€{p.value}M</div>
                  </div>
                </Link>
              ))}
            </div>
            <Link
              href={`/transfers?view=team&team=${team.id}`}
              className="mt-3 flex items-center justify-center gap-1 rounded-xl border border-neutral-200 dark:border-neutral-800 px-4 py-2.5 text-sm font-bold text-cyan-600 dark:text-cyan-400 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
            >
              스쿼드 몸값 랭킹 · 시장가치 Best XI 전체보기 →
            </Link>
          </section>
        )}

        {/* 부상·결장 명단 + 핵심 선수 */}
        {(injuries.length > 0 || keyPlayers.length > 0) && (
          <section className="grid md:grid-cols-2 gap-5">
            {injuries.length > 0 && (
              <div>
                <SectionH
                  title="🩹 부상·결장 명단"
                  subtitle={`현재 ${injuries.length}명 · 시즌 누적 기준`}
                />
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">선수</th>
                        <th className="text-right px-4 py-2 font-medium">사유</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {injuries.map((p) => (
                        <tr key={p.playerId} title={p.reason}>
                          <td className="px-4 py-2.5 font-medium">
                            <Link
                              href={`/players/${p.playerId}?league=${team.league}`}
                              prefetch={false}
                              className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition"
                            >
                              {p.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.photoUrl}
                                  alt=""
                                  loading="lazy"
                                  className="w-7 h-7 rounded-full object-cover bg-neutral-100 dark:bg-neutral-800 shrink-0"
                                />
                              ) : (
                                <span className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
                              )}
                              {koName(p.playerId, p.playerName)}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-neutral-500">
                            {translateReason(p.reason)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {keyPlayers.length > 0 && (
              <div>
                <SectionH
                  title="⭐ 시즌 핵심 선수"
                  subtitle="시즌 득점·도움 누적 Top"
                />
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">선수</th>
                        <th className="text-right px-2 py-2 font-medium">⚽</th>
                        <th className="text-right px-2 py-2 font-medium">🎯</th>
                        <th className="text-right px-4 py-2 font-medium">출전</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {keyPlayers.map((p) => (
                        <tr key={p.playerId}>
                          <td className="px-4 py-2.5 font-medium">
                            <Link
                              href={`/players/${p.playerId}?league=${team.league}`}
                              prefetch={false}
                              className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition"
                            >
                              {p.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.photoUrl}
                                  alt=""
                                  loading="lazy"
                                  className="w-7 h-7 rounded-full object-cover bg-neutral-100 dark:bg-neutral-800 shrink-0"
                                />
                              ) : (
                                <span className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
                              )}
                              {koName(p.playerId, p.playerName)}
                            </Link>
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums font-bold">
                            {p.goals}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">
                            {p.assists}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">
                            {p.appearances}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 다가오는 경기 */}
        {upcoming.length > 0 && (
          <section>
            <SectionH title="다가오는 경기" subtitle="다음 5경기" />
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {upcoming.map((m) => {
                    const isHome = m.homeTeamId === teamId;
                    const opp = isHome ? m.awayTeam : m.homeTeam;
                    const homeElo = getElo(eloTable, m.homeTeamId);
                    const awayElo = getElo(eloTable, m.awayTeamId);
                    const wp = calcWinProbability(homeElo, awayElo, m.league);
                    const myProb = isHome ? wp.home : wp.away;
                    return (
                      <tr key={m.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                        <td className="px-4 py-3 text-xs text-neutral-500 tabular-nums w-32">
                          {m.startTime.toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Seoul",
                          })}
                        </td>
                        <td className="px-2 py-3 text-xs">
                          <span className="text-neutral-400">{isHome ? "🏠 vs" : "✈ at"}</span>
                        </td>
                        <td className="px-2 py-3 font-medium">
                          <Link
                            href={`/teams/${opp.id}`}
                            className="inline-flex items-center gap-2 hover:underline"
                          >
                            <OppLogo src={opp.logoUrl} name={opp.name} />
                            <span className="truncate">{toKoreanTeamName(opp.name, m.league)}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <span className="text-neutral-500">승률 추정 </span>
                          <strong>{Math.round(myProb * 100)}%</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 최근 경기 */}
        {recentMatches.length > 0 && (
          <section>
            <SectionH title="최근 경기" subtitle="최근 5경기 결과" />
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {recentMatches.map((m) => {
                    const isHome = m.homeTeamId === teamId;
                    const opp = isHome ? m.awayTeam : m.homeTeam;
                    const myScore = isHome ? m.homeScore : m.awayScore;
                    const oppScore = isHome ? m.awayScore : m.homeScore;
                    const result =
                      myScore != null && oppScore != null
                        ? myScore > oppScore
                          ? "W"
                          : myScore < oppScore
                            ? "L"
                            : "D"
                        : null;
                    const resColor: Record<string, string> = {
                      W: "text-emerald-600 dark:text-emerald-400",
                      D: "text-neutral-500",
                      L: "text-rose-600 dark:text-rose-400",
                    };
                    return (
                      <tr key={m.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                        <td className="px-4 py-3 text-xs text-neutral-500 tabular-nums w-24">
                          {m.startTime.toISOString().slice(0, 10)}
                        </td>
                        <td className="px-2 py-3 text-xs">
                          <span className="text-neutral-400">{isHome ? "🏠" : "✈"}</span>
                        </td>
                        <td className="px-2 py-3 font-medium">
                          <Link
                            href={`/teams/${opp.id}`}
                            className="inline-flex items-center gap-2 hover:underline"
                          >
                            <OppLogo src={opp.logoUrl} name={opp.name} />
                            <span className="truncate">{toKoreanTeamName(opp.name, m.league)}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold">
                          {myScore} : {oppScore}
                        </td>
                        <td
                          className={`px-3 py-3 text-right text-xs font-bold w-10 ${result ? resColor[result] : ""}`}
                        >
                          {result ?? "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 최근 이적 (api-football 지원 리그만, client-side fetch 1시간 캐시) */}
        <TransfersSection teamId={team.id} />

        {/* 관련 기사 */}
        {articles.length > 0 && (
          <section>
            <SectionH
              title="관련 기사"
              subtitle={`${toKoreanTeamName(team.name, team.league)}이(가) 등장한 최근 기사`}
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} variant="compact" />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function OppLogo({
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

function SectionH({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3 mb-5">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {subtitle && (
        <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
      {subtle && (
        <div className="mt-0.5 text-[11px] text-neutral-500">{subtle}</div>
      )}
    </div>
  );
}

function StreakDisplay({
  streak,
}: {
  streak: {
    unbeatenRun: number;
    winningRun: number;
    losingRun: number;
    cleanSheetsLast5: number;
    failedToScoreLast5: number;
  };
}) {
  let main: { tone: "good" | "bad" | "neutral"; text: string } = {
    tone: "neutral",
    text: "특이 흐름 없음",
  };
  if (streak.winningRun >= 2) {
    main = { tone: "good", text: `${streak.winningRun}연승 중` };
  } else if (streak.unbeatenRun >= 3) {
    main = { tone: "good", text: `${streak.unbeatenRun}경기 무패` };
  } else if (streak.losingRun >= 2) {
    main = { tone: "bad", text: `${streak.losingRun}연패 중` };
  }
  const tone =
    main.tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : main.tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-neutral-500";
  return (
    <div>
      <div className={`text-base font-bold ${tone}`}>{main.text}</div>
      <div className="mt-1 text-xs text-neutral-500 space-y-0.5">
        <div>최근 5경기 클린시트 {streak.cleanSheetsLast5}</div>
        <div>최근 5경기 무득점 {streak.failedToScoreLast5}</div>
      </div>
    </div>
  );
}
