// /transactions/nba — NBA 트랜잭션 피드 (트레이드·FA계약·방출·단기계약·감독 인사).
// 데이터: ESPN transactions → SportsTransaction (cron fetch-transactions, 일 1회).
// 설명은 Haiku 한글 번역(descriptionKo) 우선 + 영문 원문 보조. 25건 페이지네이션.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { toKoreanTeamName } from "@/lib/team-names";
import { lookupNbaPlayer } from "@/lib/sports/nba-players";

export const revalidate = 1800; // 30분

const PER_PAGE = 25;

const CATS: { key: string; label: string; cls: string }[] = [
  { key: "trade", label: "트레이드", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  { key: "signing", label: "계약", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { key: "short_term", label: "단기계약", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  { key: "waive", label: "방출", cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  { key: "staff", label: "감독·프런트", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  { key: "other", label: "기타", cls: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" },
];
const CAT_MAP = Object.fromEntries(CATS.map((c) => [c.key, c]));

export const metadata: Metadata = {
  title: "NBA 트랜잭션 — 트레이드·FA·방출 | 스코어베이스",
  description:
    "NBA 트레이드·자유계약(FA)·방출·단기계약·감독 선임 등 선수 이동 소식을 한국어로 한눈에. 선수 사진·유형별 필터 제공. 매일 자동 갱신.",
  alternates: { canonical: "https://www.scorebase.kr/transactions/nba" },
};

function dateLabel(d: Date): string {
  const wk = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${wk})`;
}

/** cat·page 보존 href. */
function txHref(cat: string | null, page: number): string {
  const p = new URLSearchParams();
  if (cat) p.set("cat", cat);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return qs ? `/transactions/nba?${qs}` : "/transactions/nba";
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
  searchParams: Promise<{ cat?: string; page?: string }>;
}

export default async function NbaTransactionsPage({ searchParams }: Props) {
  const { cat, page: pageParam } = await searchParams;
  const activeCat = cat && CAT_MAP[cat] ? cat : null;
  const where = { league: "NBA", ...(activeCat ? { category: activeCat } : {}) };

  const counts = await prisma.sportsTransaction.groupBy({
    by: ["category"],
    where: { league: "NBA" },
    _count: true,
  });
  const countByCat = Object.fromEntries(counts.map((c) => [c.category, c._count]));
  const total = counts.reduce((s, c) => s + c._count, 0);
  const filteredTotal = activeCat ? countByCat[activeCat] ?? 0 : total;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PER_PAGE));
  const page = Math.min(Math.max(1, parseInt(pageParam ?? "1", 10) || 1), totalPages);

  const rows = await prisma.sportsTransaction.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "asc" }],
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
  });

  // 날짜(yyyy-mm-dd)별 그룹 (현재 페이지 내)
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/scores" className="hover:underline">라이브 스코어</Link>
          <span>›</span>
          <Link href="/leagues/NBA" className="hover:underline">NBA</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">트랜잭션</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">🏀 NBA 트랜잭션</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">
          트레이드·자유계약(FA)·방출·단기계약·감독 선임 등 선수 이동 소식을 한국어로. 매일 자동 갱신 · 데이터 ESPN.
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <Link
            href="/salaries/nba"
            className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            💰 NBA 연봉 랭킹
          </Link>
          <Link
            href="/leagues/NBA"
            className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            🏀 NBA 경기·순위
          </Link>
        </div>
      </header>

      {/* 카테고리 필터 칩 — 클릭 시 1페이지로 */}
      <nav className="flex flex-wrap gap-1.5">
        <Link
          href="/transactions/nba"
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            !activeCat
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          전체 {total}
        </Link>
        {CATS.map((c) => {
          const n = countByCat[c.key] ?? 0;
          if (n === 0) return null;
          const on = activeCat === c.key;
          return (
            <Link
              key={c.key}
              href={txHref(c.key, 1)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                on
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {c.label} {n}
            </Link>
          );
        })}
      </nav>

      {/* 날짜별 피드 */}
      {groups.size === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">표시할 트랜잭션이 없습니다.</p>
      ) : (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([day, items]) => (
            <section key={day} className="space-y-2">
              <h2 className="sticky top-0 z-10 bg-white/90 dark:bg-neutral-950/90 backdrop-blur py-1 text-xs font-bold text-neutral-400">
                {dateLabel(items[0].date)}
              </h2>
              <ul className="space-y-1.5">
                {items.map((t) => {
                  const c = CAT_MAP[t.category] ?? CAT_MAP.other;
                  const koTeam = t.teamName ? toKoreanTeamName(t.teamName, "NBA") : null;
                  // 단일 선수(계약·방출·단기) 사진 — 트레이드(다중)·감독은 매칭 안 됨 → 팀로고.
                  const player = t.category !== "trade" ? lookupNbaPlayer(t.playerName) : null;
                  return (
                    <li
                      key={t.id}
                      className="flex items-start gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3.5 py-3"
                    >
                      <TxAvatar photo={player?.photo} teamLogo={t.teamLogo} />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${c.cls}`}>{c.label}</span>
                          {koTeam && (
                            <span className="truncate text-xs font-semibold text-neutral-700 dark:text-neutral-300">{koTeam}</span>
                          )}
                        </div>
                        <p className="text-sm leading-snug text-neutral-800 dark:text-neutral-200">
                          {t.descriptionKo || t.description}
                        </p>
                        {/* 한글 번역이 있으면 영문 원문을 보조로 (신뢰성·검증). */}
                        {t.descriptionKo && (
                          <p className="mt-0.5 text-[11px] leading-snug text-neutral-400">{t.description}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 text-sm">
          {page > 1 ? (
            <Link href={txHref(activeCat, page - 1)} className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-2.5 py-1.5 font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">‹ 이전</Link>
          ) : (
            <span className="rounded-lg px-2.5 py-1.5 text-neutral-300 dark:text-neutral-700 select-none">‹ 이전</span>
          )}
          {pageList(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1.5 text-neutral-400">…</span>
            ) : (
              <Link
                key={p}
                href={txHref(activeCat, p)}
                aria-current={p === page ? "page" : undefined}
                className={`min-w-[34px] rounded-lg px-2.5 py-1.5 text-center font-medium transition ${
                  p === page
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {p}
              </Link>
            ),
          )}
          {page < totalPages ? (
            <Link href={txHref(activeCat, page + 1)} className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-2.5 py-1.5 font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">다음 ›</Link>
          ) : (
            <span className="rounded-lg px-2.5 py-1.5 text-neutral-300 dark:text-neutral-700 select-none">다음 ›</span>
          )}
        </nav>
      )}

      <footer className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-xs text-neutral-400 leading-relaxed">
        한국어 번역은 AI(Claude)가 생성하며 영문 원문을 함께 표기합니다. 트레이드는 한 건에 여러 선수가 포함될 수 있습니다.{" "}
        <Link href="/leagues/NBA" className="text-blue-600 dark:text-blue-400 hover:underline">NBA 경기·순위</Link>도 함께 확인하세요.
      </footer>
    </main>
  );
}

/** 트랜잭션 아바타 — 단일 선수면 선수 사진 + 우하단 팀로고 배지, 아니면 팀로고. */
function TxAvatar({ photo, teamLogo }: { photo?: string; teamLogo?: string | null }) {
  if (photo) {
    return (
      <div className="relative mt-0.5 h-10 w-10 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" loading="lazy" className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover object-top" />
        {teamLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={teamLogo} alt="" loading="lazy" className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-white dark:bg-neutral-900 p-0.5 object-contain ring-1 ring-neutral-200 dark:ring-neutral-700" />
        )}
      </div>
    );
  }
  if (teamLogo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={teamLogo} alt="" loading="lazy" className="mt-0.5 h-9 w-9 shrink-0 object-contain" />;
  }
  return <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800" />;
}
