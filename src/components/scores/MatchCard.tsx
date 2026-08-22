// /scores 매치 카드 — named.com 스타일 + 종목별 mini board.
// 모든 종목 공통, sport prop 으로 mini board 분기.

"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import {
  type BaseballContext,
} from "./BaseballMiniBoard";
import SoccerMiniBoard, { type SoccerContext } from "./SoccerMiniBoard";
import { type EsportsContext } from "./EsportsMiniBoard";
import {
  type BaseballLinescoreData,
} from "./BaseballLinescore";
import BaseballLiveCard from "./baseball/BaseballLiveCard";
import type { LiveCommentaryData } from "../live/LiveCommentaryBox";
import BasketballCard from "./basketball/BasketballCard";
import HockeyCard from "./hockey/HockeyCard";
import VolleyballCard from "./volleyball/VolleyballCard";
import EsportsCard from "./esports/EsportsCard";
import SoccerGoals from "./SoccerGoals";
import { StatBars } from "./soccer/SoccerLiveRow";
import type {
  PeriodLinescore as PeriodLinescoreData,
  SoccerGoal,
  SoccerCard,
  SoccerTeamStat,
} from "@/lib/sports/live-scores";
import FavoriteStar from "./FavoriteStar";
import TeamNameCell from "./TeamNameCell";
import { getLeagueFlag } from "@/lib/sports/sport-leagues";
import { useScoreFlash } from "./useScoreFlash";

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
  home: { name: string; abbr?: string | null; logo?: string | null; score?: number | null; position?: number | null };
  away: { name: string; abbr?: string | null; logo?: string | null; score?: number | null; position?: number | null };
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
  soccerCards?: SoccerCard[] | null;
  /** 축구 팀 통계(점유율·슈팅 등) — 풀타임 / 전반. 내 경기 카드에 행 툴팁과 같은 바 표시 */
  soccerTeamStats?: SoccerTeamStat[] | null;
  soccerHalfStats?: SoccerTeamStat[] | null;
  soccerCtx?: SoccerContext | null;
  esportsCtx?: EsportsContext | null;
  /** 야구 선발투수 */
  homeStarter?: string | null;
  awayStarter?: string | null;
  /** 매치 클릭 시 이동할 url (LIVE 매치는 라이브 상세, 글 있으면 글) */
  href?: string | null;
  /** 우측 액션 (프리뷰/리뷰 칩 등) */
  actions?: ReactNode;
  /** Ollama (Mac mini) 생성 라이브 코멘터리 — LIVE 야구 카드에 표시 */
  liveCommentary?: LiveCommentaryData | null;
  /** 같은 두 팀이 같은 날 2경기 이상일 때 (예: MLB 더블헤더) — 1차전/2차전 라벨 표시용 */
  doubleHeader?: { index: number; total: number } | null;
  /** 축구 승부차기 점수 — 정규/연장 동점 후 PK. 있으면 (4) 1 : 1 (3) 괄호 표시. */
  penaltyHome?: number | null;
  penaltyAway?: number | null;
  /** UFC Tale of the Tape — 파이터 신체/별명 (mma 카드 전용, 그 외 종목 무시) */
  mma?: {
    category: string | null;
    home: { nickname: string | null; height: string | null; weight: string | null; reach: string | null; stance: string | null };
    away: { nickname: string | null; height: string | null; weight: string | null; reach: string | null; stance: string | null };
  } | null;
  /** UFC 승리 방법/라운드 (종료 mma 카드 전용) — ESPN athlete result */
  mmaResult?: { method: string | null; round: number | null; clock: string | null } | null;
}

function Logo({ url, name, big }: { url?: string | null; name: string; big?: boolean }) {
  // MMA 파이터는 인물 사진이라 크게(big), 팀 로고는 작게.
  const sz = big ? "w-16 h-16 sm:w-24 sm:h-24" : "w-10 h-10 sm:w-12 sm:h-12";
  const imgCls = `${sz} object-contain bg-white rounded-md p-0.5`;
  // ESPN 등 외부 CDN 에 사진이 없는 파이터는 404 → 흰 박스로 남는다. 로드 실패 시 이니셜 placeholder 로 폴백.
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    // Next.js image optimizer 경유(서버가 fetch 후 Vercel CDN 에 캐시 → 재사용):
    //  - Liquipedia (LCK 로고): hotlink Referer 검사로 외부 직접 fetch 불가.
    //  - ESPN MMA 파이터 사진: 매 로드마다 ESPN 핫링크 대신 한 번 받아 캐시본 재사용
    //    (MatchCard 안 espncdn 은 MMA 파이터 전용, remotePatterns 에 등록됨).
    if (url.includes("liquipedia.net") || url.includes("a.espncdn.com")) {
      return (
        <Image
          src={url}
          alt=""
          width={96}
          height={96}
          className={imgCls}
          onError={() => setFailed(true)}
        />
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className={imgCls}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={`${sz} rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-sm font-bold text-neutral-400`}>
      {name.slice(0, 1)}
    </div>
  );
}

// UFC 체급(영문) → 한국어 표기
const WEIGHT_CLASS_KO: Record<string, string> = {
  Strawweight: "스트로급",
  Flyweight: "플라이급",
  Bantamweight: "밴텀급",
  Featherweight: "페더급",
  Lightweight: "라이트급",
  Welterweight: "웰터급",
  Middleweight: "미들급",
  "Light Heavyweight": "라이트헤비급",
  Heavyweight: "헤비급",
  "Women's Strawweight": "여자 스트로급",
  "Women's Flyweight": "여자 플라이급",
  "Women's Bantamweight": "여자 밴텀급",
  "Women's Featherweight": "여자 페더급",
  Catchweight: "캐치웨이트",
};

// UFC 승리 방법 한글 (ESPN result.displayName → 한글). 세부 서브미션 종류는 ESPN 미제공.
const MMA_METHOD_KO: Record<string, string> = {
  "KO/TKO": "KO/TKO",
  Submission: "서브미션",
  "Decision - Unanimous": "판정 (만장)",
  "Decision - Split": "판정 (분할)",
  "Decision - Majority": "판정 (다수)",
  Decision: "판정",
};
// "1R · KO/TKO" (피니시) / "판정 (만장)" (판정엔 라운드 생략 — 풀라운드).
function mmaResultLabel(r: NonNullable<MatchCardProps["mmaResult"]>): string | null {
  if (!r.method) return null;
  const ko = MMA_METHOD_KO[r.method] ?? r.method;
  return r.method.startsWith("Decision") ? ko : r.round ? `${r.round}R · ${ko}` : ko;
}

// UFC Tale of the Tape — 두 파이터 신체 비교 (체급 헤더 + 신장/체중/리치/스탠스).
// 값이 하나라도 있는 행만 표시. 전부 비고 체급도 없으면 렌더 안 함.
function MmaTaleOfTape({ mma }: { mma: NonNullable<MatchCardProps["mma"]> }) {
  const rows = (
    [
      ["신장", mma.home.height, mma.away.height],
      ["체중", mma.home.weight, mma.away.weight],
      ["리치", mma.home.reach, mma.away.reach],
      ["스탠스", mma.home.stance, mma.away.stance],
    ] as Array<[string, string | null, string | null]>
  ).filter(([, h, a]) => h || a);
  const cat = mma.category ? (WEIGHT_CLASS_KO[mma.category] ?? mma.category) : null;
  if (rows.length === 0 && !cat) return null;
  return (
    <div className="px-3.5 sm:px-4 pb-3 pt-1 border-t border-[var(--score-border)]">
      {cat && (
        <div className="text-center text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
          {cat}
        </div>
      )}
      <div className="space-y-1">
        {rows.map(([label, h, a]) => (
          <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
            <span className="text-right font-semibold tabular-nums text-neutral-700 dark:text-neutral-200">
              {h ?? "—"}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-neutral-400 px-1.5 whitespace-nowrap">
              {label}
            </span>
            <span className="text-left font-semibold tabular-nums text-neutral-700 dark:text-neutral-200">
              {a ?? "—"}
            </span>
          </div>
        ))}
      </div>
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
    soccerTeamStats,
    soccerHalfStats,
    soccerCtx,
    esportsCtx,
    homeStarter,
    awayStarter,
    href,
    actions,
    liveCommentary,
    doubleHeader,
    penaltyHome,
    penaltyAway,
    mma,
    mmaResult,
  } = props;

  const isLive = status === "live";
  const isFinished = status === "finished";
  const isPostponed = status === "postponed";
  // 시작 전 경기는 점수를 안 그린다 — 일부 소스가 예정 경기를 0-0 으로 실어 보낸다.
  const hasScore = (isLive || isFinished) && home.score != null && away.score != null;
  // 골 임팩트(축구) = 점수 기반 flashSide(6초). 긴 incident 윈도우(recentGoalSide, ~3분
  // 잔존) 제거 — "너무 오래 떠 있음" 해소 (2026-06-14). hook 은 baseball early-return 전이라
  // Rules of Hooks 충족.
  const { flashSide } = useScoreFlash(
    away.score ?? 0,
    home.score ?? 0,
    isLive && sport === "soccer",
  );
  const goalFlashSide = flashSide;

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
        liveCommentary={liveCommentary}
        doubleHeader={doubleHeader}
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

  // 배구 (VNL/AVC/유럽리그) — 세트 스코어 + 세트별 점수표
  if (sport === "volleyball") {
    return (
      <VolleyballCard
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

  // MMA 종료 — 승자 점수(1:0 의 1)를 초록으로 강조. 다른 종목·무승부엔 영향 없음.
  const mmaWin: "home" | "away" | null =
    sport === "mma" && isFinished && home.score != null && away.score != null
      ? home.score > away.score
        ? "home"
        : away.score > home.score
          ? "away"
          : null
      : null;

  // 메인 body — 점수 / 로고 / 팀명
  const body = (
    <>
      {/* 헤더: 상태 + 리그 + 즐겨찾기 */}
      <div className="flex items-center justify-between gap-2 px-3.5 sm:px-4 pt-2.5">
        {statusNode}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            {getLeagueFlag(league) && (
              <span className="mr-1 normal-case" aria-hidden>{getLeagueFlag(league)}</span>
            )}
            {leagueLabel ?? league}
          </span>
          {matchId != null && (
            <FavoriteStar
              matchId={String(matchId)}
              meta={{
                id: String(matchId),
                sport,
                league,
                homeName: home.name,
                awayName: away.name,
                homeShort: home.abbr ?? undefined,
                awayShort: away.abbr ?? undefined,
                homeScore: home.score,
                awayScore: away.score,
                status,
                statusLabel: liveStatusLabel ?? timeLabel,
                href: href ?? undefined,
              }}
              className="-mr-1.5"
            />
          )}
        </div>
      </div>

      {/* 본문: 홈-점수-원정 (한국 컨벤션 + SoccerLiveRow/리스트와 통일) */}
      <div className="px-3.5 sm:px-4 py-3 grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center">
        {/* 홈 */}
        <TeamNameCell className="min-w-0 flex flex-col items-center gap-1 text-center">
          <Logo url={home.logo} name={home.name} big={sport === "mma"} />
          <div className="truncate text-xs sm:text-sm font-bold w-full">
            <span data-teamname>{home.name}</span>
            {home.position != null && (
              <span className="ml-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
                [{home.position}]
              </span>
            )}
          </div>
          {homeStarter && (
            <div className="truncate text-[10px] text-neutral-500 w-full">
              {homeStarter}
            </div>
          )}
          {sport === "mma" && mma?.home.nickname && (
            <div className="truncate text-[10px] italic text-neutral-500 w-full">
              &lsquo;{mma.home.nickname}&rsquo;
            </div>
          )}
        </TeamNameCell>
        {/* 점수 — 라이브 최근 골 시 앰버 ring + pulse. 승부차기는 점수 아래 (4) (3) 좌우 정렬. */}
        <div className={`text-center font-black tabular-nums text-2xl sm:text-3xl tracking-tight min-w-[3.5rem] sm:min-w-[4.5rem] px-2 py-1 rounded-md ${scoreColor} ${
          goalFlashSide ? "ring-2 ring-amber-400 bg-amber-100/40 dark:bg-amber-500/15 animate-pulse" : ""
        }`}>
          {hasScore ? (
            <>
              <div className="flex items-center justify-center">
                <span className={mmaWin === "home" ? "text-emerald-500 dark:text-emerald-400" : ""}>{home.score}</span>
                <span className="mx-1 sm:mx-1.5 text-neutral-300 dark:text-neutral-700 font-thin">
                  :
                </span>
                <span className={mmaWin === "away" ? "text-emerald-500 dark:text-emerald-400" : ""}>{away.score}</span>
              </div>
              {penaltyHome != null && penaltyAway != null && (
                <div className="grid grid-cols-2 text-[10px] sm:text-[11px] font-bold text-neutral-400 dark:text-neutral-500 leading-none mt-0.5">
                  <span className="text-center">({penaltyHome})</span>
                  <span className="text-center">({penaltyAway})</span>
                </div>
              )}
            </>
          ) : (
            <span className="text-base font-bold text-neutral-300 dark:text-neutral-600">
              VS
            </span>
          )}
        </div>
        {/* 원정 */}
        <TeamNameCell className="min-w-0 flex flex-col items-center gap-1 text-center">
          <Logo url={away.logo} name={away.name} big={sport === "mma"} />
          <div className="truncate text-xs sm:text-sm font-bold w-full">
            <span data-teamname>{away.name}</span>
            {away.position != null && (
              <span className="ml-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
                [{away.position}]
              </span>
            )}
          </div>
          {awayStarter && (
            <div className="truncate text-[10px] text-neutral-500 w-full">
              {awayStarter}
            </div>
          )}
          {sport === "mma" && mma?.away.nickname && (
            <div className="truncate text-[10px] italic text-neutral-500 w-full">
              &lsquo;{mma.away.nickname}&rsquo;
            </div>
          )}
        </TeamNameCell>
      </div>

      {/* UFC 승리 방법 — 종료 시 점수 아래 (예: "1R · KO/TKO", "판정 (만장)") */}
      {sport === "mma" && isFinished && mmaResult && mmaResultLabel(mmaResult) && (
        <div className="px-3.5 sm:px-4 -mt-1.5 pb-1 text-center">
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            {mmaResultLabel(mmaResult)}
          </span>
        </div>
      )}

      {/* UFC Tale of the Tape — 체급 + 신장/체중/리치/스탠스 비교 (mma 카드 전용) */}
      {sport === "mma" && mma && <MmaTaleOfTape mma={mma} />}

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
      {/* 축구 팀 통계 — 라이브/종료. 점유율·슈팅·코너·카드 바 + 전반전 (행 hover 툴팁과 동일 블록) */}
      {(isLive || isFinished) && soccerTeamStats && soccerTeamStats.length > 0 && (
        <div className="px-3.5 sm:px-4 py-2 border-t border-[var(--score-border)] space-y-2">
          <StatBars stats={soccerTeamStats} />
          {soccerHalfStats && soccerHalfStats.length > 0 && (
            <div className="pt-1.5 border-t border-dashed border-[var(--score-border)]">
              <div className="text-center text-[9px] text-neutral-400 mb-1">전반전</div>
              <StatBars stats={soccerHalfStats} />
            </div>
          )}
        </div>
      )}

      {/* 푸터: 예정 시간 또는 actions */}
      {!isLive && !isFinished && !isPostponed && (
        <div className="px-3.5 sm:px-4 pb-2 text-center text-[10px] text-neutral-400">
          KST {timeLabel}
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
      {actions && (
        <div className="flex items-center justify-end gap-1.5 px-3.5 sm:px-4 pb-3">
          {actions}
        </div>
      )}
    </li>
  );
}
