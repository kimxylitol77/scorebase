// /scores 축구 row 레이아웃 — named.com 스타일 한 줄 매치.
// 구조 (데스크탑): [리그배지 110px] [시간] [상태] [홈팀 →] [점수] [← 원정팀] [글] [관심]
// 다크 디폴트. 모바일은 카드 layout (별도 처리) — 이 컴포넌트는 데스크탑 row 전용.
//
// 칸 폭·접힘은 globals.css 의 [data-srow]/[data-scell] 컨테이너 쿼리가 단일 출처.
// 여기서 인라인 gridTemplateColumns 를 다시 넣지 말 것 (nth-child 밀림 사고 종결 구조).
// 각 칸은 data-scell="league|time|status|home|score|away|half|star|info|odds" 로 식별
// (home/away 는 레이아웃 슬롯 명칭 — awayFirst 면 실제 팀은 좌우 스왑됨).
//
// client component — 행 전체가 <a>/<Link> 라서 내부 클릭 동작(리그배지/순위/예측/L/R)은
// anchor 대신 button + window.open 으로 처리한다 (nested anchor invalid HTML + hydration 회피).

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { getLeagueBadge } from "./leagueBadge";
import { getLeagueFlag } from "@/lib/sports/sport-leagues";
import FavoriteStar from "../FavoriteStar";
import { useScoreFlash } from "../useScoreFlash";
import type { SoccerGoal, SoccerCard, SoccerTeamStat, MatchOdds } from "@/lib/sports/live-scores";

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
  /** 팀 통계(점유율·슈팅·코너·카드) — tooltip 하단 표시 */
  soccerTeamStats?: SoccerTeamStat[] | null;
  /** 전반전 통계 — tooltip 통계 섹션에 "전반전" 으로 추가 표시 */
  soccerHalfStats?: SoccerTeamStat[] | null;
  /** 전반전 점수 — 원정팀 옆 컬럼에 "전반 H-A" 표시 (halfTeamStats.p1 골) */
  soccerHalfScore?: { home: number; away: number } | null;
  /** 배당 (1X2 + 오버언더 + 핸디캡) — 행에 작게 + hover 상세 팝업 */
  odds?: MatchOdds | null;
  /** 팀 약칭 라벨 — tooltip 안에 표시 */
  homeShort?: string;
  awayShort?: string;
  /** PREVIEW 글 slug — 있으면 P 아이콘 */
  previewSlug?: string | null;
  /** RECAP 글 slug — 있으면 R 아이콘 */
  recapSlug?: string | null;
  href?: string | null;
  /** 리그 순위 (TheSportsStandingsCache 기반) — 팀명 옆 [14] 표시. null 이면 미표시 */
  homePosition?: number | null;
  awayPosition?: number | null;
  /** FIFA 국가 랭킹 — 국가대항(친선/예선/대륙컵) 매치에서 리그 순위 대신 표시.
      position 이 우선, position 이 없을 때만 FIFA 랭킹 노출 ("FIFA N" 배지). */
  homeFifaRank?: number | null;
  awayFifaRank?: number | null;
  /** true 면 원정팀 좌측 / 홈팀 우측 표시 + 홈팀 옆에 "홈" 마크 (야구 미디어 관행) */
  awayFirst?: boolean;
  /** true 면 점수 증가 시 득점한 팀 숫자 뒤에 halo flash (야구 compact 행 전용).
      축구는 flashSide 로 이미 골 임팩트 효과가 있어 켜지 않음. */
  enableScoreFlash?: boolean;
  /** TheSports cache.lineup 실제 존재 시 true → L 배지 표시 (리그 whitelist 대신 실제 라인업 유무). */
  hasLineup?: boolean;
  /** 리그 그룹 카드 안에서 렌더 시 true → 리그 배지 컬럼 접기(리그는 카드 헤더로). */
  hideLeague?: boolean;
  /** true 면 행이 자체 좌우 패딩을 가짐 → LIVE 배경이 카드 끝까지 full-bleed 되면서도
      내용은 헤더와 정렬 유지. (부모 래퍼 px 제거와 짝. FavoriteMatches 는 미전달=flush 유지) */
  insetX?: boolean;
}

function TeamLogo({ url, name }: { url?: string | null; name: string }) {
  // 군소팀 로고 URL 이 404(이미지 없음)면 onError 로 이니셜 fallback. (af KFA컵 등)
  const [err, setErr] = useState(false);
  if (url && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        onError={() => setErr(true)}
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
    soccerTeamStats,
    soccerHalfStats,
    soccerHalfScore,
    odds,
    homeShort,
    awayShort,
    previewSlug,
    recapSlug,
    href,
    homePosition,
    awayPosition,
    homeFifaRank,
    awayFifaRank,
    awayFirst,
    hasLineup,
    hideLeague,
    insetX,
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

  // 팀 셀의 빈 공간(플렉스 여백) 클릭은 행 링크 이동을 막는다 — 7m 처럼 팀명 앞 공백을
  // 더블클릭하면 팀명이 텍스트 선택(복사)되게 하기 위함. 팀명·로고·순위 클릭은 기존 그대로.
  // e.target===currentTarget 인 클릭만 = 셀 div 자체(여백)를 짚은 경우.
  const blockRowNavOnBlank = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const badge = getLeagueBadge(league);
  const flag = getLeagueFlag(league);
  const isLive = status === "live";
  const isFinished = status === "finished";
  const isPostponed = status === "postponed";

  // 득점 감지 — LIVE 축구는 항상 켬. 점수 숫자 뒤 halo(score-halo-burst) + flashSide(골 임팩트).
  const { awayPing, homePing, flashSide } = useScoreFlash(
    awayScore ?? 0,
    homeScore ?? 0,
    isLive,
  );
  // 임팩트 측 = 점수 기반 flashSide(6초). incident 기반 recentGoalSide(2026-05-23 도입한
  // 0~2분 윈도우=실제 ~3분 잔존)는 라이브 느릴 때 보강책이었으나, 점수가 af+ts 병합으로
  // 빨라져 제거 — "너무 오래 떠 있음" 해소 (2026-06-14).
  const goalFlashSide = flashSide;
  // 좌/우 표시 순서는 awayFirst 에 따라 바뀜 — 좌측 숫자의 ping 을 골라준다.
  const leftPing = awayFirst ? awayPing : homePing;

  // 득점자 tooltip 좌표 — 컨테이너(overflow-x-auto)에 잘리지 않게 fixed 로 띄운다.
  // x 는 화면 가장자리 클램프(폭 280px 절반+여유), 세로는 렌더 후 실측 클램프 (GoalsTooltip).
  const [tipPos, setTipPos] = useState<{ x: number; bottom: number } | null>(null);
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
      // flat = 시간순 평면 뷰(리그 배지 칸 포함 10칸) / grouped = 리그 그룹 카드(9칸).
      // grid-template-columns 는 globals.css 가 data-srow 값 + 컨테이너 쿼리로 정의 —
      // 좁은 컨테이너에서 배당→전반·정보→리그배지→시간 순으로 접혀 팀명 폭을 지킨다.
      data-srow={hideLeague ? "grouped" : "flat"}
      className={`grid items-center gap-3 ${insetX ? "px-3 sm:px-4" : "px-0"} py-2 text-sm transition ${
        isLive
          ? "bg-rose-50/70 dark:bg-rose-500/[0.07] hover:bg-rose-100/70 dark:hover:bg-rose-500/[0.12]"
          : "hover:bg-neutral-100 dark:hover:bg-white/[0.03]"
      }`}
    >
      {/* 1. 리그 배지 — 그룹 카드 안(hideLeague)에서는 헤더로 이동해 접음. */}
      {!hideLeague && (
        <button
          type="button"
          data-scell="league"
          onClick={openInNewTab(`/predictions/${league}`)}
          className="text-[11px] font-bold text-center py-1.5 px-2 rounded-sm truncate hover:opacity-80 transition w-full cursor-pointer"
          style={{ background: badge.bg, color: badge.fg }}
          title={`${badge.label} 리그 순위 보기 (새창)`}
        >
          {flag && <span className="mr-0.5" aria-hidden>{flag}</span>}
          {badge.label}
        </button>
      )}

      {/* 2. KST 시간 */}
      <div data-scell="time" className="text-[12px] text-neutral-600 dark:text-neutral-400 tabular-nums">
        {timeLabel}
      </div>

      {/* 3. 상태 */}
      <div data-scell="status">{statusNode}</div>

      {/* 4. 좌측 팀 (우측 정렬 + 로고 옆) — awayFirst=true 면 원정팀, 아니면 홈팀 */}
      {(() => {
        const leftSide = awayFirst ? "away" : "home";
        const team = awayFirst ? away : home;
        const position = awayFirst ? awayPosition : homePosition;
        const fifaRank = awayFirst ? awayFifaRank : homeFifaRank;
        const isFlash = goalFlashSide === leftSide;
        const showHomeBadge = awayFirst === false ? false : false;
        // 좌측은 awayFirst 인 경우 원정 → "홈" 배지 안 붙음
        return (
          <div
            data-scell="home"
            onClick={blockRowNavOnBlank}
            className={`flex items-center justify-end gap-1.5 min-w-0 px-2 py-1 rounded-md transition ${
              isFlash
                ? "bg-emerald-400/45 dark:bg-emerald-500/30 ring-2 ring-emerald-500 animate-pulse"
                : ""
            }`}
          >
            {/* 리그 미니 라벨 — 리그 배지 칸이 접힌 좁은 컨테이너에서만 CSS 로 표시(시간순 뷰
                리그 식별 유지). mr-auto 로 칸 좌측 끝(옛 배지 자리 방향)에 붙는다. */}
            {!hideLeague && (
              <span
                data-scell="league-mini"
                className="mr-auto shrink-0 max-w-[76px] truncate rounded-sm px-1 py-px text-[9px] font-bold leading-tight"
                style={{ background: badge.bg, color: badge.fg }}
              >
                {badge.label}
              </span>
            )}
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
            {position != null ? (
              <button
                type="button"
                onClick={goToStandings(team.teamId)}
                title={`${team.name} 리그 순위 보기`}
                className="shrink-0 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
              >
                [{position}]
              </button>
            ) : fifaRank != null ? (
              <button
                type="button"
                onClick={openInNewTab("/predictions/fifa-ranking")}
                title={`FIFA 랭킹 ${fifaRank}위 — 전체 랭킹 보기 (새 탭)`}
                className="shrink-0 inline-flex items-baseline gap-0.5 text-[9px] font-bold text-sky-600 dark:text-sky-400 tabular-nums whitespace-nowrap hover:text-sky-700 dark:hover:text-sky-300 hover:underline cursor-pointer"
              >
                <span className="opacity-70">FIFA</span>
                {fifaRank}
              </button>
            ) : null}
            {showHomeBadge && (
              <span className="shrink-0 text-[9px] font-bold tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/15 rounded px-1 py-px">
                홈
              </span>
            )}
            <TeamLogo url={team.logo} name={team.name} />
          </div>
        );
      })()}

      {/* 5. 점수 — awayFirst=true 면 away score 좌측 / home score 우측. hover 시 z-50 으로 tooltip 이 다른 row 위로.
           승부차기는 점수 아래 absolute 로 (6) (5) — 행 높이에 영향 안 주게 (다른 행과 높이 통일). */}
      <div
        data-scell="score"
        // 72px 고정 트랙(globals.css) — auto 면 vs(예정)·0-1(진행) 내용폭 차이로 행마다
        // 팀명 정렬이 어긋남 (2026-06-14). 우측 끝 odds minmax(0,154px)는 vs 중앙정렬 spacer 겸용.
        className="relative text-center font-black text-[18px] tabular-nums whitespace-nowrap px-2 group hover:z-50"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setTipPos({
            x: Math.min(Math.max(r.left + r.width / 2, 152), window.innerWidth - 152),
            bottom: r.bottom,
          });
        }}
        onMouseLeave={() => setTipPos(null)}
      >
        {hasScore ? (
          <>
            <span
              className={`relative isolate inline-block ${
                isLive
                  ? "text-rose-600 dark:text-rose-400"
                  : isFinished
                    ? (awayFirst ? awayWin : homeWin)
                      ? "text-neutral-900 dark:text-white"
                      : "text-neutral-400 dark:text-neutral-600"
                    : "text-neutral-500"
              }`}
            >
              {leftPing > 0 && (
                <span key={leftPing} className="score-halo-burst" aria-hidden />
              )}
              {awayFirst ? awayScore : homeScore}
            </span>
            <span className="mx-1 text-neutral-300 dark:text-neutral-700 font-normal">-</span>
            <span
              className={`relative isolate inline-block ${
                isLive
                  ? "text-rose-600 dark:text-rose-400"
                  : isFinished
                    ? (awayFirst ? homeWin : awayWin)
                      ? "text-neutral-900 dark:text-white"
                      : "text-neutral-400 dark:text-neutral-600"
                    : "text-neutral-500"
              }`}
            >
              {rightPing > 0 && (
                <span key={rightPing} className="score-halo-burst" aria-hidden />
              )}
              {awayFirst ? homeScore : awayScore}
            </span>
            {/* 승부차기 — absolute 라 행 높이 불변. 점수 바로 아래 좌/우 정렬. */}
            {penaltyHome != null && penaltyAway != null && (
              <div className="absolute left-0 right-0 top-full grid grid-cols-2 text-[9px] font-semibold text-neutral-400 dark:text-neutral-500 leading-none pointer-events-none -mt-0.5">
                <span className="text-center">({awayFirst ? penaltyAway : penaltyHome})</span>
                <span className="text-center">({awayFirst ? penaltyHome : penaltyAway})</span>
              </div>
            )}
            {(isFinished || isLive) &&
              ((soccerGoals && soccerGoals.length > 0) ||
                (soccerCards && soccerCards.length > 0) ||
                (soccerTeamStats && soccerTeamStats.length > 0) ||
                (soccerHalfStats && soccerHalfStats.length > 0)) && (
                <GoalsTooltip
                  goals={soccerGoals ?? []}
                  cards={soccerCards ?? []}
                  teamStats={soccerTeamStats ?? []}
                  halfStats={soccerHalfStats ?? []}
                  homeLabel={homeShort ?? home.name}
                  awayLabel={awayShort ?? away.name}
                  pos={tipPos}
                  onClose={() => setTipPos(null)}
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
        const fifaRank = awayFirst ? homeFifaRank : awayFifaRank;
        const isFlash = goalFlashSide === rightSide;
        const showHomeBadge = awayFirst === true;
        return (
          <div
            data-scell="away"
            onClick={blockRowNavOnBlank}
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
            {position != null ? (
              <button
                type="button"
                onClick={goToStandings(team.teamId)}
                title={`${team.name} 리그 순위 보기`}
                className="shrink-0 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
              >
                [{position}]
              </button>
            ) : fifaRank != null ? (
              <button
                type="button"
                onClick={openInNewTab("/predictions/fifa-ranking")}
                title={`FIFA 랭킹 ${fifaRank}위 — 전체 랭킹 보기 (새 탭)`}
                className="shrink-0 inline-flex items-baseline gap-0.5 text-[9px] font-bold text-sky-600 dark:text-sky-400 tabular-nums whitespace-nowrap hover:text-sky-700 dark:hover:text-sky-300 hover:underline cursor-pointer"
              >
                <span className="opacity-70">FIFA</span>
                {fifaRank}
              </button>
            ) : null}
            {isFlash && (
              <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 animate-pulse whitespace-nowrap">
                ⚽ GOAL
              </span>
            )}
          </div>
        );
      })()}

      {/* 6.5 전반전 점수 (halfTeamStats.p1 골) — 진행/종료 매치만, 빨간색 점수만 */}
      <div data-scell="half" className="text-center text-[11px] tabular-nums whitespace-nowrap">
        {(isLive || isFinished) && soccerHalfScore ? (
          <span title="전반전 점수" className="text-rose-600 dark:text-rose-400 font-semibold">
            {soccerHalfScore.home}-{soccerHalfScore.away}
          </span>
        ) : null}
      </div>

      {/* 7. 관심 별표 (위치 swap — 글보다 우선 노출) */}
      <div data-scell="star" className="flex justify-center">
        <FavoriteStar
          matchId={String(matchId)}
          meta={{
            id: String(matchId),
            sport: "soccer",
            league,
            homeName: home.name,
            awayName: away.name,
            homeShort,
            awayShort,
            homeScore,
            awayScore,
            status,
            statusLabel: liveStatusLabel ?? timeLabel,
            href: href ?? undefined,
          }}
        />
      </div>

      {/* 8. 정보 — AI 매치 인사이트 + 라인업 cover 리그 + 리뷰 글 (있을 때).
          justify-start 로 AI 칩 위치를 row 마다 동일하게 고정 (칩 개수에 따라 흔들리지 않게).
          data-scell="info": 스코어보드.kr(.sb-mode) 상시 숨김 + 좁은 컨테이너 접힘 (globals.css). */}
      <div data-scell="info" className="flex items-center justify-start gap-1">
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
        {href && hasLineup && (
          <button
            type="button"
            onClick={openInNewTab(href)}
            title="라인업"
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

      {/* 배당 — 우측 끝(spacer 자리). odds 없으면 null → 빈 칸 */}
      <OddsCell odds={odds ?? null} />
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
        // 내부 링크는 같은 탭 — 다른 종목 카드와 통일. 새 탭(target=_blank)이면 PWA 설치 크롬이
        // "지원되는 링크 열기" 설정 시 앱 창으로 가로채 브라우저/앱 혼선을 만든다 (2026-07-28 제보).
        <Link href={href} prefetch={false} className="block">
          {rowContent}
        </Link>
      )}
    </div>
  );
}

/** 배당 셀 — 행에 1X2(승/무/패)+오버언더 작게, hover 시 상세 팝업(핸디캡 포함).
 *  팝업은 overflow-x-auto 컨테이너에 세로로 잘리므로(특히 마지막 행이 하단으로 넘쳐 잘림)
 *  GoalsTooltip 처럼 fixed + 실측 좌표로 띄우고, 하단 공간 부족하면 위로 플립한다. */
function OddsCell({ odds }: { odds: MatchOdds | null }) {
  const f = (n: number | null) => (n != null ? n.toFixed(2) : "-");
  // hover 시 셀의 우측·하단 좌표 저장 → 팝업을 fixed 로 띄워 컨테이너 클립 회피.
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);
  if (!odds) return null;
  return (
    <div
      data-scell="odds"
      role="link"
      title="이 배당이 어디로 움직이는지 — 배당 흐름 보기"
      onClick={(e) => {
        // 행 전체가 <Link> 라 nested anchor 회피 — button 배지들과 동일하게 window.open 우회.
        e.preventDefault();
        e.stopPropagation();
        if (typeof window !== "undefined")
          window.open("/odds?sport=soccer", "_blank", "noopener,noreferrer");
      }}
      className="relative flex cursor-pointer flex-col items-end justify-center gap-0.5 text-[9px] leading-none tabular-nums hover:text-neutral-600 dark:hover:text-neutral-300"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ right: window.innerWidth - r.right, bottom: r.bottom });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {/* 1X2 (승/무/패) — 스코어·결과가 먼저 읽히게 배당은 뮤트(hover 팝업에서 강조). */}
      <div className="flex gap-1 text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-500">
        <span>{f(odds.home)}</span>
        <span className="opacity-70">{f(odds.draw)}</span>
        <span>{f(odds.away)}</span>
      </div>
      {/* 오버언더 */}
      {odds.over != null && (
        <div className="flex gap-1 text-neutral-400/70 dark:text-neutral-600">
          <span>O{f(odds.over)}</span>
          <span>U{f(odds.under)}</span>
        </div>
      )}
      {/* hover 상세 팝업 — fixed (컨테이너 세로 클립 회피) */}
      <OddsPopup odds={odds} pos={pos} f={f} onClose={() => setPos(null)} />
    </div>
  );
}

/** 배당 상세 팝업 — fixed 로 띄워 overflow 컨테이너 세로 클립 회피. 하단 공간 부족(마지막 행)이면 위로 플립. */
function OddsPopup({
  odds,
  pos,
  f,
  onClose,
}: {
  odds: MatchOdds;
  pos: { right: number; bottom: number } | null;
  f: (n: number | null) => string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  // 호버 중 스크롤하면 fixed 팝업이 행과 분리되므로 닫는다.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", onClose, true);
    return () => window.removeEventListener("scroll", onClose, true);
  }, [pos, onClose]);
  // 렌더 후 높이 실측 → 하단 넘치면 위로 클램프(플립).
  useLayoutEffect(() => {
    // 렌더된 박스 높이를 실측해 화면 안으로 클램프. DOM 측정은 렌더 후에만 가능해 파생으로 대체할 수 없다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!pos) { setTop(null); return; }
    const el = boxRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    setTop(Math.min(pos.bottom + 4, Math.max(8, window.innerHeight - h - 8)));
  }, [pos]);
  if (!pos) return null;
  return (
    <div
      ref={boxRef}
      className="fixed z-50 pointer-events-none"
      style={{ right: pos.right, top: top ?? pos.bottom + 4 }}
    >
      <div className="rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-xl shadow-neutral-900/15 p-2.5 text-left min-w-[176px]">
        <div className="text-[10px] font-bold text-neutral-500 mb-1.5">
          배당{odds.books ? ` · ${odds.books}곳 평균` : ""}
        </div>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-neutral-500">승 / 무 / 패</span>
            <span className="tabular-nums">
              <span className="text-rose-600 dark:text-rose-400 font-semibold">{f(odds.home)}</span>
              {" "}{f(odds.draw)}{" "}
              <span className="text-blue-600 dark:text-blue-400 font-semibold">{f(odds.away)}</span>
            </span>
          </div>
          {odds.over != null && (
            <div className="flex justify-between pt-1 mt-1 border-t border-neutral-200 dark:border-white/10">
              <span className="text-neutral-500">오버언더 {odds.totalLine}</span>
              <span className="tabular-nums">O {f(odds.over)} / U {f(odds.under)}</span>
            </div>
          )}
          {odds.hcHome != null && (
            <div className="flex justify-between">
              <span className="text-neutral-500">핸디캡 {odds.hcLine}</span>
              <span className="tabular-nums">{f(odds.hcHome)} / {f(odds.hcAway)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 통계 바 행들 (점유율·슈팅·코너·카드) — 풀타임/전반 공용. 좌=홈(rose), 우=원정(blue). */
function StatBars({ stats }: { stats: SoccerTeamStat[] }) {
  return (
    <div className="space-y-1.5">
      {stats.map((s) => {
        const max = Math.max(s.home, s.away, 1);
        return (
          <div key={s.label}>
            <div className="grid grid-cols-[2.2rem_1fr_2.2rem] items-center gap-1.5 text-[10px] leading-none mb-0.5">
              <span className="text-rose-600 dark:text-rose-400 font-bold tabular-nums text-right">
                {s.home}
                {s.pct ? "%" : ""}
              </span>
              <span className="text-center text-neutral-500 truncate">{s.label}</span>
              <span className="text-blue-600 dark:text-blue-400 font-bold tabular-nums text-left">
                {s.away}
                {s.pct ? "%" : ""}
              </span>
            </div>
            <div className="flex items-center gap-0.5 h-1">
              <div className="flex-1 flex justify-end">
                <div
                  className="bg-rose-500/80 h-full rounded-l"
                  style={{ width: `${(s.home / max) * 100}%` }}
                />
              </div>
              <div className="flex-1">
                <div
                  className="bg-blue-500/80 h-full rounded-r"
                  style={{ width: `${(s.away / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 종료/진행 매치 점수 hover 시 표시되는 골 + 카드 tooltip.
 *  컨테이너(overflow-x-auto)가 absolute 팝업을 잘라서 fixed + 마우스 진입 시 계산된
 *  좌표로 띄운다 (가장자리 클램프 + 하단 공간 부족 시 위로 플립). */
function GoalsTooltip({
  goals,
  cards,
  teamStats,
  halfStats,
  homeLabel,
  awayLabel,
  pos,
  onClose,
}: {
  goals: SoccerGoal[];
  cards: SoccerCard[];
  teamStats: SoccerTeamStat[];
  halfStats: SoccerTeamStat[];
  homeLabel: string;
  awayLabel: string;
  pos: { x: number; bottom: number } | null;
  onClose: () => void;
}) {
  // 호버 중 스크롤하면 fixed 팝업이 행과 분리되므로 닫는다
  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", onClose, true);
    return () => window.removeEventListener("scroll", onClose, true);
  }, [pos, onClose]);

  // 세로 클램프 — 내용 높이가 가변(골·카드·스탯)이라 렌더 후 실측해 화면 안으로
  const boxRef = useRef<HTMLDivElement>(null);
  const [topAdj, setTopAdj] = useState<number | null>(null);
  useLayoutEffect(() => {
    // 렌더된 박스 높이를 실측해 화면 안으로 클램프. DOM 측정은 렌더 후에만 가능해 파생으로 대체할 수 없다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!pos) { setTopAdj(null); return; }
    const el = boxRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    setTopAdj(Math.min(pos.bottom + 4, Math.max(8, window.innerHeight - h - 8)));
  }, [pos]);
  const parseMinute = (s: string): number => {
    const m = s.match(/(\d+)(?:\+(\d+))?/);
    if (!m) return 0;
    // 추가시간은 fractional — 전반 추가시간(45+5)이 후반(47) 앞에 오게.
    // 합산(45+5=50)이면 47 뒤로 가던 버그 (2026-06-14 독일전 득점순서 역전).
    return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 100 : 0);
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

  if (!pos) return null;
  return (
    <div
      ref={boxRef}
      role="tooltip"
      className="fixed z-50 -translate-x-1/2 min-w-[280px] pointer-events-none"
      style={{ left: pos.x, top: topAdj ?? pos.bottom + 4 }}
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

        {/* 통계 섹션 — 풀타임(teamStats) + 전반전(halfStats). 좌=홈(rose), 우=원정(blue) */}
        {teamStats.length > 0 && (
          <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-white/10">
            <StatBars stats={teamStats} />
          </div>
        )}
        {halfStats.length > 0 && (
          <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-white/10">
            <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 text-center mb-1.5">
              전반전
            </div>
            <StatBars stats={halfStats} />
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
      data-srow
      className="grid items-center gap-3 px-0 py-2 text-[10px] font-bold tracking-wider uppercase text-neutral-500 border-b border-neutral-200 dark:border-white/10"
      style={{
        gridTemplateColumns:
          "110px 56px 64px minmax(0,1fr) 72px minmax(0,1fr) 54px 28px 48px minmax(0,154px)",
      }}
    >
      <div className="text-center">리그명</div>
      <div>시간</div>
      <div>상태</div>
      <div className="text-right">홈팀</div>
      <div className="text-center px-2">점수</div>
      <div>원정팀</div>
      <div className="text-center">전반</div>
      <div className="text-center">관심</div>
      <div data-sinfo className="text-center">정보</div>
      <div className="text-right">배당</div>
    </div>
  );
}
