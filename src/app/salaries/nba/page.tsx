// /salaries/nba — NBA 선수 연봉 랭킹 (USD + 한화 환산, 25명 페이지네이션).
// 데이터: basketball-reference contracts → PlayerSalary (cron fetch-salaries, 주 1회).
// 환율: frankfurter.app USD→KRW (revalidate 캐시, 실패 시 fallback).

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { toKoreanTeamName } from "@/lib/team-names";
import { lookupNbaPlayer, nbaPlayerHref } from "@/lib/sports/nba-players";
import { nbaEspnLogo } from "@/lib/sports/nba-logos";
import { calcAge } from "@/lib/age";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/PlayerValueTabs";
import { ArrowLeftRight, Trophy } from "lucide-react";

export const revalidate = 3600; // 1시간 — 연봉 주1회·환율 시간당 갱신이면 충분

const PER_PAGE = 25;
const FX_FALLBACK = 1520; // USD→KRW fallback (2026-06 실측 ~1,520). API 실패 시.

export const metadata: Metadata = {
  title: "NBA 선수·팀별 연봉 랭킹 — 2025-26 (한화) | 스코어베이스",
  description:
    "NBA 선수 연봉 순위 + 팀별 총 연봉(페이롤) 랭킹. 스테판 커리·요키치 등 최고 연봉 선수와 레이커스·닉스 구단 페이롤을 달러·원화로. 한국어 표기, 매주 자동 갱신. 데이터 Basketball Reference.",
  keywords: ["NBA 연봉", "NBA 팀 연봉", "NBA 페이롤", "NBA 팀별 연봉", "NBA 샐러리캡", "커리 연봉", "NBA 선수 연봉 순위"],
  alternates: { canonical: "https://www.scorebase.kr/salaries/nba" },
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}
function fmtFull(n: number): string {
  return `$${n.toLocaleString()}`;
}
/** USD → 한화 약식 — 억/만원 단위. */
function fmtKrw(usd: number, rate: number): string {
  const won = usd * rate;
  if (won >= 1e8) return `약 ${Math.round(won / 1e8).toLocaleString()}억원`;
  if (won >= 1e4) return `약 ${Math.round(won / 1e4).toLocaleString()}만원`;
  return `약 ${Math.round(won).toLocaleString()}원`;
}

/** 현재 USD→KRW 환율 — frankfurter(ECB). revalidate 캐시 안에서 시간당 1회. 실패 시 fallback. */
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

/** 페이지 번호 목록 — 1 … (현재-1) 현재 (현재+1) … 마지막. */
function pageList(cur: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, total - 1, total, cur - 1, cur, cur + 1]);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (let i = 1; i <= total; i++) {
    if (!set.has(i)) continue;
    if (i - prev > 1) out.push("…");
    out.push(i);
    prev = i;
  }
  return out;
}

interface Props {
  searchParams: Promise<{ page?: string; view?: string; team?: string }>;
}

export default async function NbaSalariesPage({ searchParams }: Props) {
  const { page: pageParam, view, team: teamParam } = await searchParams;
  const rate = await fetchUsdKrw();

  // ── 팀별 페이롤 랭킹 뷰 ──
  if (view === "team") {
    const grouped = await prisma.playerSalary.groupBy({
      by: ["teamName"],
      where: { league: "NBA" },
      _sum: { salary: true },
      _count: { _all: true },
    });
    const season =
      (await prisma.playerSalary.findFirst({ where: { league: "NBA" }, select: { season: true } }))?.season ?? "2025-26";
    const teamRows = grouped
      .filter((g) => g.teamName && g.teamName.trim())
      .map((g) => ({ name: g.teamName as string, total: g._sum.salary ?? 0, count: g._count._all }))
      .sort((a, b) => b.total - a.total);
    return (
      <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <AmbientGlow />
        <PlayerValueTabs active="/salaries/nba" />
        <NbaSalaryHeader season={season} subtitle={`팀별 총 연봉(페이롤) 순위 · ${teamRows.length}개 구단`} />
        <NbaViewToggle view="team" />
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/10 bg-neutral-50/80 dark:bg-white/[0.03] text-xs text-neutral-500">
                <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
                <th className="px-2 py-2.5 text-left font-semibold">팀</th>
                <th className="px-3 py-2.5 text-center font-semibold w-16 hidden sm:table-cell">인원</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">총 연봉</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap hidden lg:table-cell">평균</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap hidden lg:table-cell">원화 환산</th>
              </tr>
            </thead>
            <tbody>
              {teamRows.map((t, i) => {
                const top3 = i < 3;
                const ko = toKoreanTeamName(t.name, "NBA") ?? t.name;
                const logo = nbaEspnLogo(t.name);
                const avg = t.count ? t.total / t.count : 0;
                return (
                  <tr key={t.name} className="border-b border-black/5 dark:border-white/5 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{i + 1}</td>
                    <td className="px-2 py-2.5">
                      <Link href={`/salaries/nba?team=${encodeURIComponent(t.name)}`} className="flex items-center gap-2.5 hover:underline">
                        {logo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt="" className="w-6 h-6 object-contain shrink-0" />
                        )}
                        <span className={`font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>{ko}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-neutral-500 hidden sm:table-cell">{t.count}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums font-bold" title={fmtFull(t.total)}>
                      <div>{fmtUsd(t.total)}</div>
                      <div className="lg:hidden text-[11px] tabular-nums text-neutral-400 font-normal">{fmtKrw(t.total, rate)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-neutral-500 hidden lg:table-cell">{fmtUsd(avg)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-neutral-500 hidden lg:table-cell">{fmtKrw(t.total, rate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <NbaSalaryFooter rate={rate} />
      </main>
    );
  }

  // ── 선수별 뷰 (team 파라미터 있으면 그 팀만) ──
  const where = teamParam ? { league: "NBA", teamName: teamParam } : { league: "NBA" };
  const total = await prisma.playerSalary.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = teamParam ? 1 : Math.min(Math.max(1, parseInt(pageParam ?? "1", 10) || 1), totalPages);

  const rows = await prisma.playerSalary.findMany({
    where,
    orderBy: { rank: "asc" },
    skip: teamParam ? 0 : (page - 1) * PER_PAGE,
    take: teamParam ? 100 : PER_PAGE,
  });
  const season = rows[0]?.season ?? "2025-26";
  const teamKo = teamParam ? (toKoreanTeamName(teamParam, "NBA") ?? teamParam) : null;

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/salaries/nba" />
      <NbaSalaryHeader
        season={season}
        subtitle={
          teamKo
            ? `${teamKo} 선수 연봉 (달러·원화) · ${total.toLocaleString()}명`
            : `선수별 연봉 순위 (달러·원화) · 전체 ${total.toLocaleString()}명 · 매주 자동 갱신`
        }
      />
      <NbaViewToggle view="player" teamLabel={teamKo} />

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400 break-keep">연봉 데이터를 불러오는 중입니다.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/10 bg-neutral-50/80 dark:bg-white/[0.03] text-xs text-neutral-500">
                  <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
                  <th className="px-2 py-2.5 text-left font-semibold" colSpan={2}>선수</th>
                  <th className="px-2 py-2.5 text-left font-semibold">팀</th>
                  <th className="px-3 py-2.5 text-center font-semibold w-14 hidden lg:table-cell">나이</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">연봉</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap hidden lg:table-cell">원화 환산</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const top3 = r.rank <= 3;
                  const info = lookupNbaPlayer(r.playerName);
                  const display = info?.ko ?? r.playerName;
                  const href = nbaPlayerHref(info);
                  const teamLogo = nbaEspnLogo(r.teamName);
                  const age = calcAge(info?.birthday ? new Date(info.birthday * 1000) : null);
                  const nameEl = (
                    <span className={`font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""} ${href ? "hover:underline" : ""}`}>
                      {display}
                    </span>
                  );
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-black/5 dark:border-white/5 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
                    >
                      <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                      <td className="pl-2 py-1.5 w-9">
                        {href ? (
                          <Link href={href}><PlayerAvatar photo={info?.photo} name={display} /></Link>
                        ) : (
                          <PlayerAvatar photo={info?.photo} name={display} />
                        )}
                      </td>
                      <td className="pr-2 py-2.5">
                        {href ? <Link href={href}>{nameEl}</Link> : nameEl}
                      </td>
                      <td className="px-2 py-2.5 text-neutral-500">
                        <span className="inline-flex items-center gap-1.5">
                          {teamLogo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={teamLogo} alt="" className="w-5 h-5 object-contain shrink-0 hidden lg:inline-block" />
                          )}
                          {toKoreanTeamName(r.teamName, "NBA")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-neutral-500 dark:text-neutral-400 hidden lg:table-cell">{age ?? "—"}</td>
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

          {/* 페이지네이션 */}
          {!teamParam && totalPages > 1 && (
            <nav className="flex items-center justify-center gap-1 text-sm">
              <PageLink page={page - 1} disabled={page <= 1} label="‹ 이전" />
              {pageList(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className="px-1.5 text-neutral-400">…</span>
                ) : (
                  <Link
                    key={p}
                    href={p === 1 ? "/salaries/nba" : `/salaries/nba?page=${p}`}
                    aria-current={p === page ? "page" : undefined}
                    className={`min-w-[36px] rounded-full px-3 py-1.5 text-center font-semibold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      p === page
                        ? "bg-rose-600 text-white ring-rose-600 shadow-[0_8px_24px_-10px_rgba(225,29,72,0.6)]"
                        : "text-neutral-600 ring-black/10 hover:-translate-y-0.5 hover:bg-white dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    {p}
                  </Link>
                ),
              )}
              <PageLink page={page + 1} disabled={page >= totalPages} label="다음 ›" />
            </nav>
          )}
        </>
      )}

      <NbaSalaryFooter rate={rate} />
    </main>
  );
}

// 공통 헤더 — 빵부스러기 + 타이틀 + 부제(뷰별) + 액션 링크.
function NbaSalaryHeader({ season, subtitle }: { season: string; subtitle: string }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
        <Link href="/scores" className="hover:underline">라이브 스코어</Link>
        <span>›</span>
        <Link href="/leagues/NBA" className="hover:underline">NBA</Link>
        <span>›</span>
        <span className="text-neutral-600 dark:text-neutral-300">연봉 랭킹</span>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 연봉 랭킹
      </span>
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">NBA 연봉 랭킹</h1>
      <p className="text-sm text-neutral-500 leading-relaxed break-keep">
        {season} 시즌 {subtitle} · 데이터 Basketball Reference.
      </p>
      <div className="flex flex-wrap gap-2 pt-1 text-xs">
        <Link
          href="/transactions/nba"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3.5 py-1.5 font-semibold text-neutral-600 ring-1 ring-black/10 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> NBA 트랜잭션
        </Link>
        <Link
          href="/leagues/NBA"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3.5 py-1.5 font-semibold text-neutral-600 ring-1 ring-black/10 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
        >
          <Trophy className="h-3.5 w-3.5" aria-hidden /> NBA 경기·순위
        </Link>
      </div>
    </header>
  );
}

// 선수별 ↔ 팀별 뷰 토글. team 필터 중이면 해제 칩 노출.
function NbaViewToggle({ view, teamLabel }: { view: "player" | "team"; teamLabel?: string | null }) {
  const pill = (on: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
      on
        ? "bg-neutral-900 text-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] dark:bg-white dark:text-neutral-900"
        : "text-neutral-600 dark:text-neutral-300 ring-1 ring-black/10 dark:ring-white/15 hover:-translate-y-0.5 hover:bg-white dark:hover:bg-white/10"
    }`;
  const playerOn = view === "player" && !teamLabel;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/salaries/nba" className={pill(playerOn)}>선수별</Link>
      <Link href="/salaries/nba?view=team" className={pill(view === "team")}>팀별</Link>
      {teamLabel && (
        <Link
          href="/salaries/nba?view=team"
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-[0_8px_24px_-10px_rgba(225,29,72,0.6)]"
        >
          {teamLabel} <span aria-hidden className="opacity-70">×</span>
        </Link>
      )}
    </div>
  );
}

// 공통 푸터 — 출처·환율 면책.
function NbaSalaryFooter({ rate }: { rate: number }) {
  return (
    <footer className="border-t border-black/5 dark:border-white/10 pt-4 text-xs text-neutral-400 leading-relaxed break-keep">
      연봉은 해당 시즌 실계약액(USD) 기준이며, 원화는 1달러 = {Math.round(rate).toLocaleString()}원 적용한 근사값입니다. 데이터 제공{" "}
      <a href="https://www.basketball-reference.com/contracts/players.html" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
        Basketball Reference
      </a>
      {" · 환율 "}
      <a href="https://www.frankfurter.app" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
        Frankfurter
      </a>
      .
    </footer>
  );
}

/** 이전/다음 버튼 — disabled 면 비활성 표시. */
function PageLink({ page, disabled, label }: { page: number; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span className="rounded-full px-3 py-1.5 text-neutral-300 dark:text-neutral-700 cursor-default select-none">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={page === 1 ? "/salaries/nba" : `/salaries/nba?page=${page}`}
      className="rounded-full px-3 py-1.5 font-semibold text-neutral-600 ring-1 ring-black/10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
    >
      {label}
    </Link>
  );
}

/** 선수 사진 아바타 — ESPN headshot. 없으면(매칭 실패) 이니셜 원형 fallback. */
function PlayerAvatar({ photo, name }: { photo?: string; name: string }) {
  if (!photo) {
    const initial = name.trim().charAt(0).toUpperCase();
    return (
      <span className="inline-flex h-7 w-7 lg:h-9 lg:w-9 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[11px] font-bold text-neutral-500 dark:text-neutral-300">
        {initial}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={photo}
      alt=""
      loading="lazy"
      className="h-7 w-7 lg:h-9 lg:w-9 rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover object-top"
    />
  );
}
