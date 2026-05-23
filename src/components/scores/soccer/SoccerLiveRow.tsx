// /scores 축구 row 레이아웃 — named.com 스타일 한 줄 매치.
// 구조 (데스크탑): [리그배지 110px] [시간] [상태] [홈팀 →] [점수] [← 원정팀] [글] [관심]
// 다크 디폴트. 모바일은 카드 layout (별도 처리) — 이 컴포넌트는 데스크탑 row 전용.
//
// client component — 글 아이콘 onClick stopPropagation 위해 (외부 row Link 와 nested).

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getLeagueBadge } from "./leagueBadge";
import FavoriteStar from "../FavoriteStar";
import type { SoccerGoal } from "@/lib/sports/live-scores";

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
  /** 골 list — 종료 매치 hover tooltip 용 */
  soccerGoals?: SoccerGoal[] | null;
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
}

function TeamLogo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="w-5 h-5 object-contain shrink-0"
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
    soccerGoals,
    homeShort,
    awayShort,
    previewSlug,
    recapSlug,
    recentGoalSide,
    href,
    homePosition,
    awayPosition,
  } = props;

  const router = useRouter();
  const goToStandings = (teamId: number | undefined) => (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const hash = teamId != null ? `#team-${teamId}` : "";
    router.push(`/predictions/${league}${hash}`);
  };

  const badge = getLeagueBadge(league);
  const isLive = status === "live";
  const isFinished = status === "finished";
  const isPostponed = status === "postponed";

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
        gridTemplateColumns:
          "110px 56px 64px minmax(0,1fr) auto minmax(0,1fr) 48px 28px",
      }}
    >
      {/* 1. 리그 배지 */}
      <div
        className="text-[11px] font-bold text-center py-1.5 px-2 rounded-sm truncate"
        style={{ background: badge.bg, color: badge.fg }}
        title={badge.label}
      >
        {badge.label}
      </div>

      {/* 2. KST 시간 */}
      <div className="text-[12px] text-neutral-600 dark:text-neutral-400 tabular-nums">
        {timeLabel}
      </div>

      {/* 3. 상태 */}
      <div>{statusNode}</div>

      {/* 4. 홈팀 (우측 정렬 + 로고 옆에) — [순위] + 최근 골 시 row flash (7m 스타일) */}
      <div
        className={`flex items-center justify-end gap-1.5 min-w-0 px-2 py-1 rounded-md transition ${
          recentGoalSide === "home"
            ? "bg-emerald-400/45 dark:bg-emerald-500/30 ring-2 ring-emerald-500 animate-pulse"
            : ""
        }`}
      >
        {recentGoalSide === "home" && (
          <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 animate-pulse whitespace-nowrap">
            ⚽ GOAL
          </span>
        )}
        <span
          className={`truncate text-right text-[13px] ${
            recentGoalSide === "home"
              ? "text-emerald-800 dark:text-emerald-200 font-bold"
              : "text-neutral-800 dark:text-neutral-200"
          }`}
        >
          {home.name}
          {homePosition != null && (
            <button
              type="button"
              onClick={goToStandings(home.teamId)}
              title={`${home.name} 리그 순위 보기`}
              className="ml-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
            >
              [{homePosition}]
            </button>
          )}
        </span>
        <TeamLogo url={home.logo} name={home.name} />
      </div>

      {/* 5. 점수 — 종료 매치 + 골 있으면 hover tooltip / 라이브 최근 골 → emerald ring */}
      <div
        className={`relative text-center font-black text-[14px] tabular-nums whitespace-nowrap px-2 group ${
          recentGoalSide ? "rounded-md ring-2 ring-emerald-500 bg-emerald-100/50 dark:bg-emerald-500/20 animate-pulse" : ""
        }`}
      >
        {hasScore ? (
          <>
            <span
              className={
                homeWin
                  ? "text-rose-600 dark:text-rose-400"
                  : isFinished || isLive
                    ? "text-neutral-700 dark:text-neutral-300"
                    : "text-neutral-500"
              }
            >
              {homeScore}
            </span>
            <span className="mx-1 text-neutral-500">-</span>
            <span
              className={
                awayWin
                  ? "text-rose-600 dark:text-rose-400"
                  : isFinished || isLive
                    ? "text-neutral-700 dark:text-neutral-300"
                    : "text-neutral-500"
              }
            >
              {awayScore}
            </span>
            {(isFinished || isLive) && soccerGoals && soccerGoals.length > 0 && (
              <GoalsTooltip
                goals={soccerGoals}
                homeLabel={homeShort ?? home.name}
                awayLabel={awayShort ?? away.name}
              />
            )}
          </>
        ) : (
          <span className="text-neutral-500 text-[11px] font-medium">vs</span>
        )}
      </div>

      {/* 6. 원정팀 (좌측 정렬 + 로고 옆에) — 최근 골 시 row flash */}
      <div
        className={`flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-md transition ${
          recentGoalSide === "away"
            ? "bg-emerald-400/45 dark:bg-emerald-500/30 ring-2 ring-emerald-500 animate-pulse"
            : ""
        }`}
      >
        <TeamLogo url={away.logo} name={away.name} />
        <span
          className={`truncate text-[13px] ${
            recentGoalSide === "away"
              ? "text-emerald-800 dark:text-emerald-200 font-bold"
              : "text-neutral-800 dark:text-neutral-200"
          }`}
        >
          {away.name}
          {awayPosition != null && (
            <button
              type="button"
              onClick={goToStandings(away.teamId)}
              title={`${away.name} 리그 순위 보기`}
              className="ml-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
            >
              [{awayPosition}]
            </button>
          )}
        </span>
        {recentGoalSide === "away" && (
          <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 animate-pulse whitespace-nowrap">
            ⚽ GOAL
          </span>
        )}
      </div>

      {/* 7. 글 (프리뷰/리뷰) — 있을 때만 아이콘 표시 */}
      <div className="flex items-center justify-center gap-1">
        {previewSlug && (
          <Link
            href={`/articles/${previewSlug}`}
            prefetch={false}
            onClick={(e) => e.stopPropagation()}
            title="프리뷰"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 transition"
          >
            P
          </Link>
        )}
        {recapSlug && (
          <Link
            href={`/articles/${recapSlug}`}
            prefetch={false}
            onClick={(e) => e.stopPropagation()}
            title="리뷰"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 transition"
          >
            R
          </Link>
        )}
      </div>

      {/* 8. 관심 별표 */}
      <div className="flex justify-center">
        <FavoriteStar matchId={String(matchId)} />
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
        <Link href={href} prefetch={false} className="block">
          {rowContent}
        </Link>
      )}
    </div>
  );
}

/** 종료 매치 점수 hover 시 표시되는 골 list tooltip. */
function GoalsTooltip({
  goals,
  homeLabel,
  awayLabel,
}: {
  goals: SoccerGoal[];
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

  return (
    <div
      role="tooltip"
      className="absolute left-1/2 top-full z-30 -translate-x-1/2 mt-1 min-w-[260px] hidden group-hover:block pointer-events-none"
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
                <span className="truncate">{g.player || "—"}</span>
                {g.penaltyKick && (
                  <span className="text-[9px] text-neutral-400 shrink-0">
                    PK
                  </span>
                )}
                {g.ownGoal && (
                  <span className="text-[9px] text-neutral-400 shrink-0">
                    자책
                  </span>
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
                  <span className="text-[9px] text-neutral-400 shrink-0">
                    자책
                  </span>
                )}
                {g.penaltyKick && (
                  <span className="text-[9px] text-neutral-400 shrink-0">
                    PK
                  </span>
                )}
                <span className="truncate">{g.player || "—"}</span>
                <span className="text-[10px] tabular-nums text-neutral-500 shrink-0 w-8 text-left">
                  {g.minute}
                </span>
              </div>
            ))}
          </div>
        </div>
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
          "110px 56px 64px minmax(0,1fr) auto minmax(0,1fr) 48px 28px",
      }}
    >
      <div className="text-center">리그명</div>
      <div>시간</div>
      <div>상태</div>
      <div className="text-right">홈팀</div>
      <div className="text-center px-2">점수</div>
      <div>원정팀</div>
      <div className="text-center">글</div>
      <div className="text-center">관심</div>
    </div>
  );
}
