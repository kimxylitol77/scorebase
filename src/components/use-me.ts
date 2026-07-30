"use client";
// 헤더 배지 공용 세션 조회 훅 — 배지 인스턴스(데스크탑+모바일 4개)가 요청 1회를 공유.
// 라우트 이동마다 재조회하되, dedupe 는 같은 pathname 안에서만 — 로그인 전에 시작된
// 응답이 로그인 직후 네비게이션에 재사용되던 stale(새로고침해야 로그인 표시) 방지.
// 일시 오류(429/500/네트워크)는 이전 값 유지 — 로그인 표시가 저절로 뒤집히지 않게.
// 마지막 확인 상태는 localStorage 캐시 — 하드로드 직후 비로그인 깜빡임 제거 + 탭 간 동기화.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { syncFavoritesToAccount } from "./scores/fav-account-sync";

export interface Me {
  nickname: string | null;
  admin: string | null;
}

const EMPTY: Me = { nickname: null, admin: null };
const LS_KEY = "sb:me"; // 표시용 닉네임/관리자명만 저장 — 민감정보 아님

let last: Me | null = null; // null = 아직 미확인 (EMPTY 와 구분)
let inflight: Promise<Me> | null = null;
let inflightPath: string | null = null;
let seq = 0; // 조회 순번 — 늦게 도착한 옛 응답이 최신 값을 덮지 않게
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

function loadCached(): Me | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

function commit(m: Me | null): void {
  last = m;
  try {
    if (m) localStorage.setItem(LS_KEY, JSON.stringify(m));
    else localStorage.removeItem(LS_KEY);
  } catch {
    // localStorage 불가(시크릿 등) — 메모리 상태만으로 동작
  }
  notify();
  // 즐겨찾기 계정 스코프 동기화 — 로그인/로그아웃/계정전환 확정 시 localStorage 를
  // 그 계정의 서버 팔로우로 초기화·복원 (같은 계정이면 즉시 반환).
  syncFavoritesToAccount(m?.nickname ?? null);
}

function fetchMe(path: string): Promise<Me> {
  // 같은 pathname 의 중복 호출(배지 4개)만 dedupe — 경로가 바뀌면 새로 조회
  if (!inflight || inflightPath !== path) {
    inflightPath = path;
    const mySeq = ++seq;
    const p: Promise<Me> = fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
      .catch(() => null)
      .then((m) => {
        if (inflight === p) inflight = null;
        // 성공 + 최신 조회만 반영. 실패는 이전 값 유지 (확정된 200 만 로그아웃 판정 가능)
        if (m && mySeq === seq) commit(m);
        return m ?? last ?? EMPTY;
      });
    inflight = p;
  }
  return inflight;
}

/** 로그아웃 등 세션 변경 직후 캐시 무효화 — 모든 배지 즉시 갱신 */
export function resetMe(): void {
  inflight = null;
  inflightPath = null;
  seq++;
  commit(null);
}

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(last);
  const pathname = usePathname();

  useEffect(() => {
    const update = () => setMe(last);
    listeners.add(update);
    // 하드로드 첫 마운트 — 서버 확인 전까지 마지막 확인 상태로 즉시 표시
    if (last === null) {
      const cached = loadCached();
      if (cached) {
        last = cached;
        update();
      }
    }
    // 다른 탭에서 로그인/로그아웃 시 동기화
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LS_KEY) return;
      last = loadCached();
      notify();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(update);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchMe(pathname).then((m) => {
      if (alive) setMe(m);
    });
    return () => {
      alive = false;
    };
  }, [pathname]);

  return me;
}
