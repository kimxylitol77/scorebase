// localStorage 기반 즐겨찾기 매치 hook.
// key: 'scorebase:fav-matches' = JSON string[] (매치 id list)
// key: 'scorebase:fav-meta'    = { [id]: FavMeta } (경기 스냅샷 — PiP 가 상태 무관 표시용)
// 같은 탭의 여러 컴포넌트가 동기화되도록 custom event 'fav-changed' 사용.

"use client";

import { useCallback, useSyncExternalStore } from "react";
import { scheduleFavServerSync } from "./fav-server-sync";

const STORAGE_KEY = "scorebase:fav-matches";
const META_KEY = "scorebase:fav-meta";
const EVENT_NAME = "scorebase:fav-changed";

// 즐겨찾기 시 함께 저장하는 경기 스냅샷 — PiP 가 라이브 API 에 없는(종료·예정) 경기도
// 이 정보로 표시. 라이브 중이면 라이브 API 점수로 덮어써 실시간 갱신.
export interface FavMeta {
  id: string;
  sport: string;
  league: string;
  homeName: string;
  awayName: string;
  homeShort?: string;
  awayShort?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  status: string; // "live" | "scheduled" | "finished" | "postponed"
  statusLabel?: string;
  startTime?: string;
  href?: string;
}

function readIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // quota / private mode 등 — 무시
  }
}

function readMeta(): Record<string, FavMeta> {
  try {
    const raw = localStorage.getItem(META_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
function writeMeta(all: Record<string, FavMeta>): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

// === useSyncExternalStore 용 store ===
// localStorage 가 원본이라 setState 로 복제하지 않는다. 원문 문자열이 그대로면
// 직전 Set 을 재사용해야 스냅샷 참조가 안정된다(매번 새 Set 이면 무한 렌더로 본다).
const EMPTY_IDS: ReadonlySet<string> = new Set<string>();
let cachedRaw: string | null = null;
let cachedIds: Set<string> = new Set();

function getIdsSnapshot(): Set<string> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedIds;
  cachedRaw = raw;
  cachedIds = readIds();
  return cachedIds;
}

function getServerIdsSnapshot(): Set<string> {
  return EMPTY_IDS as Set<string>;
}

function subscribeFav(onChange: () => void) {
  window.addEventListener(EVENT_NAME, onChange);
  window.addEventListener("storage", onChange); // 탭 간 동기화
  return () => {
    window.removeEventListener(EVENT_NAME, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const alwaysTrue = () => true;
const alwaysFalse = () => false;

export function useFavorites() {
  const ids = useSyncExternalStore(subscribeFav, getIdsSnapshot, getServerIdsSnapshot);
  // SSR·하이드레이션 시점엔 false — 소비자가 별표를 그리기 전에 기다릴 수 있게 한다.
  const mounted = useSyncExternalStore(subscribeFav, alwaysTrue, alwaysFalse);

  // meta 는 별표가 알고 있는 경기 정보(팀·리그·상태 등)를 함께 저장 — 해제 시 같이 제거.
  const toggle = useCallback((id: string, meta?: FavMeta) => {
    const cur = readIds();
    const metaAll = readMeta();
    if (cur.has(id)) {
      cur.delete(id);
      delete metaAll[id];
    } else {
      cur.add(id);
      if (meta) metaAll[id] = meta;
    }
    writeMeta(metaAll);
    writeIds(cur); // custom event 발행 → store 구독자 전원 재렌더
    scheduleFavServerSync(); // 로그인 회원이면 서버 팔로우도 즉시 갱신 (텔레그램 알림 대상)
  }, []);

  const clear = useCallback(() => {
    writeMeta({});
    writeIds(new Set());
    scheduleFavServerSync();
  }, []);

  const isFav = useCallback((id: string) => ids.has(id), [ids]);

  return { ids, isFav, toggle, clear, mounted };
}

// 다른 컴포넌트 (LiveScoresBar·PiP 등) 가 React hook 없이 localStorage 의
// 즐겨찾기 ids / meta 를 빠르게 읽을 때 사용. event listener 도 같이 export.
export const FAV_STORAGE_KEY = STORAGE_KEY;
export const FAV_META_KEY = META_KEY;
export const FAV_EVENT_NAME = EVENT_NAME;
export function readFavIds(): Set<string> {
  return readIds();
}
export function readFavMeta(): Record<string, FavMeta> {
  return readMeta();
}
