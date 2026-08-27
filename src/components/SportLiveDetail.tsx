// NBA / NHL / 축구 라이브 상세 — /api/live/match/{gameId}?league=X polling.
// MLB/KBO/NPB/LOL 은 자체 컴포넌트 사용. 이 컴포넌트는 이외 종목용.

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { SPORTS, LEAGUE_DISPLAY, postponedLabel } from "@/lib/sports/sport-leagues";
import { hasStandingsTable } from "@/lib/sports/standings-valid";
import CountUp from "./CountUp";
import SoccerGoals from "./scores/SoccerGoals";
import LiveOddsCard from "./live/LiveOddsCard";
// SoccerFormation 제거 (2026-05-25) — TheSports lineup 으로 일원화, SoccerLineupSvg 만 사용.
import SoccerEventsTimeline from "./live/SoccerEventsTimeline";
import SoccerGoalsCard from "./live/SoccerGoalsCard";
import SubstitutionImpactCard from "./live/SubstitutionImpactCard";
import MatchEventTabs from "./live/MatchEventTabs";
import LiveTickerFeed from "./live/LiveTickerFeed";
import MatchWeather from "./live/MatchWeather";
import FavoriteStar from "./scores/FavoriteStar";
import { soccerTickerLines } from "@/lib/live/ticker";
// 타입만 참조 — import type 이라 서버 전용 모듈(prisma)이 번들에 딸려오지 않는다.
import type { RefereeCardTendency } from "@/lib/stats/referee-cards";

// 축구 리그 집합 — SPORTS 단일 진실 (라이브 배당 카드 suppress 판정용)
const VOLLEYBALL_SET = new Set(
  SPORTS.find((s) => s.code === "volleyball")?.leagues ?? [],
);
const SOCCER_LEAGUES_SET = new Set(
  SPORTS.find((s) => s.code === "soccer")?.leagues ?? [],
);

// 리그 → 종목 code (FavMeta.sport — PiP·마이페이지가 종목 구분에 쓴다)
const sportCodeOf = (lg: string) =>
  SPORTS.find((s) => s.leagues.includes(lg))?.code ?? "soccer";

interface PeriodLinescore {
  homePeriods: (number | null)[];
  awayPeriods: (number | null)[];
  homeScore: number;
  awayScore: number;
}

interface SoccerGoal {
  minute: string;
  side: "home" | "away";
  player: string;
  ownGoal: boolean;
  penaltyKick: boolean;
}

interface MatchTeamStat {
  label: string;
  value: string;
  raw: number;
}
interface TeamLeader {
  category: string;
  playerName: string;
  displayValue: string;
}
interface MatchSummary {
  homeStats: MatchTeamStat[];
  awayStats: MatchTeamStat[];
  homeLeaders: TeamLeader[];
  awayLeaders: TeamLeader[];
  winProbabilityHome?: number[];
}

interface LiveOdds {
  h2h: { home: number; draw: number | null; away: number } | null;
  totals: { line: number; over: number; under: number } | null;
  spread: {
    line: number;
    pick: "HOME" | "AWAY";
    homeOdds: number;
    awayOdds: number;
  } | null;
  bookmakers: number;
  fetchedAt: number;
}

interface FormationPlayer {
  number: number | null;
  name: string;
  pos: "G" | "D" | "M" | "F" | null;
  grid: string | null;
}
interface TeamLineup {
  teamName: string;
  formation: string | null;
  coach: string | null;
  startXI: FormationPlayer[];
  substitutes: FormationPlayer[];
}
interface SoccerLineups {
  home: TeamLineup;
  away: TeamLineup;
}

interface SoccerEventItem {
  minute: number;
  extra: number;
  type: "goal" | "card" | "subst" | "var";
  detail: string;
  side: "home" | "away";
  playerName: string | null;
  assistName: string | null;
  playerId?: string | null;
  assistId?: string | null;
  /** 골 시점 누적 스코어 (ts incident 원본) — 문자 중계 티커용 */
  homeScore?: number | null;
  awayScore?: number | null;
}

interface MatchLive {
  status: "LIVE" | "FINAL" | "PRE" | "UNKNOWN";
  statusLabel: string;
  homeScore: number | null;
  awayScore: number | null;
  periodLinescore?: PeriodLinescore | null;
  soccerGoals?: SoccerGoal[] | null;
  summary?: MatchSummary | null;
  liveOdds?: LiveOdds | null;
  soccerLineups?: SoccerLineups | null;
  soccerEvents?: SoccerEventItem[] | null;
  /** 축구 승부차기 점수 — 정규/연장 동점 후 PK. */
  penHome?: number | null;
  penAway?: number | null;
  /** 주심 이름 (축구 — route 가 DB Match.referee 를 실어줌) */
  referee?: string | null;
  /** 주심 카드 성향 (축구 — route 가 DB 자체 집계를 실어줌. 표본 미달이면 null) */
  refereeStats?: RefereeCardTendency | null;
}

interface Props {
  gameId: string;
  league: string;
  /** 한글 팀명 */
  homeNameKo: string;
  awayNameKo: string;
  /** DB 영문 팀명 (ESPN displayName 매칭용 — soccer goals fallback) */
  homeNameEn?: string;
  awayNameEn?: string;
  /** DB Team.id — 클릭 시 /teams/{id} 이동 */
  homeTeamId?: number;
  awayTeamId?: number;
  /** DB Team.logoUrl — fallback 로고 */
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  /** SSR 단에서 본 초기 점수 (라이브 데이터 도착 전 placeholder) */
  initialHomeScore?: number | null;
  initialAwayScore?: number | null;
  /** SSR 단 초기 승부차기 점수 (축구) — 첫 폴링 전 (4)1:1(3) 표시용 */
  initialPenHome?: number | null;
  initialPenAway?: number | null;
  /** DB Match.status — 라이브 API 가 매치 못 찾을 때 fallback (종료된 매치 등) */
  initialStatus?: "FINISHED" | "SCHEDULED" | "LIVE" | "POSTPONED";
  /** 리그 순위 (TheSports standings) — 팀명 옆 [N] 표시. 클릭 시 새창에서 /standings/{league} */
  homePosition?: number | null;
  awayPosition?: number | null;
  /** FIFA 국가 랭킹 — 국가대항(친선/예선/대륙컵) 매치에서 리그 순위 대신 "FIFA N" 표시. position 우선. */
  homeFifaRank?: number | null;
  awayFifaRank?: number | null;
  /** 우리 Elo 모델 예측 확률 (0~1) — 라이브 배당 카드의 implied 와 비교해 value % 표시 */
  eloPrediction?: { home: number; draw?: number | null; away: number } | null;
  /** 라이브 배당 시계열 — sparkline 차트용. 오래된→최신 순. */
  oddsHistory?: Array<{ fetchedAt: number; home: number; draw: number | null; away: number }>;
  /** TheSports player id → photo URL (lineup cache 에서 page.tsx 가 추출). 이벤트 타임라인 아바타용. */
  playerLogoById?: Record<string, string>;
  /** 경기장 도시 (TheSports venue) — 헤더 우측 현재 날씨 배지용. 없으면 미표시. */
  venueCity?: string | null;
  venueCountry?: string | null;
  /** 종료 경기의 킥오프 ISO — 날씨를 경기 당시로 고정. null 이면 현재 날씨 */
  venueWeatherAt?: string | null;
  /** DB Match.id — 헤더 관심경기 별표용. /scores 별표와 같은 저장소라 id 가 같아야 상태가 이어진다.
      없으면 별표 미표시. */
  favMatchId?: number | null;
  /** SSR 단 주심 이름 (축구 — DB Match.referee). 첫 폴링 전에도 주심 줄을 그리기 위해 받는다. */
  initialReferee?: string | null;
  /** SSR 단 주심 카드 성향. 표본 미달이면 null 이라 주심 이름만 남는다. */
  initialRefereeStats?: RefereeCardTendency | null;
}

const POLL_LIVE_MS = 5_000;
const POLL_IDLE_MS = 60_000;

export default function SportLiveDetail({
  gameId,
  league,
  homeNameKo,
  awayNameKo,
  homeNameEn,
  awayNameEn,
  homeTeamId,
  awayTeamId,
  homeLogoUrl,
  awayLogoUrl,
  initialHomeScore,
  initialAwayScore,
  initialPenHome,
  initialPenAway,
  initialStatus,
  homePosition,
  awayPosition,
  homeFifaRank,
  awayFifaRank,
  eloPrediction,
  oddsHistory,
  playerLogoById,
  venueCity,
  venueCountry,
  venueWeatherAt,
  favMatchId,
  initialReferee,
  initialRefereeStats,
}: Props) {
  const [live, setLive] = useState<MatchLive | null>(null);
  // 점수·경기 시간의 마지막 동기화 시각 — 배당(라이브 카드)·라인업(발표 시각)과 별개 축 (지시문 9)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const statusRef = useRef<MatchLive["status"]>("UNKNOWN");
  // 폴링 간격(LIVE/IDLE) 판단용. 렌더 중 ref 를 쓰면 안 되므로(react-hooks/refs)
  // effect 로 동기화한다. 읽는 쪽은 setTimeout 콜백이라 항상 이 effect 다음이다.
  useEffect(() => {
    if (live) statusRef.current = live.status;
  }, [live]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastEtag: string | null = null;

    const fetchOnce = async () => {
      try {
        const headers: HeadersInit = lastEtag
          ? { "if-none-match": lastEtag }
          : {};
        // 축구는 영문 team name 도 query 로 전달 — ESPN id ≠ DB externalId 인 EPL 등
        // soccer goals lookup name-pair fallback 용.
        const nameParams =
          homeNameEn && awayNameEn
            ? `&away=${encodeURIComponent(awayNameEn)}&home=${encodeURIComponent(homeNameEn)}`
            : "";
        const res = await fetch(
          `/api/live/match/${gameId}?league=${encodeURIComponent(league)}${nameParams}`,
          { cache: "no-store", headers },
        );
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: { live?: MatchLive } = await res.json();
        if (!alive) return;
        if (json.live) {
          setLive(json.live);
          setLoaded(true);
          setLastSyncAt(Date.now());
        }
      } catch {
        // ignore
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      const wait =
        statusRef.current === "LIVE" ? POLL_LIVE_MS : POLL_IDLE_MS;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, wait);
    };
    fetchOnce().then(schedule);
    const onVis = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        fetchOnce();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [gameId, league, homeNameEn, awayNameEn]);

  // SSR placeholder — 첫 fetch 도착 전엔 DB 점수/상태만 표시
  const isLive = live?.status === "LIVE";
  const syncAgo = lastSyncAt != null ? Math.max(0, Math.round((Date.now() - lastSyncAt) / 1000)) : null;
  const isFinal =
    live?.status === "FINAL" ||
    // 라이브 API 에 매치 없고 DB 가 FINISHED 면 종료된 경기로 간주
    (loaded && live?.status !== "LIVE" && initialStatus === "FINISHED");
  const homeScore = live?.homeScore ?? initialHomeScore ?? null;
  const awayScore = live?.awayScore ?? initialAwayScore ?? null;
  const penHome = live?.penHome ?? initialPenHome ?? null;
  const penAway = live?.penAway ?? initialPenAway ?? null;
  const statusBadge = !loaded
    ? initialStatus === "FINISHED" ? "종료" : "LOADING"
    : isLive
      ? `LIVE${live?.statusLabel ? ` · ${live.statusLabel}` : ""}`
      : isFinal
        ? "종료"
        : initialStatus === "POSTPONED"
          ? postponedLabel(league)
          : (live?.statusLabel || "예정");

  // Scorebase LiveCard v2 — 우세팀 강조
  const a = awayScore ?? 0;
  const h = homeScore ?? 0;
  const awayWin =
    isFinal &&
    (a > h || (h === a && penAway != null && penHome != null && penAway > penHome));
  const homeWin =
    isFinal &&
    (h > a || (h === a && penHome != null && penAway != null && penHome > penAway));
  const liveLead = isLive && a !== h;
  const liveAwayLead = liveLead && a > h;
  const liveHomeLead = liveLead && h > a;
  // statusLabel 표시용 (회/말이 아니라 쿼터/피리어드/하프)
  const contextLabel = isLive ? live?.statusLabel : null;

  // 농구는 라이브 배당 + 팀 stats 비교를 MatchInsight 탭으로 일원화 (2026-05-29) →
  // 여기서는 중복 렌더 안 함. 축구도 동일 일원화 (2026-06-10 — 배당 탭에 라이브
  // 배당 + 북메이커 상세 합침, 본문 중복 카드 제거).
  const isBasketball = league === "NBA" || league === "WNBA";
  const isSoccerLeague = SOCCER_LEAGUES_SET.has(league);
  // 주심 — SSR 값으로 먼저 그리고, 폴링 응답이 오면 그쪽 값을 쓴다(둘 다 같은 DB 행).
  const refereeName = live?.referee ?? initialReferee ?? null;
  const refereeStats = live?.refereeStats ?? initialRefereeStats ?? null;
  const suppressLiveOddsCard = isBasketball || isSoccerLeague;

  // 종목별 LIVE 카드 클래스 (border glow 색)
  const liveCardClass =
    league === "NBA" || league === "WNBA"
      ? "basketball-live-card"
      : league === "NHL"
        ? "hockey-live-card"
        : "match-card";

  return (
    <div className="space-y-4">
      {/* Scorebase LiveCard v2 — 통합 스코어보드 카드 */}
      <div
        className={`rounded-xl p-4 sm:p-5 space-y-3 match-card ${isLive ? liveCardClass : ""}`}
        style={{ position: "relative", overflow: "hidden" }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isLive ? (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider"
                style={{ background: "rgba(239,68,68,.18)", color: "#fca5a5" }}
              >
                <span
                  className="live-dot inline-block w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "#ef4444",
                    boxShadow: "0 0 6px rgba(239,68,68,.8)",
                  }}
                />
                LIVE
              </span>
            ) : (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider"
                style={{ background: "rgba(255,255,255,.06)", color: "#94a3b8" }}
              >
                {isFinal ? "종료" : statusBadge}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              {LEAGUE_DISPLAY[league] ?? league}
            </span>
            {isLive && syncAgo != null && (
              <span
                className="text-[10px] tabular-nums text-neutral-500"
                title="점수·경기 시간이 마지막으로 동기화된 시각 — 배당·라인업은 각자 별도 주기로 갱신됩니다"
              >
                점수 {syncAgo < 3 ? "방금" : `${syncAgo}초 전`} 동기화
              </span>
            )}
            {isLive && contextLabel && (
              <span
                className="text-[11px] font-bold tabular-nums"
                style={{ color: "#22c55e" }}
              >
                {contextLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {venueCity && (
              <MatchWeather
                city={venueCity}
                country={venueCountry}
                at={venueWeatherAt}
              />
            )}
            {isLive && (
              <span className="text-[10px] text-neutral-500">20초 자동 갱신</span>
            )}
            {favMatchId != null && (
              <FavoriteStar
                matchId={String(favMatchId)}
                showLabel
                meta={{
                  id: String(favMatchId),
                  sport: sportCodeOf(league),
                  league,
                  homeName: homeNameKo,
                  awayName: awayNameKo,
                  homeScore,
                  awayScore,
                  status: isLive ? "live" : isFinal ? "finished" : initialStatus === "POSTPONED" ? "postponed" : "scheduled",
                  statusLabel: statusBadge,
                  href: `/live/${league}/${gameId}`,
                }}
              />
            )}
          </div>
        </div>

        {/* 양팀 + 점수 — home 좌측 / away 우측 (한국 축구·야구 미디어 관행) */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-center">
          <TeamBlock teamId={homeTeamId} logo={homeLogoUrl} name={homeNameKo} position={homePosition} fifaRank={homeFifaRank} league={league} />
          <div className="font-black tabular-nums text-3xl sm:text-5xl tracking-tight flex flex-col items-center">
            <div className="flex items-center justify-center">
              <span
                style={{
                  color: homeWin || liveHomeLead ? "#22c55e" : "#cbd5e1",
                  textShadow:
                    homeWin || liveHomeLead ? "0 0 14px rgba(34,197,94,.45)" : "none",
                }}
              >
                <CountUp value={h} />
              </span>
              <span className="mx-1.5 sm:mx-3 text-neutral-500 font-thin">:</span>
              <span
                style={{
                  color: awayWin || liveAwayLead ? "#22c55e" : "#cbd5e1",
                  textShadow:
                    awayWin || liveAwayLead ? "0 0 14px rgba(34,197,94,.45)" : "none",
                }}
              >
                <CountUp value={a} />
              </span>
            </div>
            {/* 승부차기 — 점수 아래 작은 줄, 좌(홈)·우(원정) 정렬 */}
            {penHome != null && penAway != null && (
              <div className="grid grid-cols-2 w-full text-xs sm:text-sm font-bold text-neutral-400 dark:text-neutral-500 leading-none mt-1">
                <span className="text-center">({penHome})</span>
                <span className="text-center">({penAway})</span>
              </div>
            )}
          </div>
          <TeamBlock teamId={awayTeamId} logo={awayLogoUrl} name={awayNameKo} position={awayPosition} fifaRank={awayFifaRank} league={league} />
        </div>
      </div>

      {/* 축구 — 주심 + 카드 성향 (DB Match.referee + MatchStats 자체 집계).
          성향은 표본 하한(10경기) 미달이면 route/SSR 둘 다 null 을 줘서 이름만 남는다. */}
      {isSoccerLeague && refereeName && (
        <div className="text-center text-xs text-neutral-500 dark:text-neutral-400">
          주심 {refereeName}
          {refereeStats && (
            // 한 개의 템플릿 문자열로 낸다 — JSX 줄바꿈이 공백을 먹어 "4.3장(리그" 로 붙는 걸 막고,
            // 리그 평균이 null 인 분기에서 괄호가 통째로 사라지게 한다.
            // "최근 N경기"(집계 창 단서) + "평균"(이 경기 예측이 아님)이 둘 다 들어가야 한다.
            <span className="ml-1.5 text-neutral-400 dark:text-neutral-500">
              {`· 최근 ${refereeStats.matches}경기 평균 옐로카드 ${refereeStats.avgYellow.toFixed(1)}장${
                refereeStats.leagueAvgYellow != null
                  ? ` (리그 평균 ${refereeStats.leagueAvgYellow.toFixed(1)}장)`
                  : ""
              }`}
            </span>
          )}
        </div>
      )}

      {/* NBA/NHL — 쿼터/피리어드 linescore */}
      {live?.periodLinescore && (
        <PeriodTable
          league={league}
          linescore={live.periodLinescore}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
        />
      )}

      {/* 축구 — 골 (스코어 카드와 동일하게 home 좌측 / away 우측) */}
      {live?.soccerGoals && live.soccerGoals.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 py-2">
          <div className="px-3.5 sm:px-4 pt-2 pb-1 flex items-center justify-between text-[10px] font-bold tracking-wider uppercase text-neutral-400">
            <span className="truncate">{homeNameKo}</span>
            <span>⚽ 골</span>
            <span className="truncate text-right">{awayNameKo}</span>
          </div>
          <SoccerGoals goals={live.soccerGoals} />
        </div>
      )}

      {/* 라이브 승률 곡선 (NBA/NHL — ESPN winprobability) */}
      {live?.summary?.winProbabilityHome && live.summary.winProbabilityHome.length > 1 && (
        <WinProbabilityChart
          values={live.summary.winProbabilityHome}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
        />
      )}

      {/* 라이브 배당 (The Odds API 1분 갱신) — 농구·축구는 MatchInsight 배당 탭으로 이동 */}
      {!suppressLiveOddsCard && live?.liveOdds && (
        <LiveOddsCard
          odds={live.liveOdds}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
          hasDraw={league !== "NBA" && league !== "NHL" && league !== "MLB" && league !== "KBO" && league !== "NPB"}
          eloPrediction={eloPrediction}
          oddsHistory={oddsHistory}
        />
      )}

      {/* 축구 선발 라인업 — TheSports cache 의 lineup 을 page.tsx 에서 SoccerLineupSvg 로 별도 렌더.
          중복 방지를 위해 여기서는 api-football 기반 SoccerFormation 호출 안 함 (2026-05-25). */}

      {/* 골·이벤트·교체영향 — iOS 세그먼트 컨트롤 탭으로 묶음(세로로 길던 것 정리). 선수 사진은 카드 그대로 유지. */}
      {(() => {
        const sev = live?.soccerEvents ?? [];
        if (sev.length === 0) return null;
        const goalEvents = sev.filter((e) => e.type === "goal");
        const nonGoalEvents = sev.filter((e) => e.type !== "goal");
        const subs = sev.filter((e) => e.type === "subst");
        // 교체영향 탭 노출 조건 = SubstitutionImpactCard 내부와 동일(교체 후 ±10분 같은팀 골)
        const hasImpact = subs.some((s) => {
          const sm = s.minute * 100 + s.extra;
          return goalEvents.some(
            (g) => g.side === s.side && g.minute * 100 + g.extra >= sm && g.minute * 100 + g.extra <= sm + 1000,
          );
        });
        const tabs: { key: string; label: string; content: ReactNode }[] = [];
        if (goalEvents.length > 0)
          tabs.push({
            key: "goals",
            label: "골",
            content: (
              <SoccerGoalsCard
                events={sev}
                homeNameKo={homeNameKo}
                awayNameKo={awayNameKo}
                homeLogoUrl={homeLogoUrl ?? null}
                awayLogoUrl={awayLogoUrl ?? null}
                playerLogoById={playerLogoById}
              />
            ),
          });
        if (nonGoalEvents.length > 0)
          tabs.push({
            key: "events",
            label: "이벤트",
            content: (
              <SoccerEventsTimeline
                events={nonGoalEvents}
                homeNameKo={homeNameKo}
                awayNameKo={awayNameKo}
                playerLogoById={playerLogoById}
              />
            ),
          });
        if (hasImpact)
          tabs.push({
            key: "subimpact",
            label: "교체 영향",
            content: (
              <SubstitutionImpactCard
                events={sev}
                homeNameKo={homeNameKo}
                awayNameKo={awayNameKo}
                playerLogoById={playerLogoById}
              />
            ),
          });
        // 문자 중계 — 이벤트를 한국어 반응 스트림으로 (첫 탭). 폴링(5초)마다 자동 갱신.
        const tickerLines = soccerTickerLines(sev, homeNameKo, awayNameKo, {
          finished: live?.status === "FINAL",
          finalHome: live?.homeScore ?? null,
          finalAway: live?.awayScore ?? null,
        });
        if (tickerLines.length > 0)
          tabs.unshift({
            key: "ticker",
            label: "중계",
            content: <LiveTickerFeed lines={tickerLines} />,
          });
        return tabs.length > 0 ? <MatchEventTabs tabs={tabs} /> : null;
      })()}

      {/* 팀 stats 비교 — 농구는 MatchInsight "팀 통계" 탭(TheSports)으로 일원화 */}
      {!isBasketball && live?.summary && (live.summary.homeStats.length > 0 || live.summary.awayStats.length > 0) && (
        <TeamStatCompare
          summary={live.summary}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
        />
      )}

      {/* 양 팀 leaders */}
      {live?.summary && (live.summary.homeLeaders.length > 0 || live.summary.awayLeaders.length > 0) && (
        <TeamLeaders
          summary={live.summary}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
        />
      )}

      {/* 데이터 없음 안내 — 축구는 soccerEvents(골/카드/교체)도 비었을 때만 (soccerGoals 는 축구에서 항상 null) */}
      {loaded && !live?.periodLinescore && !live?.summary && (!live?.soccerGoals || live.soccerGoals.length === 0) && (!live?.soccerEvents || live.soccerEvents.length === 0) && (
        <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 p-3 sm:p-4 text-xs text-neutral-500">
          ⓘ {league === "NBA" || league === "WNBA" || league === "NHL"
            ? "쿼터/피리어드 별 점수 데이터를 가져오지 못했습니다."
            : "골 이벤트 데이터가 아직 없거나 외부 데이터 소스에서 미제공 상태입니다."}
        </div>
      )}
    </div>
  );
}

function TeamStatCompare({
  summary,
  homeNameKo,
  awayNameKo,
}: {
  summary: MatchSummary;
  homeNameKo: string;
  awayNameKo: string;
}) {
  // home/away 같은 label 짝맞춤
  const labels = new Set([
    ...summary.homeStats.map((s) => s.label),
    ...summary.awayStats.map((s) => s.label),
  ]);
  const rows = [...labels].map((label) => ({
    label,
    home: summary.homeStats.find((s) => s.label === label),
    away: summary.awayStats.find((s) => s.label === label),
  }));
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-2">
      <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 mb-2">
        팀 stats 비교
      </div>
      {rows.map(({ label, home, away }) => {
        const homeBetter =
          home && away && home.raw > away.raw && Number.isFinite(home.raw) && Number.isFinite(away.raw);
        const awayBetter =
          home && away && away.raw > home.raw && Number.isFinite(home.raw) && Number.isFinite(away.raw);
        return (
          <div
            key={label}
            className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center text-sm py-1"
          >
            <div className={`text-right tabular-nums font-bold ${homeBetter ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}>
              {home?.value ?? "—"}
            </div>
            <div className="text-[11px] text-neutral-500 text-center px-2 whitespace-nowrap min-w-[60px]">
              {label}
            </div>
            <div className={`text-left tabular-nums font-bold ${awayBetter ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}>
              {away?.value ?? "—"}
            </div>
          </div>
        );
      })}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center pt-2 border-t border-neutral-100 dark:border-neutral-800">
        <div className="text-right text-[11px] text-neutral-500 truncate">{homeNameKo}</div>
        <div className="text-[10px] text-neutral-400 px-2">팀</div>
        <div className="text-left text-[11px] text-neutral-500 truncate">{awayNameKo}</div>
      </div>
    </div>
  );
}

function TeamLeaders({
  summary,
  homeNameKo,
  awayNameKo,
}: {
  summary: MatchSummary;
  homeNameKo: string;
  awayNameKo: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 mb-3">
        🌟 양 팀 주요 선수
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <LeaderCol teamName={homeNameKo} side="홈" leaders={summary.homeLeaders} />
        <LeaderCol teamName={awayNameKo} side="원정" leaders={summary.awayLeaders} />
      </div>
    </div>
  );
}

function LeaderCol({
  teamName,
  side,
  leaders,
}: {
  teamName: string;
  side: "홈" | "원정";
  leaders: TeamLeader[];
}) {
  if (leaders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 px-3 py-3 text-sm">
        <div className="text-[11px] text-neutral-500">{side} · {teamName}</div>
        <div className="mt-1 text-neutral-400">데이터 없음</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-3">
      <div className="text-[11px] text-neutral-500 mb-2">{side} · {teamName}</div>
      <ul className="space-y-1.5 text-sm">
        {leaders.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-neutral-500 truncate w-16">{l.category}</span>
            <span className="font-semibold truncate flex-1">{l.playerName}</span>
            <span className="tabular-nums text-xs text-neutral-700 dark:text-neutral-300 shrink-0">
              {l.displayValue}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WinProbabilityChart({
  values,
  homeNameKo,
  awayNameKo,
}: {
  values: number[];
  homeNameKo: string;
  awayNameKo: string;
}) {
  const last = values[values.length - 1];
  const homePct = Math.round(last * 100);
  const awayPct = 100 - homePct;
  // SVG path — width=100, height=40
  const w = 100;
  const h = 40;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - v * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 mb-2">
        📈 승률 추이 (라이브)
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-16 mb-2"
      >
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="currentColor" strokeWidth="0.3" className="text-neutral-300 dark:text-neutral-700" strokeDasharray="1 1" />
        <polyline points={points} fill="none" strokeWidth="1" className="stroke-rose-500" />
      </svg>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-left">
          <span className="text-[11px] text-neutral-500">{homeNameKo}</span>
          <div className="font-bold tabular-nums text-rose-600 dark:text-rose-400">{homePct}%</div>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-neutral-500">{awayNameKo}</span>
          <div className="font-bold tabular-nums text-blue-600 dark:text-blue-400">{awayPct}%</div>
        </div>
      </div>
    </div>
  );
}

function TeamBlock({
  teamId,
  logo,
  name,
  position,
  fifaRank,
  league,
}: {
  teamId?: number;
  logo?: string | null;
  name: string;
  position?: number | null;
  fifaRank?: number | null;
  league?: string;
}) {
  // 순위 [N] 클릭 → 순위표 페이지 (팀 앵커로 하이라이트). 순위표 미지원 대회만 예측 페이지 폴백.
  const standingsUrl =
    league && hasStandingsTable(league)
      ? `/standings/${league}${teamId != null ? `#team-${teamId}` : ""}`
      : `/predictions/${league}${teamId != null ? `#team-${teamId}` : ""}`;
  const nameWithPosition = (
    <div className="font-bold truncate">
      {name}
      {position != null && league ? (
        <span
          role="link"
          tabIndex={0}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(standingsUrl, "_blank", "noopener,noreferrer");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              window.open(standingsUrl, "_blank", "noopener,noreferrer");
            }
          }}
          title={`${name} 리그 순위 보기 (새창)`}
          className="ml-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
        >
          [{position}]
        </span>
      ) : fifaRank != null ? (
        // 국가대항 매치 — 리그 순위 대신 FIFA 국가 랭킹 (리그 순위와 혼동 방지 위해 "FIFA" 라벨).
        <span
          title={`FIFA 랭킹 ${fifaRank}위`}
          className="ml-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 tabular-nums whitespace-nowrap"
        >
          <span className="opacity-70 mr-0.5">FIFA</span>
          {fifaRank}
        </span>
      ) : null}
    </div>
  );
  const inner = (
    <>
      {logo ? (
        // ESPN/NHL 은 hotlink OK. liquipedia (LCK 만) 만 _next/image proxy 필요.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          className="w-12 h-12 sm:w-16 sm:h-16 object-contain mx-auto mb-1.5"
          loading="lazy"
        />
      ) : (
        <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-1.5 rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-base font-bold text-neutral-400">
          {name.slice(0, 1)}
        </div>
      )}
      {nameWithPosition}
    </>
  );
  if (teamId != null) {
    return (
      <Link
        href={`/teams/${teamId}`}
        className="text-center block hover:opacity-80 transition"
      >
        {inner}
      </Link>
    );
  }
  return <div className="text-center">{inner}</div>;
}

function PeriodTable({
  league,
  linescore,
  homeNameKo,
  awayNameKo,
}: {
  league: string;
  linescore: PeriodLinescore;
  homeNameKo: string;
  awayNameKo: string;
}) {
  const isVolleyball = VOLLEYBALL_SET.has(league);
  const periodLabel = league === "NHL" ? "P" : "Q";
  const cols = Math.max(linescore.homePeriods.length, linescore.awayPeriods.length);
  const ot = isVolleyball ? 99 : league === "NHL" ? 4 : 5; // 배구는 OT 없음 (최대 5세트)
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
      <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 mb-2">
        {isVolleyball ? "세트 별 점수" : league === "NHL" ? "피리어드 별 점수" : "쿼터 별 점수"}
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] text-neutral-500">
              <th className="text-left font-medium pb-1 sm:pb-2">팀</th>
              {Array.from({ length: cols }, (_, i) => i).map((i) => {
                const isOt = i + 1 >= ot;
                return (
                  <th key={i} className="text-center font-medium px-1.5 sm:px-2 pb-1 sm:pb-2">
                    {isVolleyball ? `${i + 1}세트` : isOt ? `OT${i + 2 - ot}` : `${i + 1}${periodLabel}`}
                  </th>
                );
              })}
              <th className="text-right font-bold pl-2 pb-1 sm:pb-2">{isVolleyball ? "세트" : "합계"}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1.5 font-semibold truncate max-w-[120px]">{homeNameKo}</td>
              {Array.from({ length: cols }, (_, i) => (
                <td key={i} className="text-center px-1.5 sm:px-2">
                  {linescore.homePeriods[i] ?? "—"}
                </td>
              ))}
              <td className="text-right pl-2 font-bold">{linescore.homeScore}</td>
            </tr>
            <tr className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1.5 font-semibold truncate max-w-[120px]">{awayNameKo}</td>
              {Array.from({ length: cols }, (_, i) => (
                <td key={i} className="text-center px-1.5 sm:px-2">
                  {linescore.awayPeriods[i] ?? "—"}
                </td>
              ))}
              <td className="text-right pl-2 font-bold">{linescore.awayScore}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

