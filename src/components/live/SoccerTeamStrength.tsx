// 축구 팀 전력 섹션 — 매치 상세 상단 배치용 (Elo · 팀 비교 · 시즌 폼 · 공격vs수비).
// MatchInsight "팀 전력" 탭 내용을 페이지 상단으로 승격 + Elo 게이지 추가 강화.
// 데이터 없는(시즌 초반) 리그는 null 반환 — 페이지에서 섹션 자체가 사라짐.

import { getLeagueMatches, getLeagueTeamNames, getTeamMatches } from "@/lib/predict/league-data";
import { toKoreanTeamName } from "@/lib/team-names";
import { leagueHasDraw, NO_STANDINGS_LEAGUES, LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcForm } from "@/lib/predict/form";
import { calcSeasonStats, calcSeasonForm } from "@/lib/predict/season-stats";
import { calcStandings } from "@/lib/predict/standings";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { calcHomeAway } from "@/lib/predict/home-away";
import { calcStreaks } from "@/lib/predict/streak";
import { calcRecentTrend } from "@/lib/predict/recent-trend";
import { nationalElo } from "@/lib/predict/build-context";
import type { FormResult } from "@/lib/predict/types";
import type { H2HResult } from "@/lib/live/match-extras";
import EloMeter from "../EloMeter";
import FormDots from "../FormDots";
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
  /** 양 팀 상대전적 요약 (home 관점, match-extras) — 옛 "시즌 성적 · 상대전적" 카드에서
   *  흡수한 고유 데이터. 시즌 성적 수치는 시즌 전체 그룹과 중복이라 카드 자체를 제거. */
  h2h?: H2HResult;
}

/** home 관점 W/L 을 원정 관점으로 반전 */
function flipResults(results: FormResult[]): FormResult[] {
  return results.map((r) => (r === "W" ? "L" : r === "L" ? "W" : r) as FormResult);
}

export default async function SoccerTeamStrength({ match, h2h }: Props) {
  const matches = await getLeagueMatches(match.league);
  const referenceTime = match.startTime;
  const beforeMatches = matches.filter(
    (m) => m.startTime.getTime() < referenceTime.getTime(),
  );

  const eloTable = calcEloTable(beforeMatches);
  if (eloTable.processed < 5) return null;

  const standings = calcStandings(matches, referenceTime);

  // 승격팀 폴백 — 그 리그에 과거 경기가 없는 팀(26-27 EPL 헐 시티: EPL 0건 / 챔피언십 49건)은
  //  standings 에 행이 없다. 예전엔 여기서 통째로 return null 이라 **한쪽만 승격팀이어도 상대팀
  //  전력까지 화면에서 사라졌다** — 개막 라운드는 승격팀 경기가 리그마다 2~3개씩이라 영향이 크다.
  //  팀 기준 매치(리그 무관·친선 제외)로 시즌 성적·폼·홈원정을 대신 계산하고, 그 값이 이전 리그
  //  기록임을 화면에 밝힌다. 순위·공격/수비 랭크는 리그 안에서만 뜻이 있으므로 그 팀만 비운다.
  const sideCtx = async (teamId: number) => {
    const row = standings.byTeam.get(teamId);
    if (row) return { row, matches, prevLeague: null as string | null };
    const own = await getTeamMatches(teamId);
    const before = own.filter((m) => m.startTime.getTime() < referenceTime.getTime());
    const ownRow = calcStandings(before, referenceTime).byTeam.get(teamId);
    if (!ownRow) return null;
    // 이전 리그 = 보강 매치의 최빈 리그 (라벨용)
    const cnt = new Map<string, number>();
    for (const m of before) cnt.set(m.league, (cnt.get(m.league) ?? 0) + 1);
    const prevLeague = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { row: ownRow, matches: before, prevLeague };
  };
  const [homeCtx, awayCtx] = await Promise.all([sideCtx(match.homeTeam.id), sideCtx(match.awayTeam.id)]);
  if (!homeCtx || !awayCtx) return null;
  const homeRow = homeCtx.row;
  const awayRow = awayCtx.row;

  // 리그순위·시즌성적·승점·득실 — 공식 순위표(getFullStandings)가 있으면 우선.
  //  calcStandings 는 우리 수집 경기만의 부분 집계인 데다 A/B 조 리그(아르헨 2부 등)를
  //  한 표로 합쳐 순위표 페이지와 어긋난다 (2026-08-08 사용자 신고: 카드 14위 vs 조별 순위).
  const official = await getFullStandings(match.league).catch(() => []);
  const oH = official.find((r) => r.teamId === match.homeTeam.id);
  const oA = official.find((r) => r.teamId === match.awayTeam.id);
  //  ⚠ 한쪽이라도 승격 폴백이면 공식 순위표를 쓰지 않는다 — 개막 전 승격팀은 공식표에
  //   0경기 행으로 실려 있어 득점·실점이 0 으로 덮이고, 두 팀 기준도 서로 달라진다.
  const anyFallback = !!(homeCtx.prevLeague || awayCtx.prevLeague);
  const useOfficial = !!(oH && oA && oH.goalsFor != null && oA.goalsFor != null) && !anyFallback;
  const toStand = (r: NonNullable<typeof oH>) => ({
    position: r.position,
    points: r.points,
    played: r.won + r.draw + r.loss,
    wins: r.won,
    draws: r.draw,
    losses: r.loss,
    goalsFor: r.goalsFor!,
    goalsAgainst: r.goalsAgainst!,
  });
  const homeStand = useOfficial ? toStand(oH!) : homeRow;
  const awayStand = useOfficial ? toStand(oA!) : awayRow;

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

  const homeKo = toKoreanTeamName(match.homeTeam.name, match.league);
  const awayKo = toKoreanTeamName(match.awayTeam.name, match.league);
  // 조별 리그면 순위 분모는 그 조의 팀수 (홈팀 기준 조)
  const totalTeams = useOfficial
    ? (oH!.group ? official.filter((r) => r.group === oH!.group).length : official.length)
    : standings.rows.length;
  const showDraw = leagueHasDraw(match.league);
  //  폴백 팀의 position 은 이전 리그 순위라 "EPL 3위"처럼 읽힌다 → 순위 행 자체를 숨긴다.
  const hideRank = NO_STANDINGS_LEAGUES.has(match.league) || anyFallback;

  const homeForm = calcForm(homeCtx.matches, match.homeTeam.id, referenceTime, 5);
  const awayForm = calcForm(awayCtx.matches, match.awayTeam.id, referenceTime, 5);
  const homeHA = calcHomeAway(homeCtx.matches, match.homeTeam.id, referenceTime);
  const awayHA = calcHomeAway(awayCtx.matches, match.awayTeam.id, referenceTime);
  const homeStreak = calcStreaks(homeCtx.matches, match.homeTeam.id, referenceTime);
  const awayStreak = calcStreaks(awayCtx.matches, match.awayTeam.id, referenceTime);
  const homeTrend = calcRecentTrend(homeCtx.matches, match.homeTeam.id, referenceTime, 5);
  const awayTrend = calcRecentTrend(awayCtx.matches, match.awayTeam.id, referenceTime, 5);
  const homeSeasonForm = calcSeasonForm(homeCtx.matches, match.homeTeam.id, referenceTime);
  const awaySeasonForm = calcSeasonForm(awayCtx.matches, match.awayTeam.id, referenceTime);

  // 공격 vs 수비 산점도 — 리그 전 팀 시즌 평균
  const seasonStats = calcSeasonStats(matches, referenceTime);
  const teams = await getLeagueTeamNames(match.league);
  const teamNameById = new Map(
    teams.filter((t) => seasonStats.has(t.id)).map((t) => [t.id, toKoreanTeamName(t.name, match.league)]),
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
    position: homeStand.position,
    seasonPoints: match.homeSeasonPoints ?? homeStand.points,
    totalTeams,
    played: homeStand.played,
    wins: homeStand.wins,
    draws: homeStand.draws,
    losses: homeStand.losses,
    goalsFor: homeStand.goalsFor,
    goalsAgainst: homeStand.goalsAgainst,
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
    position: awayStand.position,
    seasonPoints: match.awaySeasonPoints ?? awayStand.points,
    totalTeams,
    played: awayStand.played,
    wins: awayStand.wins,
    draws: awayStand.draws,
    losses: awayStand.losses,
    goalsFor: awayStand.goalsFor,
    goalsAgainst: awayStand.goalsAgainst,
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
      {/* 승격팀은 이 리그 기록이 없어 이전 리그 성적을 쓴다 — 어느 팀의 무슨 기록인지 밝힌다.
          (숨기지도, 이번 시즌 기록처럼 보이게 두지도 않는다) */}
      {anyFallback && (
        <p className="-mt-4 text-[11px] text-neutral-500 break-keep">
          {[
            homeCtx.prevLeague ? `${homeKo}는 ${LEAGUE_DISPLAY[homeCtx.prevLeague] ?? homeCtx.prevLeague}` : null,
            awayCtx.prevLeague ? `${awayKo}는 ${LEAGUE_DISPLAY[awayCtx.prevLeague] ?? awayCtx.prevLeague}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}{" "}
          지난 시즌 기록 기준 (이번 시즌 이 리그 경기가 아직 없음)
        </p>
      )}

      {/* Elo 레이팅 비교 */}
      <div className="space-y-3">
        <EloMeter name={homeKo} rating={homeElo} opponentRating={awayElo} />
        <EloMeter name={awayKo} rating={awayElo} opponentRating={homeElo} />
      </div>

      {/* 기본 노출 — 팀명·최근 폼 + 시즌 전체 비교 */}
      <TeamMatchup sections="overview" showDraw={showDraw} hideRank={hideRank} home={homeSide} away={awaySide} />

      {/* 나머지 지표는 접기 — 상대전적 · 홈/원정 · 최근 5경기 · 흐름 · 시즌 폼 · 공수 분포 */}
      <CollapsibleSection
        title="상세 전력"
        hint="상대전적 · 홈/원정 · 최근 5경기 · 흐름 · 시즌 폼 · 공수 분포"
      >
        {/* 상대전적 요약 — home 관점 결과를 원정 쪽은 반전 표시 */}
        {h2h && h2h.results.length > 0 && (
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              상대전적 (최근 {h2h.results.length}경기)
            </div>
            <div className="rounded-xl border border-neutral-200/70 dark:border-neutral-800/70 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4 py-4 px-3">
              <div className="text-center space-y-2 min-w-0">
                <div className="text-xs sm:text-sm font-bold tracking-tight text-blue-600 dark:text-blue-400 truncate">
                  {homeKo}
                </div>
                <div className="text-sm font-bold tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">{h2h.wins}승</span>{" "}
                  <span className="text-neutral-500">{h2h.draws}무</span>{" "}
                  <span className="text-rose-600 dark:text-rose-400">{h2h.losses}패</span>
                </div>
                <div className="flex justify-center">
                  <FormDots results={h2h.results} />
                </div>
              </div>
              <div className="text-[10px] sm:text-xs font-semibold tracking-wider text-neutral-400 uppercase">
                VS
              </div>
              <div className="text-center space-y-2 min-w-0">
                <div className="text-xs sm:text-sm font-bold tracking-tight text-rose-600 dark:text-rose-400 truncate">
                  {awayKo}
                </div>
                <div className="text-sm font-bold tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">{h2h.losses}승</span>{" "}
                  <span className="text-neutral-500">{h2h.draws}무</span>{" "}
                  <span className="text-rose-600 dark:text-rose-400">{h2h.wins}패</span>
                </div>
                <div className="flex justify-center">
                  <FormDots results={flipResults(h2h.results)} />
                </div>
              </div>
            </div>
          </div>
        )}

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
