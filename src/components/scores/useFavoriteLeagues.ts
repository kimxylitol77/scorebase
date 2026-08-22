// localStorage 기반 즐겨찾기 리그 hook — useFavoriteTeams 와 동일 패턴 (리그 코드 문자열 배열).
// key: 'scorebase:fav-leagues' = JSON ["EPL","KLEAGUE1",...]. 같은 탭 동기화는 custom event.

"use client";

import { useCallback, useSyncExternalStore } from "react";
import { scheduleFavServerSync } from "./fav-server-sync";

const STORAGE_KEY = "scorebase:fav-leagues";
const EVENT_NAME = "scorebase:fav-leagues-changed";
const MAX_LEAGUES = 30;

const EMPTY: string[] = [];
let cachedRaw: string | null = null;
let cached: string[] = EMPTY;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = read();
  return cached;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT_NAME, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT_NAME, cb);
    window.removeEventListener("storage", cb);
  };
}

function write(leagues: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leagues.slice(0, MAX_LEAGUES)));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
    scheduleFavServerSync(); // 로그인 회원이면 서버(UserLeagueFollow)에도 미러링
  } catch {
    // quota / private mode — 무시
  }
}

/** 계정 동기화(pull)용 — 서버 세트로 교체. 이벤트만 쏘고 서버 재PUT 은 안 한다. */
export function replaceFavLeagues(leagues: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leagues.slice(0, MAX_LEAGUES)));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {}
}

export function readFavLeagues(): string[] {
  return getSnapshot();
}

export function useFavoriteLeagues() {
  const leagues = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isFavorite = useCallback((l: string) => leagues.includes(l), [leagues]);
  const toggle = useCallback((l: string) => {
    const cur = getSnapshot();
    write(cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]);
  }, []);
  return { leagues, isFavorite, toggle };
}
