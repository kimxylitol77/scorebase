// localStorage 기반 즐겨찾기 매치 hook.
// key: 'scorebase:fav-matches' = JSON string[] (매치 id list)
// 같은 탭의 여러 컴포넌트가 동기화되도록 custom event 'fav-changed' 사용.

"use client";

import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "scorebase:fav-matches";
const EVENT_NAME = "scorebase:fav-changed";

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

export function useFavorites() {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  // SSR hydration mismatch 방지 — mount 후에만 실제 localStorage 값 set
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIds(readIds());
    setMounted(true);
    const sync = () => setIds(readIds());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync); // 탭 간 동기화
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const cur = readIds();
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    writeIds(cur);
    setIds(new Set(cur));
  }, []);

  const clear = useCallback(() => {
    writeIds(new Set());
    setIds(new Set());
  }, []);

  const isFav = useCallback((id: string) => ids.has(id), [ids]);

  return { ids, isFav, toggle, clear, mounted };
}

// 다른 컴포넌트 (LiveScoresBar 등) 가 React hook 없이 localStorage 의
// 즐겨찾기 ids 만 빠르게 읽을 때 사용. event listener 도 같이 export.
export const FAV_STORAGE_KEY = STORAGE_KEY;
export const FAV_EVENT_NAME = EVENT_NAME;
export function readFavIds(): Set<string> {
  return readIds();
}
