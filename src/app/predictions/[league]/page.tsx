// 리그별 시즌 시뮬레이션 — Monte Carlo 우승·강등·순위 확률.
import { prisma } from "@/lib/db";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { fifaFlag } from "@/lib/sports/fifa-rankings";
import type { Metadata } from "next";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcWinProbability } from "@/lib/predict/win-probability";
import { runMonteCarlo } from "@/lib/predict/monte-carlo";
import { checkScheduleIntegrity } from "@/lib/predict/schedule-integrity";
import { getKboSeasonSim } from "@/lib/predict/postseason-odds";
import { simulateWorldCup } from "@/lib/predict/world-cup-simulation";
import { buildWorldCupSeedTable } from "@/lib/predict/world-cup-elos";
import type { PredictMatch } from "@/lib/predict/types";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import { isAllStarMatchRow } from "@/lib/sports/baseball/allstar";
import MonteCarloBar from "@/components/charts/MonteCarloBar";
import LeagueBadge from "@/components/LeagueBadge";
import UclBracket from "@/components/UclBracket";
import { buildUclBracket } from "@/lib/predict/ucl-bracket";
import {
  getFullStandings,
  GROUPED_STANDINGS_LEAGUES,
} from "@/lib/sports/thesports/standings-helper";
import NbaPlayoffBracket from "@/components/NbaPlayoffBracket";
import { getNbaPlayoffBracket } from "@/lib/predict/nba-playoffs";
import {
  loadPlayoffBracket,
  isPlayoffSeasonDone,
  playoffSeasonLabel,
} from "@/lib/predict/playoff-bracket-loader";
import { rateOf, type MarketRate } from "@/lib/predict/accuracy-stats";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { simulatePlayoff } from "@/lib/predict/playoff-mc";
import { toKoreanTeamName } from "@/lib/team-names";
import { attachLeaderTeamLogos } from "@/lib/leaderboard-logos";
import { STANDINGS_VALID } from "@/lib/sports/standings-valid";
import { toKoreanPlayerName } from "@/lib/player-names";
import { EN_PREDICTION_LEAGUE_SET, koEnLanguages } from "@/lib/i18n/en";
import { type LeaderRow } from "@/components/LeagueLeaderBoard";
import { CATEGORIES_BY_LEAGUE, LEAGUE_TO_SPORT } from "@/components/leaderboard-categories";
import { getBaseballH2H, type H2HMatrix } from "@/lib/sports/baseball-h2h";
import WcChampionTrendChart, { type WcTrendPoint } from "@/components/charts/WcChampionTrendChart";
import TeamFormBadges from "@/components/predictions/TeamFormBadges";
import ValueBetIndicator from "@/components/predictions/ValueBetIndicator";
import KeyMatchPreview from "@/components/predictions/KeyMatchPreview";
import StandingsOnlyView from "@/components/StandingsOnlyView";
import { ALL_LEAGUES, LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import AmbientGlow from "@/components/AmbientGlow";
import { CircleDot, BookOpen } from "lucide-react";

export const revalidate = 600; // ISR — 시즌 시뮬은 일 단위 데이터, 10분 캐시로 충분

/**
 * NBA/NHL 플레이오프 미정 매치업 placeholder ("TBD", "TTBD", "Sabres/Canadiens" 등) 처리.
 * 사전에 매핑된 진짜 팀명 (Bodø/Glimt 처럼 슬래시 포함된 정상 클럽) 은 그대로 변환.
 */
function displayTeamName(name: string | undefined | null, league?: string): string {
  if (!name) return "[미정]";
  const trimmed = name.trim();
  if (/^(TBD|TTBD|TBDT)$/i.test(trimmed)) return "[미정]";
  const ko = toKoreanTeamName(trimmed, league);
  // 사전 변환 성공 시 그대로 (Bodø/Glimt → 보되/글림트 등)
  if (ko !== trimmed) return ko;
  // 변환 실패 + slash placeholder 패턴 → 미정 처리
  if (/\//.test(trimmed)) return "[미정]";
  return trimmed;
}

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
  "WNBA", // 2026-05-21 — 미국 여자 농구 (api-sports basketball v1, league=13)
  "UEL", // UEFA 유로파 리그 — 2026-05-21 추가
  "UECL", // UEFA 유로파 컨퍼런스 — 2026-05-21 추가
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
  WNBA: {
    name: "WNBA",
    subtitle: "미국 여자 프로농구 — 시즌 시뮬레이션",
    gradient: "from-amber-400 via-orange-500 to-pink-500",
    relegationCount: 0,
    showDraw: false,
  },
  UEL: {
    name: "유로파리그",
    subtitle: "UEFA 유로파리그 — 시즌 시뮬레이션",
    gradient: "from-orange-600 via-amber-500 to-yellow-500",
    relegationCount: 0,
    showDraw: true,
  },
  UECL: {
    name: "유로파 컨퍼런스",
    subtitle: "UEFA 유로파 컨퍼런스 리그 — 시즌 시뮬레이션",
    gradient: "from-emerald-600 via-green-500 to-lime-500",
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
  const canonical = `/predictions/${upper}`;
  if (GROUPED_STANDINGS_LEAGUES.has(upper)) {
    const name = LEAGUE_DISPLAY[upper] ?? upper;
    return {
      title: `${name} 순위`,
      description: `${name} 2026 100년 비전 리그 — 지역 그룹별 순위표.`,
      alternates: { canonical },
    };
  }
  if (!VALID.includes(upper as ValidLeague)) {
    // ALL_LEAGUES 에는 있지만 VALID 에 없는 신규 리그 → standings-only fallback
    if ((ALL_LEAGUES as readonly string[]).includes(upper)) {
      const name = LEAGUE_DISPLAY[upper] ?? upper;
      return {
        title: `${name} 순위`,
        description: `${name} 현재 시즌 순위표.`,
        alternates: { canonical },
      };
    }
    return { title: "찾을 수 없음" };
  }
  const info = LEAGUE_INFO[upper as ValidLeague];
  // NPB·MLB — 빙 검색어는 "예측"이 아니라 "분석"("npb경기분석" 330·5.8위, "mlb분석" 157·5.4위,
  // 둘 다 CTR 0%대). 순위는 이미 1페이지인데 title 에 분석 단어가 없어 exact-match 에서 밀렸다.
  // KBO 순위 페이지(67491a5)와 같은 방식으로 검색어를 앞세우고 날짜를 동적 삽입한다.
  if (upper === "NPB" || upper === "MLB") {
    const kst = new Date(Date.now() + 9 * 3600_000);
    const dateLabel = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
    const koName = upper === "NPB" ? "일본프로야구" : "메이저리그";
    const headKw = upper === "NPB" ? "경기분석" : "분석"; // 각 리그의 실제 검색어에 맞춤
    return {
      title: `${upper} ${headKw} (${dateLabel}) — 오늘 ${koName} 승부예측·승률`,
      description:
        `오늘의 ${upper} 경기분석 (${dateLabel}) — ${koName} 경기별 승률과 선발 맞대결, ` +
        `시즌 우승 확률을 Elo+시장 배당 모델로 매일 자동 갱신. 승부예측 적중률도 함께 공개합니다.`,
      keywords: [
        `${upper} 분석`,
        `${upper} 경기분석`,
        `${koName} 분석`,
        `${koName} 경기분석`,
        `${upper} 예측`,
        `${upper} 승부예측`,
        `오늘 ${upper}`,
        `${upper} 승률`,
        "야구 분석",
        "야구 분석 사이트",
        "AI 승부예측",
        "스코어베이스",
      ],
      alternates: {
        canonical,
        ...(EN_PREDICTION_LEAGUE_SET.has(upper)
          ? { languages: koEnLanguages(`/predictions/${upper}`, `/en/predictions/${upper}`) }
          : {}),
      },
    };
  }
  // KBO — 순위 검색어는 /standings/KBO 담당(빙 Copilot 이 순위표를 요약해버려 클릭이 안 나는 구간).
  // 여기는 요약이 못 주는 "확률" 을 전담해 검색어를 나눈다 — 두 페이지가 같은 말을 하면 서로 깎는다.
  if (upper === "KBO") {
    const kst = new Date(Date.now() + 9 * 3600_000);
    const dateLabel = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
    return {
      title: `KBO 가을야구 확률 (${dateLabel}) — 포스트시즌 진출·우승 확률 시뮬레이션`,
      description:
        `${dateLabel} 기준 KBO 가을야구(정규시즌 5위 이내) 진출 확률과 우승 확률. ` +
        `잔여 경기를 Elo 기반 몬테카를로로 5,000회 돌려 매일 갱신합니다. 오늘 경기 승률·선발 맞대결도 함께.`,
      keywords: [
        "KBO 가을야구 확률",
        "가을야구 확률",
        "KBO 포스트시즌 진출 확률",
        "KBO 우승 확률",
        "프로야구 우승 확률",
        "KBO 예측",
        "프로야구 예측",
        "KBO 시즌 시뮬레이션",
        "AI 승부예측",
        "스코어베이스",
      ],
      alternates: {
        canonical,
        ...(EN_PREDICTION_LEAGUE_SET.has(upper)
          ? { languages: koEnLanguages(`/predictions/${upper}`, `/en/predictions/${upper}`) }
          : {}),
      },
    };
  }
  return {
    title: `${info.name} 예측 — 오늘 경기 승률·우승 확률 시뮬레이션`,
    description: `${info.subtitle}. 매일 갱신하는 ${info.name} 경기별 승률(Elo+시장 배당 모델), Monte Carlo 시즌 시뮬레이션, 우승·플레이오프 확률까지 데이터로 제공.`,
    keywords: [
      `${info.name} 예측`,
      `오늘 ${info.name}`,
      `${info.name} 승률`,
      `${info.name} 픽`,
      `${info.name} 분석`,
      "AI 승부예측",
      "스코어베이스",
    ],
    alternates: {
      canonical,
      // 영어판(/en/predictions) 지원 리그만 hreflang 상호 연결
      ...(EN_PREDICTION_LEAGUE_SET.has(upper)
        ? { languages: koEnLanguages(`/predictions/${upper}`, `/en/predictions/${upper}`) }
        : {}),
    },
  };
}

export default async function LeaguePredictions({ params }: Props) {
  const { league } = await params;
  const upper = league.toUpperCase();
  // J1/J2 2026 100년 비전 = East/West 그룹 포맷 → 단일리그 가정의 Monte Carlo 부적합.
  // 그룹별 순위표(StandingsOnlyView, af group 라벨)로 표시. 2026-27 정상 복귀 시 set 비우면 됨.
  if (GROUPED_STANDINGS_LEAGUES.has(upper)) {
    return <StandingsOnlyView league={upper} />;
  }
  if (!VALID.includes(upper as ValidLeague)) {
    if ((ALL_LEAGUES as readonly string[]).includes(upper)) {
      // 시뮬 미지원 리그의 순위표는 /standings/[league] 가 정본 — 같은 내용의 두 URL
      // (여기 fallback + standings, 2026-08-02 감사 176개 리그)을 redirect 로 통합.
      if (STANDINGS_VALID.has(upper)) permanentRedirect(`/standings/${upper}`);
      // standings 미지원 종목(테니스·골프 등)만 기존 fallback 유지
      return <StandingsOnlyView league={upper} />;
    }
    notFound();
  }
  const info = LEAGUE_INFO[upper as ValidLeague];

  // 시즌 경계 하한 — 지난 시즌까지 합산되던 버그 수정 (KBO 승점 231, 2026-07-02 감사 A2).
  // 새 시즌 개막 직후·오프시즌(완료 <10)은 직전 시즌 창으로 폴백 — 두 시즌이 섞이는 일은 없음.
  const matchSelect = {
    id: true,
    league: true,
    status: true,
    homeTeamId: true,
    awayTeamId: true,
    homeScore: true,
    awayScore: true,
    startTime: true,
  } as const;
  const seasonStart = currentSeasonStart(upper);
  // 리그 전체를 한 번 읽고 시즌 창은 메모리에서 자른다 — 순위·시뮬은 이번 시즌만 쓰지만
  //  Elo 는 시즌을 넘어 누적돼야 해서(아래 eloMatches) 두 벌이 필요하다. 쿼리는 1회로 유지.
  const allLeagueMatches = await prisma.match.findMany({
    where: { league: upper },
    select: matchSelect,
  });
  let dbMatches = seasonStart
    ? allLeagueMatches.filter((m) => m.startTime >= seasonStart)
    : allLeagueMatches;
  // 오프시즌 폴백 — 지난 시즌 표시는 "새 시즌 일정조차 없을 때"만. 새 시즌 fixture 가
  // 이미 잡혀 있으면(개막 직전~직후) 지난 시즌으로 돌아가지 않고 새 시즌에 진입한다
  // (2026-08-15: 빅5 개막 후에도 완료 <10 조건이 지난 시즌 380경기를 통째로 되살렸다).
  if (
    seasonStart &&
    dbMatches.filter((m) => m.status === "FINISHED").length < 10 &&
    !dbMatches.some((m) => m.status === "SCHEDULED")
  ) {
    const prevStart = previousSeasonStart(seasonStart);
    dbMatches = allLeagueMatches.filter((m) => m.startTime >= prevStart && m.startTime < seasonStart);
  }
  // 야구 올스타전(드림·나눔 / All-Stars / 센트럴·퍼시픽)은 정규 팀이 아니라 시뮬·순위를 오염시킨다
  dbMatches = dbMatches.filter((m) => !isAllStarMatchRow(m));
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
  // 일부 매치는 cross-league (UCL/UEL 등) Team row 가 박혀 있어
  // league filter 만으로는 lookup 이 빠진다. orphan ID 도 보강 로드.
  const orphanIds = new Set<number>();
  for (const m of dbMatches) {
    if (!teamNameById.has(m.homeTeamId)) orphanIds.add(m.homeTeamId);
    if (!teamNameById.has(m.awayTeamId)) orphanIds.add(m.awayTeamId);
  }
  if (orphanIds.size > 0) {
    const orphanTeams = await prisma.team.findMany({
      where: { id: { in: Array.from(orphanIds) } },
      select: { id: true, name: true, logoUrl: true },
    });
    for (const t of orphanTeams) {
      teamNameById.set(t.id, t.name);
      teamLogoById.set(t.id, t.logoUrl ?? null);
      teamKoNameById.set(t.id, toKoreanTeamName(t.name, upper));
    }
  }

  // 시뮬레이션 실행
  const finishedCount = matches.filter((m) => m.status === "FINISHED").length;
  const scheduledCount = matches.filter((m) => m.status === "SCHEDULED").length;

  // 월드컵은 외부 시드 Elo 를 쓰므로 finished 0 이어도 시뮬 가능
  const isWorldCup = upper === "WORLD_CUP";
  const canSimulate = isWorldCup ? teams.length >= 32 : finishedCount >= 20;

  // 외부 standings (api-football 우선, TheSports fallback) — 실제 리그 순위 ↔ Elo 예측 비교용.
  const externalStandings = await getFullStandings(upper);
  const externalPosByTeamId = new Map(externalStandings.map((s) => [s.teamId, s.position]));

  let mc: ReturnType<typeof runMonteCarlo> = [];
  let wc: ReturnType<typeof simulateWorldCup> = [];
  if (canSimulate) {
    if (isWorldCup) {
      wc = simulateWorldCup(teamNameById, 5000);
    } else if (upper === "KBO") {
      // KBO 는 /standings/KBO 순위표에도 같은 가을야구 확률이 나간다. 몬테카를로는 시드가 없어
      // 각자 돌리면 페이지마다 ±1%p 다르게 보이므로 공용 캐시 시뮬을 함께 쓴다.
      mc = (await getKboSeasonSim()).rows;
    } else {
      mc = runMonteCarlo(matches, upper, {
        iterations: 5000,
        relegationCount: info.relegationCount,
      });
    }
  }

  // 우승확률 노출 가드 — DB 일정이 잘린 리그가 99.9% 를 뿜는 것을 막는다.
  // (2026-08-27 실측: K리그1·MLS 가 잔여 일정 결손으로 99.9% 를 렌더 중이었다.)
  // 극단값일 때만 검사하므로 시즌 초·중반 리그는 영향받지 않는다.
  const topChampion = mc.length > 0 ? Math.max(...mc.map((r) => r.champion)) : 0;
  const scheduleIntegrity = checkScheduleIntegrity(matches, topChampion);
  const showChampion = scheduleIntegrity.trustworthy;

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

  // 최근 5경기 폼 (W/D/L) — 각 팀별. FINISHED 매치만, 최신 → 과거 정렬 후 5건 cut.
  // 표시는 과거 → 최신 (좌→우) 순으로 reverse.
  const formByTeamId = new Map<number, Array<{ result: "W" | "D" | "L"; startTime: Date }>>();
  {
    const finished = matches
      .filter((m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    for (const m of finished) {
      const hs = m.homeScore as number;
      const as_ = m.awayScore as number;
      const homeRes: "W" | "D" | "L" = hs > as_ ? "W" : hs < as_ ? "L" : "D";
      const awayRes: "W" | "D" | "L" = as_ > hs ? "W" : as_ < hs ? "L" : "D";
      const ha = formByTeamId.get(m.homeTeamId) ?? [];
      if (ha.length < 5) {
        ha.push({ result: homeRes, startTime: m.startTime });
        formByTeamId.set(m.homeTeamId, ha);
      }
      const aa = formByTeamId.get(m.awayTeamId) ?? [];
      if (aa.length < 5) {
        aa.push({ result: awayRes, startTime: m.startTime });
        formByTeamId.set(m.awayTeamId, aa);
      }
    }
    // 표시 순서 — 과거 → 최신 (위에서 최신부터 push 됐으므로 reverse)
    for (const [k, v] of formByTeamId) formByTeamId.set(k, v.reverse());
  }

  // 월드컵은 클럽 매치 데이터가 없으니 시드 Elo 를 직접 사용.
  // (keyMatches 가 .map callback 에서 참조하므로 keyMatches 정의 전에 선언 — TDZ 회피).
  //
  // ⚠ Elo 는 **시즌을 넘어 누적**해야 한다. 시즌 창(matches)으로 계산하면 개막 직후 완료 경기가
  //  0 건이라 전 팀이 초기값 1500 이 되고, 그 결과 리그의 모든 경기가 똑같은 확률로 나온다
  //  (2026-08-21 실측: EPL 예정 20경기가 전부 45%/24%/31%. 시장은 헐 시티를 11% 로 보는데
  //   화면은 45% 라고 말하고 있었다). 팀 페이지가 "윈도잉하면 시즌마다 레이팅 리셋" 이라고
  //  적어둔 것과 같은 함정을 예측 페이지만 밟고 있었다. 순위·시뮬은 시즌 창 그대로 둔다.
  const eloMatches: PredictMatch[] =
    upper === "NBA"
      ? allLeagueMatches
          .filter((m) => validTeamIds.has(m.homeTeamId) && validTeamIds.has(m.awayTeamId))
          .map((m) => ({ ...m }))
      : allLeagueMatches.map((m) => ({ ...m }));
  const elo = isWorldCup
    ? buildWorldCupSeedTable(teamNameById)
    : calcEloTable(eloMatches);

  // 이번 주 빅매치 — 상위 3팀의 직접 대결 매치만 추출 (mc 결과 기준).
  // mc 가 비어있으면 (시뮬 안 됨) 빈 배열.
  const top3TeamIds = new Set<number>(
    mc
      .slice()
      .sort((a, b) => a.expectedPosition - b.expectedPosition)
      .slice(0, 3)
      .map((r) => r.teamId),
  );
  const top3RankById = new Map<number, number>();
  {
    const sorted = mc
      .slice()
      .sort((a, b) => a.expectedPosition - b.expectedPosition);
    for (let i = 0; i < sorted.length; i++) top3RankById.set(sorted[i].teamId, i + 1);
  }
  const keyMatches = upcoming
    .filter(
      (m) =>
        top3TeamIds.has(m.homeTeamId) && top3TeamIds.has(m.awayTeamId),
    )
    .map((m) => {
      const homeElo = getElo(elo, m.homeTeamId);
      const awayElo = getElo(elo, m.awayTeamId);
      const wp = calcWinProbability(homeElo, awayElo, upper, { homeTeamName: m.homeTeam.name });
      return {
        id: m.id,
        startTime: m.startTime,
        homeName: displayTeamName(m.homeTeam.name, upper),
        awayName: displayTeamName(m.awayTeam.name, upper),
        homeRank: top3RankById.get(m.homeTeamId) ?? 0,
        awayRank: top3RankById.get(m.awayTeamId) ?? 0,
        homeWp: wp.home,
        awayWp: wp.away,
        href: `/live/${upper}/${m.externalId ?? m.id}`,
      };
    });

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
  // 새 시즌(7/1 경계) knockout 이 아직 없으면 브래킷 전체가 지난 시즌 결과 — 예선이
  // 진행 중인 여름에 구시즌 브래킷이 페이지 상단을 차지하지 않게 접힌 아카이브로 강등.
  const uclBracketPrevSeason =
    uclBracket.length > 0 &&
    seasonStart != null &&
    uclBracket.every((s) => s.legs.every((l) => l.startTime < seasonStart));
  const uclPrevSeasonLabel = seasonStart
    ? `${seasonStart.getUTCFullYear() - 1}-${String(seasonStart.getUTCFullYear()).slice(2)}`
    : "";

  // NBA/NHL — 플레이오프 브라켓 (raw 의 series.type='playoff' 매치만)
  const isNba = upper === "NBA";
  const isNhl = upper === "NHL";
  const isUsPlayoff = isNba || isNhl;
  let playoffBracket: ReturnType<typeof getNbaPlayoffBracket> = [];
  let playoffWinProbs: ReturnType<typeof simulatePlayoff> = [];
  let playoffSeasonDone = false;
  // 지난 시즌 AI 예측 성적 (비시즌 아카이브 — 채점 완료 매치 실측)
  let lastSeasonPred: {
    label: string;
    oneXTwo: MarketRate;
    over: MarketRate;
    hc: MarketRate;
    strong: MarketRate;
  } | null = null;
  if (isUsPlayoff) {
    playoffBracket = await loadPlayoffBracket(isNhl ? "NHL" : "NBA");
    // 플레이오프 우승 시뮬레이션 — 진행 중 시리즈 잔여 + 미시작 라운드 5000회 Monte Carlo.
    // 파이널까지 끝난 시즌(비시즌 아카이브)엔 시뮬레이션할 잔여 경기가 없으므로 skip.
    playoffSeasonDone = isPlayoffSeasonDone(playoffBracket);
    if (playoffBracket.length > 0 && !isWorldCup && !playoffSeasonDone) {
      const eloMap: Record<number, number> = {};
      for (const [tid, rating] of elo.ratings) eloMap[tid] = rating;
      playoffWinProbs = simulatePlayoff(playoffBracket, eloMap, {
        iterations: 5000,
      });
    }
    // 비시즌 — 직전 시즌 채점 완료 매치로 AI 예측 성적 실측 (accuracy 페이지와 같은 채점 필드).
    if (playoffSeasonDone) {
      const label = playoffSeasonLabel(playoffBracket);
      const endYear = Number(label.slice(0, 4)) + 1;
      const rows = await prisma.match.findMany({
        where: {
          league: upper,
          predCorrect: { not: null },
          startTime: { gte: new Date(Date.UTC(endYear - 1, 8, 1)) }, // 시즌 개막 전 9/1 경계
        },
        select: {
          predCorrect: true,
          predOverCorrect: true,
          predHcCorrect: true,
          predHome: true,
          predDraw: true,
          predAway: true,
        },
      });
      if (rows.length > 0) {
        const threshold = strongPickThreshold(upper);
        lastSeasonPred = {
          label,
          oneXTwo: rateOf(rows.map((m) => ({ ok: m.predCorrect }))),
          over: rateOf(rows.map((m) => ({ ok: m.predOverCorrect }))),
          hc: rateOf(rows.map((m) => ({ ok: m.predHcCorrect }))),
          strong: rateOf(
            rows
              .filter(
                (m) =>
                  Math.max(m.predHome ?? 0, m.predDraw ?? 0, m.predAway ?? 0) >=
                  threshold,
              )
              .map((m) => ({ ok: m.predCorrect })),
          ),
        };
      }
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

  // (2026-08-15) 빅5 를 정적 JSON(player-season-stats)으로 덮어쓰던 override 제거 —
  // 같은 JSON 을 leaders cron 이 매일 DB 에 적재하므로 중복이었고, JSON 에 행이 1~14개뿐인
  // 리그(J1·SERBIA_SL 등)까지 가로채 신선한 DB 리더보드를 지난 시즌 라벨로 바꿔치기했다.
  // PC 중앙 컬럼용 팀 로고/국기 — 이 페이지는 자체 조립이라 공용 로더 밖에서 직접 부착.
  await attachLeaderTeamLogos(upper, leaderRowsByCategory);
  // 부문별 1위 요약 (최대 4부문) — 풀 TOP 10 리더보드는 /standings/[league] 가 정본.
  const leaderCatDefs = CATEGORIES_BY_LEAGUE[LEAGUE_TO_SPORT[upper] ?? "SOCCER"] ?? [];
  const leaderTops = leaderCatDefs
    .filter((c) => (leaderRowsByCategory[c.key]?.length ?? 0) > 0)
    .slice(0, 4)
    .map((c) => ({ cat: c, row: leaderRowsByCategory[c.key][0] }));

  // 우승 확률 추이 — 일일 시뮬 스냅샷(2개 이상부터 차트 노출). WC·KBO 공용 변환.
  type ChampionTrend = { data: WcTrendPoint[]; teams: { name: string; color: string }[] };
  const buildChampionTrend = (snaps: { date: string; data: unknown }[]): ChampionTrend | null => {
    if (snaps.length < 2) return null;
    type SnapRow = { team: string; champion: number };
    const latest = snaps[snaps.length - 1].data as SnapRow[];
    const TREND_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#64748b"];
    const topTeams = [...latest]
      .sort((a, b) => b.champion - a.champion)
      .slice(0, 6)
      .map((r, i) => ({ en: r.team, name: toKoreanTeamName(r.team, upper) || r.team, color: TREND_COLORS[i] }));
    return {
      teams: topTeams.map(({ name, color }) => ({ name, color })),
      data: snaps.map((s) => {
        const rows = s.data as SnapRow[];
        const point: WcTrendPoint = { date: s.date.slice(5).replace("-", "/") };
        for (const t of topTeams) {
          const r = rows.find((x) => x.team === t.en);
          point[t.name] = r ? +(r.champion * 100).toFixed(1) : null;
        }
        return point;
      }),
    };
  };
  let wcTrend: ChampionTrend | null = null;
  if (isWorldCup) {
    const snaps = await prisma.worldCupSimSnapshot.findMany({ orderBy: { date: "asc" } });
    wcTrend = buildChampionTrend(snaps.map((s) => ({ date: s.date, data: s.data })));
  }

  // 야구(KBO·NPB·MLB) — 우승 확률 추이(league-sim-snapshot cron, KST 07:00)
  // + 상대전적 매트릭스(KBO 10팀·NPB 12팀만 — MLB 30팀은 표가 비실용적이라 제외)
  const isKbo = upper === "KBO";
  const isBaseballSim = ["KBO", "NPB", "MLB"].includes(upper);
  let baseballTrend: ChampionTrend | null = null;
  let baseballH2H: H2HMatrix | null = null;
  if (isBaseballSim) {
    const snaps = await prisma.leagueSimSnapshot.findMany({ where: { league: upper }, orderBy: { date: "asc" } });
    baseballTrend = buildChampionTrend(snaps.map((s) => ({ date: s.date, data: s.data })));
    if (upper !== "MLB") baseballH2H = await getBaseballH2H(upper);
  }

  return (
    <div className="relative">
      <AmbientGlow />
      {/* 히어로 */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
        <div
          className={`absolute inset-0 -z-10 bg-gradient-to-br ${info.gradient} opacity-10 dark:opacity-15`}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> AI 예측
          </span>
          <div className="mt-4 flex items-center gap-3 mb-2">
            <LeagueBadge league={upper} size="md" />
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
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
              "UCL", "UEL", "UECL", "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS",
            ] as const
          ).map((l) => (
            <PredTab key={l} l={l} active={l === upper} />
          ))}
          <CategoryDot />
          <PredTab l="NBA" active={"NBA" === upper} />
          <PredTab l="WNBA" active={"WNBA" === upper} />
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

        {/* 야구 — 오늘의 선발 매치업 보드 진입 */}
        {["KBO", "MLB", "NPB"].includes(upper) && (
          <Link
            href="/predictions/starters"
            prefetch={false}
            className="flex items-center justify-between rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white px-5 py-4 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-emerald-400 dark:bg-white/[0.04] dark:shadow-none dark:hover:border-emerald-500 dark:hover:bg-white/[0.06]"
          >
            <div>
              <p className="flex items-center gap-1.5 font-bold break-keep"><CircleDot className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden /> 오늘의 선발 투수 매치업</p>
              <p className="text-xs text-neutral-500 mt-0.5 break-keep">KBO·MLB·NPB 선발 맞대결 — ERA·WHIP·K/9·최근 폼 비교, 발표 시 자동 갱신</p>
            </div>
            <span className="text-emerald-500 font-bold">→</span>
          </Link>
        )}

        {/* 조별 통합 베스트 11 진입 (12조) */}
        {isWorldCup && (
          <section>
            <Heading title="조별 통합 베스트 11" subtitle="각 조 4개국 선수를 아우른 최고의 11인 · 평점·순위 매일 갱신" />
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:max-w-xl">
              {"ABCDEFGHIJKL".split("").map((g) => (
                <Link
                  key={g}
                  href={`/world-cup/best-xi/${g.toLowerCase()}`}
                  className="flex items-center justify-center py-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-sm font-bold transition"
                >
                  {g}조
                </Link>
              ))}
            </div>
            {/* 12개 조를 아우른 종합 분석 글 진입점 (글 #2105) */}
            <Link
              href="/articles/world-cup-best-xi-2026"
              className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-amber-600 dark:text-amber-400 hover:underline"
            >
              <BookOpen className="h-4 w-4 shrink-0" aria-hidden /> 12개 조 통합 베스트 11 종합 분석 글 보기 →
            </Link>
          </section>
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

            {/* 우승 확률 추이 — 일일 스냅샷 누적 (경기 결과가 확률을 어떻게 움직였는지) */}
            {wcTrend && (
              <section>
                <Heading
                  title="📈 우승 확률 추이"
                  subtitle="매일 13시 시뮬레이션 스냅샷 — 경기 결과에 따라 우승 확률이 어떻게 움직이는지 (TOP 6)"
                />
                <div className="sm:max-w-2xl">
                  <WcChampionTrendChart data={wcTrend.data} teams={wcTrend.teams} />
                </div>
              </section>
            )}

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
              <WorldCupGroupTable
                rows={wc}
                nameToId={new Map(Array.from(teamNameById, ([id, name]): [string, number] => [name, id]))}
              />
            </section>
          </>
        )}

        {/* UCL — knockout 브래킷. 구시즌 결과뿐이면 접힌 아카이브로 (새 시즌 예선이 먼저 보이게) */}
        {isUcl && uclBracketPrevSeason && (
          <details className="rounded-xl border border-neutral-200 dark:border-white/10 px-4 py-3">
            <summary className="cursor-pointer text-sm font-bold text-neutral-600 dark:text-neutral-300">
              지난 시즌 ({uclPrevSeasonLabel}) 토너먼트 브래킷 보기
            </summary>
            <div className="mt-3">
              <UclBracket series={uclBracket} />
            </div>
          </details>
        )}
        {isUcl && !uclBracketPrevSeason && (
          <section>
            <Heading
              title="UCL 토너먼트 브래킷"
              subtitle="16강 → 8강 → 4강 → 결승 (2-leg 합산 진출)"
            />
            <UclBracket series={uclBracket} />
          </section>
        )}

        {/* NBA/NHL — 플레이오프 브라켓 (진행 중일 때만 — 끝난 시즌 아카이브는 순위 페이지로) */}
        {isUsPlayoff && playoffBracket.length > 0 && !playoffSeasonDone && (
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
        {isUsPlayoff && playoffSeasonDone && (
          <>
            {/* 지난 시즌 AI 예측 성적 — 채점 완료 매치 실측 (accuracy 페이지와 같은 채점 필드) */}
            {lastSeasonPred && (
              <section>
                <Heading
                  title={`${lastSeasonPred.label} 시즌 AI 예측 성적`}
                  subtitle={`채점 완료 ${lastSeasonPred.oneXTwo.evaluated.toLocaleString()}경기 실측 — 다음 시즌도 같은 모델로 예측합니다`}
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { name: "승패 (1X2)", stat: lastSeasonPred.oneXTwo },
                    { name: "오버/언더", stat: lastSeasonPred.over },
                    { name: "핸디캡", stat: lastSeasonPred.hc },
                    { name: "Strong Pick", stat: lastSeasonPred.strong },
                  ].map((m) => (
                    <div
                      key={m.name}
                      className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] p-4"
                    >
                      <div className="text-[11px] text-neutral-500">{m.name}</div>
                      <div className="mt-1 text-2xl font-bold tabular-nums">
                        {m.stat.evaluated > 0
                          ? `${(m.stat.rate * 100).toFixed(1)}%`
                          : "—"}
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">
                        {m.stat.correct.toLocaleString()}/{m.stat.evaluated.toLocaleString()}경기 적중
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">
                  전체 리그·기간별 적중률은{" "}
                  <Link
                    href="/predictions/accuracy"
                    className="font-bold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    AI 적중률 페이지
                  </Link>
                  에서 확인할 수 있습니다.
                </p>
              </section>
            )}
            <p className="text-sm text-neutral-500">
              지난 시즌 플레이오프 브라켓은{" "}
              <Link
                href={`/standings/${upper}`}
                className="font-bold text-amber-600 dark:text-amber-400 hover:underline"
              >
                {upper} 순위 페이지
              </Link>
              에서 볼 수 있습니다.
            </p>
          </>
        )}

        {/* NBA/NHL — 플레이오프 우승 시뮬레이션 (Monte Carlo 5000회) */}
        {isUsPlayoff && playoffWinProbs.length > 0 && (
          <section>
            <Heading
              title={isNhl ? "스탠리컵 우승 확률" : "NBA 우승 확률"}
              subtitle="진행 중 시리즈 잔여 + 미시작 라운드 Monte Carlo 5,000회 (Elo 기반)"
            />
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] overflow-hidden">
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

        {/* NBA — 예상 순위는 수집기 데이터(팀 중복/매치 누락) 정비 중이라 숨김.
            (api-sports NBA 팀 id 불일치 — 별도 수집기 fix 예정) */}
        {isNba && canSimulate && (
          <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500">
            ⓘ NBA 예상 순위는 데이터 정비 중입니다.
            {playoffSeasonDone
              ? " 다음 시즌 플레이오프가 시작되면 브라켓·우승 확률이 여기에 표시됩니다."
              : " 플레이오프 브라켓·우승 확률은 위에서 정상 제공됩니다."}
          </div>
        )}

        {/* 일반 리그 — Monte Carlo 결과 (UCL·NBA 제외) */}
        {canSimulate && !isWorldCup && !isUcl && !isNba && (
          <>
            {/* 우승 확률 — 일정이 잘린 리그는 숨기고 사유를 밝힌다 */}
            {showChampion ? (
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
            ) : scheduleIntegrity.failure === "no-remaining" ? (
              /* 남은 경기가 아예 없음 — 비시즌·시즌 종료의 정상 상태라 경고색을 쓰지 않는다.
                 (NBA·NHL 이 여름에 여기 들어온다. 끝난 시즌의 1위는 확률이 아니라 사실이다.) */
              <section>
                <Heading title="우승 확률" subtitle="남은 경기가 없어 계산하지 않습니다" />
                <div className="sm:max-w-xl rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-600 dark:text-neutral-300">
                  <p className="leading-relaxed">
                    시즌이 끝났거나 다음 일정이 아직 등록되지 않았습니다. 남은 경기가 없으면
                    우승은 확률이 아니라 이미 정해진 결과라 따로 계산하지 않습니다.
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
                    아래 예상 승점·순위는 지금까지 치른 경기 기준입니다.
                  </p>
                </div>
              </section>
            ) : (
              <section>
                <Heading title="우승 확률" subtitle="이번 시즌은 아직 계산하지 않습니다" />
                <div className="sm:max-w-xl rounded-xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                  <p className="font-semibold">우승 확률을 표시하지 않습니다.</p>
                  <p className="mt-1 leading-relaxed">{scheduleIntegrity.reason}</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-amber-800/80 dark:text-amber-200/70">
                    남은 경기가 실제보다 적게 잡히면 1위 팀의 우승 확률이 실제보다 훨씬 높게
                    나옵니다. 잘못된 수치를 보여주는 대신 일정이 채워질 때까지 감춥니다.
                    아래 예상 승점·순위는 지금까지 치른 경기 기준입니다.
                  </p>
                </div>
              </section>
            )}

            {/* 야구 — 우승 확률 추이 (일일 스냅샷 누적, KBO·NPB·MLB) */}
            {isBaseballSim && baseballTrend && (
              <section>
                <Heading
                  title="📈 우승 확률 추이"
                  subtitle="매일 아침 7시 시뮬레이션 스냅샷 — 시즌이 흐르며 우승 확률이 어떻게 움직이는지 (TOP 6)"
                />
                <div className="sm:max-w-2xl">
                  <WcChampionTrendChart data={baseballTrend.data} teams={baseballTrend.teams} />
                </div>
              </section>
            )}

            {/* KBO — 가을야구(5강) 진출 확률 */}
            {isKbo && (
              <section>
                <Heading title="🍂 가을야구 (5강) 진출 확률" subtitle="시즌 종료 시점 5위 이상 — 포스트시즌 진출 가능성" />
                <div className="sm:max-w-xl">
                  <MonteCarloBar
                    data={mc
                      .filter((r) => r.top5 >= 0.01)
                      .sort((a, b) => b.top5 - a.top5)
                      .slice(0, 10)
                      .map((r) => ({
                        name: teamKoNameById.get(r.teamId) ?? `Team ${r.teamId}`,
                        value: r.top5 * 100,
                      }))}
                  />
                </div>
              </section>
            )}

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

            {/* 현재 순위 vs Elo 예측 비교 — 외부 standings 데이터 있을 때 */}
            {externalStandings.length > 0 && (
              <section>
                <Heading
                  title="현재 순위 vs Elo 예측"
                  subtitle="실제 순위와 우리 모델의 예상 최종 순위 비교 — 큰 격차는 상승/하락 후보"
                />
                <CurrentVsPredictionCard
                  externalStandings={externalStandings}
                  mc={mc}
                  teamKoNameById={teamKoNameById}
                />
              </section>
            )}

            {/* 예상 최종 순위 표 */}
            <section>
              <Heading
                title="예상 최종 순위"
                subtitle="평균 승점 · 평균 순위 · 최근 5경기"
              />
              <ProjectionsTable
                showChampion={showChampion}
                rows={mc.map((r) => ({
                  name: teamKoNameById.get(r.teamId) ?? `Team ${r.teamId}`,
                  logoUrl: teamLogoById.get(r.teamId) ?? null,
                  ...r,
                  currentPosition: externalPosByTeamId.get(r.teamId) ?? r.currentPosition,
                }))}
                top4Cutoff={
                  // UCL 진출권 4팀 — 무승부 있는 (축구) + 강등 있는 (1부) 리그만 노출.
                  info.showDraw && info.relegationCount > 0 ? 4 : 0
                }
                relegationCount={info.relegationCount}
                formByTeamId={formByTeamId}
              />
            </section>

            {/* 야구 — 팀 간 상대전적 매트릭스 (KBO·NPB, 경기 종료 시 자동 갱신) */}
            {baseballH2H && (
              <section>
                <Heading
                  title="⚔️ 팀 상대전적 매트릭스"
                  subtitle="2026 시즌 맞대결 승-무-패 (행 팀 기준) — 진한 초록일수록 우세, 경기 종료 시 자동 갱신"
                />
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
                  <table className="w-full text-xs min-w-[640px]">
                    <thead>
                      <tr className="bg-neutral-50 dark:bg-neutral-900 text-[11px] text-neutral-500">
                        <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-neutral-50 dark:bg-neutral-900">팀 \ 상대</th>
                        {baseballH2H.teams.map((t) => (
                          <th key={t} className="px-1 py-2 text-center font-semibold">{t.split(" ")[0]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {baseballH2H.teams.map((row) => (
                        <tr key={row}>
                          <td className="px-2 py-1.5 font-bold whitespace-nowrap sticky left-0 bg-white dark:bg-neutral-950">{row.split(" ")[0]}</td>
                          {baseballH2H!.teams.map((col) => {
                            if (row === col) return <td key={col} className="px-1 py-1.5 text-center text-neutral-300 dark:text-neutral-700">—</td>;
                            const c = baseballH2H!.cells[row]?.[col];
                            if (!c || c.w + c.d + c.l === 0) return <td key={col} className="px-1 py-1.5 text-center text-neutral-400">·</td>;
                            const diff = c.w - c.l;
                            const cls = diff > 1 ? "bg-emerald-100 dark:bg-emerald-900/40 font-bold" : diff > 0 ? "bg-emerald-50 dark:bg-emerald-900/20" : diff < -1 ? "bg-rose-100 dark:bg-rose-900/40" : diff < 0 ? "bg-rose-50 dark:bg-rose-900/20" : "";
                            return (
                              <td key={col} className={`px-1 py-1.5 text-center tabular-nums ${cls}`}>
                                {c.w}-{c.d}-{c.l}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 text-[11px] text-neutral-400 bg-neutral-50/50 dark:bg-neutral-900/40 border-t border-neutral-200 dark:border-neutral-800">
                    승-무-패 (행 팀 기준) · 천적 관계는 진한 색 — 시즌 전 경기 자동 집계
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* 이번 주 빅매치 — 상위 3팀 직접 대결 강조 (해당 매치 있을 때만) */}
        {keyMatches.length > 0 && (
          <section>
            <KeyMatchPreview matches={keyMatches} />
          </section>
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
                    const wp = calcWinProbability(homeElo, awayElo, upper, { homeTeamName: m.homeTeam.name });
                    const marketProbs: [number, number, number] | null =
                      m.marketHome != null && m.marketAway != null
                        ? [m.marketHome, m.marketDraw ?? 0, m.marketAway]
                        : null;
                    const modelProbs: [number, number, number] = [
                      wp.home,
                      wp.draw ?? 0,
                      wp.away,
                    ];
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
                              {displayTeamName(m.homeTeam.name, upper)}
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
                              {displayTeamName(m.awayTeam.name, upper)}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <ProbBar wp={wp} hideDraw={!info.showDraw} fullWidth />
                            </div>
                            <ValueBetIndicator
                              modelProbs={modelProbs}
                              marketProbs={marketProbs}
                            />
                          </div>
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
                const wp = calcWinProbability(homeElo, awayElo, upper, { homeTeamName: m.homeTeam.name });
                const kst = new Date(m.startTime.getTime() + 9 * 3600 * 1000);
                const dateLabel = `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
                const timeLabel = `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
                const marketProbs: [number, number, number] | null =
                  m.marketHome != null && m.marketAway != null
                    ? [m.marketHome, m.marketDraw ?? 0, m.marketAway]
                    : null;
                const modelProbs: [number, number, number] = [
                  wp.home,
                  wp.draw ?? 0,
                  wp.away,
                ];
                return (
                  <div key={m.id} className="px-3 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-neutral-500 tabular-nums whitespace-nowrap">
                        {dateLabel} · {timeLabel}
                      </div>
                      <ValueBetIndicator
                        modelProbs={modelProbs}
                        marketProbs={marketProbs}
                      />
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
                          {displayTeamName(m.homeTeam.name, upper)}
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
                          {displayTeamName(m.awayTeam.name, upper)}
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

        {/* 시즌 리더보드 요약 — 부문별 1위만. 풀 리더보드(TOP 10)는 /standings/[league] 가
            정본 (2026-08-15 역할 분리: predictions=확률 전용, standings=순위·기록 정본).
            WORLD_CUP 은 상단 실시간 선수 랭킹으로 대체 (중복 노출 방지) */}
        {!isWorldCup && leaderTops.length > 0 && (
          <section>
            <Heading
              title="시즌 리더보드"
              subtitle={`${leaderSeason} 시즌 · 부문별 1위`}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {leaderTops.map(({ cat, row }) => (
                <div
                  key={cat.key}
                  className="rounded-xl bg-white ring-1 ring-black/5 px-3 py-2.5 dark:bg-white/[0.04] dark:ring-white/10"
                >
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {cat.emoji} {cat.label} 1위
                  </div>
                  <div className="mt-1 text-sm font-semibold truncate">{row.playerName}</div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-neutral-500 truncate">{row.teamName}</span>
                    <span className="text-sm font-bold tabular-nums shrink-0">
                      {row.value.toFixed(cat.decimals ?? 0)}
                      {row.unit ? (
                        <span className="ml-0.5 text-[10px] font-normal text-neutral-500">{row.unit}</span>
                      ) : null}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href={`/standings/${upper}#leaderboard`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              전체 리더보드 보기 (TOP 10) →
            </Link>
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
  WNBA: "WNBA",
  UEL: "유로파",
  UECL: "유로파 컨퍼런스",
};

function PredTab({ l, active }: { l: string; active: boolean }) {
  return (
    <Link
      href={`/predictions/${l}`}
      className={`shrink-0 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        active
          ? "bg-neutral-900 text-white ring-neutral-900 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] dark:bg-white dark:text-neutral-900 dark:ring-white"
          : "bg-neutral-100 text-neutral-600 ring-black/5 hover:-translate-y-0.5 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-400 dark:ring-white/10 dark:hover:bg-white/[0.1]"
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

interface ProjectionsTableProps {
  rows: ProjectionRow[];
  /** UCL 권 진출 라인 (Top N) — N 이 0보다 크면 상위 N 행 emerald 배경. EPL/라리가/분데스 등 = 4. */
  top4Cutoff?: number;
  /** 강등 라인 (하위 N 팀). 0보다 크면 하위 N 행 rose 배경. */
  relegationCount?: number;
  /** teamId → 최근 5경기 W/D/L. */
  formByTeamId?: Map<number, Array<{ result: "W" | "D" | "L"; startTime: Date }>>;
  /** false 면 우승 % 열을 통째로 감춘다 (일정 결손 리그). */
  showChampion?: boolean;
}

function ProjectionsTable({
  rows,
  top4Cutoff = 0,
  relegationCount = 0,
  formByTeamId,
  showChampion = true,
}: ProjectionsTableProps) {
  const total = rows.length;
  const relegationStartIdx = relegationCount > 0 ? total - relegationCount : total;
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium w-10">#</th>
            <th className="text-left px-3 py-2 font-medium">팀</th>
            <th className="text-left px-3 py-2 font-medium hidden sm:table-cell w-32">최근 5</th>
            <th className="text-right px-3 py-2 font-medium">승점</th>
            <th className="text-right px-3 py-2 font-medium">예상 승점</th>
            {showChampion && (
              <th className="text-right px-3 py-2 font-medium">우승 %</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {rows.map((r, i) => {
            const isTop4 = top4Cutoff > 0 && i < top4Cutoff;
            const isRelegation = relegationCount > 0 && i >= relegationStartIdx;
            // 행 배경 (PO 권 emerald / 강등권 rose). hover 효과는 유지.
            const rowBg = isTop4
              ? "bg-emerald-50/60 dark:bg-emerald-500/5 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
              : isRelegation
              ? "bg-rose-50/60 dark:bg-rose-500/5 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50";
            // 좌측 # 셀에 작은 색띠 (왼쪽 경계선 강조).
            const rankAccent = isTop4
              ? "border-l-2 border-emerald-500"
              : isRelegation
              ? "border-l-2 border-rose-500"
              : "border-l-2 border-transparent";
            const form = formByTeamId?.get(r.teamId) ?? [];
            return (
              <tr
                key={r.teamId}
                id={`team-${r.teamId}`}
                className={`${rowBg} target:bg-amber-50 dark:target:bg-amber-500/10 scroll-mt-24`}
              >
                <td
                  className={`px-3 py-2 font-bold text-neutral-400 tabular-nums ${rankAccent}`}
                >
                  {i + 1}
                </td>
                <td className="px-3 py-2 font-medium truncate">
                  <Link
                    href={`/teams/${r.teamId}`}
                    className="inline-flex items-center gap-2 hover:underline underline-offset-2 decoration-neutral-300 dark:decoration-neutral-600"
                  >
                    <PredTeamLogo src={r.logoUrl} name={r.name} />
                    <span className="truncate">{r.name}</span>
                  </Link>
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <TeamFormBadges form={form} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                  {r.currentPoints}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {r.expectedPoints.toFixed(1)}
                </td>
                {showChampion && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.champion >= 0.001
                      ? `${(r.champion * 100).toFixed(1)}%`
                      : "<0.1%"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* 범례 — top4 / 강등권이 있을 때만 표시 */}
      {(top4Cutoff > 0 || relegationCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500">
          {top4Cutoff > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-emerald-500/30 border-l-2 border-emerald-500" />
              <span>Top {top4Cutoff} (UCL 권)</span>
            </span>
          )}
          {relegationCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-rose-500/30 border-l-2 border-rose-500" />
              <span>강등권 (하위 {relegationCount}팀)</span>
            </span>
          )}
        </div>
      )}
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

function WorldCupGroupTable({ rows, nameToId }: { rows: WorldCupRow[]; nameToId?: Map<string, number> }) {
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
                  {(() => {
                    const tid = nameToId?.get(r.teamName);
                    const flag = fifaFlag(r.teamName) || (isKorea ? "🇰🇷" : "");
                    const inner = (
                      <>
                        {flag && <span className="shrink-0" aria-hidden>{flag} </span>}
                        {toKoreanTeamName(r.teamName, "WORLD_CUP")}
                      </>
                    );
                    return tid ? (
                      <Link
                        href={`/national-teams/${tid}`}
                        className="flex-1 truncate hover:underline underline-offset-2 decoration-neutral-300 dark:decoration-neutral-600"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <span className="flex-1 truncate">{inner}</span>
                    );
                  })()}
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

/** 현재 standings 와 Elo 예측 비교 — Top 5 + 격차 가장 큰 5팀 (상승/하락 후보).
 *  좌측 = 현재 순위, 중앙 = Δ (예측 - 현재), 우측 = Elo 예측 순위. */
function CurrentVsPredictionCard({
  externalStandings,
  mc,
  teamKoNameById,
}: {
  externalStandings: Array<{ teamId: number; position: number; points: number }>;
  mc: Array<{ teamId: number; expectedPosition: number; expectedPoints: number }>;
  teamKoNameById: Map<number, string>;
}) {
  const mcByTeamId = new Map(mc.map((r) => [r.teamId, r]));
  // 격차 = 현재 순위 - 예측 순위. + 면 우리가 더 높게 예상 (상승), - 면 낮게 (하락).
  type Row = {
    teamId: number;
    name: string;
    currentPos: number;
    predictedPos: number | null;
    delta: number | null;
  };
  const rows: Row[] = externalStandings.map((s) => {
    const m = mcByTeamId.get(s.teamId);
    const predicted = m ? Math.round(m.expectedPosition * 10) / 10 : null;
    return {
      teamId: s.teamId,
      name: teamKoNameById.get(s.teamId) ?? `Team ${s.teamId}`,
      currentPos: s.position,
      predictedPos: predicted,
      delta: predicted == null ? null : s.position - predicted,
    };
  });

  const top5 = rows.slice(0, 5);
  // 격차 큰 (상승/하락 후보) 5팀 — top5 와 중복 제외, |delta| desc
  const movers = rows
    .filter((r) => !top5.includes(r) && r.delta != null && Math.abs(r.delta) >= 1.5)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
    .slice(0, 5);

  const renderRow = (r: Row, idx: number) => {
    const d = r.delta;
    const deltaColor =
      d == null
        ? "text-neutral-400"
        : d > 0.8
          ? "text-emerald-600 dark:text-emerald-400"
          : d < -0.8
            ? "text-rose-600 dark:text-rose-400"
            : "text-neutral-500";
    const deltaText =
      d == null ? "—" : d === 0 ? "±0" : `${d > 0 ? "+" : ""}${d.toFixed(1)}`;
    return (
      <tr
        key={r.teamId}
        id={`team-${r.teamId}`}
        className={`${idx % 2 === 0 ? "bg-neutral-50/50 dark:bg-white/[0.02]" : ""} target:bg-amber-50 dark:target:bg-amber-500/10 scroll-mt-24`}
      >
        <td className="px-3 py-2 text-sm tabular-nums font-bold text-neutral-700 dark:text-neutral-300 w-12">
          {r.currentPos}
        </td>
        <td className="px-3 py-2 text-sm font-medium truncate">{r.name}</td>
        <td className={`px-3 py-2 text-sm tabular-nums font-bold text-center ${deltaColor}`}>
          {deltaText}
        </td>
        <td className="px-3 py-2 text-sm tabular-nums text-neutral-600 dark:text-neutral-400 w-16 text-right">
          {r.predictedPos == null ? "—" : r.predictedPos.toFixed(1)}
        </td>
      </tr>
    );
  };

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
        <div className="px-3 py-2 text-xs font-bold border-b border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.04]">
          상위 5팀 — 우승 경쟁
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-neutral-500 dark:text-neutral-400">
              <th className="px-3 py-1.5 text-left font-semibold">현재</th>
              <th className="px-3 py-1.5 text-left font-semibold">팀</th>
              <th className="px-3 py-1.5 text-center font-semibold">Δ</th>
              <th className="px-3 py-1.5 text-right font-semibold">예측</th>
            </tr>
          </thead>
          <tbody>{top5.map(renderRow)}</tbody>
        </table>
      </div>

      <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
        <div className="px-3 py-2 text-xs font-bold border-b border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.04]">
          격차 큰 팀 — 상승·하락 후보
        </div>
        {movers.length === 0 ? (
          <div className="px-3 py-6 text-xs text-neutral-500 text-center">
            현재 순위와 예측이 모두 1.5계단 이내 — 큰 변동 없음
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-neutral-500 dark:text-neutral-400">
                <th className="px-3 py-1.5 text-left font-semibold">현재</th>
                <th className="px-3 py-1.5 text-left font-semibold">팀</th>
                <th className="px-3 py-1.5 text-center font-semibold">Δ</th>
                <th className="px-3 py-1.5 text-right font-semibold">예측</th>
              </tr>
            </thead>
            <tbody>{movers.map(renderRow)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
