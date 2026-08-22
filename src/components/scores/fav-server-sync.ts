"use client";
// 즐겨찾기 별표 → 서버 즉시 미러링 (텔레그램 알림 대상 동기화).
// 기존엔 마이페이지 방문 시에만 PUT 이라, 별표만 하고 마이페이지를 안 들르면
// 서버(UserTeamFollow/UserMatchFollow)가 몰라서 알림이 누락됐다 (docs/telegram-alerts 약점 항목).
// 로컬이 현재 계정 소유(canPushFavorites)일 때만 debounce PUT — 비로그인 401 스팸 방지 +
// 계정 전환 pull 완료 전에 이전 로컬이 서버를 덮는 레이스 차단.

import { canPushFavorites } from "./fav-account-sync";

const DEBOUNCE_MS = 1500;
let timer: ReturnType<typeof setTimeout> | null = null;

function readMatchIds(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem("scorebase:fav-matches") ?? "[]");
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function readTeamIds(): number[] {
  try {
    const arr = JSON.parse(localStorage.getItem("scorebase:fav-teams") ?? "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t) => (typeof t === "object" && t ? Number((t as { id?: unknown }).id) : Number(t)))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

function readLeagues(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem("scorebase:fav-leagues") ?? "[]");
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 별표 토글 직후 호출 — 로그인 회원이면 localStorage 전체 집합을 서버로 교체 PUT. */
export function scheduleFavServerSync(): void {
  if (typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (!canPushFavorites()) return;
    const put = (url: string, body: unknown) =>
      fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    void put("/api/favorites/matches", { matchIds: readMatchIds() });
    void put("/api/favorites/teams", { teamIds: readTeamIds() });
    void put("/api/favorites/leagues", { leagues: readLeagues() });
  }, DEBOUNCE_MS);
}
