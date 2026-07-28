// 즐겨찾기 경기 PiP — 화면에 떠서 드래그로 옮기는 미니 스코어 창.
// /scores '내 경기'의 버튼으로 켜고(localStorage + custom event), 전역 레이아웃에서 상시 렌더.
// 라이브 API(/api/live/scores 5초 폴링) + 즐겨찾기 스냅샷(fav-meta)을 병합해
// LIVE 는 실시간 점수, 예정·종료는 스냅샷으로 상태 무관 전부 표시.
// Chrome·Edge 는 Document Picture-in-Picture 로 브라우저 창 밖(항상 위) 분리 지원.

"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import CountUp from "./CountUp";
import LeagueBadge from "./LeagueBadge";
import {
  readFavIds,
  readFavMeta,
  FAV_EVENT_NAME,
  type FavMeta,
} from "./scores/useFavorites";

const PIP_ON_KEY = "scorebase:pip-on";
const PIP_POS_KEY = "scorebase:pip-pos";
const PIP_SIZE_KEY = "scorebase:pip-size";
// 새로고침 직전에 Document PiP 분리 상태를 남기는 sessionStorage 플래그 —
// 브라우저가 opener unload 때 분리 창을 강제로 닫으므로, 다음 로드의 첫 클릭에서 재분리.
const PIP_DOC_RESTORE_KEY = "scorebase:pip-doc-restore";
export const PIP_CHANGE_EVENT = "scorebase:pip-changed";
const FAV_KEY = "scorebase:fav-matches";

interface LiveMatch {
  id: string;
  /** 같은 경기의 DB Match.id 별칭 — 별표가 저장하는 id 는 이쪽. */
  dbId?: string;
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

// /api/matches/by-ids 응답 한 건 — 종료·예정 DB 매치의 현재 점수·상태 (스냅샷 고착 방지).
interface BriefMatch {
  id: number;
  league: string;
  status: string; // "LIVE" | "FINISHED" | "SCHEDULED" | "POSTPONED"
  startTime: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
}

// 표시용 행 — 라이브 API(실시간) 또는 fav-meta 스냅샷에서 만든다.
interface PipRow {
  id: string;
  league: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  statusLabel: string;
  /** live=0 → scheduled=1 → finished/postponed=2 (정렬·색상) */
  state: "live" | "scheduled" | "done";
}

const POLL_LIVE_MS = 5_000;

// Document PiP 지원 브라우저(Chrome·Edge)의 window 확장 타입.
interface DocPipWindow extends Window {
  documentPictureInPicture?: {
    requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
  };
}

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
  const [favMeta, setFavMeta] = useState<Record<string, FavMeta>>({});
  // DB 매치(숫자 id) 현재 상태 — 라이브 API 에 없는 종료·예정 경기의 점수·상태 최신화.
  const [brief, setBrief] = useState<Record<string, BriefMatch>>({});
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<"sm" | "lg">("sm"); // 기본 작게
  const [mounted, setMounted] = useState(false);
  // Document PiP 분리 창 — null 이면 인페이지 플로팅 카드로 렌더.
  const [docWin, setDocWin] = useState<Window | null>(null);
  const [docPipSupported, setDocPipSupported] = useState(false);
  // 새로고침 전에 분리 중이었음 — 다음 클릭에서 재분리 대기 (안내 문구 표시용).
  const [restoreArmed, setRestoreArmed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // mount: on 상태·위치·크기·즐겨찾기 로드 + 이벤트 동기화
  useEffect(() => {
    setMounted(true);
    setDocPipSupported(
      typeof window !== "undefined" &&
        !!(window as DocPipWindow).documentPictureInPicture,
    );
    try {
      setOn(localStorage.getItem(PIP_ON_KEY) === "1");
      const p = localStorage.getItem(PIP_POS_KEY);
      if (p) {
        const parsed = JSON.parse(p);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") setPos(parsed);
      }
      const sz = localStorage.getItem(PIP_SIZE_KEY);
      if (sz === "sm" || sz === "lg") setSize(sz);
    } catch {
      // ignore
    }
    setFavIds(readFavIds());
    setFavMeta(readFavMeta());
    const syncOn = () => setOn(isPipOn());
    const syncFav = () => {
      setFavIds(readFavIds());
      setFavMeta(readFavMeta());
    };
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
        const json: ApiResp & { error?: string } = await res.json();
        if (!alive) return;
        // 업스트림 실패 응답({matches:[], error}) 은 무시 — 빈 목록으로 반영하면
        // 라이브 즐겨찾기가 스냅샷 "종료" 로 잠깐 퇴행한다. 직전 상태 유지 후 재시도.
        if (json.error) return;
        setMatches(json.matches ?? []);
      } catch {
        // 다음 polling 에서 재시도
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      // Document PiP 분리 창이 살아있으면 탭이 hidden 이어도 계속 폴링해야 함.
      if (typeof document !== "undefined" && document.hidden && !docWin) return;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, POLL_LIVE_MS);
    };
    fetchOnce().then(schedule);
    const onVisibility = () => {
      if (document.hidden && !docWin) {
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
  }, [on, docWin]);

  // Document PiP 창이 열린 채 컴포넌트 사라질 때 창 닫기.
  useEffect(() => {
    return () => {
      if (docWin && !docWin.closed) docWin.close();
    };
  }, [docWin]);

  // 종료·예정 즐겨찾기의 현재 점수·상태 — 라이브 API 는 진행 중 경기만 주므로,
  // DB 매치(숫자 id)는 /api/matches/by-ids 로 최신값을 받아 스냅샷(별표 시점 값,
  // 예: 0-0) 고착을 막는다. 라이브는 5초 폴링이 담당하니 60초면 충분.
  useEffect(() => {
    if (!on) return;
    const numericIds = [...favIds].filter((id) => /^\d+$/.test(id));
    if (numericIds.length === 0) {
      setBrief({});
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/matches/by-ids?ids=${numericIds.join(",")}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json: { matches?: BriefMatch[] } = await res.json();
        if (!alive) return;
        const map: Record<string, BriefMatch> = {};
        for (const b of json.matches ?? []) map[String(b.id)] = b;
        setBrief(map);
      } catch {
        // 다음 주기 재시도
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [on, favIds]);

  // 새로고침 시 Document PiP 복원 — opener 가 unload 되면 브라우저가 분리 창을 강제로
  // 닫는다. unload 직전(pagehide)에 "분리 중이었는지" 를 기록하고, 다음 로드에서는
  // 첫 클릭 때 재분리한다 (user gesture 없이 requestWindow 를 부르면 NotAllowedError —
  // 완전 자동 재오픈은 브라우저 보안 제약상 불가).
  const docWinRef = useRef<Window | null>(null);
  docWinRef.current = docWin;
  useEffect(() => {
    const onPageHide = () => {
      try {
        // 분리 중이었으면 기록, 아니면 제거 — 수동으로 닫은 뒤 새로고침엔 복원 안 함.
        // ⚠️ .closed 검사 금지: unload 때 브라우저가 분리 창을 먼저 닫으면 closed=true 라
        // 플래그가 지워진다(순서 비보장). 수동 닫기는 child pagehide → setDocWin(null) →
        // 재렌더로 ref 가 null 이 되므로 ref 존재 여부만으로 구분 가능(unload 중엔 재렌더
        // 가 없어 ref 가 살아있음).
        if (docWinRef.current) {
          sessionStorage.setItem(PIP_DOC_RESTORE_KEY, "1");
        } else {
          sessionStorage.removeItem(PIP_DOC_RESTORE_KEY);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  const openDocPipRef = useRef<(opts?: { silent?: boolean }) => Promise<boolean>>(
    async () => false,
  );
  openDocPipRef.current = openDocPip; // 함수 선언 호이스팅 — 최신 state(size) 클로저 유지

  useEffect(() => {
    if (!mounted || !on || !docPipSupported) return;
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(PIP_DOC_RESTORE_KEY) === "1";
    } catch {
      // ignore
    }
    if (!flagged) return;
    setRestoreArmed(true);
    // 성공할 때까지 클릭마다 재시도 — 플래그는 pagehide 가 관리하므로 여기선 안 지운다.
    let busy = false;
    let removed = false;
    const off = () => {
      if (removed) return;
      removed = true;
      window.removeEventListener("click", restore, { capture: true });
    };
    const restore = async (e: Event) => {
      // PiP 카드 내부 클릭(밖으로/닫기 버튼 등)은 그 버튼의 의도를 존중 — 복원 트리거 제외.
      const t = e.target as Node | null;
      if (t && cardRef.current?.contains(t)) return;
      if (busy) return;
      busy = true;
      const ok = await openDocPipRef.current({ silent: true });
      busy = false;
      if (ok) {
        setRestoreArmed(false);
        off();
      }
    };
    window.addEventListener("click", restore, { capture: true });
    return () => {
      setRestoreArmed(false);
      off();
    };
  }, [mounted, on, docPipSupported]);

  if (!mounted || !on) return null;

  // 표시 행 병합 — 라이브 API(실시간) 우선, 없으면 즐겨찾기 스냅샷(예정·종료).
  // 별표는 DB 매치 id 를 저장하므로 소스 id(id)와 DB 별칭(dbId) 양쪽 키로 색인.
  const liveById = new Map<string, LiveMatch>();
  for (const m of matches) {
    liveById.set(m.id, m);
    if (m.dbId) liveById.set(m.dbId, m);
  }
  const rows: PipRow[] = [...favIds]
    .map((id): PipRow | null => {
      const live = liveById.get(id);
      if (live) {
        return {
          id,
          league: live.league,
          home: live.homeShort || live.homeName,
          away: live.awayShort || live.awayName,
          homeScore: live.homeScore,
          awayScore: live.awayScore,
          statusLabel: live.statusLabel,
          state: "live",
        };
      }
      const meta = favMeta[id];
      const b = brief[id];
      // DB 최신값(by-ids) — 종료·예정 경기의 점수·상태를 스냅샷 대신 실제 값으로.
      if (b) {
        const state: PipRow["state"] =
          b.status === "LIVE" ? "live" : b.status === "SCHEDULED" ? "scheduled" : "done";
        const kickoff = new Date(b.startTime).toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Seoul",
        });
        return {
          id,
          league: b.league,
          home: meta?.homeShort || b.homeName,
          away: meta?.awayShort || b.awayName,
          homeScore: state === "scheduled" ? null : b.homeScore,
          awayScore: state === "scheduled" ? null : b.awayScore,
          statusLabel:
            b.status === "POSTPONED"
              ? "연기"
              : state === "done"
                ? "종료"
                : state === "live"
                  ? "LIVE" // 라이브 API 커버 밖(af 미추적 등) — DB 점수로라도 표시
                  : kickoff,
          state,
        };
      }
      if (!meta) return null; // 스냅샷 없는 옛 즐겨찾기 — 라이브일 때만 표시(기존 동작)
      const state: PipRow["state"] =
        meta.status === "live"
          ? "done" // 스냅샷상 live 였는데 라이브 API 에 없음 = 이미 끝난 경기
          : meta.status === "scheduled"
            ? "scheduled"
            : "done";
      return {
        id,
        league: meta.league,
        home: meta.homeShort || meta.homeName,
        away: meta.awayShort || meta.awayName,
        homeScore: meta.homeScore ?? null,
        awayScore: meta.awayScore ?? null,
        statusLabel:
          state === "done"
            ? "종료"
            : meta.statusLabel || "예정",
        state,
      };
    })
    .filter((r): r is PipRow => r !== null)
    .sort((a, b) => {
      const order = { live: 0, scheduled: 1, done: 2 } as const;
      return order[a.state] - order[b.state];
    });

  function close() {
    if (docWin && !docWin.closed) docWin.close();
    setDocWin(null);
    setPipOn(false);
    setOn(false);
  }

  function toggleSize() {
    const next = size === "sm" ? "lg" : "sm";
    setSize(next);
    try {
      localStorage.setItem(PIP_SIZE_KEY, next);
    } catch {
      // ignore
    }
  }

  // Document PiP — 브라우저 창 밖 always-on-top 분리 창 (Chrome·Edge).
  // user gesture(버튼 클릭) 안에서 호출해야 한다. 페이지 스타일시트를 복사해
  // Tailwind 클래스가 분리 창에서도 그대로 적용되게 함.
  async function openDocPip(opts?: { silent?: boolean }): Promise<boolean> {
    const api = (window as DocPipWindow).documentPictureInPicture;
    if (!api) return false;
    try {
      const win = await api.requestWindow({
        width: size === "lg" ? 340 : 280,
        height: 380,
      });
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = Array.from(sheet.cssRules)
            .map((r) => r.cssText)
            .join("\n");
          const style = win.document.createElement("style");
          style.textContent = rules;
          win.document.head.appendChild(style);
        } catch {
          // CORS 시트는 link 로 재참조
          if (sheet.href) {
            const link = win.document.createElement("link");
            link.rel = "stylesheet";
            link.href = sheet.href;
            win.document.head.appendChild(link);
          }
        }
      }
      // 다크모드 클래스·배경 동기화
      win.document.documentElement.className = document.documentElement.className;
      win.document.body.style.margin = "0";
      win.document.body.style.background = "transparent";
      win.document.title = "스코어베이스 내 경기";
      win.addEventListener("pagehide", () => setDocWin(null));
      setDocWin(win);
      return true;
    } catch (e) {
      // 자동 복원(새로고침 후 첫 클릭) 실패는 조용히 인페이지 카드 유지 — 클릭 방해 금지.
      if (opts?.silent) return false;
      // 실패를 침묵하면 "버튼 눌러도 안 됨" 으로 보임 — 원인을 사용자에게 알려준다.
      alert(
        "브라우저 밖 분리에 실패했어요.\n" +
          "Chrome/Edge 116 이상에서 지원됩니다.\n(" +
          (e instanceof Error ? e.message : String(e)) +
          ")",
      );
      return false;
    }
  }

  // 헤더 드래그 — pointer 이벤트로 카드를 이동, 놓을 때 위치 저장. (인페이지 모드 전용)
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

  const body = (
    <div className="max-h-72 overflow-y-auto p-2">
      {rows.length === 0 ? (
        <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-neutral-500">
          즐겨찾기한 경기가 없어요.
          <br />
          경기 카드의 별표를 눌러보세요.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((m) => (
            <li
              key={m.id}
              // 좌(리그)·우(상태) 칸을 같은 고정폭으로 — 리그명이 길어도 가운데
              // 점수 축이 모든 행에서 세로 정렬되게 (auto 폭이면 긴 뱃지가 축을 밀어냄).
              className={`grid grid-cols-[3.25rem_1fr_auto_1fr_3.25rem] items-center gap-1.5 rounded-lg px-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 ${size === "lg" ? "py-2.5 text-sm" : "py-1.5 text-[12px]"} ${m.state === "done" ? "opacity-60" : ""}`}
            >
              <span className="flex min-w-0 justify-start overflow-hidden">
                <LeagueBadge league={m.league} size="sm" />
              </span>
              <span className="truncate text-right font-medium text-neutral-800 dark:text-neutral-200">
                {m.home}
              </span>
              <span className="whitespace-nowrap text-center font-black tabular-nums text-neutral-900 dark:text-white">
                {m.homeScore != null && m.awayScore != null ? (
                  <>
                    <CountUp value={m.homeScore} className="tabular-nums" />
                    <span className="mx-0.5 text-neutral-400">-</span>
                    <CountUp value={m.awayScore} className="tabular-nums" />
                  </>
                ) : (
                  <span className="text-neutral-400">vs</span>
                )}
              </span>
              <span className="truncate font-medium text-neutral-800 dark:text-neutral-200">
                {m.away}
              </span>
              <span
                className={`whitespace-nowrap text-right text-[10px] font-semibold tabular-nums ${
                  m.state === "live"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-neutral-400"
                }`}
              >
                {m.statusLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const header = (isDocMode: boolean) => (
    <div
      onPointerDown={isDocMode ? undefined : onDragStart}
      className={`flex items-center gap-2 rounded-t-2xl border-b border-neutral-100 px-3 py-2 dark:border-neutral-800 ${isDocMode ? "" : "cursor-grab active:cursor-grabbing"}`}
    >
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
      </span>
      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
        내 경기
      </span>
      <span className="ml-auto flex items-center">
        {!isDocMode && docPipSupported && (
          <button
            type="button"
            onClick={() => openDocPip()}
            aria-label="브라우저 밖으로 분리"
            title="브라우저 밖 항상-위 미니 창으로 분리"
            className="mr-0.5 inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-1 text-[10px] font-bold text-rose-600 transition hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 3 21 3 21 9" />
              <line x1="21" y1="3" x2="12" y2="12" />
              <rect x="3" y="9" width="10" height="12" rx="2" />
            </svg>
            밖으로
          </button>
        )}
        <button
          type="button"
          onClick={toggleSize}
          aria-label={size === "sm" ? "크게 보기" : "작게 보기"}
          title={size === "sm" ? "크게 보기" : "작게 보기"}
          className="rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          {size === "sm" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="PiP 닫기"
          className="rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </span>
    </div>
  );

  // Document PiP 모드 — 분리 창의 body 에 포털 렌더 (인페이지 카드는 숨김).
  if (docWin && !docWin.closed) {
    return createPortal(
      <div className="min-h-screen bg-white dark:bg-neutral-900">
        {header(true)}
        {body}
      </div>,
      docWin.document.body,
    );
  }

  // 인페이지 플로팅 카드 — 저장된 좌표가 있으면 그것, 없으면 좌하단 기본(우하단 챗봇 회피).
  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { left: 16, bottom: 88, right: "auto", top: "auto" };

  return (
    <div
      ref={cardRef}
      style={style}
      className={`fixed z-[60] ${size === "lg" ? "w-80" : "w-64"} rounded-2xl border border-neutral-200 bg-white/95 shadow-[0_24px_70px_-20px_rgba(15,23,30,0.35)] backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95`}
      role="dialog"
      aria-label="즐겨찾기 라이브 스코어 PiP"
    >
      {header(false)}
      {restoreArmed && (
        <p className="border-b border-rose-100 bg-rose-50/60 px-3 py-1.5 text-[10px] font-semibold text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
          화면 아무 곳이나 클릭하면 미니 창이 다시 밖으로 빠집니다
        </p>
      )}
      {body}
    </div>
  );
}
