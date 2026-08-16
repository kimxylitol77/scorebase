"use client";

// 즐겨찾기 매치 id 를 쿠키로 미러 — 서버가 "이 방문자의 즐겨찾기"만 골라 props 로 내려보내게 한다.
//
// 왜. FavoriteMatches 는 localStorage 를 읽어야 해서 SSR 에선 아무것도 안 그리는데, 그동안
// 서버는 필터할 방법이 없어 오늘 경기 전체(520건·548KB)를 props 로 실어 보냈다. 즐겨찾기가
// 없는 대다수 방문자에겐 통째로 낭비다 (2026-08-16 실측, /scores HTML 의 10%).
// 쿠키 미러는 SortPrefWriter 와 같은 패턴 — 클라이언트가 쓰고 서버가 읽는다.
//
// 쿠키가 아직 없는 기존 사용자는 첫 렌더에 즐겨찾기 섹션이 비므로, 최초 기록 직후 한 번만
// router.refresh() 로 서버 렌더를 다시 받아 즉시 복구한다(그 이후로는 조용히 동기화만).
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFavorites } from "./useFavorites";

export const FAV_COOKIE = "scores_fav";
/** 쿠키 크기 상한 방어 — 매치 id 는 최대 7자리라 60개면 넉넉하고 500B 안쪽이다. */
const MAX_IDS = 60;

export default function FavPrefWriter() {
  const { ids } = useFavorites();
  const router = useRouter();
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    const value = [...ids].slice(0, MAX_IDS).sort().join(".");
    if (lastWritten.current === value) return;
    const had = document.cookie.includes(`${FAV_COOKIE}=`);
    const prev = document.cookie.match(new RegExp(`${FAV_COOKIE}=([^;]*)`))?.[1] ?? "";
    lastWritten.current = value;
    if (value) {
      document.cookie = `${FAV_COOKIE}=${value};path=/;max-age=31536000;samesite=lax`;
    } else if (had) {
      document.cookie = `${FAV_COOKIE}=;path=/;max-age=0;samesite=lax`;
    }
    // 서버가 못 받은 즐겨찾기가 있었을 때만 재렌더 — 쿠키가 이미 같으면 아무것도 안 한다.
    if (value && decodeURIComponent(prev) !== value) router.refresh();
  }, [ids, router]);

  return null;
}
