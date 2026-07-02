// localStorage 기반 즐겨찾기 팀 hook — useFavorites(매치)와 동일 패턴.
// key: 'scorebase:fav-teams' = JSON [{id, name, league}] (팀 페이지 chips 렌더용 메타 포함).
// 같은 탭의 여러 컴포넌트가 동기화되도록 custom event 사용.

"use client";

import { useEffect, useState, useCallback } from "react";

export interface FavTeam {
  id: number;
  name: string; // 한글 표시명 (저장 시점에 toKoreanTeamName 결과)
  league: string;
}

const STORAGE_KEY = "scorebase:fav-teams";
const EVENT_NAME = "scorebase:fav-teams-changed";
const MAX_TEAMS = 20;

function readTeams(): FavTeam[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (t) => t && typeof t.id === "number" && typeof t.name === "string",
    );
  } catch {
    return [];
  }
}

function writeTeams(teams: FavTeam[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(teams.slice(0, MAX_TEAMS)));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // quota / private mode 등 — 무시
  }
}

export function useFavoriteTeams() {
  const [teams, setTeams] = useState<FavTeam[]>([]);
  // SSR hydration mismatch 방지 — mount 후에만 실제 localStorage 값 set
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTeams(readTeams());
    setMounted(true);
    const sync = () => setTeams(readTeams());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync); // 탭 간 동기화
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((team: FavTeam) => {
    const cur = readTeams();
    const next = cur.some((t) => t.id === team.id)
      ? cur.filter((t) => t.id !== team.id)
      : [...cur, team];
    writeTeams(next);
    setTeams(next);
  }, []);

  const isFav = useCallback(
    (id: number) => teams.some((t) => t.id === id),
    [teams],
  );

  return { teams, isFav, toggle, mounted };
}
