// /salaries/tennis — 테니스 시즌 상금 랭킹 (ATP/WTA 탭, USD + 한화 환산, top 50).
// 데이터: ATP·WTA 공식 주간 PDF 큐레이션 → PlayerSalary(TENNIS_ATP/TENNIS_WTA) (lib/sports/tennis-prize-money 헤더 참고).
// 한글 선수명·국적 = ESPN 랭킹 top150 (fetchTennisRankings) 이름 매칭 재사용 — 복식 전문 선수 등 미매칭은 영문 fallback.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/PlayerValueTabs";
import PlayerPhoto from "@/components/PlayerPhoto";
import { fetchTennisRankings, type Tour } from "@/lib/sports/espn-tennis";
import { TENNIS_PRIZE_AS_OF } from "@/lib/sports/tennis-prize-money";
import { CircleDollarSign } from "lucide-react";

export const revalidate = 3600;

const FX_FALLBACK = 1520; // USD→KRW fallback (2026-06 실측 ~1,520)

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const isWta = sp?.tour === "wta";
  const label = isWta ? "WTA 여자" : "ATP 남자";
  return {
    title: `테니스 상금 랭킹 — ${label} 시즌 상금 순위 (한화)`,
    description: `${label} 테니스 시즌 상금(YTD) 순위 top 50 을 달러·원화로. 단식·복식 합산 공식 상금을 한국어 선수명으로 — 스코어베이스. 데이터 ATP·WTA 공식 발표.`,
    keywords: ["테니스 상금 랭킹", "ATP 상금", "WTA 상금", "테니스 상금 순위", "시너 상금", "사발렌카 상금", "알카라스 상금"],
    alternates: { canonical: `https://www.scorebase.kr/salaries/tennis${isWta ? "?tour=wta" : ""}` },
  };
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}
function fmtFull(n: number): string {
  return `$${n.toLocaleString()}`;
}
function fmtKrw(usd: number, rate: number): string {
  const won = usd * rate;
  if (won >= 1e8) return `약 ${Math.round(won / 1e8).toLocaleString()}억원`;
  if (won >= 1e4) return `약 ${Math.round(won / 1e4).toLocaleString()}만원`;
  return `약 ${Math.round(won).toLocaleString()}원`;
}

async function fetchUsdKrw(): Promise<number> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=KRW", {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return FX_FALLBACK;
    const j = (await res.json()) as { rates?: { KRW?: number } };
    const krw = j.rates?.KRW;
    return typeof krw === "number" && krw > 0 ? krw : FX_FALLBACK;
  } catch {
    return FX_FALLBACK;
  }
}

/** 이름 매칭 키 — 소문자 + 분음부호 제거 (PDF 표기와 ESPN 표기 흡수). */
function nameKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

export default async function TennisSalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  const sp = await searchParams;
  const tour: Tour = sp?.tour === "wta" ? "WTA" : "ATP";
  const [rate, rows, ranks] = await Promise.all([
    fetchUsdKrw(),
    prisma.playerSalary.findMany({
      where: { league: tour === "WTA" ? "TENNIS_WTA" : "TENNIS_ATP" },
      orderBy: { rank: "asc" },
    }),
    fetchTennisRankings(tour),
  ]);
  const season = rows[0]?.season ?? String(new Date().getUTCFullYear());

  // ESPN 랭킹 이름 매칭 → 한글명·국적·선수 페이지 링크.
  // 중국 선수 등 성-이름 순서가 소스별로 달라(WTA "Shuai Zhang" vs ESPN "Zhang Shuai") 역순 키도 함께 둔다.
  const rankMap = new Map<string, (typeof ranks)[number]>();
  for (const r of ranks) {
    rankMap.set(nameKey(r.name), r);
    const reversed = nameKey(r.name.split(" ").reverse().join(" "));
    if (!rankMap.has(reversed)) rankMap.set(reversed, r);
  }

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/salaries/tennis" />

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/scores?sport=tennis" className="hover:underline">테니스</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">상금 랭킹</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 상금 랭킹
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          <CircleDollarSign className="h-8 w-8 shrink-0 text-rose-500" aria-hidden /> 테니스 상금 랭킹
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          {season} 시즌 {tour === "WTA" ? "WTA 여자" : "ATP 남자"} 상금(YTD·단식+복식 합산) 순위 top {rows.length || 50} (달러·원화) · {TENNIS_PRIZE_AS_OF} 기준.
        </p>
      </header>

      {/* 투어 탭 — /rankings/tennis 와 같은 패턴 */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
        {(["ATP", "WTA"] as const).map((t) => {
          const on = tour === t;
          return (
            <Link
              key={t}
              href={t === "ATP" ? "/salaries/tennis" : "/salaries/tennis?tour=wta"}
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

      <p className="text-xs text-neutral-500">
        성적 기준 순위가 궁금하다면{" "}
        <Link href={tour === "WTA" ? "/rankings/tennis?tour=wta" : "/rankings/tennis"} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          테니스 세계랭킹 보기
        </Link>
        .
      </p>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">상금 데이터를 불러오는 중입니다.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-neutral-800 dark:bg-white/[0.04] dark:shadow-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
                <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
                <th className="px-2 py-2.5 text-left font-semibold">선수</th>
                <th className="px-2 py-2.5 text-left font-semibold hidden sm:table-cell">국적</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">시즌 상금</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap hidden lg:table-cell">원화 환산</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top3 = r.rank <= 3;
                const hit = rankMap.get(nameKey(r.playerName));
                const display = hit?.nameKo ?? r.playerName;
                const country = hit?.countryKo ?? hit?.countryEn ?? (r.teamName || null);
                const name = (
                  <>
                    <PlayerPhoto photo={r.photoUrl} name={display} />
                    <span className="min-w-0">
                      <span className={`block truncate font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>{display}</span>
                      {hit?.nameKo && <span className="block truncate text-[11px] font-normal text-neutral-400">{r.playerName}</span>}
                    </span>
                  </>
                );
                return (
                  <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                    <td className="px-2 py-2.5">
                      {hit ? (
                        <Link href={`/rankings/tennis/${hit.athleteId}`} className="flex items-center gap-2.5 hover:underline">
                          {name}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2.5">{name}</div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-neutral-500 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1.5">
                        {hit?.flag && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={hit.flag} alt="" className="w-4 h-3 shrink-0 object-cover rounded-[2px]" />
                        )}
                        {country ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap" title={fmtFull(r.salary)}>
                      <div className="tabular-nums font-bold">{fmtUsd(r.salary)}</div>
                      <div className="lg:hidden text-[11px] tabular-nums text-neutral-400">{fmtKrw(r.salary, rate)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-neutral-500 dark:text-neutral-400 hidden lg:table-cell">{fmtKrw(r.salary, rate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-xs text-neutral-400 leading-relaxed">
        상금은 {season} 시즌 누적(YTD) 공식 상금(단식·복식·혼합 합산, USD) 기준 {TENNIS_PRIZE_AS_OF} 발표분이며, 원화는 1달러 = {Math.round(rate).toLocaleString()}원 적용한 근사값입니다.
        복식 전문 선수 등 일부는 한글명·국적 매칭이 없어 영문으로 표기됩니다. 데이터 제공{" "}
        <a href="https://www.protennislive.com/posting/ramr/current_prize.pdf" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          ATP
        </a>
        {" · "}
        <a href="https://wtafiles.wtatennis.com/pdf/rankings/All_YTD_Prize_Money.pdf" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          WTA
        </a>
        {" · 환율 "}
        <a href="https://www.frankfurter.app" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          Frankfurter
        </a>
        .
      </footer>
    </main>
  );
}
