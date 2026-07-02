"use client";
// 헤더 배지 공용 세션 조회 훅 — 배지 인스턴스(데스크탑+모바일 4개)가 요청 1회를 공유.
// 라우트 이동마다 재조회(로그인/로그아웃 직후 소프트 네비게이션에서도 상태 반영),
// 같은 틱의 중복 호출은 in-flight promise 로 dedupe.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export interface Me {
  nickname: string | null;
  admin: string | null;
}

const EMPTY: Me = { nickname: null, admin: null };

let inflight: Promise<Me> | null = null;
let last: Me | null = null;

function fetchMe(): Promise<Me> {
  if (!inflight) {
    inflight = fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Me>) : EMPTY))
      .catch(() => EMPTY)
      .then((m) => {
        last = m;
        inflight = null;
        return m;
      });
  }
  return inflight;
}

/** 로그아웃 등 세션 변경 직후 캐시 무효화 */
export function resetMe(): void {
  inflight = null;
  last = null;
}

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(last);
  const pathname = usePathname();
  useEffect(() => {
    let alive = true;
    fetchMe().then((m) => {
      if (alive) setMe(m);
    });
    return () => {
      alive = false;
    };
  }, [pathname]);
  return me;
}
