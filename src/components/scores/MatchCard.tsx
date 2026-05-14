// /scores 매치 카드 — named.com 스타일 + 종목별 mini board.
// 모든 종목 공통, sport prop 으로 mini board 분기.

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import BaseballMiniBoard, {
  type BaseballContext,
} from "./BaseballMiniBoard";
import SoccerMiniBoard, { type SoccerContext } from "./SoccerMiniBoard";
import EsportsMiniBoard, { type EsportsContext } from "./EsportsMiniBoard";
import BaseballLinescore, {
  type BaseballLinescoreData,
} from "./BaseballLinescore";
import SoccerGoals from "./SoccerGoals";
import PeriodLinescore from "./PeriodLinescore";
import type {
  PeriodLinescore as PeriodLinescoreData,
  SoccerGoal,
} from "@/lib/sports/live-scores";
import FavoriteStar from "./FavoriteStar";

export interface MatchCardProps {
  /** localStorage 즐겨찾기 식별자 (DB Match.id) */
  matchId?: string | number;
  /** "baseball" | "soccer" | "basketball" | "hockey" | "esports" */
  sport: string;
  status: "scheduled" | "live" | "finished" | "postponed";
  /** "KBO" / "EPL" 등 */
  league: string;
  /** 화면 표시용 리그 라벨 ("KBO", "프리미어리그") */
  leagueLabel?: string;
  home: { name: string; abbr?: string | null; logo?: string | null; score?: number | null };
  away: { name: string; abbr?: string | null; logo?: string | null; score?: number | null };
  /** "18:30" KST */
  timeLabel: string;
  /** "5회 말 진행 중" 같은 LIVE 보조 텍스트 */
  liveStatusLabel?: string | null;
  /** 종목별 라이브 컨텍스트 */
  baseballCtx?: BaseballContext | null;
  /** 야구 이닝별 점수 + H/E/R — 라이브/종료 매치에 표시 */
  baseballLinescore?: BaseballLinescoreData | null;
  /** NBA 쿼터 / NHL 피리어드별 점수 — 라이브/종료 매치에 표시 */
  periodLinescore?: PeriodLinescoreData | null;
  /** 축구 골 list (분 + 선수) — 라이브/종료 매치에 표시 */
  soccerGoals?: SoccerGoal[] | null;
  soccerCtx?: SoccerContext | null;
  esportsCtx?: EsportsContext | null;
  /** 야구 선발투수 */
  homeStarter?: string | null;
  awayStarter?: string | null;
  /** 매치 클릭 시 이동할 url (LIVE 매치는 라이브 상세, 글 있으면 글) */
  href?: string | null;
  /** 우측 액션 (프리뷰/리뷰 칩 등) */
  actions?: ReactNode;
}

function Logo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    // Liquipedia (LCK 로고) 는 hotlink Referer 검사로 외부 직접 fetch 불가 →
    // Next.js image optimizer 통해 서버가 fetch 후 재제공해야 표시됨.
    if (url.includes("liquipedia.net")) {
      return (
        <Image
          src={url}
          alt=""
          width={48}
          height={48}
          className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
        />
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-sm font-bold text-neutral-400">
      {name.slice(0, 1)}
    </div>
  );
}

export default function MatchCard(props: MatchCardProps) {
  const {
    matchId,
    sport,
    status,
    league,
    leagueLabel,
    home,
    away,
    timeLabel,
    liveStatusLabel,
    baseballCtx,
    baseballLinescore,
    periodLinescore,
    soccerGoals,
    soccerCtx,
    esportsCtx,
    homeStarter,
    awayStarter,
    href,
    actions,
  } = props;

  const isLive = status === "live";
  const isFinished = status === "finished";
  const isPostponed = status === "postponed";
  const hasScore = home.score != null && away.score != null;

  const statusNode = isPostponed ? (
    <span className="status-badge finished">연기</span>
  ) : isLive ? (
    <span className="status-badge live">
      <span className="w-1.5 h-1.5 rounded-full bg-white" />
      LIVE
      {liveStatusLabel && (
        <span className="ml-1 normal-case font-semibold tabular-nums">
          {liveStatusLabel}
        </span>
      )}
    </span>
  ) : isFinished ? (
    <span className="status-badge finished">종료</span>
  ) : (
    <span className="status-badge scheduled">
      <span className="tabular-nums">{timeLabel}</span>
    </span>
  );

  const scoreColor = isLive
    ? "text-rose-600 dark:text-rose-400"
    : isFinished
      ? "text-neutral-900 dark:text-white"
      : "text-neutral-400";

  // 메인 body — 점수 / 로고 / 팀명
  const body = (
    <>
      {/* 헤더: 상태 + 리그 + 즐겨찾기 */}
      <div className="flex items-center justify-between gap-2 px-3.5 sm:px-4 pt-2.5">
        {statusNode}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            {leagueLabel ?? league}
          </span>
          {matchId != null && (
            <FavoriteStar matchId={String(matchId)} className="-mr-1.5" />
          )}
        </div>
      </div>

      {/* 본문: 원정-점수-홈 */}
      <div className="px-3.5 sm:px-4 py-3 grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center">
        {/* 원정 */}
        <div className="min-w-0 flex flex-col items-center gap-1 text-center">
          <Logo url={away.logo} name={away.name} />
          <div className="truncate text-xs sm:text-sm font-bold w-full">
            {away.name}
          </div>
          {awayStarter && (
            <div className="truncate text-[10px] text-neutral-500 w-full">
              {awayStarter}
            </div>
          )}
        </div>
        {/* 점수 */}
        <div className={`text-center font-black tabular-nums text-2xl sm:text-3xl tracking-tight min-w-[3.5rem] sm:min-w-[4.5rem] ${scoreColor}`}>
          {hasScore ? (
            <>
              {away.score}
              <span className="mx-1 sm:mx-1.5 text-neutral-300 dark:text-neutral-700 font-thin">
                :
              </span>
              {home.score}
            </>
          ) : (
            <span className="text-base font-bold text-neutral-300 dark:text-neutral-600">
              VS
            </span>
          )}
        </div>
        {/* 홈 */}
        <div className="min-w-0 flex flex-col items-center gap-1 text-center">
          <Logo url={home.logo} name={home.name} />
          <div className="truncate text-xs sm:text-sm font-bold w-full">
            {home.name}
          </div>
          {homeStarter && (
            <div className="truncate text-[10px] text-neutral-500 w-full">
              {homeStarter}
            </div>
          )}
        </div>
      </div>

      {/* 종목별 mini board */}
      {sport === "baseball" && baseballLinescore && (isLive || isFinished) && (
        <div className="pt-1 border-t border-[var(--score-border)]">
          <BaseballLinescore data={baseballLinescore} />
        </div>
      )}
      {(sport === "basketball" || sport === "hockey") &&
        periodLinescore &&
        (isLive || isFinished) && (
          <div className="pt-1 border-t border-[var(--score-border)]">
            <PeriodLinescore
              data={periodLinescore}
              sport={sport}
              awayLabel={away.abbr ?? away.name}
              homeLabel={home.abbr ?? home.name}
            />
          </div>
        )}
      {isLive && sport === "baseball" && baseballCtx && (
        <div className="px-3.5 sm:px-4 pb-2 pt-1 border-t border-[var(--score-border)]">
          <BaseballMiniBoard ctx={baseballCtx} />
        </div>
      )}
      {isLive && sport === "soccer" && soccerCtx && (
        <div className="px-3.5 sm:px-4 pb-2 pt-1 border-t border-[var(--score-border)]">
          <SoccerMiniBoard ctx={soccerCtx} />
        </div>
      )}
      {/* 축구 골 list — 라이브/종료 매치 모두 (있으면 표시) */}
      {sport === "soccer" && soccerGoals && soccerGoals.length > 0 && (
        <div className="border-t border-[var(--score-border)]">
          <SoccerGoals goals={soccerGoals} />
        </div>
      )}
      {isLive && sport === "esports" && esportsCtx && (
        <div className="px-3.5 sm:px-4 pb-2 pt-1 border-t border-[var(--score-border)]">
          <EsportsMiniBoard
            ctx={esportsCtx}
            awayLabel={away.abbr ?? away.name}
            homeLabel={home.abbr ?? home.name}
          />
        </div>
      )}

      {/* 푸터: 예정 시간 또는 actions */}
      {!isLive && !isFinished && !isPostponed && (
        <div className="px-3.5 sm:px-4 pb-2 text-center text-[10px] text-neutral-400">
          KST {timeLabel}
        </div>
      )}
      {actions && (
        <div className="flex items-center justify-end gap-1.5 px-3.5 sm:px-4 pb-3">
          {actions}
        </div>
      )}
    </>
  );

  return (
    <li className={`match-card ${isLive ? "live" : ""} list-none`}>
      {href ? (
        <Link href={href} prefetch={false} className="card-link">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}
