// 매치 인사이트 박스 — 글 상세 페이지에 임베드.
// 차트 시각화 강화 버전 (recharts 기반).

import { prisma } from "@/lib/db";
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
  };
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

  const winProb = calcWinProbability(homeElo, awayElo, match.league);
  const summary = summarizeWinProb(
    winProb,
    match.homeTeam.name,
    match.awayTeam.name,
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

  const hideDraw = match.league === "NBA" || match.league === "KBO";
  const dataSparse = eloTable.processed < 10;

  if (dataSparse) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 my-8 text-sm text-neutral-500">
        <div className="font-semibold text-neutral-700 dark:text-neutral-200 mb-1">
          📊 매치 인사이트
        </div>
        분석에 필요한 과거 매치 데이터가 충분하지 않습니다 (현재{" "}
        {eloTable.processed}경기). 시즌이 진행될수록 정확도가 올라갑니다.
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-6 my-10 space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <h3 className="font-bold tracking-tight">매치 인사이트</h3>
        </div>
        <span className="text-xs font-medium text-neutral-500">{summary}</span>
      </div>

      {/* 0) 팀 전력 — 양 팀 마주보기 통합 비교 (시즌·홈원정·최근·흐름) */}
      {homeRow && awayRow && (
        <TeamMatchup
          showDraw={!hideDraw}
          home={{
            name: match.homeTeam.name,
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
            splitLabel: "🏠 홈",
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
            name: match.awayTeam.name,
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
            splitLabel: "✈ 원정",
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
            homeName={match.homeTeam.name}
            awayName={match.awayTeam.name}
            bookmakers={match.marketBookmakers ?? 0}
            hideDraw={hideDraw}
          />
        </Section>
      )}

      {/* 0.6) 베팅사이트 평균 배당 (decimal odds) — UI 참고용 */}
      {(match.oddsHome ||
        match.oddsOver ||
        match.oddsHcHome) && (
        <Section title="베팅사이트 평균 배당">
          <OddsTable
            homeName={match.homeTeam.name}
            awayName={match.awayTeam.name}
            oddsHome={match.oddsHome ?? null}
            oddsDraw={match.oddsDraw ?? null}
            oddsAway={match.oddsAway ?? null}
            oddsTotalLine={match.oddsTotalLine ?? null}
            oddsOver={match.oddsOver ?? null}
            oddsUnder={match.oddsUnder ?? null}
            oddsHcLine={match.oddsHcLine ?? null}
            oddsHcHome={match.oddsHcHome ?? null}
            oddsHcAway={match.oddsHcAway ?? null}
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
          homeName={match.homeTeam.name}
          awayName={match.awayTeam.name}
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
              pick={dcPickLabel(dc.pick, match.homeTeam.name, match.awayTeam.name)}
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
              pick={`${hc.pick === "HOME" ? match.homeTeam.name : match.awayTeam.name} -${hc.line}`}
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
            name={match.homeTeam.name}
            rating={homeElo}
            opponentRating={awayElo}
          />
          <EloMeter
            name={match.awayTeam.name}
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
              name: match.homeTeam.name,
              color: "#3b82f6",
              points: homeHistory.map((h, i) => ({
                index: i,
                date: h.date.toISOString().slice(0, 10),
                rating: h.rating,
              })),
            }}
            awaySeries={{
              name: match.awayTeam.name,
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
                name={match.homeTeam.name}
                cells={homeSeasonForm}
              />
            )}
            {awaySeasonForm.length > 0 && (
              <SeasonFormHeatmap
                name={match.awayTeam.name}
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
            오른쪽 위로 갈수록 좋음. 점선은 리그 평균. 🟦 {match.homeTeam.name},{" "}
            🟥 {match.awayTeam.name}
          </div>
        </Section>
      )}

      {/* 6) 상대 전적 */}
      {h2h.total > 0 && (
        <Section title={`상대 전적 (최근 ${Math.min(h2h.total, 10)}경기)`}>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {match.homeTeam.name} {h2h.homeTeamWins}승
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-500">{h2h.draws}무</span>
            <span className="text-neutral-400">·</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              {match.awayTeam.name} {h2h.awayTeamWins}승
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
      <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
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

const TONE_CLASSES = {
  blue:
    "border-blue-200 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/30",
  emerald:
    "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/30",
  orange:
    "border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/30",
  pink:
    "border-pink-200 dark:border-pink-900/40 bg-pink-50/60 dark:bg-pink-950/30",
  violet:
    "border-violet-200 dark:border-violet-900/40 bg-violet-50/60 dark:bg-violet-950/30",
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
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900/50 text-[11px] uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">결과</th>
              <th className="text-right px-3 py-2 font-semibold">AI 모델</th>
              <th className="text-right px-3 py-2 font-semibold">시장</th>
              <th className="text-right px-3 py-2 font-semibold">차이</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
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
                      {isValue && " ✨"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        시장 평균 = {bookmakers}개 베팅사이트 odds(vig 제거) · ✨ = AI 가 시장보다
        5%p+ 자신 있는 결과 (Value Bet 후보)
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
      className={`rounded-xl border ${TONE_CLASSES[tone]} p-3.5 flex flex-col gap-1.5`}
    >
      <div className="flex items-center justify-between">
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${TONE_TEXT[tone]}`}>
          {label}
        </div>
        {isFinished && correct !== null && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              correct
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
            }`}
          >
            {correct ? "✓ 적중" : "✗ 빗나감"}
          </span>
        )}
      </div>
      <div className="text-sm font-bold text-neutral-900 dark:text-white truncate">
        {pick}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums">
          {Math.round(prob * 100)}
          <span className="text-sm text-neutral-500">%</span>
        </span>
        <span className="text-[10px] text-neutral-500">추정 확률</span>
      </div>
    </div>
  );
}
