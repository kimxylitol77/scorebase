// 즐겨찾기 라이브 경기 PiP — 화면에 떠서 드래그로 옮기는 미니 스코어 창.
// /scores '내 경기'의 버튼으로 켜고(localStorage + custom event), 전역 레이아웃에서 상시 렌더.
// 데이터는 LiveScoresBar 와 동일한 /api/live/scores 폴링, 즐겨찾기(readFavIds) 매치만 노출.

"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import CountUp from "./CountUp";
import LeagueBadge from "./LeagueBadge";
import { readFavIds, FAV_EVENT_NAME } from "./scores/useFavorites";

const PIP_ON_KEY = "scorebase:pip-on";
const PIP_POS_KEY = "scorebase:pip-pos";
export const PIP_CHANGE_EVENT = "scorebase:pip-changed";
const FAV_KEY = "scorebase:fav-matches";

interface LiveMatch {
  id: string;
  league: string;
  homeName: string;
  awayName: string;
  homeShort: string;
  awayShort: string;
  homeScore: number;
  awayScore: number;
  statusLabel: string;
}
interface ApiResp {
  matches?: LiveMatch[];
}

const POLL_LIVE_MS = 5_000;
const POLL_IDLE_MS = 60_000;

// 다른 컴포넌트(내 경기 버튼)가 PiP 를 켜고 상태를 읽을 때 쓰는 헬퍼.
export function isPipOn(): boolean {
  try {
    return localStorage.getItem(PIP_ON_KEY) === "1";
  } catch {
    return false;
  }
}
export function setPipOn(on: boolean): void {
  try {
    localStorage.setItem(PIP_ON_KEY, on ? "1" : "0");
    window.dispatchEvent(new CustomEvent(PIP_CHANGE_EVENT));
  } catch {
    // ignore
  }
}

export default function LivePipScore() {
  const [on, setOn] = useState(false);
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // mount: on 상태·위치·즐겨찾기 로드 + 이벤트 동기화
  useEffect(() => {
    setMounted(true);
    try {
      setOn(localStorage.getItem(PIP_ON_KEY) === "1");
      const p = localStorage.getItem(PIP_POS_KEY);
      if (p) {
        const parsed = JSON.parse(p);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") setPos(parsed);
      }
    } catch {
      // ignore
    }
    setFavIds(readFavIds());
    const syncOn = () => setOn(isPipOn());
    const syncFav = () => setFavIds(readFavIds());
    const onStorage = (e: StorageEvent) => {
      if (e.key === PIP_ON_KEY) syncOn();
      else if (e.key === FAV_KEY) syncFav();
    };
    window.addEventListener(PIP_CHANGE_EVENT, syncOn);
    window.addEventListener(FAV_EVENT_NAME, syncFav);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PIP_CHANGE_EVENT, syncOn);
      window.removeEventListener(FAV_EVENT_NAME, syncFav);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // 라이브 스코어 폴링 — PiP 가 켜져 있을 때만.
  useEffect(() => {
    if (!on) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastEtag: string | null = null;

    const fetchOnce = async () => {
      try {
        const headers: HeadersInit = lastEtag ? { "if-none-match": lastEtag } : {};
        const res = await fetch("/api/live/scores", { cache: "no-store", headers });
        if (res.status === 304 || !res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: ApiResp = await res.json();
        if (!alive) return;
        setMatches(json.matches ?? []);
      } catch {
        // 다음 polling 에서 재시도
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, POLL_LIVE_MS);
    };
    fetchOnce().then(schedule);
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        fetchOnce();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // POLL_IDLE_MS 는 참조만 — PiP 는 켜진 동안 항상 live 주기(가벼운 fav 창)
    void POLL_IDLE_MS;
  }, [on]);

  if (!mounted || !on) return null;

  const favMatches = matches.filter((m) => favIds.has(m.id));

  function close() {
    setPipOn(false);
    setOn(false);
  }

  // 헤더 드래그 — pointer 이벤트로 카드를 이동, 놓을 때 위치 저장.
  function onDragStart(e: ReactPointerEvent) {
    const el = cardRef.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    const move = (ev: PointerEvent) => {
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      const nx = Math.max(0, Math.min(ev.clientX - offX, Math.max(0, maxX)));
      const ny = Math.max(0, Math.min(ev.clientY - offY, Math.max(0, maxY)));
      setPos({ x: nx, y: ny });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(PIP_POS_KEY, JSON.stringify(p));
          } catch {
            // ignore
          }
        }
        return p;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // 위치 — 저장된 좌표가 있으면 그것, 없으면 좌하단 기본(우하단 챗봇과 겹침 회피).
  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { left: 16, bottom: 88, right: "auto", top: "auto" };

  return (
    <div
      ref={cardRef}
      style={style}
      className="fixed z-[60] w-64 rounded-2xl border border-neutral-200 bg-white/95 shadow-[0_24px_70px_-20px_rgba(15,23,30,0.35)] backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95"
      role="dialog"
      aria-label="즐겨찾기 라이브 스코어 PiP"
    >
      {/* 헤더 — 드래그 핸들 + 닫기 */}
      <div
        onPointerDown={onDragStart}
        className="flex cursor-grab items-center gap-2 rounded-t-2xl border-b border-neutral-100 px-3 py-2 active:cursor-grabbing dark:border-neutral-800"
      >
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
          내 경기 LIVE
        </span>
        <button
          type="button"
          onClick={close}
          aria-label="PiP 닫기"
          className="ml-auto rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 본문 — 즐겨찾기 LIVE 경기 목록 */}
      <div className="max-h-72 overflow-y-auto p-2">
        {favMatches.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-neutral-500">
            즐겨찾기한 경기 중<br />
            지금 진행 중인 경기가 없어요.
          </p>
        ) : (
          <ul className="space-y-1">
            {favMatches.map((m) => (
              <li
                key={m.id}
                className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[12px] hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
              >
                <LeagueBadge league={m.league} size="sm" />
                <span className="truncate text-right font-medium text-neutral-800 dark:text-neutral-200">
                  {m.homeShort}
                </span>
                <span className="whitespace-nowrap text-center font-black tabular-nums text-neutral-900 dark:text-white">
                  <CountUp value={m.homeScore} className="tabular-nums" />
                  <span className="mx-0.5 text-neutral-400">-</span>
                  <CountUp value={m.awayScore} className="tabular-nums" />
                </span>
                <span className="truncate font-medium text-neutral-800 dark:text-neutral-200">
                  {m.awayShort}
                </span>
                <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  {m.statusLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
