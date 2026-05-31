// /scores 축구 row 레이아웃 — named.com 스타일 한 줄 매치.
// 구조 (데스크탑): [리그배지 110px] [시간] [상태] [홈팀 →] [점수] [← 원정팀] [글] [관심]
// 다크 디폴트. 모바일은 카드 layout (별도 처리) — 이 컴포넌트는 데스크탑 row 전용.
//
// client component — 행 전체가 <a>/<Link> 라서 내부 클릭 동작(리그배지/순위/예측/L/R)은
// anchor 대신 button + window.open 으로 처리한다 (nested anchor invalid HTML + hydration 회피).

"use client";

import Link from "next/link";
import { getLeagueBadge } from "./leagueBadge";
import { getLeagueFlag } from "@/lib/sports/sport-leagues";
import FavoriteStar from "../FavoriteStar";
import { useScoreFlash } from "../useScoreFlash";
import type { SoccerGoal, SoccerCard } from "@/lib/sports/live-scores";

// TheSports football-poller 가 lineup.detail 풍부 cover 하는 리그.
// 메모리 [project_thesports_trial] 의 라이브 데이터 cover 현황 참고 — 메이저 + 한국/일본 + AFC.
const LINEUP_LEAGUES = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "UCL", "UEL", "UECL",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE",
  "AFC_CL", "AFC_CL_TWO", "AFC_U23",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EREDIVISIE", "PRIMEIRA_LIGA", "MLS", "BRASILEIRAO", "LIGA_MX",
  "INDIA_ISL", "SAUDI_PL",
]);

export interface SoccerLiveRowProps {
  matchId: string | number;
  league: string;
  status: "live" | "finished" | "scheduled" | "postponed";
  /** "KST 18:30" */
  timeLabel: string;
  /** "전반 38'", "HT", "후반 78'", "FT" 등 — 라이브 진행 상태 */
  liveStatusLabel?: string | null;
  home: { name: string; logo?: string | null; teamId?: number };
  away: { name: string; logo?: string | null; teamId?: number };
  homeScore: number | null;
  awayScore: number | null;
  /** 축구 승부차기 — 정규/연장 동점 후 PK */
  penaltyHome?: number | null;
  penaltyAway?: number | null;
  /** 골 list — 종료 매치 hover tooltip 용 */
  soccerGoals?: SoccerGoal[] | null;
  /** 옐로/레드 카드 list — 골 tooltip 안에 같이 표시 */
  soccerCards?: SoccerCard[] | null;
  /** 팀 약칭 라벨 — tooltip 안에 표시 */
  homeShort?: string;
  awayShort?: string;
  /** PREVIEW 글 slug — 있으면 P 아이콘 */
  previewSlug?: string | null;
  /** RECAP 글 slug — 있으면 R 아이콘 */
  recapSlug?: string | null;
  /** 최근 1분 내 골 측 — 점수 셀 노란 ring + pulse */
  recentGoalSide?: "home" | "away" | null;
  href?: string | null;
  /** 리그 순위 (TheSportsStandingsCache 기반) — 팀명 옆 [14] 표시. null 이면 미표시 */
  homePosition?: number | null;
  awayPosition?: number | null;
  /** true 면 원정팀 좌측 / 홈팀 우측 표시 + 홈팀 옆에 "홈" 마크 (야구 미디어 관행) */
  awayFirst?: boolean;
  /** true 면 점수 증가 시 득점한 팀 숫자 뒤에 halo flash (야구 compact 행 전용).
      축구는 recentGoalSide 로 이미 골 임팩트 효과가 있어 켜지 않음. */
  enableScoreFlash?: boolean;
}

function TeamLogo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="h-5 w-5 object-contain shrink-0 bg-white rounded p-0.5"
        loading="lazy"
      />
    );
  }
  return (
    <span className="w-5 h-5 inline-flex items-center justify-center text-[10px] font-bold text-neutral-400 bg-white/5 rounded-full shrink-0">
      {name.slice(0, 1)}
    </span>
  );
}

export default function SoccerLiveRow(props: SoccerLiveRowProps) {
  const {
    matchId,
    league,
    status,
    timeLabel,
    liveStatusLabel,
    home,
    away,
    homeScore,
    awayScore,
    penaltyHome,
    penaltyAway,
    soccerGoals,
    soccerCards,
    homeShort,
    awayShort,
    previewSlug,
    recapSlug,
    recentGoalSide,
    href,
    homePosition,
    awayPosition,
    awayFirst,
    enableScoreFlash,
  } = props;

  // 행 전체가 <a>/<Link> 라 내부 링크를 anchor 로 두면 nested anchor (invalid HTML +
  // hydration mismatch) 가 된다. 내부 클릭 동작은 모두 button + window.open 으로 우회.
  const openInNewTab = (url: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const goToStandings = (teamId: number | undefined) =>
    openInNewTab(
      `/predictions/${league}${teamId != null ? `#team-${teamId}` : ""}`,
    );

  const badge = getLeagueBadge(league);
  const flag = getLeagueFlag(league);
  const isLive = status === "live";
  const isFinished = status === "finished";
  const isPostponed = status === "postponed";

  // 야구 compact 행 — 득점 시 점수 숫자 뒤 halo (enableScoreFlash + LIVE 일 때만).
  const { awayPing, homePing } = useScoreFlash(
    awayScore ?? 0,
    homeScore ?? 0,
    !!enableScoreFlash && isLive,
  );
  // 좌/우 표시 순서는 awayFirst 에 따라 바뀜 — 좌측 숫자의 ping 을 골라준다.
  const leftPing = awayFirst ? awayPing : homePing;
  const rightPing = awayFirst ? homePing : awayPing;

  // SCHEDULED 매치는 score 무시 — collector 잔여 데이터로 미래 매치에 점수 표시되는 버그 회피
  const hasScore = (isLive || isFinished) && homeScore != null && awayScore != null;
  const homeWin = hasScore && homeScore! > awayScore!;
  const awayWin = hasScore && awayScore! > homeScore!;

  // 상태 텍스트 — LIVE: 진행시간 (빨강), 종료: "종료", 예정: 시간만
  const statusNode = isLive ? (
    <span className="text-[12px] font-bold text-rose-500 tabular-nums whitespace-nowrap">
      {liveStatusLabel || "LIVE"}
    </span>
  ) : isPostponed ? (
    <span className="text-[11px] text-neutral-500">연기</span>
  ) : isFinished ? (
    <span className="text-[11px] text-neutral-500">종료</span>
  ) : (
    <span className="text-[11px] text-neutral-500">예정</span>
  );

  const rowContent = (
    <div
      className="grid items-center gap-3 px-0 py-2 text-sm transition hover:bg-neutral-100 dark:hover:bg-white/[0.03]"
      style={{
        // 좌측 fixed (110+56+64=230) vs 우측 fixed (28+48=76) 비대칭으로 vs/점수가 우측 쏠림.
        // 우측에 154px spacer 컬럼 추가 → vs 가 row 가운데 정렬 (날짜 header 와 일치).
        // 7=관심(28px), 8=글(48px) — 사용자 요청으로 위치 swap (2026-05-24)
        gridTemplateColumns:
          "110px 56px 64px minmax(0,1fr) auto minmax(0,1fr) 28px 48px minmax(0,154px)",
      }}
    >
      {/* 1. 리그 배지 — 클릭 시 새창에서 리그 순위 페이지 (nested anchor 회피 위해 button) */}
      <button
        type="button"
        onClick={openInNewTab(`/predictions/${league}`)}
        className="text-[11px] font-bold text-center py-1.5 px-2 rounded-sm truncate hover:opacity-80 transition w-full cursor-pointer"
        style={{ background: badge.bg, color: badge.fg }}
        title={`${badge.label} 리그 순위 보기 (새창)`}
      >
        {flag && <span className="mr-0.5" aria-hidden>{flag}</span>}
        {badge.label}
      </button>

      {/* 2. KST 시간 */}
      <div className="text-[12px] text-neutral-600 dark:text-neutral-400 tabular-nums">
        {timeLabel}
      </div>

      {/* 3. 상태 */}
      <div>{statusNode}</div>

      {/* 4. 좌측 팀 (우측 정렬 + 로고 옆) — awayFirst=true 면 원정팀, 아니면 홈팀 */}
      {(() => {
        const leftSide = awayFirst ? "away" : "home";
        const team = awayFirst ? away : home;
        const position = awayFirst ? awayPosition : homePosition;
        const isFlash = recentGoalSide === leftSide;
        const showHomeBadge = awayFirst === false ? false : false;
        // 좌측은 awayFirst 인 경우 원정 → "홈" 배지 안 붙음
        return (
          <div
            className={`flex items-center justify-end gap-1.5 min-w-0 px-2 py-1 rounded-md transition ${
              isFlash
                ? "bg-emerald-400/45 dark:bg-emerald-500/30 ring-2 ring-emerald-500 animate-pulse"
                : ""
            }`}
          >
            {isFlash && (
              <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 animate-pulse whitespace-nowrap">
                ⚽ GOAL
              </span>
            )}
            <span
              className={`truncate text-right text-[13px] min-w-0 ${
                isFlash
                  ? "text-emerald-800 dark:text-emerald-200 font-bold"
                  : "text-neutral-800 dark:text-neutral-200"
              }`}
            >
              {team.name}
            </span>
            {position != null && (
              <button
                type="button"
                onClick={goToStandings(team.teamId)}
                title={`${team.name} 리그 순위 보기`}
                className="shrink-0 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
              >
                [{position}]
              </button>
            )}
            {showHomeBadge && (
              <span className="shrink-0 text-[9px] font-bold tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/15 rounded px-1 py-px">
                홈
              </span>
            )}
            <TeamLogo url={team.logo} name={team.name} />
          </div>
        );
      })()}

      {/* 5. 점수 — awayFirst=true 면 away score 좌측 / home score 우측. hover 시 z-50 으로 tooltip 이 다른 row 위로 */}
      <div className="relative text-center font-black text-[14px] tabular-nums whitespace-nowrap px-2 group hover:z-50">
        {hasScore ? (
          <>
            {(awayFirst ? penaltyAway : penaltyHome) != null && (
              <span className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 mr-0.5">
                ({awayFirst ? penaltyAway : penaltyHome})
              </span>
            )}
            <span
              className={`relative isolate inline-block ${
                (awayFirst ? awayWin : homeWin)
                  ? "text-rose-600 dark:text-rose-400"
                  : isFinished || isLive
                    ? "text-neutral-700 dark:text-neutral-300"
                    : "text-neutral-500"
              }`}
            >
              {leftPing > 0 && (
                <span key={leftPing} className="score-halo-burst" aria-hidden />
              )}
              {awayFirst ? awayScore : homeScore}
            </span>
            <span className="mx-1 text-neutral-500">-</span>
            <span
              className={`relative isolate inline-block ${
                (awayFirst ? homeWin : awayWin)
                  ? "text-rose-600 dark:text-rose-400"
                  : isFinished || isLive
                    ? "text-neutral-700 dark:text-neutral-300"
                    : "text-neutral-500"
              }`}
            >
              {rightPing > 0 && (
                <span key={rightPing} className="score-halo-burst" aria-hidden />
              )}
              {awayFirst ? homeScore : awayScore}
            </span>
            {(awayFirst ? penaltyHome : penaltyAway) != null && (
              <span className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 ml-0.5">
                ({awayFirst ? penaltyHome : penaltyAway})
              </span>
            )}
            {(isFinished || isLive) &&
              ((soccerGoals && soccerGoals.length > 0) ||
                (soccerCards && soccerCards.length > 0)) && (
                <GoalsTooltip
                  goals={soccerGoals ?? []}
                  cards={soccerCards ?? []}
                  homeLabel={homeShort ?? home.name}
                  awayLabel={awayShort ?? away.name}
                />
              )}
          </>
        ) : (
          <span className="text-neutral-500 text-[11px] font-medium">vs</span>
        )}
      </div>

      {/* 6. 우측 팀 (좌측 정렬 + 로고 옆) — awayFirst=true 면 홈팀("홈" 배지), 아니면 원정팀 */}
      {(() => {
        const rightSide = awayFirst ? "home" : "away";
        const team = awayFirst ? home : away;
        const position = awayFirst ? homePosition : awayPosition;
        const isFlash = recentGoalSide === rightSide;
        const showHomeBadge = awayFirst === true;
        return (
          <div
            className={`flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-md transition ${
              isFlash
                ? "bg-emerald-400/45 dark:bg-emerald-500/30 ring-2 ring-emerald-500 animate-pulse"
                : ""
            }`}
          >
            <TeamLogo url={team.logo} name={team.name} />
            {showHomeBadge && (
              <span className="shrink-0 text-[9px] font-bold tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/15 rounded px-1 py-px">
                홈
              </span>
            )}
            <span
              className={`truncate text-[13px] min-w-0 ${
                isFlash
                  ? "text-emerald-800 dark:text-emerald-200 font-bold"
                  : "text-neutral-800 dark:text-neutral-200"
              }`}
            >
              {team.name}
            </span>
            {position != null && (
              <button
                type="button"
                onClick={goToStandings(team.teamId)}
                title={`${team.name} 리그 순위 보기`}
                className="shrink-0 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
              >
                [{position}]
              </button>
            )}
            {isFlash && (
              <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 animate-pulse whitespace-nowrap">
                ⚽ GOAL
              </span>
            )}
          </div>
        );
      })()}

      {/* 7. 관심 별표 (위치 swap — 글보다 우선 노출) */}
      <div className="flex justify-center">
        <FavoriteStar matchId={String(matchId)} />
      </div>

      {/* 8. 정보 — AI 매치 인사이트 + 라인업 cover 리그 + 리뷰 글 (있을 때).
          justify-start 로 AI 칩 위치를 row 마다 동일하게 고정 (칩 개수에 따라 흔들리지 않게). */}
      <div className="flex items-center justify-start gap-1">
        {href && (
          <button
            type="button"
            onClick={openInNewTab(href)}
            title="AI 매치 인사이트"
            className="inline-flex items-center justify-center px-1.5 h-5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 transition whitespace-nowrap cursor-pointer"
          >
            예측
          </button>
        )}
        {href && LINEUP_LEAGUES.has(league) && (
          <button
            type="button"
            onClick={openInNewTab(href)}
            title="라인업 (TheSports cover)"
            className="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/25 transition cursor-pointer"
          >
            L
          </button>
        )}
        {recapSlug && (
          <button
            type="button"
            onClick={openInNewTab(`/articles/${recapSlug}`)}
            title="리뷰"
            className="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 transition cursor-pointer"
          >
            R
          </button>
        )}
      </div>
    </div>
  );

  if (!href) return rowContent;

  const isExternal = /^https?:\/\//i.test(href);
  return (
    <div className="border-b border-neutral-200 dark:border-white/5">
      {isExternal ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block">
          {rowContent}
        </a>
      ) : (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          prefetch={false}
          className="block"
        >
          {rowContent}
        </Link>
      )}
    </div>
  );
}

/** 종료/진행 매치 점수 hover 시 표시되는 골 + 카드 tooltip. */
function GoalsTooltip({
  goals,
  cards,
  homeLabel,
  awayLabel,
}: {
  goals: SoccerGoal[];
  cards: SoccerCard[];
  homeLabel: string;
  awayLabel: string;
}) {
  const parseMinute = (s: string): number => {
    const m = s.match(/(\d+)(?:\+(\d+))?/);
    if (!m) return 0;
    return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
  };
  const homeGoals = goals
    .filter((g) => g.side === "home")
    .sort((a, b) => parseMinute(a.minute) - parseMinute(b.minute));
  const awayGoals = goals
    .filter((g) => g.side === "away")
    .sort((a, b) => parseMinute(a.minute) - parseMinute(b.minute));
  const homeCards = cards
    .filter((c) => c.side === "home")
    .sort((a, b) => parseMinute(a.minute) - parseMinute(b.minute));
  const awayCards = cards
    .filter((c) => c.side === "away")
    .sort((a, b) => parseMinute(a.minute) - parseMinute(b.minute));

  const CardBadge = ({ kind }: { kind: "yellow" | "red" }) => (
    <span
      className="inline-block w-2 h-3 rounded-sm shrink-0"
      style={{
        background: kind === "yellow" ? "#facc15" : "#dc2626",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
      }}
      aria-label={kind === "yellow" ? "옐로카드" : "레드카드"}
    />
  );

  return (
    <div
      role="tooltip"
      className="absolute left-1/2 top-full z-50 -translate-x-1/2 mt-1 min-w-[280px] hidden group-hover:block pointer-events-none"
    >
      <div className="rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-xl shadow-neutral-900/15 dark:shadow-black/50 p-2.5 text-left">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 pb-1 border-b border-neutral-200 dark:border-white/10 truncate">
            {homeLabel}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 pb-1 border-b border-neutral-200 dark:border-white/10 truncate text-right">
            {awayLabel}
          </div>
          {/* 좌측 컬럼 — 홈팀 골 */}
          <div className="space-y-1">
            {homeGoals.length === 0 && (
              <div className="text-neutral-400 text-[10px]">—</div>
            )}
            {homeGoals.map((g, i) => (
              <div
                key={`h${i}`}
                className="flex items-center gap-1.5 text-neutral-800 dark:text-neutral-200 truncate"
              >
                <span className="text-[10px] tabular-nums text-neutral-500 shrink-0 w-8">
                  {g.minute}
                </span>
                <span className="shrink-0" aria-label="골">⚽</span>
                <span className="truncate">{g.player || "—"}</span>
                {g.penaltyKick && (
                  <span className="text-[9px] text-neutral-400 shrink-0">PK</span>
                )}
                {g.ownGoal && (
                  <span className="text-[9px] text-neutral-400 shrink-0">자책</span>
                )}
              </div>
            ))}
          </div>
          {/* 우측 컬럼 — 원정팀 골 */}
          <div className="space-y-1 text-right">
            {awayGoals.length === 0 && (
              <div className="text-neutral-400 text-[10px]">—</div>
            )}
            {awayGoals.map((g, i) => (
              <div
                key={`a${i}`}
                className="flex items-center justify-end gap-1.5 text-neutral-800 dark:text-neutral-200 truncate"
              >
                {g.ownGoal && (
                  <span className="text-[9px] text-neutral-400 shrink-0">자책</span>
                )}
                {g.penaltyKick && (
                  <span className="text-[9px] text-neutral-400 shrink-0">PK</span>
                )}
                <span className="truncate">{g.player || "—"}</span>
                <span className="shrink-0" aria-label="골">⚽</span>
                <span className="text-[10px] tabular-nums text-neutral-500 shrink-0 w-8 text-left">
                  {g.minute}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 카드 섹션 — 옐로/레드 */}
        {(homeCards.length > 0 || awayCards.length > 0) && (
          <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-white/10 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div className="space-y-1">
              {homeCards.map((c, i) => (
                <div
                  key={`hc${i}`}
                  className="flex items-center gap-1.5 text-neutral-800 dark:text-neutral-200 truncate"
                >
                  <span className="text-[10px] tabular-nums text-neutral-500 shrink-0 w-8">
                    {c.minute}
                  </span>
                  <CardBadge kind={c.kind} />
                  <span className="truncate">{c.player || "—"}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-right">
              {awayCards.map((c, i) => (
                <div
                  key={`ac${i}`}
                  className="flex items-center justify-end gap-1.5 text-neutral-800 dark:text-neutral-200 truncate"
                >
                  <span className="truncate">{c.player || "—"}</span>
                  <CardBadge kind={c.kind} />
                  <span className="text-[10px] tabular-nums text-neutral-500 shrink-0 w-8 text-left">
                    {c.minute}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 테이블 헤더 — SoccerLiveRow 행들 위에 한 번만 표시 */
export function SoccerLiveRowHeader() {
  return (
    <div
      className="grid items-center gap-3 px-0 py-2 text-[10px] font-bold tracking-wider uppercase text-neutral-500 border-b border-neutral-200 dark:border-white/10"
      style={{
        gridTemplateColumns:
          "110px 56px 64px minmax(0,1fr) auto minmax(0,1fr) 28px 48px minmax(0,154px)",
      }}
    >
      <div className="text-center">리그명</div>
      <div>시간</div>
      <div>상태</div>
      <div className="text-right">홈팀</div>
      <div className="text-center px-2">점수</div>
      <div>원정팀</div>
      <div className="text-center">관심</div>
      <div className="text-center">정보</div>
    </div>
  );
}
