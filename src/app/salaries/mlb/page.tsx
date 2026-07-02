// /salaries/mlb — MLB 선수 연봉 랭킹 (USD + 한화 환산, 25명 페이지네이션).
// 데이터: spotrac → PlayerSalary(MLB) (cron fetch-salaries). 선수 한글명·팀 = TheSportsPlayer(MLB) 매칭.
// ⚠️ MLB 선수 사진 소스가 없어 이니셜 fallback (NBA 는 ESPN headshot). 이름 매칭 ~69%(표기차 영문 유지).

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { calcAge } from "@/lib/age";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/PlayerValueTabs";
import { CircleDollarSign } from "lucide-react";

export const revalidate = 3600;

const PER_PAGE = 25;
const FX_FALLBACK = 1520; // USD→KRW fallback (2026-06 실측 ~1,520)

export const metadata: Metadata = {
  title: "MLB 선수·팀별 연봉 랭킹 — 2026 (한화)",
  description:
    "MLB 선수 연봉 순위 + 팀별 총 연봉(페이롤) 랭킹. 후안 소토·오타니 등 최고 연봉 선수와 다저스·메츠·양키스 구단 페이롤을 달러·원화로. 한국어 선수명·팀 표기, 매주 자동 갱신. 데이터 Spotrac.",
  keywords: ["MLB 연봉", "MLB 팀 연봉", "MLB 페이롤", "MLB 팀별 연봉", "다저스 연봉", "MLB 선수 연봉 순위", "오타니 연봉"],
  alternates: { canonical: "https://www.scorebase.kr/salaries/mlb" },
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

/** 페이지 내 mlbamId 들의 생년월일 일괄 조회 — MLB Stats people 배치(무료 공식, 1회 호출). 실패 시 빈 맵. */
async function fetchMlbBirthdays(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(",")}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return map;
    const j = (await res.json()) as { people?: Array<{ id: number; birthDate?: string }> };
    for (const p of j.people ?? []) if (p.birthDate) map.set(String(p.id), p.birthDate);
  } catch {
    /* 실패 시 나이 미표기(— ) */
  }
  return map;
}

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

export default async function MlbSalariesPage({ searchParams }: Props) {
  const { page: pageParam, view, team: teamParam } = await searchParams;
  const rate = await fetchUsdKrw();

  // 팀 로고·기준집합 — Team(MLB) 30팀(영문 풀네임). 스팟랙엔 마이너 산하팀(1명 row)도 섞여
  // 있어 팀 뷰는 이 30팀으로 필터한다.
  const mlbTeams = await prisma.team.findMany({ where: { league: "MLB" }, select: { name: true, logoUrl: true } });
  const teamLogoMap = new Map(mlbTeams.map((t) => [t.name, t.logoUrl]));
  const mlbTeamSet = new Set(mlbTeams.map((t) => t.name));

  // ── 팀별 페이롤 랭킹 뷰 ──
  if (view === "team") {
    const grouped = await prisma.playerSalary.groupBy({
      by: ["teamName"],
      where: { league: "MLB" },
      _sum: { salary: true },
      _count: { _all: true },
    });
    const season =
      (await prisma.playerSalary.findFirst({ where: { league: "MLB" }, select: { season: true } }))?.season ??
      String(new Date().getUTCFullYear());
    const teamRows = grouped
      .filter((g) => g.teamName && mlbTeamSet.has(g.teamName))
      .map((g) => ({ name: g.teamName as string, total: g._sum.salary ?? 0, count: g._count._all }))
      .sort((a, b) => b.total - a.total);
    return (
      <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <AmbientGlow />
        <PlayerValueTabs active="/salaries/mlb" />
        <SalaryHeader season={season} subtitle={`팀별 총 연봉(페이롤) 순위 · ${teamRows.length}개 구단`} />
        <ViewToggle view="team" />
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-neutral-800 dark:bg-white/[0.04] dark:shadow-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
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
                const ko = toKoreanTeamName(t.name, "MLB") ?? t.name;
                const logo = teamLogoMap.get(t.name) ?? null;
                const avg = t.count ? t.total / t.count : 0;
                return (
                  <tr key={t.name} className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{i + 1}</td>
                    <td className="px-2 py-2.5">
                      <Link href={`/salaries/mlb?team=${encodeURIComponent(t.name)}`} className="flex items-center gap-2.5 hover:underline">
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
        <SalaryFooter rate={rate} />
      </main>
    );
  }

  // ── 선수별 랭킹 뷰 (team 파라미터 있으면 그 팀만, 없으면 전체 페이지네이션) ──
  const where = teamParam ? { league: "MLB", teamName: teamParam } : { league: "MLB" };
  const total = await prisma.playerSalary.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = teamParam ? 1 : Math.min(Math.max(1, parseInt(pageParam ?? "1", 10) || 1), totalPages);

  const rows = await prisma.playerSalary.findMany({
    where,
    orderBy: { rank: "asc" },
    skip: teamParam ? 0 : (page - 1) * PER_PAGE,
    take: teamParam ? 100 : PER_PAGE,
  });
  const season = rows[0]?.season ?? String(new Date().getUTCFullYear());
  const teamKo = teamParam ? (toKoreanTeamName(teamParam, "MLB") ?? teamParam) : null;

  // 선수 한글명 = TheSportsPlayer(MLB) 매칭 (~69%).
  const names = rows.map((r) => r.playerName);
  const tsP = names.length
    ? await prisma.theSportsPlayer.findMany({
        where: { sport: "MLB", name: { in: names } },
        select: { name: true, nameKo: true },
      })
    : [];
  const pMap = new Map(tsP.map((p) => [p.name, p]));

  // 나이 — 행 사진 URL(mlbstatic headshot)의 mlbamId → MLB Stats people 배치(1회 호출) → 생년월일
  const mlbamIds = Array.from(
    new Set(rows.map((r) => r.photoUrl?.match(/\/people\/(\d+)\//)?.[1]).filter((x): x is string => Boolean(x))),
  );
  const birthdayMap = await fetchMlbBirthdays(mlbamIds);

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/salaries/mlb" />
      <SalaryHeader
        season={season}
        subtitle={
          teamKo
            ? `${teamKo} 선수 연봉 (달러·원화) · ${total.toLocaleString()}명`
            : `선수별 연봉 순위 (달러·원화) · 전체 ${total.toLocaleString()}명 · 매주 자동 갱신`
        }
      />
      <ViewToggle view="player" teamLabel={teamKo} />

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">연봉 데이터를 불러오는 중입니다.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-neutral-800 dark:bg-white/[0.04] dark:shadow-none">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
                  <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
                  <th className="px-2 py-2.5 text-left font-semibold">선수</th>
                  <th className="px-2 py-2.5 text-left font-semibold">팀</th>
                  <th className="px-3 py-2.5 text-center font-semibold w-14 hidden lg:table-cell">나이</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">연봉</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap hidden lg:table-cell">원화 환산</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const top3 = r.rank <= 3;
                  const p = pMap.get(r.playerName);
                  const display = p?.nameKo ?? toKoreanPlayerName(r.playerName);
                  const team = r.teamName ? toKoreanTeamName(r.teamName, "MLB") : null;
                  const teamLogo = r.teamName ? teamLogoMap.get(r.teamName) ?? null : null;
                  // 사진 URL(mlbstatic headshot)의 mlbamId → 통일 선수 페이지(/players/[pid], MLB 기본)
                  const mlbamId = r.photoUrl?.match(/\/people\/(\d+)\//)?.[1];
                  const href = mlbamId ? `/players/${mlbamId}` : null;
                  const bd = mlbamId ? birthdayMap.get(mlbamId) : undefined;
                  const age = calcAge(bd ? new Date(bd) : null);
                  return (
                    <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                      <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                      <td className="px-2 py-2.5">
                        {href ? (
                          <Link href={href} className="flex items-center gap-2.5 hover:underline">
                            <Avatar photo={r.photoUrl} name={display} />
                            <span className={`font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>{display}</span>
                          </Link>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <Avatar photo={r.photoUrl} name={display} />
                            <span className={`font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>{display}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-neutral-500">
                        <span className="inline-flex items-center gap-1.5">
                          {teamLogo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={teamLogo} alt="" className="w-5 h-5 object-contain shrink-0 hidden lg:inline-block" />
                          )}
                          {team ?? "—"}
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

          {!teamParam && totalPages > 1 && (
            <nav className="flex items-center justify-center gap-1 text-sm">
              <PageLink page={page - 1} disabled={page <= 1} label="‹ 이전" />
              {pageList(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className="px-1.5 text-neutral-400">…</span>
                ) : (
                  <Link
                    key={p}
                    href={p === 1 ? "/salaries/mlb" : `/salaries/mlb?page=${p}`}
                    aria-current={p === page ? "page" : undefined}
                    className={`min-w-[34px] rounded-full px-2.5 py-1.5 text-center font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      p === page
                        ? "bg-neutral-900 text-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] dark:bg-white dark:text-neutral-900"
                        : "border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:-translate-y-0.5 hover:bg-neutral-100 dark:hover:bg-white/[0.06]"
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

      <SalaryFooter rate={rate} />
    </main>
  );
}

// 공통 헤더 — 빵부스러기 + 타이틀 + 부제(뷰별 문구).
function SalaryHeader({ season, subtitle }: { season: string; subtitle: string }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
        <Link href="/scores" className="hover:underline">라이브 스코어</Link>
        <span>›</span>
        <Link href="/leagues/MLB" className="hover:underline">MLB</Link>
        <span>›</span>
        <span className="text-neutral-600 dark:text-neutral-300">연봉 랭킹</span>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 연봉 랭킹
      </span>
      <h1 className="flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
        <CircleDollarSign className="h-8 w-8 shrink-0 text-rose-500" aria-hidden /> MLB 연봉 랭킹
      </h1>
      <p className="text-sm text-neutral-500 leading-relaxed break-keep">
        {season} 시즌 {subtitle} · 데이터 Spotrac.
      </p>
    </header>
  );
}

// 선수별 ↔ 팀별 뷰 토글. team 필터 중이면 해제 칩 노출.
function ViewToggle({ view, teamLabel }: { view: "player" | "team"; teamLabel?: string | null }) {
  const pill = (on: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
      on
        ? "bg-neutral-900 text-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] dark:bg-white dark:text-neutral-900"
        : "text-neutral-600 dark:text-neutral-300 ring-1 ring-black/10 dark:ring-white/15 hover:-translate-y-0.5 hover:bg-white dark:hover:bg-white/10"
    }`;
  const playerOn = view === "player" && !teamLabel;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/salaries/mlb" className={pill(playerOn)}>선수별</Link>
      <Link href="/salaries/mlb?view=team" className={pill(view === "team")}>팀별</Link>
      {teamLabel && (
        <Link
          href="/salaries/mlb?view=team"
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-[0_8px_24px_-10px_rgba(225,29,72,0.6)]"
        >
          {teamLabel} <span aria-hidden className="opacity-70">×</span>
        </Link>
      )}
    </div>
  );
}

// 공통 푸터 — 출처·환율 면책.
function SalaryFooter({ rate }: { rate: number }) {
  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-xs text-neutral-400 leading-relaxed">
      연봉은 해당 시즌 계약 총액(USD) 기준이며, 원화는 1달러 = {Math.round(rate).toLocaleString()}원 적용한 근사값입니다. 선수 한국어명·팀은 보유 데이터 매칭분만 표기됩니다. 데이터 제공{" "}
      <a href="https://www.spotrac.com/mlb/rankings" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
        Spotrac
      </a>
      {" · 환율 "}
      <a href="https://www.frankfurter.app" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
        Frankfurter
      </a>
      .
    </footer>
  );
}

function PageLink({ page, disabled, label }: { page: number; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="rounded-full px-2.5 py-1.5 text-neutral-300 dark:text-neutral-700 cursor-default select-none">{label}</span>;
  }
  return (
    <Link
      href={page === 1 ? "/salaries/mlb" : `/salaries/mlb?page=${page}`}
      className="rounded-full border border-neutral-200 dark:border-neutral-800 px-2.5 py-1.5 font-medium text-neutral-600 dark:text-neutral-300 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-100 dark:hover:bg-white/[0.06]"
    >
      {label}
    </Link>
  );
}

/** 선수 아바타 — MLB Stats headshot, 매칭 실패 시 이니셜 원형. */
function Avatar({ photo, name }: { photo?: string | null; name: string }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" loading="lazy" className="h-7 w-7 lg:h-9 lg:w-9 rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover object-top shrink-0" />;
  }
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span className="inline-flex h-7 w-7 lg:h-9 lg:w-9 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[11px] font-bold text-neutral-500 dark:text-neutral-300 shrink-0">
      {initial}
    </span>
  );
}
