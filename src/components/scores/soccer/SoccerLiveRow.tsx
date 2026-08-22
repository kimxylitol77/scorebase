// /scores 축구 row 레이아웃 — named.com 스타일 한 줄 매치.
// 구조 (데스크탑): [리그배지 110px] [시간] [상태] [홈팀 →] [점수] [← 원정팀] [글] [관심]
// 다크 디폴트. 모바일은 카드 layout (별도 처리) — 이 컴포넌트는 데스크탑 row 전용.
//
// 칸 폭·접힘은 globals.css 의 [data-srow]/[data-scell] 컨테이너 쿼리가 단일 출처.
// 여기서 인라인 gridTemplateColumns 를 다시 넣지 말 것 (nth-child 밀림 사고 종결 구조).
// 각 칸은 data-scell="league|time|status|home|score|away|half|star|info|odds" 로 식별
// (home/away 는 레이아웃 슬롯 명칭 — awayFirst 면 실제 팀은 좌우 스왑됨).
//
// client component — 매치 상세 링크는 팀명 텍스트 + 점수에만 건다 (7m 방식, 2026-08-11 요청.
// 점수 링크는 2026-08-14 추가 — 점수를 누르는 습관이 강해서). 행의 나머지 빈칸은 화살표 커서 +
// 클릭 무동작 + 텍스트 선택 자유. 리그배지/순위/분석/라인업/리뷰 는 기존대로 button + window.open
// (행 링크 시절의 nested anchor 회피 구조 유지 — 무해).

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { getLeagueBadge } from "./leagueBadge";
import { getLeagueFlag } from "@/lib/sports/sport-leagues";
import { hasStandingsTable } from "@/lib/sports/standings-valid";
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

  const openInNewTab = (url: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  // 순위 [N] 클릭 → 순위표 페이지 (팀 앵커로 하이라이트). 순위표 미지원 대회만 예측 페이지 폴백.
  const goToStandings = (teamId: number | undefined) =>
    openInNewTab(
      hasStandingsTable(league)
        ? `/standings/${league}${teamId != null ? `#team-${teamId}` : ""}`
        : `/predictions/${league}${teamId != null ? `#team-${teamId}` : ""}`,
    );

  const isExternal = href != null && /^https?:\/\//i.test(href);

  // 팀명 텍스트만 매치 상세 링크 — 빈칸·시간·상태는 링크 아님 (화살표 커서, 클릭 무동작).
  // 7m 사용 습관 (팀명 복사·검색) 대응.
  const teamNameLink = (name: string, extraClass: string) => {
    if (!href) return <span data-teamname className={extraClass}>{name}</span>;
    const cls = `${extraClass} hover:underline underline-offset-2`;
    return isExternal ? (
      <a data-teamname href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {name}
      </a>
    ) : (
      <Link data-teamname href={href} prefetch={false} className={cls}>
        {name}
      </Link>
    );
  };

  // 점수 클릭 → 매치 상세(라이브 페이지). 팀명 링크와 같은 목적지·같은 탭.
  // 득점자 tooltip 은 hover 라 클릭과 겹치지 않는다.
  const scoreLink = (inner: React.ReactNode) => {
    if (!href) return inner;
    const cls = "inline-flex items-baseline hover:opacity-80 transition";
    return isExternal ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title="경기 상세 보기">
        {inner}
      </a>
    ) : (
      <Link href={href} prefetch={false} className={cls} title="경기 상세 보기">
        {inner}
      </Link>
    );
  };

  // 팀 셀의 빈 여백 더블클릭 → 팀명 전체를 텍스트 선택. 플렉스 여백은 팀명과 다른 텍스트
  // 노드라 브라우저 기본 단어 선택이 개행만 잡는다 — 7m(테이블 셀 단일 텍스트 흐름)과 같은
  // 결과를 내려면 직접 선택해줘야 한다.
  const selectTeamNameOnBlankDblClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return; // 팀명·버튼 위 더블클릭은 기본 동작 유지
    const el = (e.currentTarget as HTMLElement).querySelector("[data-teamname]");
    const sel = window.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
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
      className={`grid items-center gap-2 ${insetX ? "px-3 sm:px-4" : "px-0"} py-2 text-sm transition ${
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
          onClick={openInNewTab(`/leagues/${league}`)}
          className="text-[11px] font-bold text-center py-1.5 px-2 rounded-sm truncate hover:opacity-80 transition w-full cursor-pointer"
          style={{ background: badge.bg, color: badge.fg }}
          title={`${badge.label} 리그 정보 보기 (새창)`}
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
            onDoubleClick={selectTeamNameOnBlankDblClick}
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
            {teamNameLink(
              team.name,
              `truncate text-right text-[13px] min-w-0 ${
                isFlash
                  ? "text-emerald-800 dark:text-emerald-200 font-bold"
                  : "text-neutral-800 dark:text-neutral-200"
              }`,
            )}
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
        // 팀명 정렬이 어긋남 (2026-06-14). 우측 끝 odds minmax(0,124px)는 vs 중앙정렬 spacer 겸용.
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
            {scoreLink(
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
              </>,
            )}
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
          scoreLink(<span className="text-neutral-500 text-[11px] font-medium">vs</span>)
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
            onDoubleClick={selectTeamNameOnBlankDblClick}
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
            {teamNameLink(
              team.name,
              `truncate text-[13px] min-w-0 ${
                isFlash
                  ? "text-emerald-800 dark:text-emerald-200 font-bold"
                  : "text-neutral-800 dark:text-neutral-200"
              }`,
            )}
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

      {/* 8. 정보 — 분석(AI 모델 확률) + 라인업 cover 리그 + 리뷰 글 (있을 때). 단문자 L/R 은 의미 불명이라 풀네임 (2026-08-22).
          justify-start 로 AI 칩 위치를 row 마다 동일하게 고정 (칩 개수에 따라 흔들리지 않게).
          data-scell="info": 스코어보드.kr(.sb-mode) 상시 숨김 + 좁은 컨테이너 접힘 (globals.css). */}
      <div data-scell="info" className="flex items-center justify-start gap-1">
        {href && (
          <button
            type="button"
            onClick={openInNewTab(href)}
            title="AI 모델 확률·핵심 변수 보기 (새 탭)"
            aria-label="AI 분석 — 모델 확률과 핵심 변수 보기"
            className="inline-flex items-center justify-center px-1.5 h-5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 transition whitespace-nowrap cursor-pointer"
          >
            분석
          </button>
        )}
        {href && hasLineup && (
          <button
            type="button"
            onClick={openInNewTab(href)}
            title="선발 라인업 보기 (새 탭)"
            aria-label="선발 라인업 보기"
            className="inline-flex items-center justify-center px-1.5 h-5 rounded text-[9px] font-bold bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/25 transition whitespace-nowrap cursor-pointer"
          >
            라인업
          </button>
        )}
        {recapSlug && (
          <button
            type="button"
            onClick={openInNewTab(`/articles/${recapSlug}`)}
            title="경기 리뷰 글 보기 (새 탭)"
            aria-label="경기 리뷰 글 보기"
            className="inline-flex items-center justify-center px-1.5 h-5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 transition whitespace-nowrap cursor-pointer"
          >
            리뷰
          </button>
        )}
      </div>

      {/* 배당 — 우측 끝(spacer 자리). odds 없으면 null → 빈 칸 */}
      <OddsCell odds={odds ?? null} />
    </div>
  );

  if (!href) return rowContent;

  // 행 전체 링크 제거 (7m 방식) — 매치 상세 진입은 팀명(teamNameLink)·분석/라인업/리뷰 버튼으로.
  return (
    <div className="border-b border-neutral-200 dark:border-white/5">{rowContent}</div>
  );
}

/** 배당 셀 — 행에 승/무/패 + 오버언더(기준선) 라벨 포함, hover 시 상세 팝업(핸디캡·제공처·갱신시각).
 *  팝업은 overflow-x-auto 컨테이너에 세로로 잘리므로(특히 마지막 행이 하단으로 넘쳐 잘림)
 *  GoalsTooltip 처럼 fixed + 실측 좌표로 띄우고, 하단 공간 부족하면 위로 플립한다. */
function OddsCell({ odds }: { odds: MatchOdds | null }) {
  const f = (n: number | null) => (n != null ? n.toFixed(2) : "-");
  // hover 시 셀의 우측·하단 좌표 저장 → 팝업을 fixed 로 띄워 컨테이너 클립 회피.
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);
  if (!odds) return null;
  const stale = isOddsStale(odds.updatedAt);
  const aria = `배당 승 ${f(odds.home)} 무 ${f(odds.draw)} 패 ${f(odds.away)}${
    odds.over != null ? `, 오버언더 ${odds.totalLine ?? ""} 오버 ${f(odds.over)} 언더 ${f(odds.under)}` : ""
  }${odds.books ? `, ${odds.books}곳 평균` : ""}${stale ? ", 갱신 지연" : ""} — 배당 흐름 보기`;
  return (
    <div
      data-scell="odds"
      role="link"
      tabIndex={0}
      aria-label={aria}
      title="배당 흐름 보기 (새 탭)"
      onClick={(e) => {
        // 행 전체가 <Link> 라 nested anchor 회피 — button 배지들과 동일하게 window.open 우회.
        e.preventDefault();
        e.stopPropagation();
        if (typeof window !== "undefined")
          window.open("/odds?sport=soccer", "_blank", "noopener,noreferrer");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.open("/odds?sport=soccer", "_blank", "noopener,noreferrer");
        }
      }}
      className="relative flex cursor-pointer flex-col items-end justify-center gap-0.5 text-[9px] leading-none tabular-nums hover:text-neutral-600 dark:hover:text-neutral-300"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ right: window.innerWidth - r.right, bottom: r.bottom });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {/* 승/무/패 — 라벨은 더 뮤트, 숫자는 기존 톤. 화살표는 오프닝 대비 2% 초과 변동만. */}
      <div className="flex gap-1 text-neutral-400 dark:text-neutral-500">
        <OddsPair label="승" value={f(odds.home)} trend={odds.trend?.home} />
        <OddsPair label="무" value={f(odds.draw)} trend={odds.trend?.draw} muted />
        <OddsPair label="패" value={f(odds.away)} trend={odds.trend?.away} />
      </div>
      {/* 오버언더 — 기준선 명시 (2.5 인지 3.5 인지 없으면 숫자가 무의미) */}
      {odds.over != null && (
        <div className="flex gap-1 text-neutral-400/70 dark:text-neutral-600">
          {odds.totalLine != null && <span className="opacity-80">O/U {odds.totalLine}</span>}
          <OddsPair label="오버" value={f(odds.over)} />
          <OddsPair label="언더" value={f(odds.under)} />
          {stale && (
            <span className="text-amber-600 dark:text-amber-400 font-semibold" title="배당 갱신 지연">
              지연
            </span>
          )}
        </div>
      )}
      {/* hover 상세 팝업 — fixed (컨테이너 세로 클립 회피) */}
      <OddsPopup odds={odds} pos={pos} f={f} onClose={() => setPos(null)} />
    </div>
  );
}

/** 라벨+배당 한 쌍. trend 가 있으면 ▲(상승)·▼(하락, 돈 몰림) 화살표. */
function OddsPair({
  label,
  value,
  trend,
  muted,
}: {
  label: string;
  value: string;
  trend?: -1 | 0 | 1 | null;
  muted?: boolean;
}) {
  return (
    <span className={`inline-flex items-baseline gap-px ${muted ? "opacity-70" : ""}`}>
      <span className="text-[8px] opacity-70">{label}</span>
      <span>{value}</span>
      {trend === 1 && <span className="text-[7px] text-rose-500" aria-label="상승">▲</span>}
      {trend === -1 && <span className="text-[7px] text-blue-500" aria-label="하락">▼</span>}
    </span>
  );
}

/** 목록 배당은 cron 평균값(라이브 폴링 아님) — 6시간 넘게 안 움직였을 때만 "지연" 표시. */
const ODDS_STALE_MS = 6 * 60 * 60 * 1000;
function isOddsStale(updatedAt: number | null | undefined): boolean {
  if (updatedAt == null) return false;
  return Date.now() - updatedAt > ODDS_STALE_MS;
}

/** 갱신 시각 상대 표기 — 서버/클라이언트 시계 차이로 hydration 이 어긋나므로 mount 후에만 계산. */
function useOddsAgo(updatedAt: number | null | undefined): string | null {
  const [ago, setAgo] = useState<string | null>(null);
  useEffect(() => {
    if (updatedAt == null) return;
    const min = Math.max(0, Math.floor((Date.now() - updatedAt) / 60000));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAgo(min < 1 ? "방금" : min < 60 ? `${min}분 전` : min < 1440 ? `${Math.floor(min / 60)}시간 전` : `${Math.floor(min / 1440)}일 전`);
  }, [updatedAt]);
  return ago;
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
  const ago = useOddsAgo(odds.updatedAt);
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
  const stale = isOddsStale(odds.updatedAt);
  const arrow = (t?: -1 | 0 | 1 | null) =>
    t === 1 ? <span className="text-rose-500"> ▲</span> : t === -1 ? <span className="text-blue-500"> ▼</span> : null;
  return (
    <div
      ref={boxRef}
      className="fixed z-50 pointer-events-none"
      style={{ right: pos.right, top: top ?? pos.bottom + 4 }}
    >
      <div className="rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-xl shadow-neutral-900/15 p-2.5 text-left min-w-[196px]">
        <div className="text-[10px] font-bold text-neutral-500 mb-1.5">
          배당{odds.books ? ` · 해외 ${odds.books}곳 평균` : ""}
        </div>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-neutral-500">승 / 무 / 패</span>
            <span className="tabular-nums">
              <span className="text-rose-600 dark:text-rose-400 font-semibold">{f(odds.home)}{arrow(odds.trend?.home)}</span>
              {" "}{f(odds.draw)}{arrow(odds.trend?.draw)}{" "}
              <span className="text-blue-600 dark:text-blue-400 font-semibold">{f(odds.away)}{arrow(odds.trend?.away)}</span>
            </span>
          </div>
          {odds.over != null && (
            <div className="flex justify-between pt-1 mt-1 border-t border-neutral-200 dark:border-white/10">
              <span className="text-neutral-500">오버언더 {odds.totalLine}</span>
              <span className="tabular-nums">오버 {f(odds.over)} / 언더 {f(odds.under)}</span>
            </div>
          )}
          {odds.hcHome != null && (
            <div className="flex justify-between">
              <span className="text-neutral-500">핸디캡 {odds.hcLine}</span>
              <span className="tabular-nums">{f(odds.hcHome)} / {f(odds.hcAway)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 mt-1 border-t border-neutral-200 dark:border-white/10 text-[10px] text-neutral-500">
            <span>갱신 {ago ?? (odds.updatedAt == null ? "시각 미상" : "")}</span>
            {stale ? (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">갱신 지연</span>
            ) : odds.trend ? (
              <span>▲▼ 오프닝 대비</span>
            ) : null}
          </div>
          <div className="text-[9px] text-neutral-400 leading-snug">
            참고용 정보이며 베팅을 권유하지 않습니다.
          </div>
        </div>
      </div>
    </div>
  );
}

/** 통계 바 행들 (점유율·슈팅·코너·카드) — 풀타임/전반 공용. 좌=홈(rose), 우=원정(blue).
 *  내 경기 카드(MatchCard)도 같은 블록을 쓴다 (2026-08-22 사용자 요청). */
export function StatBars({ stats }: { stats: SoccerTeamStat[] }) {
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
      className="grid items-center gap-2 px-0 py-2 text-[10px] font-bold tracking-wider uppercase text-neutral-500 border-b border-neutral-200 dark:border-white/10"
      style={{
        gridTemplateColumns:
          "110px 56px 64px minmax(0,1fr) 72px minmax(0,1fr) 54px 28px 72px minmax(0,124px)",
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
