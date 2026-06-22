// 선수 비교 입구 — 종목 선택 + 선수 2명 검색. ?sport=종목, ?a={id} 로 한 명 프리필(선수페이지 "비교하기").
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import ComparePicker, { type PickPlayer } from "@/components/ComparePicker";
import { loadComparePlayer } from "./loadComparePlayer";
import { loadNba, loadNhl, loadLol } from "./loaders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "선수 비교 · head-to-head 스탯 | 스코어베이스",
  description: "축구·NBA·NHL·LCK 선수 두 명을 골라 이번 시즌 지표를 레이더와 표로 비교하세요. 스코어베이스 선수 비교.",
  keywords: ["선수 비교", "축구 선수 비교", "NBA 선수 비교", "스탯 비교", "스코어베이스"],
  alternates: { canonical: "/compare" },
};

// 피커 검색 가능 종목(선수목록 보유). NHL·야구는 선수목록 빌드 후 추가 — 비교 페이지는 URL 로 동작.
const SPORTS: { code: string; label: string }[] = [
  { code: "SOCCER", label: "축구" },
  { code: "NBA", label: "NBA" },
  { code: "LOL", label: "LCK" },
];

async function prefill(a: string, sport: string): Promise<PickPlayer | null> {
  if (sport === "SOCCER") {
    const p = await loadComparePlayer(a);
    return p ? { id: p.id, name: p.name, team: [p.team, p.leagueLabel].filter(Boolean).join(" · "), photo: p.photo, value: p.value != null ? `€${p.value}M` : "" } : null;
  }
  const load = sport === "NBA" ? loadNba : sport === "NHL" ? loadNhl : sport === "LOL" ? loadLol : null;
  if (!load) return null;
  const p = await load(a);
  return p ? { id: p.id, name: p.name, team: p.sub ?? "", photo: p.photo, value: "" } : null;
}

export default async function ComparePickerPage({ searchParams }: { searchParams: Promise<{ a?: string; sport?: string }> }) {
  const sp = await searchParams;
  const sport = (sp.sport || "SOCCER").toUpperCase();
  const validSport = SPORTS.some((s) => s.code === sport) ? sport : "SOCCER";
  const initialA = sp.a ? await prefill(sp.a, validSport) : null;

  return (
    <main className="relative max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <AmbientGlow />
      <Link
        href="/transfers"
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden /> 이적시장
      </Link>

      <header className="mt-6 mb-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400">
          <Users className="h-3.5 w-3.5" aria-hidden /> 선수 비교
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">선수 head-to-head 비교</h1>
        <p className="mt-2 text-sm text-neutral-500">종목을 고르고 두 선수를 검색하면 이번 시즌 지표를 나란히 비교합니다.</p>
      </header>

      {/* 종목 선택 */}
      <div className="flex justify-center gap-1.5 mb-6 flex-wrap">
        {SPORTS.map((s) => (
          <Link
            key={s.code}
            href={`/compare${s.code === "SOCCER" ? "" : `?sport=${s.code}`}`}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition ${
              s.code === validSport
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <ComparePicker key={validSport} initialA={initialA} sport={validSport} />

      <p className="mt-6 text-center text-[11px] text-neutral-400">
        {validSport === "SOCCER" ? "축구 빅5·K리그1·MLS 등 시장가치 보유 선수" : validSport === "LOL" ? "LCK 등 수집 선수" : `${validSport} 선수`} 기준 · 데이터 스코어베이스
      </p>
    </main>
  );
}
