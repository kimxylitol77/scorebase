// /salaries/f1 — F1 드라이버 연봉 랭킹 (미디어 종합 추정치, USD + 한화 환산).
// 데이터: data/f1-salaries.json 큐레이션 → PlayerSalary(F1) (lib/sports/f1-salaries 헤더 참고).
// ⚠️ F1 은 연봉 공식 발표가 없어 "추정" 고지를 페이지에 반드시 유지할 것.
// 한글 드라이버명 = 시드 JSON(name→nameKo), 팀 한글명·컬러 = espn-f1 고정 매핑 재사용.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/PlayerValueTabs";
import PlayerPhoto from "@/components/PlayerPhoto";
import { F1_TEAM_KO, F1_TEAM_COLOR, fetchF1Championship } from "@/lib/sports/espn-f1";
import { getF1Salaries, F1_SALARY_AS_OF, F1_SALARY_SOURCE, F1_SALARY_SOURCE_URL } from "@/lib/sports/f1-salaries";
import { CircleDollarSign } from "lucide-react";

export const revalidate = 3600;

const FX_FALLBACK = 1520; // USD→KRW fallback (2026-06 실측 ~1,520)

export const metadata: Metadata = {
  title: "F1 드라이버 연봉 랭킹 — 추정 연봉 순위 (한화)",
  description:
    "2026 F1 드라이버 연봉 순위를 달러·원화로. 페르스타펀·해밀턴·르클레르 등 드라이버별 추정 기본급과 소속 팀을 한국어로 — 공식 발표가 없어 미디어 종합 추정치 기준.",
  keywords: ["F1 연봉", "F1 드라이버 연봉", "페르스타펀 연봉", "해밀턴 연봉", "F1 연봉 순위", "포뮬러1 연봉"],
  alternates: { canonical: "https://www.scorebase.kr/salaries/f1" },
};

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

// 이름 매칭용 정규화 — 소문자 + 발음기호 제거 (DB 는 영문 이름만 있어 ESPN athleteId 를 이름으로 연결)
function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

export default async function F1SalariesPage() {
  const rate = await fetchUsdKrw();
  const rows = await prisma.playerSalary.findMany({
    where: { league: "F1" },
    orderBy: { rank: "asc" },
  });
  const season = rows[0]?.season ?? String(new Date().getUTCFullYear());
  // 한글 드라이버명 — 시드 JSON name→nameKo (DB 에는 영문만 저장)
  const koMap = new Map(getF1Salaries().map((d) => [d.name, d.nameKo]));
  // 드라이버 상세 링크 — ESPN standings 이름 매칭 (2026 시즌 22명 전원 정확 일치 실측, 실패 시 링크 없이 표시)
  const { drivers: championshipDrivers } = await fetchF1Championship(String(new Date().getUTCFullYear()));
  const idByName = new Map(championshipDrivers.map((d) => [normName(d.name), d.athleteId]));

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/salaries/f1" />

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/scores?sport=f1" className="hover:underline">F1</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">드라이버 연봉</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 연봉 랭킹
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          <CircleDollarSign className="h-8 w-8 shrink-0 text-rose-500" aria-hidden /> F1 드라이버 연봉
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          {season} 시즌 드라이버 {rows.length || 22}명의 연봉 추정 기본급(보너스 제외, 달러·원화) 순위.
        </p>
      </header>

      {/* 추정치 고지 — F1 은 연봉 공식 발표가 없다 */}
      <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
        F1 팀은 드라이버 연봉을 공식 발표하지 않습니다. 아래 수치는 공식 발표가 아닌 <strong>미디어 종합 추정치</strong>
        ({F1_SALARY_SOURCE}, {F1_SALARY_AS_OF} 기준)이며 실제 계약 조건과 다를 수 있습니다.
      </div>

      <p className="text-xs text-neutral-500">
        시즌 성적이 궁금하다면{" "}
        <Link href="/rankings/f1" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          F1 챔피언십 순위 보기
        </Link>
        .
      </p>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">연봉 데이터를 불러오는 중입니다.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-neutral-800 dark:bg-white/[0.04] dark:shadow-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
                <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
                <th className="px-2 py-2.5 text-left font-semibold">드라이버</th>
                <th className="px-2 py-2.5 text-left font-semibold hidden sm:table-cell">팀</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">연봉 (추정)</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap hidden lg:table-cell">원화 환산</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top3 = r.rank <= 3;
                const nameKo = koMap.get(r.playerName) ?? null;
                const teamKo = F1_TEAM_KO[r.teamName] ?? r.teamName;
                const color = F1_TEAM_COLOR[r.teamName] ?? "#9CA3AF";
                const athleteId = idByName.get(normName(r.playerName)) ?? null;
                return (
                  <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                    <td className="px-2 py-2.5">
                      {athleteId ? (
                        <Link href={`/rankings/f1/${athleteId}`} className="flex items-center gap-2.5 group">
                          <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                          <PlayerPhoto photo={r.photoUrl} name={nameKo ?? r.playerName} />
                          <span className="min-w-0">
                            <span className={`block truncate font-semibold group-hover:underline ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                              {nameKo ?? r.playerName}
                            </span>
                            {nameKo && <span className="block truncate text-[11px] font-normal text-neutral-400">{r.playerName}</span>}
                          </span>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                          <PlayerPhoto photo={r.photoUrl} name={nameKo ?? r.playerName} />
                          <span className="min-w-0">
                            <span className={`block truncate font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                              {nameKo ?? r.playerName}
                            </span>
                            {nameKo && <span className="block truncate text-[11px] font-normal text-neutral-400">{r.playerName}</span>}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-neutral-500 hidden sm:table-cell">{teamKo}</td>
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
        연봉은 {season} 시즌 추정 기본급(USD, 보너스·스폰서 수입 제외) 기준이며, 원화는 1달러 = {Math.round(rate).toLocaleString()}원 적용한 근사값입니다.
        일부 신인은 추정 범위(50만~100만 달러)의 하한값으로 표기했습니다. 추정 출처{" "}
        <a href={F1_SALARY_SOURCE_URL} target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          RacingNews365
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
