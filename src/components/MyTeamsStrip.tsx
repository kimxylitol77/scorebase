"use client";
// "내 팀" 바로가기 스트립 — 즐겨찾기 팀(localStorage)을 chips 로. 비어 있으면 렌더 안 함.
// /scores·홈 상단에서 재방문 사용자를 자기 팀 페이지로 즉시 연결하는 리텐션 장치.

import Link from "next/link";
import { Star } from "lucide-react";
import { useFavoriteTeams } from "./scores/useFavoriteTeams";

export default function MyTeamsStrip() {
  const { teams, mounted } = useFavoriteTeams();
  // 이름이 빈 항목은 구버전 형식(id 만 저장)이라 chip 에 쓸 표시명이 없다.
  // 그 팀 페이지를 한 번 열면 메타가 채워져 여기 나타난다.
  const named = teams.filter((t) => t.name);
  if (!mounted || named.length === 0) return null;
  return (
    <div className="mb-4 flex items-center gap-2 overflow-x-auto py-1" aria-label="내 팀 바로가기">
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold uppercase tracking-[0.15em] text-amber-500">
        <Star className="h-3 w-3" fill="currentColor" aria-hidden /> 내 팀
      </span>
      {named.map((t) => (
        <Link
          key={t.id}
          href={`/teams/${t.id}`}
          prefetch={false}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-200 dark:hover:bg-white/[0.08]"
        >
          {t.name}
          <span className="text-[10px] font-normal text-neutral-400">{t.league}</span>
        </Link>
      ))}
    </div>
  );
}
