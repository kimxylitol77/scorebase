// 선수 비교 입구 — 선수 2명을 골라 head-to-head 비교. ?a={ts id} 로 한 명 프리필(선수 페이지의 "비교하기" 진입).
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import ComparePicker, { type PickPlayer } from "@/components/ComparePicker";
import { loadComparePlayer } from "./loadComparePlayer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "선수 비교 · head-to-head 스탯 | 스코어베이스",
  description: "축구 선수 두 명을 골라 이번 시즌 골·도움·슈팅·패스·수비 지표를 레이더 차트와 표로 비교하세요. 스코어베이스 선수 비교.",
  keywords: ["선수 비교", "축구 선수 비교", "스탯 비교", "head to head", "스코어베이스"],
  alternates: { canonical: "/compare" },
};

export default async function ComparePickerPage({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const { a } = await searchParams;
  let initialA: PickPlayer | null = null;
  if (a) {
    const p = await loadComparePlayer(a);
    if (p) {
      initialA = {
        id: p.id,
        name: p.name,
        team: [p.team, p.leagueLabel].filter(Boolean).join(" · "),
        photo: p.photo,
        value: p.value != null ? `€${p.value}M` : "",
      };
    }
  }

  return (
    <main className="relative max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <AmbientGlow />
      <Link
        href="/transfers"
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden /> 이적시장
      </Link>

      <header className="mt-6 mb-7 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400">
          <Users className="h-3.5 w-3.5" aria-hidden /> 선수 비교
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">선수 head-to-head 비교</h1>
        <p className="mt-2 text-sm text-neutral-500">두 선수를 검색해 고르면 이번 시즌 지표를 레이더와 표로 나란히 비교합니다.</p>
      </header>

      <ComparePicker initialA={initialA} />

      <p className="mt-6 text-center text-[11px] text-neutral-400">축구 빅5·K리그1·MLS 등 시장가치 보유 선수 기준 · 데이터 스코어베이스(TheSports)</p>
    </main>
  );
}
