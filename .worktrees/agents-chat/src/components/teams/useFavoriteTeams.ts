// localStorage 기반 즐겨찾기 팀 hook.
// key: 'scorebase:fav-teams' = JSON string[] (DB Team.id list)

"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "scorebase:fav-teams";
const EVENT_NAME = "scorebase:fav-teams-changed";

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

function writeIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // 무시 (quota / private mode)
  }
}

export function useFavoriteTeams() {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIds(readIds());
    setMounted(true);
    const sync = () => setIds(readIds());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
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

  const isFav = useCallback((id: string) => ids.has(id), [ids]);

  return { ids, isFav, toggle, mounted };
}
