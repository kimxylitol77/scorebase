// 테니스 드로우 허브 — 현재 진행/최근 ATP·WTA 대회를 나열해 각 대진표로 진입.

import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { listTennisDraws } from "@/lib/sports/tennis-draw";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "테니스 대진표 — ATP·WTA 토너먼트 드로우",
  description:
    "진행 중인 ATP·WTA 테니스 대회의 대진표(드로우)를 한국어로. 라운드별 경기 결과와 세트 스코어, 한국 선수 강조까지 — 스코어베이스 테니스.",
  keywords: ["테니스 대진표", "ATP 드로우", "WTA 드로우", "테니스 토너먼트", "테니스 브래킷"],
  alternates: { canonical: `${SITE_URL}/tennis/draw` },
};

export default async function TennisDrawHubPage() {
  const draws = await listTennisDraws();
  const atp = draws.filter((d) => d.tour === "ATP");
  const wta = draws.filter((d) => d.tour === "WTA");

  return (
    <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 테니스 · 대진표
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">테니스 대진표</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          진행 중인 ATP·WTA 대회의 드로우입니다. 대회를 선택하면 라운드별 경기 결과와 세트 스코어를 볼 수 있습니다.
        </p>
      </header>

      {draws.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500">
          지금 진행 중인 ATP·WTA 대회가 없습니다.
          <p className="mt-1 text-xs text-neutral-400">투어 대회 기간에 대진표가 표시됩니다. 데이터 출처 ESPN.</p>
        </div>
      ) : (
        [
          { label: "ATP 남자", list: atp },
          { label: "WTA 여자", list: wta },
        ].map(
          (g) =>
            g.list.length > 0 && (
              <section key={g.label} className="space-y-2">
                <h2 className="text-sm font-bold text-neutral-500">{g.label}</h2>
                <ul className="grid gap-2">
                  {g.list.map((d) => (
                    <li key={`${d.tourSlug}-${d.eventId}`}>
                      <Link
                        href={`/tennis/draw/${d.tourSlug}/${d.eventId}`}
                        className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
                      >
                        <span className="text-lg" aria-hidden>🎾</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                            {d.name}
                          </span>
                          <span className="block text-[11px] text-neutral-400">
                            본선 {d.matchCount}경기
                            {d.completed && " · 종료"}
                            {d.hasKorean && <span className="ml-1 font-semibold text-rose-500">· 🇰🇷 한국 선수 출전</span>}
                          </span>
                        </span>
                        <span className="text-neutral-300 dark:text-neutral-600" aria-hidden>→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/scores?sport=tennis"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          🎾 테니스 라이브 스코어
        </Link>
        <Link
          href="/rankings/tennis"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          세계 랭킹
        </Link>
      </div>

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        본선 단식 기준입니다. 데이터 출처 ESPN · 5분 갱신.
      </footer>
    </main>
  );
}
