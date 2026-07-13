// 축구 팀 전력 섹션 — 매치 상세 상단 배치용 (Elo · 팀 비교 · 시즌 폼 · 공격vs수비).
// MatchInsight "팀 전력" 탭 내용을 페이지 상단으로 승격 + Elo 게이지 추가 강화.
// 데이터 없는(시즌 초반) 리그는 null 반환 — 페이지에서 섹션 자체가 사라짐.

import { getLeagueMatches, getLeagueTeamNames } from "@/lib/predict/league-data";
import { toKoreanTeamName } from "@/lib/team-names";
import { leagueHasDraw } from "@/lib/sports/sport-leagues";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcForm } from "@/lib/predict/form";
import { calcSeasonStats, calcSeasonForm } from "@/lib/predict/season-stats";
import { calcStandings } from "@/lib/predict/standings";
import { calcHomeAway } from "@/lib/predict/home-away";
import { calcStreaks } from "@/lib/predict/streak";
import { calcRecentTrend } from "@/lib/predict/recent-trend";
import { nationalElo } from "@/lib/predict/build-context";
import EloMeter from "../EloMeter";
import SeasonFormHeatmap from "../charts/SeasonFormHeatmap";
import { GoalScatter } from "../charts/lazy-insight-charts";
import TeamMatchup, { type TeamSide } from "../TeamMatchup";
import CollapsibleSection from "./CollapsibleSection";

interface Props {
  match: {
    league: string;
    startTime: Date;
    homeTeam: { id: number; name: string };
    awayTeam: { id: number; name: string };
    /** 글 스냅샷 Elo — 있으면 재계산 대신 사용 (MatchInsight 와 동일 원칙) */
    eloHome?: number | null;
    eloAway?: number | null;
    homeSeasonPoints?: number | null;
    awaySeasonPoints?: number | null;
  };
}

export default async function SoccerTeamStrength({ match }: Props) {
  const matches = await getLeagueMatches(match.league);
  const referenceTime = match.startTime;
  const beforeMatches = matches.filter(
    (m) => m.startTime.getTime() < referenceTime.getTime(),
  );

  const eloTable = calcEloTable(beforeMatches);
  if (eloTable.processed < 5) return null;

  const standings = calcStandings(matches, referenceTime);
  const homeRow = standings.byTeam.get(match.homeTeam.id);
  const awayRow = standings.byTeam.get(match.awayTeam.id);
  if (!homeRow || !awayRow) return null;

  // 국가대항(월드컵·친선)은 클럽 히스토리가 없어 시드 Elo fallback (MatchInsight 동일)
  const isNationalLeague =
    match.league === "WORLD_CUP" || match.league === "INTL_FRIENDLY";
  const homeElo =
    match.eloHome ??
    (isNationalLeague
      ? nationalElo(match.homeTeam.name)
      : getElo(eloTable, match.homeTeam.id));
  const awayElo =
    match.eloAway ??
    (isNationalLeague
      ? nationalElo(match.awayTeam.name)
      : getElo(eloTable, match.awayTeam.id));

  const homeKo = toKoreanTeamName(match.homeTeam.name);
  const awayKo = toKoreanTeamName(match.awayTeam.name);
  const totalTeams = standings.rows.length;
  const showDraw = leagueHasDraw(match.league);

  const homeForm = calcForm(matches, match.homeTeam.id, referenceTime, 5);
  const awayForm = calcForm(matches, match.awayTeam.id, referenceTime, 5);
  const homeHA = calcHomeAway(matches, match.homeTeam.id, referenceTime);
  const awayHA = calcHomeAway(matches, match.awayTeam.id, referenceTime);
  const homeStreak = calcStreaks(matches, match.homeTeam.id, referenceTime);
  const awayStreak = calcStreaks(matches, match.awayTeam.id, referenceTime);
  const homeTrend = calcRecentTrend(matches, match.homeTeam.id, referenceTime, 5);
  const awayTrend = calcRecentTrend(matches, match.awayTeam.id, referenceTime, 5);
  const homeSeasonForm = calcSeasonForm(matches, match.homeTeam.id, referenceTime);
  const awaySeasonForm = calcSeasonForm(matches, match.awayTeam.id, referenceTime);

  // 공격 vs 수비 산점도 — 리그 전 팀 시즌 평균
  const seasonStats = calcSeasonStats(matches, referenceTime);
  const teams = await getLeagueTeamNames(match.league);
  const teamNameById = new Map(
    teams.filter((t) => seasonStats.has(t.id)).map((t) => [t.id, toKoreanTeamName(t.name)]),
  );
  const scatterPoints = Array.from(seasonStats.values())
    .filter((s) => s.played >= 5)
    .map((s) => ({
      name: teamNameById.get(s.teamId) ?? `Team ${s.teamId}`,
      goalsFor: s.avgGoalsFor,
      goalsAgainst: s.avgGoalsAgainst,
      highlight:
        s.teamId === match.homeTeam.id
          ? ("home" as const)
          : s.teamId === match.awayTeam.id
            ? ("away" as const)
            : null,
    }));
  const leagueAvgGF =
    scatterPoints.reduce((s, p) => s + p.goalsFor, 0) / Math.max(scatterPoints.length, 1);
  const leagueAvgGA =
    scatterPoints.reduce((s, p) => s + p.goalsAgainst, 0) / Math.max(scatterPoints.length, 1);

  const homeSide: TeamSide = {
    name: homeKo,
    form: homeForm.results,
    position: homeRow.position,
    seasonPoints: match.homeSeasonPoints ?? homeRow.points,
    totalTeams,
    played: homeRow.played,
    wins: homeRow.wins,
    draws: homeRow.draws,
    losses: homeRow.losses,
    goalsFor: homeRow.goalsFor,
    goalsAgainst: homeRow.goalsAgainst,
    attackRank: standings.attackRank.get(match.homeTeam.id),
    defenseRank: standings.defenseRank.get(match.homeTeam.id),
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
  };
  const awaySide: TeamSide = {
    name: awayKo,
    form: awayForm.results,
    position: awayRow.position,
    seasonPoints: match.awaySeasonPoints ?? awayRow.points,
    totalTeams,
    played: awayRow.played,
    wins: awayRow.wins,
    draws: awayRow.draws,
    losses: awayRow.losses,
    goalsFor: awayRow.goalsFor,
    goalsAgainst: awayRow.goalsAgainst,
    attackRank: standings.attackRank.get(match.awayTeam.id),
    defenseRank: standings.defenseRank.get(match.awayTeam.id),
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
  };

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-6">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base sm:text-lg font-black tracking-tight">팀 전력</h2>
        <span className="text-[11px] text-neutral-500">Elo · 시즌 · 홈/원정 · 흐름</span>
      </header>

      {/* Elo 레이팅 비교 */}
      <div className="space-y-3">
        <EloMeter name={homeKo} rating={homeElo} opponentRating={awayElo} />
        <EloMeter name={awayKo} rating={awayElo} opponentRating={homeElo} />
      </div>

      {/* 기본 노출 — 팀명·최근 폼 + 시즌 전체 비교 */}
      <TeamMatchup sections="overview" showDraw={showDraw} home={homeSide} away={awaySide} />

      {/* 나머지 지표는 접기 — 홈/원정 · 최근 5경기 · 흐름 · 시즌 폼 · 공수 분포 */}
      <CollapsibleSection
        title="상세 전력"
        hint="홈/원정 · 최근 5경기 · 흐름 · 시즌 폼 · 공수 분포"
      >
        <TeamMatchup sections="detail" showDraw={showDraw} home={homeSide} away={awaySide} />

        {/* 시즌 폼 히트맵 */}
        {(homeSeasonForm.length > 0 || awaySeasonForm.length > 0) && (
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              시즌 폼
            </div>
            <div className="space-y-4">
              {homeSeasonForm.length > 0 && (
                <SeasonFormHeatmap name={homeKo} cells={homeSeasonForm} />
              )}
              {awaySeasonForm.length > 0 && (
                <SeasonFormHeatmap name={awayKo} cells={awaySeasonForm} />
              )}
            </div>
          </div>
        )}

        {/* 공격 vs 수비 산점도 */}
        {scatterPoints.length >= 5 && (
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              공격 vs 수비 (시즌 평균)
            </div>
            <GoalScatter
              points={scatterPoints}
              leagueAvgGF={leagueAvgGF}
              leagueAvgGA={leagueAvgGA}
            />
            <div className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
              오른쪽 위로 갈수록 좋음. 점선은 리그 평균.{" "}
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-blue-500" />
                {homeKo}
              </span>
              ,{" "}
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-rose-500" />
                {awayKo}
              </span>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </section>
  );
}
