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
  predictGoalsMarket,
  overActual,
  bttsActual,
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

  // === AI 예측 시장 (DC / OVER 2.5 / BTTS) — 축구만 ===
  const isSoccer = SOCCER_LEAGUES_FOR_MARKETS.has(match.league);
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
  const dc = bestDoubleChance(winProb);
  const goals = isSoccer
    ? predictGoalsMarket(matches, match.homeTeamId, match.awayTeamId, referenceTime)
    : null;
  const oneXTwoPick: "HOME" | "DRAW" | "AWAY" =
    winProb.home >= winProb.away && winProb.home >= winProb.draw
      ? "HOME"
      : winProb.away >= winProb.draw
        ? "AWAY"
        : "DRAW";
  const oneXTwoCorrect = actualWinner ? oneXTwoPick === actualWinner : null;
  const dcOk = actualWinner ? dcCorrect(dc.pick, actualWinner) : null;
  const ovPick = goals ? (goals.pOver >= 0.5 ? "OVER" : "UNDER") : null;
  const ovOk =
    isFinished && ovPick
      ? ovPick === overActual(match.homeScore!, match.awayScore!)
      : null;
  const btPick = goals ? (goals.pBtts >= 0.5 ? "YES" : "NO") : null;
  const btOk =
    isFinished && btPick
      ? btPick === bttsActual(match.homeScore!, match.awayScore!)
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

      {/* 0) 팀 전력 — 양 팀 마주보기 비교 (NEW prototype) */}
      {homeRow && awayRow && (
        <TeamMatchup
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
          }}
        />
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

      {/* 1.5) AI 예측 종합 — 4개 시장 (축구는 4개 모두, 그 외는 1X2만) */}
      <Section title={isFinished ? "AI 예측 종합 · 결과 비교" : "AI 예측 종합"}>
        <div className={`grid ${isSoccer ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1"} gap-3`}>
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
          {isSoccer && (
            <MarketCard
              label="더블 찬스"
              pick={dcPickLabel(dc.pick, match.homeTeam.name, match.awayTeam.name)}
              prob={dc.prob}
              correct={dcOk}
              isFinished={isFinished}
              tone="emerald"
            />
          )}
          {isSoccer && goals && ovPick && (
            <MarketCard
              label="OVER 2.5"
              pick={ovPick === "OVER" ? "OVER (3골+)" : "UNDER (2골-)"}
              prob={ovPick === "OVER" ? goals.pOver : 1 - goals.pOver}
              correct={ovOk}
              isFinished={isFinished}
              tone="orange"
            />
          )}
          {isSoccer && goals && btPick && (
            <MarketCard
              label="양 팀 득점"
              pick={btPick === "YES" ? "YES" : "NO"}
              prob={btPick === "YES" ? goals.pBtts : 1 - goals.pBtts}
              correct={btOk}
              isFinished={isFinished}
              tone="pink"
            />
          )}
        </div>
        {isSoccer && goals && (
          <p className="mt-3 text-[11px] text-neutral-500">
            기대 골 (Poisson λ) — {match.homeTeam.name} {goals.lambdaHome.toFixed(2)} ·{" "}
            {match.awayTeam.name} {goals.lambdaAway.toFixed(2)}
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

      {/* 3) 최근 5경기 폼 (단순 점) */}
      <Section title="최근 5경기 폼">
        <div className="space-y-2.5">
          <FormRow name={match.homeTeam.name} form={homeForm} />
          <FormRow name={match.awayTeam.name} form={awayForm} />
        </div>
      </Section>

      {/* 새 섹션: 시즌 순위 + 공격/수비 */}
      {homeRow && awayRow && (
        <Section title="시즌 순위 / 공격·수비 랭킹">
          <div className="grid sm:grid-cols-2 gap-4">
            <RankCard
              name={match.homeTeam.name}
              row={homeRow}
              total={totalTeams}
              attackRank={homeAttackRank}
              defenseRank={homeDefenseRank}
              variant="home"
            />
            <RankCard
              name={match.awayTeam.name}
              row={awayRow}
              total={totalTeams}
              attackRank={awayAttackRank}
              defenseRank={awayDefenseRank}
              variant="away"
            />
          </div>
        </Section>
      )}

      {/* 새 섹션: 홈/원정 강도 */}
      {(homeHA.home.played > 0 || awayHA.away.played > 0) && (
        <Section title="홈/원정 강도">
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <SplitCard
              name={match.homeTeam.name}
              label="🏠 홈 성적"
              rec={homeHA.home}
              variant="home"
            />
            <SplitCard
              name={match.awayTeam.name}
              label="✈ 원정 성적"
              rec={awayHA.away}
              variant="away"
            />
          </div>
        </Section>
      )}

      {/* 새 섹션: Streak */}
      <Section title="흐름 (Streak)">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <StreakCard name={match.homeTeam.name} s={homeStreak} variant="home" />
          <StreakCard name={match.awayTeam.name} s={awayStreak} variant="away" />
        </div>
      </Section>

      {/* 새 섹션: 최근 5경기 평균 */}
      {(homeTrend.matches > 0 || awayTrend.matches > 0) && (
        <Section title="최근 5경기 평균">
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <TrendCard name={match.homeTeam.name} t={homeTrend} variant="home" />
            <TrendCard name={match.awayTeam.name} t={awayTrend} variant="away" />
          </div>
        </Section>
      )}

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

function FormRow({
  name,
  form,
}: {
  name: string;
  form: {
    results: Array<"W" | "D" | "L">;
    wins: number;
    draws: number;
    losses: number;
  };
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium flex-1 truncate">{name}</span>
      <span className="text-xs text-neutral-500 tabular-nums">
        {form.wins}승 {form.draws}무 {form.losses}패
      </span>
      <FormDots results={form.results} />
    </div>
  );
}

const VARIANT_COLOR = {
  home: "text-blue-600 dark:text-blue-400",
  away: "text-rose-600 dark:text-rose-400",
};
const VARIANT_BG = {
  home: "border-blue-200 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-900/10",
  away: "border-rose-200 dark:border-rose-900/30 bg-rose-50/40 dark:bg-rose-900/10",
};

function ordinal(n: number) {
  return `${n}위`;
}

function RankCard({
  name,
  row,
  total,
  attackRank,
  defenseRank,
  variant,
}: {
  name: string;
  row: { position: number; played: number; points: number; goalDiff: number };
  total: number;
  attackRank?: number;
  defenseRank?: number;
  variant: "home" | "away";
}) {
  return (
    <div className={`rounded-lg border ${VARIANT_BG[variant]} p-3.5`}>
      <div className={`text-xs font-semibold mb-2 truncate ${VARIANT_COLOR[variant]}`}>
        {name}
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-black tabular-nums">
          {ordinal(row.position)}
        </span>
        <span className="text-xs text-neutral-500">/ {total}팀</span>
      </div>
      <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5">
        <div>승점 <span className="tabular-nums font-semibold">{row.points}</span> · 골득실 <span className="tabular-nums">{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</span></div>
        <div>
          공격 <span className="font-semibold">{attackRank ? ordinal(attackRank) : "-"}</span>
          {" · "}
          수비 <span className="font-semibold">{defenseRank ? ordinal(defenseRank) : "-"}</span>
        </div>
      </div>
    </div>
  );
}

function SplitCard({
  name,
  label,
  rec,
  variant,
}: {
  name: string;
  label: string;
  rec: { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; ppg: number };
  variant: "home" | "away";
}) {
  if (rec.played === 0) {
    return (
      <div className={`rounded-lg border ${VARIANT_BG[variant]} p-3.5`}>
        <div className={`text-xs font-semibold mb-1 truncate ${VARIANT_COLOR[variant]}`}>
          {name}
        </div>
        <div className="text-xs text-neutral-500">{label} 데이터 없음</div>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border ${VARIANT_BG[variant]} p-3.5`}>
      <div className={`text-xs font-semibold mb-1 truncate ${VARIANT_COLOR[variant]}`}>
        {name}
      </div>
      <div className="text-[11px] text-neutral-500 mb-1.5">{label}</div>
      <div className="text-base font-bold tabular-nums mb-1">
        {rec.wins}승 {rec.draws}무 {rec.losses}패
      </div>
      <div className="text-xs text-neutral-600 dark:text-neutral-400">
        경기당 승점 <span className="font-semibold tabular-nums">{rec.ppg.toFixed(2)}</span>
        {" · "}
        득실 <span className="tabular-nums">{rec.goalsFor}-{rec.goalsAgainst}</span>
      </div>
    </div>
  );
}

function StreakCard({
  name,
  s,
  variant,
}: {
  name: string;
  s: {
    unbeatenRun: number;
    winningRun: number;
    losingRun: number;
    cleanSheetsLast5: number;
    failedToScoreLast5: number;
  };
  variant: "home" | "away";
}) {
  const headline =
    s.winningRun >= 2
      ? { tone: "good", text: `${s.winningRun}연승 중` }
      : s.unbeatenRun >= 3
        ? { tone: "good", text: `${s.unbeatenRun}경기 무패 행진` }
        : s.losingRun >= 2
          ? { tone: "bad", text: `${s.losingRun}연패 중` }
          : { tone: "neutral" as const, text: "특이 흐름 없음" };

  const toneCls =
    headline.tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : headline.tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-neutral-500";

  return (
    <div className={`rounded-lg border ${VARIANT_BG[variant]} p-3.5`}>
      <div className={`text-xs font-semibold mb-1 truncate ${VARIANT_COLOR[variant]}`}>
        {name}
      </div>
      <div className={`text-base font-bold mb-2 ${toneCls}`}>{headline.text}</div>
      <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5">
        <div>최근 5경기 클린시트 <span className="font-semibold tabular-nums">{s.cleanSheetsLast5}</span></div>
        <div>최근 5경기 무득점 <span className="font-semibold tabular-nums">{s.failedToScoreLast5}</span></div>
      </div>
    </div>
  );
}

function TrendCard({
  name,
  t,
  variant,
}: {
  name: string;
  t: { matches: number; avgGoalsFor: number; avgGoalsAgainst: number; ppg: number };
  variant: "home" | "away";
}) {
  if (t.matches === 0) {
    return (
      <div className={`rounded-lg border ${VARIANT_BG[variant]} p-3.5`}>
        <div className={`text-xs font-semibold mb-1 truncate ${VARIANT_COLOR[variant]}`}>
          {name}
        </div>
        <div className="text-xs text-neutral-500">데이터 없음</div>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border ${VARIANT_BG[variant]} p-3.5`}>
      <div className={`text-xs font-semibold mb-1 truncate ${VARIANT_COLOR[variant]}`}>
        {name}
      </div>
      <div className="text-xs text-neutral-500 mb-1.5">최근 {t.matches}경기 평균</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="득점" value={t.avgGoalsFor.toFixed(1)} />
        <Stat label="실점" value={t.avgGoalsAgainst.toFixed(1)} />
        <Stat label="승점" value={t.ppg.toFixed(2)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-neutral-500">{label}</div>
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
} as const;
const TONE_TEXT = {
  blue: "text-blue-700 dark:text-blue-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
  orange: "text-orange-700 dark:text-orange-300",
  pink: "text-pink-700 dark:text-pink-300",
} as const;

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
