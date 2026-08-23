// 테니스 세계랭킹 — ATP·WTA top150. ESPN 랭킹 + 한글명 사전(위키+Haiku).
// 경쟁사(Flashscore 한국어) 대비 차별점 = 한글명. docs/tennis-rankings 참고.

import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import DriverAvatar from "@/components/scores/f1/DriverAvatar";
import { fetchTennisRankings, type Tour } from "@/lib/sports/espn-tennis";
import { SITE_URL } from "@/lib/site-url";
import { koEnLanguages } from "@/lib/i18n/en";

export const revalidate = 3600;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const tour: Tour = sp?.tour === "wta" ? "WTA" : "ATP";
  const label = tour === "WTA" ? "WTA 여자" : "ATP 남자";
  return {
    title: `${label} 테니스 세계랭킹 — 순위·포인트 (한글)`,
    description: `${label} 테니스 세계랭킹 1~150위를 한국어 선수명으로. 순위 등락, 랭킹 포인트, 국적을 한눈에. 시너·알카라스·조코비치 등 상위 선수 프로필과 시즌 성적까지 — 스코어베이스.`,
    keywords: [
      "테니스 세계랭킹", "ATP 랭킹", "WTA 랭킹", "테니스 순위", "ATP 순위",
      "테니스 랭킹 포인트", "시너 랭킹", "알카라스 랭킹", "조코비치 순위",
    ],
    alternates: {
      canonical: `${SITE_URL}/rankings/tennis${tour === "WTA" ? "?tour=wta" : ""}`,
      languages: koEnLanguages(
        `/rankings/tennis${tour === "WTA" ? "?tour=wta" : ""}`,
        `/en/rankings/tennis${tour === "WTA" ? "?tour=wta" : ""}`,
      ),
    },
  };
}

export default async function TennisRankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  const sp = await searchParams;
  const tour: Tour = sp?.tour === "wta" ? "WTA" : "ATP";
  const rows = await fetchTennisRankings(tour);

  return (
    <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 테니스 랭킹
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">
          테니스 세계랭킹
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          ATP(남자)·WTA(여자) 세계랭킹 1~150위. 선수 이름을 한국어로, 순위 등락과 랭킹 포인트를 함께 봅니다.
        </p>
      </header>

      {/* 투어 탭 */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
        {(["ATP", "WTA"] as const).map((t) => {
          const on = tour === t;
          return (
            <Link
              key={t}
              href={t === "ATP" ? "/rankings/tennis" : "/rankings/tennis?tour=wta"}
              aria-current={on ? "page" : undefined}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300"
                  : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {t === "ATP" ? "ATP 남자" : "WTA 여자"}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/scores?sport=tennis"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          🎾 테니스 라이브 스코어
        </Link>
        <Link
          href="/tennis/draw"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          대진표
        </Link>
        <Link
          href={tour === "WTA" ? "/salaries/tennis?tour=wta" : "/salaries/tennis"}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          시즌 상금 랭킹
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500">
          랭킹 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          {/* 헤더 행 */}
          <div className="grid grid-cols-[44px_1fr_auto_72px] sm:grid-cols-[52px_1fr_120px_88px] items-center gap-2 border-b border-neutral-100 px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
            <span className="text-center">순위</span>
            <span>선수</span>
            <span className="hidden sm:block">국적</span>
            <span className="text-right">포인트</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {rows.map((r) => (
              <li key={r.athleteId}>
                <Link
                  href={`/rankings/tennis/${r.athleteId}`}
                  className="grid grid-cols-[44px_1fr_auto_72px] sm:grid-cols-[52px_1fr_120px_88px] items-center gap-2 px-3 sm:px-4 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                >
                  {/* 순위 + 등락 */}
                  <span className="flex flex-col items-center leading-none">
                    <span className={`font-black tabular-nums ${r.rank <= 3 ? "text-rose-600 dark:text-rose-400" : "text-neutral-800 dark:text-neutral-200"}`}>
                      {r.rank}
                    </span>
                    {r.delta != null && (
                      <span className={`mt-0.5 text-[10px] font-bold tabular-nums ${r.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                        {r.delta > 0 ? `▲${r.delta}` : `▼${Math.abs(r.delta)}`}
                      </span>
                    )}
                  </span>

                  {/* 선수 사진(국기 배지) + 선수명 (한글 우선) */}
                  <span className="flex items-center gap-2 min-w-0">
                    <DriverAvatar
                      photo={r.headshot}
                      flag={r.flag}
                      country={r.countryEn}
                      name={r.nameKo ?? r.name}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                        {r.nameKo ?? r.name}
                      </span>
                      {r.nameKo && (
                        <span className="block truncate text-[11px] text-neutral-400">{r.name}</span>
                      )}
                    </span>
                  </span>

                  {/* 국적 */}
                  <span className="hidden sm:flex items-center gap-1.5 min-w-0">
                    {r.flag && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.flag} alt="" className="w-4 h-3 shrink-0 object-cover rounded-[2px]" />
                    )}
                    <span className="truncate text-[12px] text-neutral-500">
                      {r.countryKo ?? r.countryEn ?? ""}
                    </span>
                  </span>

                  {/* 포인트 */}
                  <span className="text-right text-sm font-bold tabular-nums text-neutral-700 dark:text-neutral-300">
                    {r.points.toLocaleString("ko-KR")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        랭킹은 매주 갱신됩니다(ATP·WTA 공식 발표 기준). 선수 이름은 한국어 위키백과와 외래어표기법을 기준으로 표기하며,
        일부 선수는 통용 표기와 다를 수 있습니다. 데이터 출처 ESPN.
      </footer>
    </main>
  );
}
