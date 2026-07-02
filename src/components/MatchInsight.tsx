// 매치 인사이트 박스 — 글 상세 페이지에 임베드.
// 차트 시각화 강화 버전 (recharts 기반).

import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { leagueHasDraw } from "@/lib/sports/sport-leagues";
import {
  fitDixonColes,
  predictDixonColes,
  type DcMatch,
  type DcPrediction,
} from "@/lib/predict/dixon-coles";
import { toKoreanPlayerName } from "@/lib/player-names";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { mlbHeadshotUrl } from "@/lib/sports/mlb-stats-api";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcEloHistory } from "@/lib/predict/elo-history";
import { calcForm } from "@/lib/predict/form";
import {
  calcSeasonStats,
  calcSeasonForm,
} from "@/lib/predict/season-stats";
import { calcStandings } from "@/lib/predict/standings";
import { calcHomeAway } from "@/lib/predict/home-away";
import { calcStreaks } from "@/lib/predict/streak";
import { calcRecentTrend } from "@/lib/predict/recent-trend";
import {
  calcWinProbability,
  summarizeWinProb,
} from "@/lib/predict/win-probability";
import {
  bestDoubleChance,
  dcCorrect,
  predictTotalMarket,
  predictBttsMarket,
  predictHandicapMarket,
  handicapCorrect,
  overActual,
  bttsActual,
  getSportProfile,
  SOCCER_LEAGUES_FOR_MARKETS,
  type DcPick,
} from "@/lib/predict/markets";
import {
  computeStarterAdjustment,
  applyStarterToWinProb,
} from "@/lib/predict/starter-adjust";
import {
  computeGoalieAdjustment,
  applyGoalieToWinProb,
} from "@/lib/predict/goalie-adjust";
import { blendWithMarket } from "@/lib/predict/market-blend";
import { nationalElo } from "@/lib/predict/build-context";
import type { PredictMatch } from "@/lib/predict/types";
import type { ReactNode } from "react";
import EloMeter from "./EloMeter";
// recharts 3종은 지연 로딩(청크 분리) — 글 상세 초기 번들 경량화 (감사 B3)
import { WinProbDonut, EloTrendChart, GoalScatter } from "./charts/lazy-insight-charts";
import SeasonFormHeatmap from "./charts/SeasonFormHeatmap";
import TeamMatchup from "./TeamMatchup";
import MatchInsightTabs, { type InsightTab } from "./MatchInsightTabs";
import MatchStatsCard from "./MatchStatsCard";

interface Props {
  match: {
    id: number;
    league: string;
    status: string;
    homeTeamId: number;
    awayTeamId: number;
    homeScore: number | null;
    awayScore: number | null;
    startTime: Date;
    homeTeam: { id: number; name: string };
    awayTeam: { id: number; name: string };
    /** 글 생성 시점 저장 예측 — 있으면 위젯이 이 값 사용 (본문=위젯 단일 소스).
     *  없으면(글 없는 매치) 렌더 시점 재계산 fallback. */
    predHome?: number | null;
    predDraw?: number | null;
    predAway?: number | null;
    predWinner?: string | null;
    /** 글 생성 시점 저장 Elo·시즌 승점 — 있으면 위젯이 이 값 사용 (본문=위젯 단일 소스).
     *  없으면(글 없는 매치) 렌더 시점 재계산 fallback. */
    eloHome?: number | null;
    eloAway?: number | null;
    homeSeasonPoints?: number | null;
    awaySeasonPoints?: number | null;
    marketHome?: number | null;
    marketDraw?: number | null;
    marketAway?: number | null;
    marketBookmakers?: number | null;
    oddsHome?: number | null;
    oddsDraw?: number | null;
    oddsAway?: number | null;
    oddsTotalLine?: number | null;
    oddsOver?: number | null;
    oddsUnder?: number | null;
    oddsHcLine?: number | null;
    oddsHcHome?: number | null;
    oddsHcAway?: number | null;
    oddsBttsYes?: number | null;
    oddsBttsNo?: number | null;
    oddsDc1X?: number | null;
    oddsDc12?: number | null;
    oddsDcX2?: number | null;
    homeStarter?: string | null;
    awayStarter?: string | null;
    startersUpdatedAt?: Date | null;
    homeGoalie?: string | null;
    awayGoalie?: string | null;
    goaliesUpdatedAt?: Date | null;
  };
  /** 라이브 페이지에서 sport 별 팀 통계 카드 prop 으로 주입 (탭 자동 추가).
      ESPN team statistics (MLB) / TheSports detailLive.stats (KBO/NPB) / SoccerTeamStatsCard 등 */
  teamStatsContent?: ReactNode;
  /** 라이브 배당 카드 prop (탭 자동 추가) — LiveOddsCard 또는 같은 데이터 카드 */
  liveOddsContent?: ReactNode;
  /** 맞대결·최근 폼 카드 prop (탭 자동 추가) — 농구 BasketballH2HCard 등 풍부한 H2H */
  h2hRichContent?: ReactNode;
  /** 선수 기록(박스스코어) 카드 prop (탭 자동 추가) — 농구 BasketballBoxScoreTab 등 */
  playerBoxContent?: ReactNode;
  /** 스포츠별 추가 탭 — 축구 라인업/팀통계/맞대결/경기정보 등. starters 다음에 삽입.
   *  { key, label, enabled, content } 배열. 모든 스포츠가 같은 탭 UI 를 쓰도록 통일. */
  extraTabs?: Array<{ key: string; label: string; enabled: boolean; content: ReactNode }>;
  /** NPB 선발 투수 사진 URL — npb.jp scraping 필요해 SSR 단에서 미리 fetch 후 주입.
   *  KBO 는 kboPhotoUrl, MLB 는 mlbHeadshotUrl 로 pid 즉시 생성하므로 불필요. */
  homeStarterPhoto?: string;
  awayStarterPhoto?: string;
}

/** 선발 투수 정보 — DB JSON 에서 파싱. MLB 는 풀 stats, KBO/NPB 는 이름만 (statizId 옵션). */
interface MlbStarterInfo {
  pid?: number; // MLB Stats API player id (KBO statiz id 도 여기에 들어갈 수 있음)
  name: string;
  hand?: string;
  era?: number;
  whip?: number;
  k9?: number;
  wins?: number;
  losses?: number;
  gs?: number;
  ip?: string;
}

/** NHL 골리 정보 */
interface NhlGoalieInfo {
  pid: number;
  name: string;
  gaa?: number;
  savePctg?: number;
  wins?: number;
  losses?: number;
  otLosses?: number;
  gamesPlayed?: number;
  shutouts?: number;
  isBest?: boolean;
}

function parseStarter(s?: string | null): MlbStarterInfo | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as MlbStarterInfo;
  } catch {
    return null;
  }
}

function parseGoalie(s?: string | null): NhlGoalieInfo | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as NhlGoalieInfo;
  } catch {
    return null;
  }
}

export default async function MatchInsight({
  match,
  teamStatsContent,
  liveOddsContent,
  h2hRichContent,
  playerBoxContent,
  extraTabs,
  homeStarterPhoto,
  awayStarterPhoto,
}: Props) {
  const dbMatches = await prisma.match.findMany({
    where: { league: match.league },
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
  const referenceTime = match.startTime;

  // === 모든 통계 계산 ===
  const beforeMatches = matches.filter(
    (m) => m.startTime.getTime() < referenceTime.getTime(),
  );

  // 축구 Dixon-Coles 예상 스코어 (Elo 가 못 주는 스코어라인 — DC 신규 능력).
  let dcPred: DcPrediction | null = null;
  if (leagueHasDraw(match.league)) {
    try {
      const scored = beforeMatches.filter(
        (m) => m.homeScore != null && m.awayScore != null,
      );
      const s = fitDixonColes(scored as unknown as DcMatch[], referenceTime);
      dcPred = predictDixonColes(s, match.homeTeamId, match.awayTeamId);
    } catch {
      // silent — DC 실패 시 표시 생략
    }
  }

  // 실제 경기 기록 (코너·슈팅·점유율·카드) — 종료 축구 경기만. 예측 아닌 사실 통계.
  const matchStats =
    leagueHasDraw(match.league) && match.status === "FINISHED"
      ? await prisma.matchStats.findUnique({ where: { matchId: match.id } })
      : null;

  // 기대득점(xG) — af fixtureStats[home, away].expectedGoals (종료 빅5·MLS·브라질 등만 제공).
  // "경기 기록" 카드 상단에 강조 + 실제 스코어 대비 인사이트.
  let matchXg: { home: number; away: number; homeScore: number | null; awayScore: number | null } | null = null;
  if (leagueHasDraw(match.league) && match.status === "FINISHED") {
    const xgRow = await prisma.match.findUnique({
      where: { id: match.id },
      select: { fixtureStats: true },
    });
    if (xgRow?.fixtureStats) {
      try {
        const fs = JSON.parse(xgRow.fixtureStats) as { expectedGoals?: number }[];
        const h = fs[0]?.expectedGoals;
        const a = fs[1]?.expectedGoals;
        if (typeof h === "number" && typeof a === "number") {
          matchXg = { home: h, away: a, homeScore: match.homeScore, awayScore: match.awayScore };
        }
      } catch {
        // 손상 JSON — xG 생략
      }
    }
  }

  const eloTable = calcEloTable(beforeMatches);
  // 단일 소스 — 글 스냅샷 Elo 가 있으면 그 값 사용 (본문 글과 100% 일치). 없으면 재계산.
  // 국가대항(월드컵·친선)은 클럽 매치 히스토리가 없어 calcEloTable 이 전원 1500 —
  // build-context/predictionEngine 과 동일하게 국가대표 시드 Elo 로 fallback.
  const isNationalLeague =
    match.league === "WORLD_CUP" || match.league === "INTL_FRIENDLY";
  const homeElo =
    match.eloHome ??
    (isNationalLeague
      ? nationalElo(match.homeTeam.name)
      : getElo(eloTable, match.homeTeamId));
  const awayElo =
    match.eloAway ??
    (isNationalLeague
      ? nationalElo(match.awayTeam.name)
      : getElo(eloTable, match.awayTeamId));

  const homeForm = calcForm(matches, match.homeTeamId, referenceTime, 5);
  const awayForm = calcForm(matches, match.awayTeamId, referenceTime, 5);

  const baseWinProb = calcWinProbability(homeElo, awayElo, match.league, {
    homeTeamName: match.homeTeam.name,
  });

  // MLB 선발 투수 / NHL 골리 가중치
  const homeStarterEarly = parseStarter(match.homeStarter);
  const awayStarterEarly = parseStarter(match.awayStarter);
  const homeGoalieEarly = parseGoalie(match.homeGoalie);
  const awayGoalieEarly = parseGoalie(match.awayGoalie);
  const starterAdj = computeStarterAdjustment(homeStarterEarly, awayStarterEarly);
  const goalieAdj = computeGoalieAdjustment(homeGoalieEarly, awayGoalieEarly);
  let winProb: { home: number; draw: number; away: number } = baseWinProb;
  if (starterAdj.applied)
    winProb = applyStarterToWinProb(winProb, starterAdj);
  if (goalieAdj.applied)
    winProb = applyGoalieToWinProb(winProb, goalieAdj);

  // 시장 odds blending — 베팅사이트 평균 implied 와 ensemble
  let marketBlended = false;
  if (match.marketHome != null && match.marketAway != null) {
    const blended = blendWithMarket(winProb, {
      home: match.marketHome,
      draw: match.marketDraw,
      away: match.marketAway,
      bookmakers: match.marketBookmakers,
    });
    if (blended.blended) {
      winProb = { home: blended.home, draw: blended.draw, away: blended.away };
      marketBlended = true;
    }
  }

  // 단일 소스 — 글 생성 시점에 저장된 예측이 있으면 그 값을 사용 (본문 글과 100% 일치).
  // 위 재계산은 글 없는 매치용 fallback. 글이 있는 매치는 며칠 전 Elo/배당으로 쓴 본문과
  // 지금 재계산이 달라지는 불일치(76% vs 64%)를 방지 — 저장값으로 고정.
  if (match.predHome != null && match.predDraw != null && match.predAway != null) {
    winProb = { home: match.predHome, draw: match.predDraw, away: match.predAway };
  }
  const summary = summarizeWinProb(
    winProb,
    toKoreanTeamName(match.homeTeam.name),
    toKoreanTeamName(match.awayTeam.name),
  );

  // === 예측 근거 분해 — 실제 1X2 승률에 반영되는 신호만 (정직성: 폼·H2H·득실은 미반영) ===
  const eloGap = Math.round(homeElo - awayElo);
  const predBasis: { label: string; detail: string }[] = [
    {
      label: "Elo 레이팅",
      detail: `홈 ${Math.round(homeElo)} · 원정 ${Math.round(awayElo)} (${eloGap >= 0 ? "+" : ""}${eloGap} ${eloGap > 0 ? "홈 우위" : eloGap < 0 ? "원정 우위" : "대등"})`,
    },
  ];
  if (starterAdj.applied) {
    const he = homeStarterEarly?.era;
    const ae = awayStarterEarly?.era;
    const detail =
      he != null && ae != null
        ? `${he < ae ? "홈 선발 우위" : he > ae ? "원정 선발 우위" : "대등"} — ERA ${he.toFixed(2)} vs ${ae.toFixed(2)}`
        : "선발 매치업 반영 — 상세는 아래 선발 카드";
    predBasis.push({ label: "선발 투수", detail });
  }
  if (goalieAdj.applied) {
    const hg = homeGoalieEarly?.gaa;
    const ag = awayGoalieEarly?.gaa;
    const detail =
      hg != null && ag != null
        ? `${hg < ag ? "홈 골리 우위" : hg > ag ? "원정 골리 우위" : "대등"} — GAA ${hg.toFixed(2)} vs ${ag.toFixed(2)}`
        : "골리 매치업 반영 — 상세는 아래 골리 카드";
    predBasis.push({ label: "골리", detail });
  }
  if (marketBlended)
    predBasis.push({ label: "시장 배당", detail: "베팅사이트 평균 확률과 앙상블 블렌드" });

  // === AI 예측 시장 ===
  const isSoccer = SOCCER_LEAGUES_FOR_MARKETS.has(match.league);
  const sportProfile = getSportProfile(match.league);
  const isFinished =
    match.status === "FINISHED" &&
    match.homeScore != null &&
    match.awayScore != null;
  const actualWinner = isFinished
    ? match.homeScore! > match.awayScore!
      ? ("HOME" as const)
      : match.awayScore! > match.homeScore!
        ? ("AWAY" as const)
        : ("DRAW" as const)
    : null;
  const oneXTwoPick: "HOME" | "DRAW" | "AWAY" =
    winProb.home >= winProb.away && winProb.home >= winProb.draw
      ? "HOME"
      : winProb.away >= winProb.draw
        ? "AWAY"
        : "DRAW";
  const oneXTwoCorrect = actualWinner ? oneXTwoPick === actualWinner : null;

  // 축구 전용 — DC + BTTS
  const dc = isSoccer ? bestDoubleChance(winProb) : null;
  const dcOk = dc && actualWinner ? dcCorrect(dc.pick, actualWinner) : null;
  const btts = isSoccer
    ? predictBttsMarket(matches, match.league, match.homeTeamId, match.awayTeamId, referenceTime)
    : null;
  const btPick = btts ? (btts.pBtts >= 0.5 ? "YES" : "NO") : null;
  const btOk =
    isFinished && btPick
      ? btPick === bttsActual(match.homeScore!, match.awayScore!)
      : null;

  // 모든 종목 공통 — OVER/UNDER + 핸디캡
  const total = sportProfile
    ? predictTotalMarket(matches, match.league, match.homeTeamId, match.awayTeamId, referenceTime, {
        homeStarterEra: homeStarterEarly?.era,
        awayStarterEra: awayStarterEarly?.era,
        homeTeamName: match.homeTeam.name,
      })
    : null;
  const ovPick = total ? (total.pOver >= 0.5 ? "OVER" : "UNDER") : null;
  const ovOk =
    isFinished && ovPick && total
      ? ovPick === overActual(match.homeScore!, match.awayScore!, total.line)
      : null;
  const hc = sportProfile
    ? predictHandicapMarket(matches, match.league, match.homeTeamId, match.awayTeamId, referenceTime)
    : null;
  const hcOk =
    isFinished && hc
      ? handicapCorrect(hc.pick, hc.line, match.homeScore!, match.awayScore!)
      : null;

  // Elo 변천사 (양 팀 시즌 추이)
  const history = calcEloHistory(beforeMatches, [
    match.homeTeamId,
    match.awayTeamId,
  ]);
  const homeHistory = history.get(match.homeTeamId) ?? [];
  const awayHistory = history.get(match.awayTeamId) ?? [];

  // 시즌 산점도용 모든 팀 통계
  const seasonStats = calcSeasonStats(matches, referenceTime);
  const teams = await prisma.team.findMany({
    where: {
      league: match.league,
      id: { in: Array.from(seasonStats.keys()) },
    },
    select: { id: true, name: true },
  });
  const teamNameById = new Map(teams.map((t) => [t.id, toKoreanTeamName(t.name)]));

  const scatterPoints = Array.from(seasonStats.values())
    .filter((s) => s.played >= 5)
    .map((s) => ({
      name: teamNameById.get(s.teamId) ?? `Team ${s.teamId}`,
      goalsFor: s.avgGoalsFor,
      goalsAgainst: s.avgGoalsAgainst,
      highlight:
        s.teamId === match.homeTeamId
          ? ("home" as const)
          : s.teamId === match.awayTeamId
            ? ("away" as const)
            : null,
    }));

  const leagueAvgGF =
    scatterPoints.reduce((s, p) => s + p.goalsFor, 0) /
    Math.max(scatterPoints.length, 1);
  const leagueAvgGA =
    scatterPoints.reduce((s, p) => s + p.goalsAgainst, 0) /
    Math.max(scatterPoints.length, 1);

  // 시즌 폼 히트맵
  const homeSeasonForm = calcSeasonForm(
    matches,
    match.homeTeamId,
    referenceTime,
  );
  const awaySeasonForm = calcSeasonForm(
    matches,
    match.awayTeamId,
    referenceTime,
  );

  // 시즌 순위 + 공격/수비 랭킹
  const standings = calcStandings(matches, referenceTime);
  const homeRow = standings.byTeam.get(match.homeTeamId);
  const awayRow = standings.byTeam.get(match.awayTeamId);
  const totalTeams = standings.rows.length;
  const homeAttackRank = standings.attackRank.get(match.homeTeamId);
  const homeDefenseRank = standings.defenseRank.get(match.homeTeamId);
  const awayAttackRank = standings.attackRank.get(match.awayTeamId);
  const awayDefenseRank = standings.defenseRank.get(match.awayTeamId);

  // 홈/원정 split
  const homeHA = calcHomeAway(matches, match.homeTeamId, referenceTime);
  const awayHA = calcHomeAway(matches, match.awayTeamId, referenceTime);

  // Streak
  const homeStreak = calcStreaks(matches, match.homeTeamId, referenceTime);
  const awayStreak = calcStreaks(matches, match.awayTeamId, referenceTime);

  // Recent trend
  const homeTrend = calcRecentTrend(matches, match.homeTeamId, referenceTime, 5);
  const awayTrend = calcRecentTrend(matches, match.awayTeamId, referenceTime, 5);

  // 무승부 표기 여부 — 축구만 무 표시 (leagueHasDraw 단일 진실). MLB·NHL·WNBA 등
  // 비축구 전부 무 숨김. 이전엔 NBA/KBO/NPB/LOL 만 하드코딩돼 MLB·하키·마이너 야구가 누락.
  const hideDraw = !leagueHasDraw(match.league);
  const dataSparse = eloTable.processed < 5;
  // sparse 라도 선발 투수 카드만은 표시 (KBO/NPB 시즌 초반 등)
  const sparseHasStarters =
    (match.league === "MLB" || match.league === "KBO" || match.league === "NPB") &&
    (homeStarterEarly || awayStarterEarly);

  if (dataSparse) {
    // sparse(과거 매치 <5) 라도 라이브/주입 데이터(축구 라인업·팀통계, 야구 선발 등)는
    // Elo 누적과 무관하니 탭으로 표시. Elo 기반 팀전력/예측/시장 탭만 생략.
    //
    // AI 예측 탭 — 공식 예측(predHome 저장값) 또는 국가대항 시드 Elo 가 있으면 히스토리
    // 누적과 무관하게 신뢰 가능 → 표시. 월드컵 개막 직후 "AI 분석 없음" 문제 해소
    // (2026-06-11 사용자 보고: world_cup-preview 글 위젯이 "데이터 누적 중"만 표시).
    const sparseHasPrediction =
      (match.predHome != null && match.predDraw != null && match.predAway != null) ||
      isNationalLeague;
    const sparseTabs: InsightTab[] = [
      sparseHasPrediction && {
        key: "predict",
        label: "AI 예측",
        enabled: true,
        content: (
          <div className="space-y-6">
            <Section title="승률 추정">
              <WinProbDonut
                homeProb={winProb.home}
                drawProb={winProb.draw}
                awayProb={winProb.away}
                homeName={toKoreanTeamName(match.homeTeam.name)}
                awayName={toKoreanTeamName(match.awayTeam.name)}
                hideDraw={hideDraw}
              />
            </Section>
            <Section title="Elo 레이팅">
              <div className="space-y-3">
                <EloMeter
                  name={toKoreanTeamName(match.homeTeam.name)}
                  rating={homeElo}
                  opponentRating={awayElo}
                />
                <EloMeter
                  name={toKoreanTeamName(match.awayTeam.name)}
                  rating={awayElo}
                  opponentRating={homeElo}
                />
              </div>
              {isNationalLeague && (
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
                  ⓘ 국가대표 Elo — World Football Elo Ratings 기반 시드값으로, 본선 경기
                  결과가 쌓이면 자동 갱신됩니다.
                </p>
              )}
            </Section>
          </div>
        ),
      },
      sparseHasStarters && {
        key: "starters",
        label: "선발 매치업",
        enabled: true,
        content: (
          <StarterCard
            home={homeStarterEarly}
            away={awayStarterEarly}
            homeTeam={toKoreanTeamName(match.homeTeam.name)}
            awayTeam={toKoreanTeamName(match.awayTeam.name)}
            league={match.league}
            homeStarterPhoto={homeStarterPhoto}
            awayStarterPhoto={awayStarterPhoto}
          />
        ),
      },
      ...(extraTabs ?? []),
      teamStatsContent && { key: "team-stats", label: "팀 통계", enabled: true, content: teamStatsContent },
      h2hRichContent && { key: "h2h-rich", label: "맞대결·최근 폼", enabled: true, content: h2hRichContent },
      playerBoxContent && { key: "player-box", label: "선수 기록", enabled: true, content: playerBoxContent },
      liveOddsContent && { key: "odds", label: "라이브 배당", enabled: true, content: liveOddsContent },
    ].filter((t): t is InsightTab => !!t && (t as InsightTab).enabled);

    if (sparseTabs.length > 0) {
      return (
        <MatchInsightTabs
          headerLabel="매치 인사이트"
          headerSubLabel={
            isNationalLeague
              ? "국가대표 시드 Elo 기반"
              : `시즌 초반 데이터 누적 중 (${eloTable.processed}경기)`
          }
          headerSummary={sparseHasPrediction ? summary : undefined}
          tabs={sparseTabs}
        />
      );
    }
    return (
      <section className="my-10 space-y-4 rounded-[1.5rem] sm:rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-white/45">
          <span>매치 인사이트</span>
          <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-400 dark:text-white/35">
            · 시즌 초반 데이터 누적 중 ({eloTable.processed}경기)
          </span>
        </div>
        <p className="text-sm text-neutral-500">
          분석에 필요한 과거 매치 데이터가 충분하지 않습니다. 시즌이 진행될수록 정확도가 올라갑니다.
        </p>
      </section>
    );
  }

  // MLB 선발 투수 / NHL 골리 — 위에서 이미 parse 한 값 재사용
  const homeStarter = homeStarterEarly;
  const awayStarter = awayStarterEarly;
  const hasStarters =
    (match.league === "MLB" || match.league === "KBO" || match.league === "NPB") &&
    (homeStarter || awayStarter);
  const homeGoalie = homeGoalieEarly;
  const awayGoalie = awayGoalieEarly;
  const hasGoalies = match.league === "NHL" && (homeGoalie || awayGoalie);

  // Strong Pick / Value Bet 판정
  const topConfidence = Math.max(winProb.home, winProb.away, winProb.draw);
  const isStrongPick = topConfidence >= 0.65;
  const isValueBet =
    match.marketHome != null &&
    match.marketAway != null &&
    (() => {
      const ourTopProb =
        oneXTwoPick === "HOME"
          ? winProb.home
          : oneXTwoPick === "AWAY"
            ? winProb.away
            : winProb.draw;
      const marketTopProb =
        oneXTwoPick === "HOME"
          ? match.marketHome
          : oneXTwoPick === "AWAY"
            ? match.marketAway
            : (match.marketDraw ?? 0);
      return ourTopProb - (marketTopProb ?? 0) >= 0.05;
    })();

  // === 통합 탭 카드 (네이버 스타일) 용 sections 변수화 ===
  const startersContent = (hasStarters || hasGoalies) ? (
    <>
      {hasStarters && (
        <StarterCard
          home={homeStarter}
          away={awayStarter}
          homeTeam={toKoreanTeamName(match.homeTeam.name)}
          awayTeam={toKoreanTeamName(match.awayTeam.name)}
          league={match.league}
          homeStarterPhoto={homeStarterPhoto}
          awayStarterPhoto={awayStarterPhoto}
        />
      )}
      {hasGoalies && (
        <GoalieCard
          home={homeGoalie}
          away={awayGoalie}
          homeTeam={toKoreanTeamName(match.homeTeam.name)}
          awayTeam={toKoreanTeamName(match.awayTeam.name)}
        />
      )}
    </>
  ) : null;

  const matchupSubsections: React.ReactNode[] = [];
  if (homeRow && awayRow) {
    matchupSubsections.push(
      <TeamMatchup
        key="tm"
        showDraw={!hideDraw}
        home={{
          name: toKoreanTeamName(match.homeTeam.name),
          form: homeForm.results,
          position: homeRow.position,
          seasonPoints: match.homeSeasonPoints ?? homeRow.points,
          totalTeams: totalTeams,
          played: homeRow.played,
          wins: homeRow.wins,
          draws: homeRow.draws,
          losses: homeRow.losses,
          goalsFor: homeRow.goalsFor,
          goalsAgainst: homeRow.goalsAgainst,
          attackRank: homeAttackRank,
          defenseRank: homeDefenseRank,
          splitLabel: "홈",
          splitPlayed: homeHA.home.played,
          splitWins: homeHA.home.wins,
          splitDraws: homeHA.home.draws,
          splitLosses: homeHA.home.losses,
          splitPpg: homeHA.home.ppg,
          recentMatches: homeTrend.matches,
          recentAvgFor: homeTrend.avgGoalsFor,
          recentAvgAgainst: homeTrend.avgGoalsAgainst,
          recentPpg: homeTrend.ppg,
          winningRun: homeStreak.winningRun,
          unbeatenRun: homeStreak.unbeatenRun,
          losingRun: homeStreak.losingRun,
          cleanSheetsLast5: homeStreak.cleanSheetsLast5,
          failedToScoreLast5: homeStreak.failedToScoreLast5,
        }}
        away={{
          name: toKoreanTeamName(match.awayTeam.name),
          form: awayForm.results,
          position: awayRow.position,
          seasonPoints: match.awaySeasonPoints ?? awayRow.points,
          totalTeams: totalTeams,
          played: awayRow.played,
          wins: awayRow.wins,
          draws: awayRow.draws,
          losses: awayRow.losses,
          goalsFor: awayRow.goalsFor,
          goalsAgainst: awayRow.goalsAgainst,
          attackRank: awayAttackRank,
          defenseRank: awayDefenseRank,
          splitLabel: "원정",
          splitPlayed: awayHA.away.played,
          splitWins: awayHA.away.wins,
          splitDraws: awayHA.away.draws,
          splitLosses: awayHA.away.losses,
          splitPpg: awayHA.away.ppg,
          recentMatches: awayTrend.matches,
          recentAvgFor: awayTrend.avgGoalsFor,
          recentAvgAgainst: awayTrend.avgGoalsAgainst,
          recentPpg: awayTrend.ppg,
          winningRun: awayStreak.winningRun,
          unbeatenRun: awayStreak.unbeatenRun,
          losingRun: awayStreak.losingRun,
          cleanSheetsLast5: awayStreak.cleanSheetsLast5,
          failedToScoreLast5: awayStreak.failedToScoreLast5,
        }}
      />,
    );
  }

  // matchup 탭에 시즌 폼 + 공격 vs 수비 도 같이
  const matchupContent = matchupSubsections.length > 0 ? (
    <div className="space-y-6">{matchupSubsections}</div>
  ) : null;

  // 옛 sequential return 부터 시작 — 아래 markup 은 더 이상 렌더되지 않지만
  // 변수 capture 와 인덱싱이 같은 scope 이므로 그대로 유지하면 비효율. 통째 교체.
  // === 시즌 폼 + 공격 vs 수비 — 팀 전력 탭에 함께 묶기 ===
  if (homeSeasonForm.length > 0 || awaySeasonForm.length > 0) {
    matchupSubsections.push(
      <Section key="form" title="시즌 폼">
        <div className="space-y-4">
          {homeSeasonForm.length > 0 && (
            <SeasonFormHeatmap
              name={toKoreanTeamName(match.homeTeam.name)}
              cells={homeSeasonForm}
            />
          )}
          {awaySeasonForm.length > 0 && (
            <SeasonFormHeatmap
              name={toKoreanTeamName(match.awayTeam.name)}
              cells={awaySeasonForm}
            />
          )}
        </div>
      </Section>,
    );
  }
  if (scatterPoints.length >= 5) {
    matchupSubsections.push(
      <Section key="scatter" title="공격 vs 수비 (시즌 평균)">
        <GoalScatter
          points={scatterPoints}
          leagueAvgGF={leagueAvgGF}
          leagueAvgGA={leagueAvgGA}
        />
        <div className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
          오른쪽 위로 갈수록 좋음. 점선은 리그 평균.{" "}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-blue-500" />
            {toKoreanTeamName(match.homeTeam.name)}
          </span>
          ,{" "}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-rose-500" />
            {toKoreanTeamName(match.awayTeam.name)}
          </span>
        </div>
      </Section>,
    );
  }
  const matchupContentFinal =
    matchupSubsections.length > 0 ? (
      <div className="space-y-6">{matchupSubsections}</div>
    ) : null;

  // === AI 예측 탭 — 항상 표시 ===
  const predictContent = (
    <div className="space-y-6">
      <Section title="승률 추정">
        <WinProbDonut
          homeProb={winProb.home}
          drawProb={winProb.draw}
          awayProb={winProb.away}
          homeName={toKoreanTeamName(match.homeTeam.name)}
          awayName={toKoreanTeamName(match.awayTeam.name)}
          hideDraw={hideDraw}
        />
      </Section>
      <Section title="이 예측의 근거">
        <div className="rounded-[1rem] bg-zinc-50 p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 space-y-2">
          {predBasis.map((b) => (
            <div key={b.label} className="flex gap-2.5 text-sm">
              <span className="w-16 shrink-0 font-semibold text-zinc-700 dark:text-white/80">
                {b.label}
              </span>
              <span className="text-zinc-600 dark:text-white/55">{b.detail}</span>
            </div>
          ))}
          <p className="mt-1 border-t border-black/5 pt-2 text-[11px] leading-relaxed text-zinc-500 dark:border-white/10 dark:text-white/45">
            ⓘ 위 신호만 승률에 직접 반영됩니다. 최근 폼·상대전적(H2H)·득실 추이는 아래 참고 지표이며, 예측 확률 계산에는 들어가지 않습니다.
          </p>
        </div>
      </Section>
      {dcPred && dcPred.sampleHome >= 3 && dcPred.sampleAway >= 3 && (
        <Section title="예상 스코어 · 기대 득점">
          <div className="rounded-[1rem] bg-zinc-50 p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
            <div className="flex items-center justify-center gap-3 sm:gap-5 text-center">
              <div className="min-w-0 flex-1 truncate text-sm font-semibold">
                {toKoreanTeamName(match.homeTeam.name)}
              </div>
              <div className="text-3xl font-black tabular-nums text-zinc-950 dark:text-white">
                {dcPred.topScore.home}
                <span className="mx-1.5 text-zinc-400">:</span>
                {dcPred.topScore.away}
              </div>
              <div className="min-w-0 flex-1 truncate text-sm font-semibold">
                {toKoreanTeamName(match.awayTeam.name)}
              </div>
            </div>
            <div className="mt-2 text-center text-[11px] text-zinc-500 dark:text-white/45">
              가장 유력한 스코어 ({Math.round(dcPred.topScore.prob * 100)}%) · 기대 득점{" "}
              {dcPred.lambdaHome.toFixed(1)}–{dcPred.lambdaAway.toFixed(1)} (합{" "}
              {dcPred.expGoals.toFixed(1)})
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
              ⓘ Dixon-Coles 득점 모델 — 팀별 공·수 강도와 홈 어드밴티지로 추정한 예상 스코어입니다.
              OVER 2.5 {Math.round(dcPred.probOver25 * 100)}% · 양 팀 득점{" "}
              {Math.round(dcPred.probBttsYes * 100)}%.
            </p>
          </div>
        </Section>
      )}
      <Section title={isFinished ? "AI 예측 종합 · 결과 비교" : "AI 예측 종합"}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MarketCard
            label={hideDraw ? "승패 예측" : "결과 (1X2)"}
            pick={
              oneXTwoPick === "HOME"
                ? "홈 승"
                : oneXTwoPick === "AWAY"
                  ? "원정 승"
                  : "무승부"
            }
            prob={
              oneXTwoPick === "HOME"
                ? winProb.home
                : oneXTwoPick === "AWAY"
                  ? winProb.away
                  : winProb.draw
            }
            correct={oneXTwoCorrect}
            isFinished={isFinished}
            tone="blue"
          />
          {dc && (
            <MarketCard
              label="더블 찬스"
              pick={dcPickLabel(
                dc.pick,
                toKoreanTeamName(match.homeTeam.name),
                toKoreanTeamName(match.awayTeam.name),
              )}
              prob={dc.prob}
              correct={dcOk}
              isFinished={isFinished}
              tone="emerald"
            />
          )}
          {total && ovPick && (
            <MarketCard
              label={`OVER ${total.line}`}
              pick={
                ovPick === "OVER"
                  ? `OVER (${total.line}+)`
                  : `UNDER (${total.line}-)`
              }
              prob={ovPick === "OVER" ? total.pOver : 1 - total.pOver}
              correct={ovOk}
              isFinished={isFinished}
              tone="orange"
            />
          )}
          {hc && (
            <MarketCard
              label={`핸디캡 ${hc.line > 0 ? `±${hc.line}` : ""}`}
              pick={`${hc.pick === "HOME" ? toKoreanTeamName(match.homeTeam.name) : toKoreanTeamName(match.awayTeam.name)} ${hc.pick === "HOME" ? "-" : "+"}${hc.line}`}
              prob={hc.prob}
              correct={hcOk}
              isFinished={isFinished}
              tone="violet"
            />
          )}
          {btts && btPick && (
            <MarketCard
              label="양 팀 득점"
              pick={btPick === "YES" ? "YES" : "NO"}
              prob={btPick === "YES" ? btts.pBtts : 1 - btts.pBtts}
              correct={btOk}
              isFinished={isFinished}
              tone="pink"
            />
          )}
        </div>
        {(total || hc) && (
          <p className="mt-3 text-[11px] text-neutral-500">
            {total &&
              `기대 총득점 ${total.expectedTotal.toFixed(1)} · 기준선 ${total.line}`}
            {total && hc && " · "}
            {hc &&
              `기대 마진 ${hc.expectedMargin >= 0 ? "+" : ""}${hc.expectedMargin.toFixed(1)}`}
          </p>
        )}
      </Section>
      <Section title="Elo 레이팅">
        <div className="space-y-3 mb-4">
          <EloMeter
            name={toKoreanTeamName(match.homeTeam.name)}
            rating={homeElo}
            opponentRating={awayElo}
          />
          <EloMeter
            name={toKoreanTeamName(match.awayTeam.name)}
            rating={awayElo}
            opponentRating={homeElo}
          />
        </div>
        {homeHistory.length > 1 && awayHistory.length > 1 && (
          <>
            <div className="mt-2 text-xs text-neutral-500 mb-1">시즌 추이</div>
            <EloTrendChart
              homeSeries={{
                name: toKoreanTeamName(match.homeTeam.name),
                color: "#3b82f6",
                points: homeHistory.map((h, i) => ({
                  index: i,
                  date: h.date.toISOString().slice(0, 10),
                  rating: h.rating,
                })),
              }}
              awaySeries={{
                name: toKoreanTeamName(match.awayTeam.name),
                color: "#f43f5e",
                points: awayHistory.map((h, i) => ({
                  index: i,
                  date: h.date.toISOString().slice(0, 10),
                  rating: h.rating,
                })),
              }}
            />
          </>
        )}
      </Section>
      <p className="text-[11px] text-neutral-500 leading-relaxed pt-2 border-t border-neutral-200 dark:border-neutral-800">
        ⓘ Elo 레이팅 + 홈 어드밴티지 기반 통계 추정치입니다. 실제 경기 양상과
        다를 수 있습니다. (데이터셋 {eloTable.processed}경기 기준)
      </p>
    </div>
  );

  // === 시장 odds 탭 ===
  const hasMarketCompare =
    match.marketHome != null && match.marketAway != null;
  const hasOddsTable = !!(
    match.oddsHome ||
    match.oddsOver ||
    match.oddsHcHome ||
    match.oddsBttsYes ||
    match.oddsDc1X
  );
  const marketContent =
    hasMarketCompare || hasOddsTable ? (
      <div className="space-y-6">
        {hasMarketCompare && (
          <Section title="예측 비교 — 순수 Elo · 시장 반영 · 베팅시장">
            <MarketCompareTable
              baseHome={baseWinProb.home}
              baseDraw={baseWinProb.draw}
              baseAway={baseWinProb.away}
              modelHome={winProb.home}
              modelDraw={winProb.draw}
              modelAway={winProb.away}
              marketHome={match.marketHome!}
              marketDraw={match.marketDraw ?? null}
              marketAway={match.marketAway!}
              homeName={toKoreanTeamName(match.homeTeam.name)}
              awayName={toKoreanTeamName(match.awayTeam.name)}
              bookmakers={match.marketBookmakers ?? 0}
              hideDraw={hideDraw}
            />
          </Section>
        )}
        {hasOddsTable && (
          <Section title="베팅사이트 평균 배당">
            <OddsTable
              homeName={toKoreanTeamName(match.homeTeam.name)}
              awayName={toKoreanTeamName(match.awayTeam.name)}
              oddsHome={match.oddsHome ?? null}
              oddsDraw={match.oddsDraw ?? null}
              oddsAway={match.oddsAway ?? null}
              oddsTotalLine={match.oddsTotalLine ?? null}
              oddsOver={match.oddsOver ?? null}
              oddsUnder={match.oddsUnder ?? null}
              oddsHcLine={match.oddsHcLine ?? null}
              oddsHcHome={match.oddsHcHome ?? null}
              oddsHcAway={match.oddsHcAway ?? null}
              oddsBttsYes={match.oddsBttsYes ?? null}
              oddsBttsNo={match.oddsBttsNo ?? null}
              oddsDc1X={match.oddsDc1X ?? null}
              oddsDc12={match.oddsDc12 ?? null}
              oddsDcX2={match.oddsDcX2 ?? null}
              hideDraw={hideDraw}
            />
          </Section>
        )}
      </div>
    ) : null;

  const headerBadges = (
    <>
      {isStrongPick && (
        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300 dark:ring-amber-300/30">
          Strong Pick
        </span>
      )}
      {isValueBet && (
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-300/30">
          Value Bet
        </span>
      )}
      {marketBlended && (
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 ring-1 ring-black/5 dark:bg-white/[0.06] dark:text-white/70 dark:ring-white/10">
          시장 odds 반영
        </span>
      )}
      {/* 4-2 시점 라벨 — 이 승률은 경기 전 모델값(실시간 WPA 곡선과 구분) */}
      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 ring-1 ring-black/5 dark:bg-white/[0.06] dark:text-white/70 dark:ring-white/10">
        경기 전 기준
      </span>
    </>
  );

  return (
    <MatchInsightTabs
      headerLabel="매치 인사이트"
      headerBadges={headerBadges}
      headerSummary={summary}
      tabs={[
        {
          key: "starters",
          label: hasGoalies ? "선발 골리" : "선발 매치업",
          enabled: !!startersContent,
          content: startersContent,
        },
        // 스포츠별 추가 탭 (축구 라인업/팀통계/맞대결/경기정보 등) — starters 다음, 팀전력 앞.
        ...(extraTabs ?? []),
        {
          key: "matchup",
          label: "팀 전력",
          enabled: !!matchupContentFinal,
          content: matchupContentFinal,
        },
        {
          key: "team-stats",
          label: "팀 통계",
          enabled: !!teamStatsContent,
          content: teamStatsContent ?? null,
        },
        {
          key: "match-stats",
          label: "경기 기록",
          enabled: !!matchStats,
          content: matchStats ? (
            <MatchStatsCard
              stats={matchStats}
              homeName={toKoreanTeamName(match.homeTeam.name)}
              awayName={toKoreanTeamName(match.awayTeam.name)}
              xg={matchXg}
            />
          ) : null,
        },
        {
          key: "h2h-rich",
          label: "맞대결·최근 폼",
          enabled: !!h2hRichContent,
          content: h2hRichContent ?? null,
        },
        {
          key: "player-box",
          label: "선수 기록",
          enabled: !!playerBoxContent,
          content: playerBoxContent ?? null,
        },
        {
          key: "predict",
          label: "AI 예측",
          enabled: true,
          content: predictContent,
        },
        {
          key: "odds",
          label: "라이브 배당",
          enabled: !!liveOddsContent,
          content: liveOddsContent ?? null,
        },
        {
          key: "market",
          label: "시장 odds",
          enabled: !!marketContent,
          content: marketContent,
        },
      ]}
    />
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-white/45">
        {title}
      </div>
      {children}
    </div>
  );
}


function dcPickLabel(pick: DcPick, homeName: string, awayName: string): string {
  if (pick === "1X") return `${homeName} 승 또는 무`;
  if (pick === "X2") return `${awayName} 승 또는 무`;
  return "무승부 제외";
}

const TONE_CARD =
  "bg-zinc-50 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10";

const TONE_CLASSES = {
  blue: TONE_CARD,
  emerald: TONE_CARD,
  orange: TONE_CARD,
  pink: TONE_CARD,
  violet: TONE_CARD,
} as const;
const TONE_TEXT = {
  blue: "text-blue-700 dark:text-blue-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
  orange: "text-orange-700 dark:text-orange-300",
  pink: "text-pink-700 dark:text-pink-300",
  violet: "text-violet-700 dark:text-violet-300",
} as const;

function OddsTable({
  homeName,
  awayName,
  oddsHome,
  oddsDraw,
  oddsAway,
  oddsTotalLine,
  oddsOver,
  oddsUnder,
  oddsHcLine,
  oddsHcHome,
  oddsHcAway,
  oddsBttsYes,
  oddsBttsNo,
  oddsDc1X,
  oddsDc12,
  oddsDcX2,
  hideDraw,
}: {
  homeName: string;
  awayName: string;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  oddsTotalLine: number | null;
  oddsOver: number | null;
  oddsUnder: number | null;
  oddsHcLine: number | null;
  oddsHcHome: number | null;
  oddsHcAway: number | null;
  oddsBttsYes: number | null;
  oddsBttsNo: number | null;
  oddsDc1X: number | null;
  oddsDc12: number | null;
  oddsDcX2: number | null;
  hideDraw: boolean;
}) {
  const fmt = (n: number | null) => (n != null ? n.toFixed(2) : "—");
  return (
    <div className="space-y-2.5">
      {/* 1X2 */}
      {oddsHome && oddsAway && (
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] sm:grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 sm:gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-neutral-500 pr-2 sm:pr-3 border-r border-neutral-200 dark:border-neutral-800">
            1X2
          </div>
          <OddsCell label={homeName} value={fmt(oddsHome)} />
          {!hideDraw && oddsDraw && <OddsCell label="무" value={fmt(oddsDraw)} />}
          {(hideDraw || !oddsDraw) && <div />}
          <OddsCell label={awayName} value={fmt(oddsAway)} />
        </div>
      )}
      {/* OVER/UNDER */}
      {oddsOver && oddsUnder && oddsTotalLine != null && (
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 sm:gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-neutral-500 pr-2 sm:pr-3 border-r border-neutral-200 dark:border-neutral-800">
            O/U
          </div>
          <OddsCell label={`OVER ${oddsTotalLine}`} value={fmt(oddsOver)} />
          <OddsCell label="기준선" value={String(oddsTotalLine)} mono />
          <OddsCell label={`UNDER ${oddsTotalLine}`} value={fmt(oddsUnder)} />
        </div>
      )}
      {/* 핸디캡 */}
      {oddsHcHome && oddsHcAway && oddsHcLine != null && (
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 sm:gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-neutral-500 pr-2 sm:pr-3 border-r border-neutral-200 dark:border-neutral-800">
            HC
          </div>
          <OddsCell label={`${homeName} -${oddsHcLine}`} value={fmt(oddsHcHome)} />
          <OddsCell label="line" value={`±${oddsHcLine}`} mono />
          <OddsCell label={`${awayName} +${oddsHcLine}`} value={fmt(oddsHcAway)} />
        </div>
      )}
      {/* 더블 찬스 (축구만) */}
      {oddsDc1X && oddsDc12 && oddsDcX2 && (
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 sm:gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-neutral-500 pr-2 sm:pr-3 border-r border-neutral-200 dark:border-neutral-800">
            DC
          </div>
          <OddsCell label={`${homeName} 또는 무`} value={fmt(oddsDc1X)} />
          <OddsCell label="홈 또는 원정" value={fmt(oddsDc12)} />
          <OddsCell label={`무 또는 ${awayName}`} value={fmt(oddsDcX2)} />
        </div>
      )}
      {/* BTTS (축구만) */}
      {oddsBttsYes && oddsBttsNo && (
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 sm:gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-neutral-500 pr-2 sm:pr-3 border-r border-neutral-200 dark:border-neutral-800">
            BTTS
          </div>
          <OddsCell label="양 팀 득점 YES" value={fmt(oddsBttsYes)} />
          <div />
          <OddsCell label="양 팀 득점 NO" value={fmt(oddsBttsNo)} />
        </div>
      )}
      <p className="text-[11px] text-neutral-500">
        decimal odds (소수 배당) — 1.85 = 1만원 베팅 시 1.85만원 환수. 베팅사이트
        평균값 (vig 미제거 raw odds).
      </p>
    </div>
  );
}

function OddsCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="text-center min-w-0">
      <div className="text-[10px] text-neutral-500 truncate">{label}</div>
      <div
        className={`text-base sm:text-lg font-bold tabular-nums ${
          mono ? "text-neutral-500" : "text-neutral-900 dark:text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function MarketCompareTable({
  baseHome,
  baseDraw,
  baseAway,
  modelHome,
  modelDraw,
  modelAway,
  marketHome,
  marketDraw,
  marketAway,
  homeName,
  awayName,
  bookmakers,
  hideDraw,
}: {
  // 순수 Elo(시장 blend 전) — 있으면 3-way 비교(순수 Elo · Scorebase 최종 · 시장).
  baseHome?: number;
  baseDraw?: number;
  baseAway?: number;
  modelHome: number;
  modelDraw: number;
  modelAway: number;
  marketHome: number;
  marketDraw: number | null;
  marketAway: number;
  homeName: string;
  awayName: string;
  bookmakers: number;
  hideDraw: boolean;
}) {
  // 순수 Elo 와 최종(시장 반영)이 유의미하게 다를 때만 순수 Elo 열 노출.
  // 같으면(시장 blend 미적용 매치) 기존 2-way(모델 vs 시장 + 차이) 유지.
  const showBase =
    baseHome != null &&
    baseAway != null &&
    (Math.abs(baseHome - modelHome) > 0.01 || Math.abs(baseAway - modelAway) > 0.01);

  const rows = [
    { label: "홈 승", base: baseHome, model: modelHome, market: marketHome, name: homeName, key: "h" },
    !hideDraw && marketDraw !== null
      ? { label: "무", base: baseDraw, model: modelDraw, market: marketDraw, name: "무승부", key: "d" }
      : null,
    { label: "원정 승", base: baseAway, model: modelAway, market: marketAway, name: awayName, key: "a" },
  ].filter(Boolean) as Array<{ label: string; base?: number; model: number; market: number; name: string; key: string }>;

  const pct = (n: number) => Math.round(n * 100);

  return (
    <div>
      <div className="overflow-hidden rounded-[1rem] ring-1 ring-black/5 dark:ring-white/10">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500 dark:bg-white/[0.04] dark:text-white/45">
            <tr>
              <th className="px-2.5 py-2 text-left font-semibold">결과</th>
              {showBase && <th className="px-2 py-2 text-right font-semibold">순수 Elo</th>}
              <th className="px-2 py-2 text-right font-semibold">Scorebase</th>
              <th className="px-2 py-2 text-right font-semibold">시장</th>
              {!showBase && <th className="px-2 py-2 text-right font-semibold">차이</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {rows.map((r) => {
              const gap = r.model - r.market;
              const isValue = gap >= 0.05;
              const isOver = gap <= -0.05;
              // 3-way 일 땐 차이 열 대신 Scorebase 셀 배경으로 Value/Over 인코딩.
              const finalCls = showBase
                ? isValue
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : isOver
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                    : ""
                : "";
              return (
                <tr key={r.key}>
                  <td className="px-2.5 py-2.5">
                    <div className="text-xs text-neutral-500">{r.label}</div>
                    <div className="font-medium truncate">{r.name}</div>
                  </td>
                  {showBase && (
                    <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                      {r.base != null ? `${pct(r.base)}%` : "—"}
                    </td>
                  )}
                  <td className={`px-2 py-2.5 text-right tabular-nums font-bold ${finalCls}`}>
                    {pct(r.model)}%
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                    {pct(r.market)}%
                  </td>
                  {!showBase && (
                    <td className="px-2 py-2.5 text-right">
                      <span
                        className={`tabular-nums font-bold text-xs px-2 py-0.5 rounded ${
                          isValue
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : isOver
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                              : "text-neutral-500"
                        }`}
                      >
                        {gap > 0 ? "+" : ""}
                        {pct(gap)}%p
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500 dark:text-white/45">
        {showBase ? (
          <>
            <b>순수 Elo</b> = 레이팅만의 추정 · <b>Scorebase</b> = 베팅시장 {bookmakers}곳을
            반영한 최종 예측 · <b>시장</b> = 베팅사이트 평균(vig 제거). 초록 = 최종이 시장보다
            5%p+ 자신 있는 결과(Value 후보), 빨강 = 시장이 더 높게 보는 결과.
          </>
        ) : (
          <>
            시장 평균 = {bookmakers}개 베팅사이트 odds(vig 제거) · 초록 표시 = AI 가 시장보다
            5%p+ 자신 있는 결과 (Value Bet 후보)
          </>
        )}
      </p>
    </div>
  );
}

function MarketCard({
  label,
  pick,
  prob,
  correct,
  isFinished,
  tone,
}: {
  label: string;
  pick: string;
  prob: number;
  correct: boolean | null;
  isFinished: boolean;
  tone: keyof typeof TONE_CLASSES;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-[1rem] p-3.5 ${TONE_CLASSES[tone]}`}
    >
      <div className="flex items-center justify-between">
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${TONE_TEXT[tone]}`}>
          {label}
        </div>
        {isFinished && correct !== null && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              correct
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
            }`}
          >
            {correct ? "적중" : "빗나감"}
          </span>
        )}
      </div>
      <div className="truncate text-sm font-bold text-zinc-950 dark:text-white">
        {pick}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">
          {Math.round(prob * 100)}
          <span className="text-sm text-zinc-500 dark:text-white/45">%</span>
        </span>
        <span className="text-[10px] text-zinc-500 dark:text-white/45">추정 확률</span>
      </div>
    </div>
  );
}

/* =====================================================================
 * MLB 선발 투수 카드 — 양 팀 비교 (ERA·WHIP·K9·시즌 W-L)
 * ===================================================================*/
function StarterCard({
  home,
  away,
  homeTeam,
  awayTeam,
  league,
  homeStarterPhoto,
  awayStarterPhoto,
}: {
  home: MlbStarterInfo | null;
  away: MlbStarterInfo | null;
  homeTeam: string;
  awayTeam: string;
  league?: string;
  homeStarterPhoto?: string;
  awayStarterPhoto?: string;
}) {
  // ERA 비교 — 낮은 쪽이 우세
  const homeBetterEra =
    home?.era != null && away?.era != null && home.era < away.era;
  const awayBetterEra =
    home?.era != null && away?.era != null && away.era < home.era;

  const sourceLabel =
    league === "KBO"
      ? "statiz · 내프야"
      : league === "NPB"
        ? "NPB.jp · 공식 예고선발"
        : "MLB Stats API · 시즌 누적";

  return (
    <div className="space-y-3 rounded-[1rem] bg-zinc-50 p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-white/45">
        <span>오늘의 선발 매치업</span>
        <span className="text-zinc-300 dark:text-white/20">·</span>
        <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-400 dark:text-white/35">
          {sourceLabel}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StarterPanel
          starter={away}
          teamName={awayTeam}
          side="원정"
          highlight={awayBetterEra}
          league={league}
          photoUrl={awayStarterPhoto}
        />
        <StarterPanel
          starter={home}
          teamName={homeTeam}
          side="홈"
          highlight={homeBetterEra}
          league={league}
          photoUrl={homeStarterPhoto}
        />
      </div>
      {(home || away) && (home?.era != null || away?.era != null) && (
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          ⓘ ERA(평균자책점)·WHIP(이닝당 출루)·K/9(9이닝당 삼진) 모두 낮을수록 좋고,
          K/9 만 높을수록 좋습니다. 오늘 매치 결과의 가장 큰 변수.
        </p>
      )}
    </div>
  );
}

function StarterPanel({
  starter,
  teamName,
  side,
  highlight,
  league,
  photoUrl,
}: {
  starter: MlbStarterInfo | null;
  teamName: string;
  side: "홈" | "원정";
  highlight: boolean;
  league?: string;
  photoUrl?: string;
}) {
  if (!starter) {
    return (
      <div className="rounded-[0.75rem] border border-dashed border-zinc-300 px-3 py-3 text-sm dark:border-white/15">
        <div className="text-[11px] text-zinc-500 dark:text-white/45">{side} · {teamName}</div>
        <div className="mt-1 text-zinc-400 dark:text-white/35">선발 미정</div>
      </div>
    );
  }

  const handLabel =
    starter.hand === "L" ? "좌완" : starter.hand === "R" ? "우완" : "";

  const hasAnyStat =
    starter.era != null || starter.whip != null || starter.k9 != null;

  // 이름 한글화 (MLB 영문 → 한글, KBO/NPB 는 이미 한글이라 그대로) + 선수 사진.
  const nameKo = toKoreanPlayerName(starter.name);
  const pidNum =
    starter.pid != null
      ? typeof starter.pid === "string"
        ? Number(starter.pid)
        : starter.pid
      : null;
  // NPB 는 pid 로 URL 생성 불가 → SSR 단에서 npb.jp scraping 한 photoUrl 주입받아 사용.
  const photo =
    league === "NPB"
      ? photoUrl ?? null
      : pidNum != null && Number.isFinite(pidNum)
        ? league === "MLB"
          ? mlbHeadshotUrl(pidNum)
          : league === "KBO"
            ? kboPhotoUrl(pidNum)
            : null
        : null;

  return (
    <div
      className={`rounded-[0.875rem] px-3 py-3 ring-1 ${
        highlight
          ? "bg-emerald-500/5 ring-emerald-500/30 dark:bg-emerald-500/10 dark:ring-emerald-400/30"
          : "ring-black/5 dark:ring-white/10"
      }`}
    >
      <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-white/45">
        <span>{side} · {teamName}</span>
        {handLabel && <span>{handLabel}</span>}
      </div>
      <div className="mt-1 flex items-center gap-2.5">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="h-11 w-11 shrink-0 rounded-full bg-zinc-100 object-cover ring-1 ring-black/5 dark:bg-white/[0.06] dark:ring-white/10"
            loading="lazy"
          />
        )}
        {starter.pid != null ? (
          <a
            href={`/players/${starter.pid}${
              league === "KBO" ? "?league=KBO" : league === "NPB" ? "?league=NPB" : ""
            }`}
            className="min-w-0 truncate font-semibold tracking-tight transition hover:text-blue-600 hover:underline dark:hover:text-blue-400"
          >
            {nameKo}
          </a>
        ) : (
          <div className="min-w-0 truncate font-semibold tracking-tight">{nameKo}</div>
        )}
      </div>
      {hasAnyStat && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <StatCell label="ERA" value={fmtNum(starter.era, 2)} />
          <StatCell label="WHIP" value={fmtNum(starter.whip, 2)} />
          <StatCell label="K/9" value={fmtNum(starter.k9, 1)} />
        </div>
      )}
      {(starter.wins != null ||
        starter.gs != null ||
        starter.ip != null) && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-neutral-500">
          {starter.wins != null && starter.losses != null && (
            <span>
              <span className="text-neutral-400">W-L</span>{" "}
              <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
                {starter.wins}-{starter.losses}
              </span>
            </span>
          )}
          {starter.gs != null && (
            <span>
              <span className="text-neutral-400">GS</span>{" "}
              <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
                {starter.gs}
              </span>
            </span>
          )}
          {starter.ip != null && (
            <span>
              <span className="text-neutral-400">IP</span>{" "}
              <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
                {starter.ip}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-1 py-1.5 ring-1 ring-black/5 dark:bg-white/[0.06] dark:ring-white/10">
      <div className="text-[10px] text-zinc-500 dark:text-white/45">{label}</div>
      <div className="text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
        {value}
      </div>
    </div>
  );
}

function fmtNum(n: number | undefined, dp: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(dp);
}

/* =====================================================================
 * NHL 골리 카드 — 양 팀 시즌 best goalie (GAA·SV%·시즌 W-L)
 * ===================================================================*/
function GoalieCard({
  home,
  away,
  homeTeam,
  awayTeam,
}: {
  home: NhlGoalieInfo | null;
  away: NhlGoalieInfo | null;
  homeTeam: string;
  awayTeam: string;
}) {
  const homeBetter =
    home?.gaa != null && away?.gaa != null && home.gaa < away.gaa;
  const awayBetter =
    home?.gaa != null && away?.gaa != null && away.gaa < home.gaa;

  return (
    <div className="space-y-3 rounded-[1rem] bg-zinc-50 p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-white/45">
        <span>예상 시작 골리</span>
        <span className="text-zinc-300 dark:text-white/20">·</span>
        <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-400 dark:text-white/35">
          NHL 공식 API · 시즌 best goalie
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <GoaliePanel
          goalie={away}
          teamName={awayTeam}
          side="원정"
          highlight={awayBetter}
        />
        <GoaliePanel
          goalie={home}
          teamName={homeTeam}
          side="홈"
          highlight={homeBetter}
        />
      </div>
      {(home || away) && (home?.gaa != null || away?.gaa != null) && (
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          ⓘ GAA(평균 실점)는 낮을수록 좋고, SV%(세이브율)는 높을수록 좋습니다.
          NHL 시작 골리는 매치 1~2시간 전 발표 — 표시는 시즌 most-played 골리(추정).
        </p>
      )}
    </div>
  );
}

function GoaliePanel({
  goalie,
  teamName,
  side,
  highlight,
}: {
  goalie: NhlGoalieInfo | null;
  teamName: string;
  side: "홈" | "원정";
  highlight: boolean;
}) {
  if (!goalie) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 px-3 py-3 text-sm">
        <div className="text-[11px] text-neutral-500">
          {side} · {teamName}
        </div>
        <div className="mt-1 text-neutral-400">골리 정보 없음</div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[0.875rem] px-3 py-3 ring-1 ${
        highlight
          ? "bg-emerald-500/5 ring-emerald-500/30 dark:bg-emerald-500/10 dark:ring-emerald-400/30"
          : "ring-black/5 dark:ring-white/10"
      }`}
    >
      <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-white/45">
        <span>
          {side} · {teamName}
        </span>
        {goalie.shutouts != null && goalie.shutouts > 0 && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
            완봉 {goalie.shutouts}
          </span>
        )}
      </div>
      <div className="mt-1 font-semibold tracking-tight truncate">
        {goalie.name}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-center">
        <StatCell label="GAA" value={fmtNum(goalie.gaa, 2)} />
        <StatCell
          label="SV%"
          value={
            goalie.savePctg != null
              ? (goalie.savePctg * 100).toFixed(1)
              : "—"
          }
        />
        <StatCell
          label="GP"
          value={goalie.gamesPlayed != null ? String(goalie.gamesPlayed) : "—"}
        />
      </div>
      {(goalie.wins != null || goalie.losses != null) && (
        <div className="mt-2 text-[11px] text-neutral-500">
          <span className="text-neutral-400">시즌 기록</span>{" "}
          <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
            {goalie.wins ?? 0}-{goalie.losses ?? 0}
            {goalie.otLosses != null && `-${goalie.otLosses}`}
          </span>
        </div>
      )}
    </div>
  );
}
