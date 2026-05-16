// /scores 매치 카드 — named.com 스타일 + 종목별 mini board.
// 모든 종목 공통, sport prop 으로 mini board 분기.

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import {
  type BaseballContext,
} from "./BaseballMiniBoard";
import SoccerMiniBoard, { type SoccerContext } from "./SoccerMiniBoard";
import { type EsportsContext } from "./EsportsMiniBoard";
import {
  type BaseballLinescoreData,
} from "./BaseballLinescore";
import BaseballLiveCard from "./baseball/BaseballLiveCard";
import BasketballCard from "./basketball/BasketballCard";
import HockeyCard from "./hockey/HockeyCard";
import EsportsCard from "./esports/EsportsCard";
import SoccerGoals from "./SoccerGoals";
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

  // 야구 (KBO/NPB/MLB) — LIVE/종료/예정 모두 통합 카드
  if (sport === "baseball") {
    return (
      <BaseballLiveCard
        matchId={matchId}
        status={status}
        league={league}
        leagueLabel={leagueLabel}
        home={home}
        away={away}
        timeLabel={timeLabel}
        liveStatusLabel={liveStatusLabel}
        baseballLinescore={baseballLinescore}
        baseballCtx={baseballCtx}
        homeStarter={homeStarter}
        awayStarter={awayStarter}
        href={href}
        actions={actions}
      />
    );
  }

  // 농구 (NBA)
  if (sport === "basketball") {
    return (
      <BasketballCard
        matchId={matchId}
        status={status}
        league={league}
        leagueLabel={leagueLabel}
        home={home}
        away={away}
        timeLabel={timeLabel}
        liveStatusLabel={liveStatusLabel}
        periodLinescore={periodLinescore}
        href={href}
        actions={actions}
      />
    );
  }

  // 하키 (NHL)
  if (sport === "hockey") {
    return (
      <HockeyCard
        matchId={matchId}
        status={status}
        league={league}
        leagueLabel={leagueLabel}
        home={home}
        away={away}
        timeLabel={timeLabel}
        liveStatusLabel={liveStatusLabel}
        periodLinescore={periodLinescore}
        href={href}
        actions={actions}
      />
    );
  }

  // e스포츠 (LCK/LOL)
  if (sport === "esports") {
    return (
      <EsportsCard
        matchId={matchId}
        status={status}
        league={league}
        leagueLabel={leagueLabel}
        home={home}
        away={away}
        timeLabel={timeLabel}
        liveStatusLabel={liveStatusLabel}
        esportsCtx={esportsCtx}
        href={href}
        actions={actions}
      />
    );
  }

  // ----- 이하는 축구만 (기존 디자인 유지) -----

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

      {/* 본문: 홈-점수-원정 (한국 컨벤션 + SoccerLiveRow/리스트와 통일) */}
      <div className="px-3.5 sm:px-4 py-3 grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center">
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
        {/* 점수 */}
        <div className={`text-center font-black tabular-nums text-2xl sm:text-3xl tracking-tight min-w-[3.5rem] sm:min-w-[4.5rem] ${scoreColor}`}>
          {hasScore ? (
            <>
              {home.score}
              <span className="mx-1 sm:mx-1.5 text-neutral-300 dark:text-neutral-700 font-thin">
                :
              </span>
              {away.score}
            </>
          ) : (
            <span className="text-base font-bold text-neutral-300 dark:text-neutral-600">
              VS
            </span>
          )}
        </div>
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
      </div>

      {/* 축구 라이브 컨텍스트 */}
      {isLive && soccerCtx && (
        <div className="px-3.5 sm:px-4 pb-2 pt-1 border-t border-[var(--score-border)]">
          <SoccerMiniBoard ctx={soccerCtx} />
        </div>
      )}
      {/* 축구 골 list — 라이브/종료 매치 모두 (있으면 표시) */}
      {soccerGoals && soccerGoals.length > 0 && (
        <div className="border-t border-[var(--score-border)]">
          <SoccerGoals goals={soccerGoals} />
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

  // 외부 url 은 새 탭 + rel="noopener noreferrer". 내부는 Next/Link.
  const isExternal = href != null && /^https?:\/\//i.test(href);

  return (
    <li className={`match-card ${isLive ? "live" : ""} list-none`}>
      {href ? (
        isExternal ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="card-link"
          >
            {body}
          </a>
        ) : (
          <Link href={href} prefetch={false} className="card-link">
            {body}
          </Link>
        )
      ) : (
        body
      )}
    </li>
  );
}
