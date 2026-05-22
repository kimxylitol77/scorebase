// 매치 인사이트 박스 — 글 상세 페이지에 임베드.
// 차트 시각화 강화 버전 (recharts 기반).

import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcEloHistory } from "@/lib/predict/elo-history";
import { calcForm } from "@/lib/predict/form";
import { calcH2H } from "@/lib/predict/h2h";
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
import type { PredictMatch } from "@/lib/predict/types";
import FormDots from "./FormDots";
import EloMeter from "./EloMeter";
import WinProbDonut from "./charts/WinProbDonut";
import EloTrendChart from "./charts/EloTrendChart";
import SeasonFormHeatmap from "./charts/SeasonFormHeatmap";
import GoalScatter from "./charts/GoalScatter";
import TeamMatchup from "./TeamMatchup";

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

export default async function MatchInsight({ match }: Props) {
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
  const eloTable = calcEloTable(beforeMatches);
  const homeElo = getElo(eloTable, match.homeTeamId);
  const awayElo = getElo(eloTable, match.awayTeamId);

  const homeForm = calcForm(matches, match.homeTeamId, referenceTime, 5);
  const awayForm = calcForm(matches, match.awayTeamId, referenceTime, 5);

  const h2h = calcH2H(
    matches,
    match.homeTeamId,
    match.awayTeamId,
    referenceTime,
    5,
  );

  const baseWinProb = calcWinProbability(homeElo, awayElo, match.league);

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
  const summary = summarizeWinProb(
    winProb,
    toKoreanTeamName(match.homeTeam.name),
    toKoreanTeamName(match.awayTeam.name),
  );

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
    ? predictTotalMarket(matches, match.league, match.homeTeamId, match.awayTeamId, referenceTime)
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
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

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

  const hideDraw =
    match.league === "NBA" ||
    match.league === "KBO" ||
    match.league === "NPB" ||
    match.league === "LOL";
  const dataSparse = eloTable.processed < 5;
  // sparse 라도 선발 투수 카드만은 표시 (KBO/NPB 시즌 초반 등)
  const sparseHasStarters =
    (match.league === "MLB" || match.league === "KBO" || match.league === "NPB") &&
    (homeStarterEarly || awayStarterEarly);

  if (dataSparse) {
    return (
      <section className="my-10 space-y-4 rounded-[1.5rem] sm:rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-white/45">
          <span>매치 인사이트</span>
          <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-400 dark:text-white/35">
            · 시즌 초반 데이터 누적 중 ({eloTable.processed}경기)
          </span>
        </div>
        {sparseHasStarters ? (
          <StarterCard
            home={homeStarterEarly}
            away={awayStarterEarly}
            homeTeam={toKoreanTeamName(match.homeTeam.name)}
            awayTeam={toKoreanTeamName(match.awayTeam.name)}
            league={match.league}
          />
        ) : (
          <p className="text-sm text-neutral-500">
            분석에 필요한 과거 매치 데이터가 충분하지 않습니다. 시즌이 진행될수록 정확도가 올라갑니다.
          </p>
        )}
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

  return (
    <section className="my-10 space-y-8 rounded-[1.5rem] sm:rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold tracking-tight text-zinc-950 dark:text-white">
            매치 인사이트
          </h3>
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
        </div>
        <span className="text-xs font-medium text-zinc-500 dark:text-white/45">
          {summary}
        </span>
      </div>

      {/* 선발 투수 (MLB · KBO · NPB) */}
      {hasStarters && (
        <StarterCard
          home={homeStarter}
          away={awayStarter}
          homeTeam={toKoreanTeamName(match.homeTeam.name)}
          awayTeam={toKoreanTeamName(match.awayTeam.name)}
          league={match.league}
        />
      )}

      {/* 골리 (NHL) */}
      {hasGoalies && (
        <GoalieCard
          home={homeGoalie}
          away={awayGoalie}
          homeTeam={toKoreanTeamName(match.homeTeam.name)}
          awayTeam={toKoreanTeamName(match.awayTeam.name)}
        />
      )}

      {/* 0) 팀 전력 — 양 팀 마주보기 통합 비교 (시즌·홈원정·최근·흐름) */}
      {homeRow && awayRow && (
        <TeamMatchup
          showDraw={!hideDraw}
          home={{
            name: toKoreanTeamName(match.homeTeam.name),
            form: homeForm.results,
            position: homeRow.position,
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
        />
      )}

      {/* 0.5) 시장 odds 비교 — odds API 데이터가 있을 때만 */}
      {match.marketHome != null && match.marketAway != null && (
        <Section title="AI 모델 vs 시장 odds">
          <MarketCompareTable
            modelHome={winProb.home}
            modelDraw={winProb.draw}
            modelAway={winProb.away}
            marketHome={match.marketHome}
            marketDraw={match.marketDraw ?? null}
            marketAway={match.marketAway}
            homeName={toKoreanTeamName(match.homeTeam.name)}
            awayName={toKoreanTeamName(match.awayTeam.name)}
            bookmakers={match.marketBookmakers ?? 0}
            hideDraw={hideDraw}
          />
        </Section>
      )}

      {/* 0.6) 베팅사이트 평균 배당 (decimal odds) — UI 참고용 */}
      {(match.oddsHome ||
        match.oddsOver ||
        match.oddsHcHome ||
        match.oddsBttsYes ||
        match.oddsDc1X) && (
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

      {/* 1) 승률 도넛 */}
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

      {/* 1.5) AI 예측 종합 — 종목별 시장 카드 */}
      <Section title={isFinished ? "AI 예측 종합 · 결과 비교" : "AI 예측 종합"}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MarketCard
            label="결과 (1X2)"
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
              pick={dcPickLabel(dc.pick, toKoreanTeamName(match.homeTeam.name), toKoreanTeamName(match.awayTeam.name))}
              prob={dc.prob}
              correct={dcOk}
              isFinished={isFinished}
              tone="emerald"
            />
          )}
          {total && ovPick && (
            <MarketCard
              label={`OVER ${total.line}`}
              pick={ovPick === "OVER" ? `OVER (${total.line}+)` : `UNDER (${total.line}-)`}
              prob={ovPick === "OVER" ? total.pOver : 1 - total.pOver}
              correct={ovOk}
              isFinished={isFinished}
              tone="orange"
            />
          )}
          {hc && (
            <MarketCard
              label={`핸디캡 ${hc.line > 0 ? `±${hc.line}` : ""}`}
              pick={`${hc.pick === "HOME" ? toKoreanTeamName(match.homeTeam.name) : toKoreanTeamName(match.awayTeam.name)} -${hc.line}`}
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
            {hc && `기대 마진 ${hc.expectedMargin >= 0 ? "+" : ""}${hc.expectedMargin.toFixed(1)}`}
          </p>
        )}
      </Section>

      {/* 2) Elo + 변천사 */}
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
          <div className="mt-2 text-xs text-neutral-500 mb-1">시즌 추이</div>
        )}
        {homeHistory.length > 1 && awayHistory.length > 1 && (
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
        )}
      </Section>

      {/* 최근 5경기 폼 / 시즌 순위 / 홈원정 / Streak / 최근 5평균
          → 모두 위쪽 TeamMatchup 한 섹션으로 통합됨 */}

      {/* 4) 시즌 폼 히트맵 */}
      {(homeSeasonForm.length > 0 || awaySeasonForm.length > 0) && (
        <Section title="시즌 폼">
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
        </Section>
      )}

      {/* 5) 득실점 산점도 */}
      {scatterPoints.length >= 5 && (
        <Section title="공격 vs 수비 (시즌 평균)">
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
        </Section>
      )}

      {/* 6) 상대 전적 */}
      {h2h.total > 0 && (
        <Section title={`상대 전적 (최근 ${Math.min(h2h.total, 10)}경기)`}>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {toKoreanTeamName(match.homeTeam.name)} {h2h.homeTeamWins}승
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-500">{h2h.draws}무</span>
            <span className="text-neutral-400">·</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              {toKoreanTeamName(match.awayTeam.name)} {h2h.awayTeamWins}승
            </span>
            {h2h.recentForHome.length > 0 && (
              <span className="ml-auto">
                <FormDots results={h2h.recentForHome} />
              </span>
            )}
          </div>
        </Section>
      )}

      <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          ⓘ Elo 레이팅 + 홈 어드밴티지 기반 통계 추정치입니다. 실제 경기
          양상과 다를 수 있습니다. (데이터셋 {eloTable.processed}경기 기준)
        </p>
      </div>
    </section>
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
  const rows = [
    { label: "홈 승", model: modelHome, market: marketHome, name: homeName, key: "h" },
    !hideDraw && marketDraw !== null
      ? { label: "무", model: modelDraw, market: marketDraw, name: "무승부", key: "d" }
      : null,
    { label: "원정 승", model: modelAway, market: marketAway, name: awayName, key: "a" },
  ].filter(Boolean) as Array<{ label: string; model: number; market: number; name: string; key: string }>;

  return (
    <div>
      <div className="overflow-hidden rounded-[1rem] ring-1 ring-black/5 dark:ring-white/10">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500 dark:bg-white/[0.04] dark:text-white/45">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">결과</th>
              <th className="px-3 py-2 text-right font-semibold">AI 모델</th>
              <th className="px-3 py-2 text-right font-semibold">시장</th>
              <th className="px-3 py-2 text-right font-semibold">차이</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {rows.map((r) => {
              const gap = r.model - r.market;
              const isValue = gap >= 0.05;
              const isOver = gap <= -0.05;
              return (
                <tr key={r.key}>
                  <td className="px-3 py-2.5">
                    <div className="text-xs text-neutral-500">{r.label}</div>
                    <div className="font-medium truncate">{r.name}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {Math.round(r.model * 100)}%
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                    {Math.round(r.market * 100)}%
                  </td>
                  <td className="px-3 py-2.5 text-right">
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
                      {Math.round(gap * 100)}%p
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500 dark:text-white/45">
        시장 평균 = {bookmakers}개 베팅사이트 odds(vig 제거) · 초록 표시 = AI 가
        시장보다 5%p+ 자신 있는 결과 (Value Bet 후보)
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
}: {
  home: MlbStarterInfo | null;
  away: MlbStarterInfo | null;
  homeTeam: string;
  awayTeam: string;
  league?: string;
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
        />
        <StarterPanel
          starter={home}
          teamName={homeTeam}
          side="홈"
          highlight={homeBetterEra}
          league={league}
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
}: {
  starter: MlbStarterInfo | null;
  teamName: string;
  side: "홈" | "원정";
  highlight: boolean;
  league?: string;
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
      {starter.pid != null ? (
        <a
          href={`/players/${starter.pid}${
            league === "KBO" ? "?league=KBO" : league === "NPB" ? "?league=NPB" : ""
          }`}
          className="mt-1 block font-semibold tracking-tight truncate hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition"
        >
          {starter.name}
        </a>
      ) : (
        <div className="mt-1 font-semibold tracking-tight truncate">
          {starter.name}
        </div>
      )}
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
