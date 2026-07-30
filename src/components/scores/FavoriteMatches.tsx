// /scores 페이지 최상단 "내 경기" 섹션.
// 모든 매치 list 를 props 로 받고, localStorage 의 fav id 들에 해당하는 매치만 노출.
// 종목별 그룹 (축구→야구→농구→하키→e스포츠), 각 그룹 안에서 LIVE → 예정 → 종료 순.
// 0개이면 섹션 자체 안 그림.
//
// 헤더 옆 컨트롤:
//   - 작게/크게 보기 토글 (compact / large) — localStorage 저장
//   - 즐겨찾기 사운드 토글 — fav 매치만 chime (전체 사운드와 별개)
//   - 전체 해제 (전부 별표 해제, confirm)

"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import MatchCard, { type MatchCardProps } from "./MatchCard";
import SoccerLiveRow from "./soccer/SoccerLiveRow";
import LeagueBadge from "../LeagueBadge";
import FavoriteStar from "./FavoriteStar";
import { useFavorites } from "./useFavorites";
import { setPipOn } from "../LivePipScore";
import { useScoreFlash } from "./useScoreFlash";
import { playChime, unlockAudio } from "@/lib/sound/chime";
import {
  FAV_SOUND_STORAGE_KEY,
  FAV_SOUND_CHANGE_EVENT,
} from "@/lib/sound/fav-sound";
import { useClientValue, subscribeToStorage } from "@/lib/use-client-value";

interface MatchEntry extends Omit<MatchCardProps, "actions" | "home" | "away"> {
  id: string;
  /** 정렬용 — LIVE=0, SCHEDULED=1, FINISHED=2 */
  sortKey: number;
  actions?: ReactNode;
  // SoccerLiveRow 와 동일 디테일 (로고/순위/골 임팩트) 표시용 — MatchCardProps.home 보다 넓음
  home: {
    name: string;
    abbr?: string | null;
    logo?: string | null;
    score?: number | null;
    teamId?: number;
    position?: number | null;
  };
  away: {
    name: string;
    abbr?: string | null;
    logo?: string | null;
    score?: number | null;
    teamId?: number;
    position?: number | null;
  };
  preview?: string;
  recap?: string;
  /** 축구 라인업(cache.lineup) 존재 여부 — 데스크탑 L 배지용 */
  hasLineup?: boolean;
}

interface Props {
  matches: MatchEntry[];
}

// 종목 표시 순서 + 메타 (이모지 / 한국어 라벨)
const SPORT_ORDER = ["soccer", "baseball", "basketball", "hockey", "esports"] as const;
const SPORT_META: Record<string, { label: string; emoji: string }> = {
  soccer: { label: "축구", emoji: "⚽" },
  baseball: { label: "야구", emoji: "⚾" },
  basketball: { label: "농구", emoji: "🏀" },
  hockey: { label: "하키", emoji: "🏒" },
  esports: { label: "e스포츠", emoji: "🎮" },
};

const VIEW_STORAGE_KEY = "scorebase-fav-view"; // "compact" | "large"

type ViewMode = "compact" | "large";
const VIEW_CHANGE_EVENT = "scorebase-fav-view-change";

function readView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    return v === "compact" || v === "large" ? v : "large";
  } catch {
    return "large";
  }
}

function readFavSound(): boolean {
  try {
    return localStorage.getItem(FAV_SOUND_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function readIsScoreboard(): boolean {
  return /xn--hy1bm7m1yevrd8pq|스코어보드/.test(window.location.host);
}

const subscribeView = subscribeToStorage(VIEW_CHANGE_EVENT);
const subscribeFavSound = subscribeToStorage(FAV_SOUND_CHANGE_EVENT);

export default function FavoriteMatches({ matches }: Props) {
  const { ids, mounted, clear } = useFavorites();
  // 브라우저 전용 값 3개. 원본이 localStorage·host 라 setState 로 복제하지 않는다.
  const view = useClientValue<ViewMode>(readView, "large", subscribeView);
  const favSound = useClientValue(readFavSound, false, subscribeFavSound);
  // 스코어보드.kr 에서는 메인 라이브 테이블과 동일 행(SoccerLiveRow)으로 정렬 통일
  // 위해 즐겨찾기 섹션도 항상 compact 강제 → 점수 중앙·별 우측이 메인 섹션과 세로 일치.
  const isScoreboard = useClientValue(readIsScoreboard, false);

  // 스코어보드.kr → compact 강제, 그 외 → 사용자 설정(view)
  const effectiveView: ViewMode = isScoreboard ? "compact" : view;

  function toggleView() {
    const next: ViewMode = view === "large" ? "compact" : "large";
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent(VIEW_CHANGE_EVENT));
    } catch {
      // ignore
    }
  }

  function toggleFavSound() {
    const next = !favSound;
    try {
      localStorage.setItem(FAV_SOUND_STORAGE_KEY, next ? "1" : "0");
      window.dispatchEvent(
        new CustomEvent(FAV_SOUND_CHANGE_EVENT, { detail: { soundOn: next } }),
      );
    } catch {
      // ignore
    }
    if (next) {
      // user gesture — AudioContext 활성화 + sample chime
      unlockAudio();
      playChime();
    }
  }

  function handleClearAll() {
    if (ids.size === 0) return;
    if (!confirm(`즐겨찾기 ${ids.size}경기 전체 해제할까요?`)) return;
    clear();
  }

  if (!mounted) return null; // SSR 단에는 표시 안 함 (hydration mismatch 방지)
  if (ids.size === 0) return null;

  const fav = matches
    .filter((m) => ids.has(m.id))
    .sort((a, b) => a.sortKey - b.sortKey);

  if (fav.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-300/50 dark:border-amber-500/30 p-4 text-center text-xs text-neutral-500">
        ⭐ 즐겨찾기한 경기가 오늘 일정에 없습니다.
        <button
          type="button"
          onClick={handleClearAll}
          className="ml-2 text-rose-600 dark:text-rose-400 hover:underline"
        >
          전체 해제
        </button>
      </div>
    );
  }

  // 종목별 그룹화 — 그룹 안에선 이미 sortKey (LIVE→예정→종료) 순.
  const grouped = new Map<string, MatchEntry[]>();
  for (const m of fav) {
    const arr = grouped.get(m.sport) ?? [];
    arr.push(m);
    grouped.set(m.sport, arr);
  }
  const sportOrder = [
    ...SPORT_ORDER.filter((s) => grouped.has(s)),
    ...[...grouped.keys()].filter((s) => !SPORT_ORDER.includes(s as typeof SPORT_ORDER[number])),
  ];

  const renderMatchLarge = (m: MatchEntry) => (
    <MatchCard
      key={m.id}
      matchId={m.id}
      sport={m.sport}
      status={m.status}
      league={m.league}
      leagueLabel={m.leagueLabel}
      home={m.home}
      away={m.away}
      timeLabel={m.timeLabel}
      liveStatusLabel={m.liveStatusLabel}
      baseballCtx={m.baseballCtx}
      baseballLinescore={m.baseballLinescore}
      periodLinescore={m.periodLinescore}
      soccerGoals={m.soccerGoals}
      soccerCtx={m.soccerCtx}
      esportsCtx={m.esportsCtx}
      homeStarter={m.homeStarter}
      awayStarter={m.awayStarter}
      href={m.href}
      actions={m.actions}
      liveCommentary={m.liveCommentary}
    />
  );

  return (
    <section className="space-y-3">
      {/* 헤더 + 컨트롤 */}
      <div className="flex items-center gap-2 px-1 flex-wrap">
        <h2 className="text-sm font-bold tracking-tight">⭐ 내 경기</h2>
        <span className="text-[11px] text-neutral-400 tabular-nums">
          {fav.length}경기 · {sportOrder.length}종목
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPipOn(true)}
            title="즐겨찾기 라이브를 화면에 고정(PiP) — 드래그로 이동"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-neutral-100 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
            </svg>
            <span className="hidden sm:inline">화면 고정</span>
          </button>
          <ToggleBtn
            active={view === "compact"}
            onClick={toggleView}
            label={view === "compact" ? "크게 보기" : "작게 보기"}
            icon={view === "compact" ? "large" : "compact"}
          />
          <ToggleBtn
            active={favSound}
            onClick={toggleFavSound}
            label={favSound ? "즐겨찾기 소리 ON" : "즐겨찾기 소리"}
            icon={favSound ? "sound-on" : "sound-off"}
            accent={favSound}
          />
          <button
            type="button"
            onClick={handleClearAll}
            title="모든 즐겨찾기 해제"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14H7L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            <span>전체 해제</span>
          </button>
        </div>
      </div>

      {/* 종목별 그룹 */}
      {sportOrder.map((sport) => {
        const list = grouped.get(sport) ?? [];
        if (list.length === 0) return null;
        const meta = SPORT_META[sport] ?? { label: sport, emoji: "🏆" };
        return (
          <div key={sport} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-base" aria-hidden>
                {meta.emoji}
              </span>
              <h3 className="text-[13px] font-semibold tracking-tight text-neutral-700 dark:text-neutral-300">
                {meta.label}
              </h3>
              <span className="text-[11px] text-neutral-400 tabular-nums">
                {list.length}경기
              </span>
            </div>
            {effectiveView === "large" ? (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {list.map(renderMatchLarge)}
              </ul>
            ) : (
              // data-srows: SoccerLiveRow 접힘 컨테이너 쿼리 기준(globals.css)
              <ul data-srows className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 divide-y divide-neutral-100 dark:divide-neutral-800">
                {list.map((m) => (
                  <CompactRow key={m.id} match={m} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

function ToggleBtn({
  active,
  onClick,
  label,
  icon,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: "compact" | "large" | "sound-on" | "sound-off";
  accent?: boolean;
}) {
  const color = accent && active
    ? "bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-500/25"
    : "bg-neutral-100 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition ${color}`}
    >
      <IconSvg icon={icon} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function IconSvg({ icon }: { icon: "compact" | "large" | "sound-on" | "sound-off" }) {
  if (icon === "compact") {
    // 한 줄 list 아이콘
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    );
  }
  if (icon === "large") {
    // 그리드 아이콘
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    );
  }
  if (icon === "sound-on") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// 한 줄 compact row — 한번에 많은 매치 훑어보기 용.
// 레이아웃: [리그뱃지 + 시간/상태]  |  홈팀  점수  어웨이팀
// 좌측 그룹은 고정 폭, 매치 본문은 가운데 영역에서 flex justify-center.
function CompactRow({ match }: { match: MatchEntry }) {
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const isPostponed = match.status === "postponed";
  // 시작 전 경기는 점수를 안 그린다 — 일부 소스가 예정 경기를 0-0 으로 실어 보낸다.
  const hasScore =
    (isLive || isFinished) && match.home.score != null && match.away.score != null;
  const statusText = isLive
    ? match.liveStatusLabel ?? "LIVE"
    : isFinished
      ? "종료"
      : isPostponed
        ? "연기"
        : match.timeLabel;
  const statusColor = isLive
    ? "text-rose-600 dark:text-rose-400 font-semibold"
    : isFinished
      ? "text-neutral-400"
      : isPostponed
        ? "text-amber-600 dark:text-amber-400"
        : "text-neutral-500 tabular-nums";

  // 모바일: 기존 6컬럼 compact grid (사용자 요청: 그대로 유지)
  // 데스크탑(sm+): SoccerLiveRow 와 동일 9컬럼 grid → 점수/별표 컬럼이
  //              메인 진행 중 섹션과 세로로 정렬됨 (사용자 빨간선 정렬 요구).
  // 두 layout 을 별도 div 로 분리 (sm:hidden / hidden sm:grid).

  return (
    <li>
      {/* ───── 모바일 (sm 미만) ───── */}
      <div className="sm:hidden grid grid-cols-[56px_44px_1fr_56px_1fr_32px] items-stretch py-1.5 text-[12px] hover:bg-neutral-50 dark:hover:bg-neutral-900/60 transition">
        {match.href ? (
          <Link
            href={match.href}
            prefetch={false}
            className="contents"
            aria-label={`${match.home.name} ${match.home.score ?? ""} - ${match.away.score ?? ""} ${match.away.name}`}
          >
            <MobileCells match={match} statusText={statusText} statusColor={statusColor} hasScore={hasScore} />
          </Link>
        ) : (
          <MobileCells match={match} statusText={statusText} statusColor={statusColor} hasScore={hasScore} />
        )}
        <div className="flex items-center justify-center">
          <FavoriteStar
            matchId={match.id}
            meta={{
              id: match.id,
              sport: match.sport,
              league: match.league,
              homeName: match.home.name,
              awayName: match.away.name,
              homeShort: match.home.abbr ?? undefined,
              awayShort: match.away.abbr ?? undefined,
              homeScore: match.home.score,
              awayScore: match.away.score,
              status: match.status,
              statusLabel: match.liveStatusLabel ?? match.timeLabel,
              href: match.href ?? undefined,
            }}
          />
        </div>
      </div>

      {/* ───── 데스크탑 (sm+) — SoccerLiveRow 재사용 (메인 라이브 스코어와 동일 ───── */}
      {/* 레이아웃, 색상 뱃지, 팀 로고, [순위], 골 임팩트, P/R 글 아이콘, 별 위치 자동 일치) */}
      <div className="hidden sm:block">
        <SoccerLiveRow
          matchId={match.id}
          league={match.league}
          hideLeague
          status={match.status}
          timeLabel={match.timeLabel}
          liveStatusLabel={match.liveStatusLabel}
          home={{ name: match.home.name, logo: match.home.logo, teamId: match.home.teamId }}
          away={{ name: match.away.name, logo: match.away.logo, teamId: match.away.teamId }}
          homeScore={match.home.score ?? null}
          awayScore={match.away.score ?? null}
          soccerGoals={match.soccerGoals}
          soccerCards={match.soccerCards ?? null}
          homeShort={match.home.abbr ?? undefined}
          awayShort={match.away.abbr ?? undefined}
          previewSlug={match.preview ?? null}
          recapSlug={match.recap ?? null}
          href={match.href ?? null}
          homePosition={match.home.position ?? null}
          awayPosition={match.away.position ?? null}
          awayFirst={match.league === "KBO" || match.league === "NPB" || match.league === "MLB"}
          enableScoreFlash={match.sport === "baseball"}
          hasLineup={match.hasLineup}
        />
      </div>
    </li>
  );
}

// 모바일 6컬럼 cells (1=리그, 2=시간/상태, 3=홈, 4=점수, 5=어웨이)
function MobileCells({
  match,
  statusText,
  statusColor,
  hasScore,
}: {
  match: MatchEntry;
  statusText: string;
  statusColor: string;
  hasScore: boolean;
}) {
  const cellBorder = "border-r border-neutral-200/70 dark:border-neutral-800";
  // 야구 LIVE 매치만 — 득점 시 점수 숫자 뒤 halo flash.
  const flashEnabled = match.sport === "baseball" && match.status === "live";
  const { awayPing, homePing } = useScoreFlash(
    match.away.score ?? 0,
    match.home.score ?? 0,
    flashEnabled,
  );
  return (
    <>
      <div className={`flex items-center justify-center px-1.5 ${cellBorder}`}>
        <LeagueBadge league={match.league} size="sm" />
      </div>
      <div className={`flex items-center justify-center px-1 ${cellBorder}`}>
        <span className={`text-[10px] ${statusColor} text-center leading-tight`}>
          {statusText}
        </span>
      </div>
      <div className={`flex items-center justify-end pr-2 min-w-0 ${cellBorder}`}>
        <span className="truncate text-[12px] text-neutral-800 dark:text-neutral-200 font-medium">
          {match.home.name}
        </span>
      </div>
      <div className={`flex items-center justify-center px-1 ${cellBorder}`}>
        <span className="font-black tabular-nums text-[12px] text-neutral-900 dark:text-white whitespace-nowrap">
          {hasScore ? (
            <>
              <span className="relative isolate inline-block">
                {homePing > 0 && (
                  <span key={homePing} className="score-halo-burst" aria-hidden />
                )}
                {match.home.score}
              </span>
              <span className="mx-1 text-neutral-400">-</span>
              <span className="relative isolate inline-block">
                {awayPing > 0 && (
                  <span key={awayPing} className="score-halo-burst" aria-hidden />
                )}
                {match.away.score}
              </span>
            </>
          ) : (
            "vs"
          )}
        </span>
      </div>
      <div className={`flex items-center justify-start pl-2 min-w-0 ${cellBorder}`}>
        <span className="truncate text-[12px] text-neutral-800 dark:text-neutral-200 font-medium">
          {match.away.name}
        </span>
      </div>
    </>
  );
}

