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
import LeagueBadge from "../LeagueBadge";
import FavoriteStar from "./FavoriteStar";
import { useFavorites } from "./useFavorites";
import { playChime, unlockAudio } from "@/lib/sound/chime";
import {
  FAV_SOUND_STORAGE_KEY,
  FAV_SOUND_CHANGE_EVENT,
} from "@/lib/sound/fav-sound";

interface MatchEntry extends Omit<MatchCardProps, "actions"> {
  id: string;
  /** 정렬용 — LIVE=0, SCHEDULED=1, FINISHED=2 */
  sortKey: number;
  actions?: ReactNode;
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

export default function FavoriteMatches({ matches }: Props) {
  const { ids, mounted, clear } = useFavorites();
  const [view, setView] = useState<ViewMode>("large");
  const [favSound, setFavSound] = useState(false);

  // localStorage init
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === "compact" || v === "large") setView(v);
      setFavSound(localStorage.getItem(FAV_SOUND_STORAGE_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  function toggleView() {
    const next: ViewMode = view === "large" ? "compact" : "large";
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  function toggleFavSound() {
    const next = !favSound;
    setFavSound(next);
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
            {view === "large" ? (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {list.map(renderMatchLarge)}
              </ul>
            ) : (
              <ul className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800">
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
  const hasScore = match.home.score != null && match.away.score != null;
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
      <div className="sm:hidden grid grid-cols-[56px_44px_1fr_auto_1fr_32px] items-stretch py-1.5 text-[12px] hover:bg-neutral-50 dark:hover:bg-neutral-900/60 transition">
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
          <FavoriteStar matchId={match.id} />
        </div>
      </div>

      {/* ───── 데스크탑 (sm+) — SoccerLiveRow 와 동일 grid ───── */}
      <div
        className="hidden sm:grid items-center gap-3 py-2 text-[13px] hover:bg-neutral-50 dark:hover:bg-neutral-900/60 transition"
        style={{
          gridTemplateColumns:
            "110px 56px 64px minmax(0,1fr) auto minmax(0,1fr) 48px 28px minmax(0,154px)",
        }}
      >
        {match.href ? (
          <Link
            href={match.href}
            prefetch={false}
            className="contents"
            aria-label={`${match.home.name} ${match.home.score ?? ""} - ${match.away.score ?? ""} ${match.away.name}`}
          >
            <DesktopCells match={match} statusText={statusText} statusColor={statusColor} hasScore={hasScore} />
          </Link>
        ) : (
          <DesktopCells match={match} statusText={statusText} statusColor={statusColor} hasScore={hasScore} />
        )}
        {/* 8번: 관심 (별표) */}
        <div className="flex items-center justify-center">
          <FavoriteStar matchId={match.id} />
        </div>
        {/* 9번: 우측 spacer (메인 SoccerLiveRow 와 정확히 정렬) */}
        <div />
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
          {hasScore ? `${match.home.score} - ${match.away.score}` : "vs"}
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

// 데스크탑 cells (SoccerLiveRow 와 동일 7컬럼 — 1리그, 2시간, 3상태, 4홈, 5점수, 6어웨이, 7글)
// 별표(8) + spacer(9) 는 외부에서 직접 배치.
function DesktopCells({
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
  return (
    <>
      {/* 1. 리그 뱃지 (110px) */}
      <div className="flex items-center justify-center min-w-0">
        <LeagueBadge league={match.league} size="sm" />
      </div>
      {/* 2. 시간 (56px) */}
      <div className="text-[11px] text-neutral-500 tabular-nums">
        {match.timeLabel}
      </div>
      {/* 3. 상태 (64px) */}
      <div className={`text-[11px] ${statusColor}`}>
        {statusText}
      </div>
      {/* 4. 홈팀 (1fr, 우측 정렬) */}
      <div className="truncate text-right text-neutral-800 dark:text-neutral-200 font-medium">
        {match.home.name}
      </div>
      {/* 5. 점수 (auto) — SoccerLiveRow 와 동일 위치 */}
      <div className="text-center font-black tabular-nums text-[14px] text-neutral-900 dark:text-white whitespace-nowrap px-2">
        {hasScore ? `${match.home.score} - ${match.away.score}` : "vs"}
      </div>
      {/* 6. 원정팀 (1fr, 좌측 정렬) */}
      <div className="truncate text-neutral-800 dark:text-neutral-200 font-medium">
        {match.away.name}
      </div>
      {/* 7. 글 (48px) — 비움 (즐겨찾기 row 는 글 link 안 보임) */}
      <div />
    </>
  );
}
