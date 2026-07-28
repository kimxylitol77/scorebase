// localStorage 기반 즐겨찾기 팀 hook — useFavorites(매치)와 동일 패턴.
// key: 'scorebase:fav-teams' = JSON [{id, name, league}] (팀 페이지 chips 렌더용 메타 포함).
// 같은 탭의 여러 컴포넌트가 동기화되도록 custom event 사용.

"use client";

import { useEffect, useState, useCallback } from "react";
import { scheduleFavServerSync } from "./fav-server-sync";

export interface FavTeam {
  id: number;
  name: string; // 한글 표시명 (저장 시점에 toKoreanTeamName 결과)
  league: string;
}

const STORAGE_KEY = "scorebase:fav-teams";
const EVENT_NAME = "scorebase:fav-teams-changed";
const MAX_TEAMS = 20;

/**
 * 저장된 항목 하나를 FavTeam 으로 정규화. null 이면 버린다.
 *
 * 구 팀 팔로우 버튼(♡)이 같은 키에 `["7","12"]` 형태의 id 배열을 써서 이 hook 의 객체
 * 배열을 통째로 덮어쓰던 시기가 있었다. 그 형식도 읽어 살려낸다 — 이름·리그는 비워두고,
 * 마이페이지가 서버 조회로 채운다(healTeams). 버리면 사용자 즐겨찾기가 소리없이 사라진다.
 */
function normalizeTeam(t: unknown): FavTeam | null {
  if (typeof t === "string" || typeof t === "number") {
    const id = Number(t);
    return Number.isInteger(id) && id > 0 ? { id, name: "", league: "" } : null;
  }
  if (t && typeof t === "object") {
    const o = t as Partial<FavTeam>;
    if (typeof o.id === "number" && typeof o.name === "string") {
      return { id: o.id, name: o.name, league: typeof o.league === "string" ? o.league : "" };
    }
  }
  return null;
}

function readTeams(): FavTeam[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeTeam).filter((t): t is FavTeam => t !== null);
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
    scheduleFavServerSync(); // 로그인 회원이면 서버 팔로우도 즉시 갱신 (텔레그램 알림 대상)
  }, []);

  /** id 만으로 제거 — 마이페이지 목록처럼 팀 메타를 다시 만들 필요가 없는 곳에서 쓴다. */
  const remove = useCallback((id: number) => {
    const next = readTeams().filter((t) => t.id !== id);
    writeTeams(next);
    setTeams(next);
    scheduleFavServerSync();
  }, []);

  const clear = useCallback(() => {
    writeTeams([]);
    setTeams([]);
    scheduleFavServerSync();
  }, []);

  /**
   * 이름·리그가 빈 항목(구 ♡ 형식에서 살린 id-only)을 서버 조회 결과로 채운다.
   * 저장된 팀 목록 자체는 바꾸지 않고 메타만 보강 — 한 번 들르면 이후로는 이름이 보인다.
   */
  const healTeams = useCallback((info: Array<{ id: number; name: string; league: string }>) => {
    const byId = new Map(info.map((t) => [t.id, t]));
    const cur = readTeams();
    let changed = false;
    const next = cur.map((t) => {
      if (t.name) return t;
      const found = byId.get(t.id);
      if (!found) return t;
      changed = true;
      return { id: t.id, name: found.name, league: found.league };
    });
    if (!changed) return;
    writeTeams(next);
    setTeams(next);
  }, []);

  const isFav = useCallback(
    (id: number) => teams.some((t) => t.id === id),
    [teams],
  );

  return { teams, isFav, toggle, remove, clear, healTeams, mounted };
}
