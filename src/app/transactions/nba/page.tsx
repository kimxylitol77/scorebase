// /transactions/nba — NBA 트랜잭션 피드 (트레이드·FA계약·방출·단기계약·감독 인사).
// 데이터: ESPN transactions → SportsTransaction (cron fetch-transactions, 일 1회).
// 축구 /transfers(이적료·시장가치)와 분리 — 북미는 이적료 시장이 아닌 트랜잭션 피드.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { toKoreanTeamName } from "@/lib/team-names";

export const revalidate = 1800; // 30분 — 데이터는 일 1회 갱신이라 충분

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
    "NBA 트레이드·자유계약(FA)·방출·단기계약·감독 선임 등 선수 이동 소식을 날짜순으로 한눈에. 팀별·유형별 필터 제공. 매일 자동 갱신.",
  alternates: { canonical: "https://www.scorebase.kr/transactions/nba" },
};

function dateLabel(d: Date): string {
  const wk = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${wk})`;
}

interface Props {
  searchParams: Promise<{ cat?: string }>;
}

export default async function NbaTransactionsPage({ searchParams }: Props) {
  const { cat } = await searchParams;
  const activeCat = cat && CAT_MAP[cat] ? cat : null;

  const [rows, counts] = await Promise.all([
    prisma.sportsTransaction.findMany({
      where: { league: "NBA", ...(activeCat ? { category: activeCat } : {}) },
      orderBy: { date: "desc" },
      take: 250,
    }),
    prisma.sportsTransaction.groupBy({
      by: ["category"],
      where: { league: "NBA" },
      _count: true,
    }),
  ]);
  const countByCat = Object.fromEntries(counts.map((c) => [c.category, c._count]));
  const total = counts.reduce((s, c) => s + c._count, 0);

  // 날짜(yyyy-mm-dd)별 그룹
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
          트레이드·자유계약(FA)·방출·단기계약·감독 선임 등 선수 이동 소식을 날짜순으로. 매일 자동 갱신 · 데이터 ESPN.
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

      {/* 카테고리 필터 칩 */}
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
              href={`/transactions/nba?cat=${c.key}`}
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
                  return (
                    <li
                      key={t.id}
                      className="flex items-start gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3.5 py-3"
                    >
                      {t.teamLogo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.teamLogo} alt="" className="mt-0.5 h-7 w-7 shrink-0 object-contain" />
                      ) : (
                        <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${c.cls}`}>{c.label}</span>
                          {koTeam && (
                            <span className="truncate text-xs font-semibold text-neutral-700 dark:text-neutral-300">{koTeam}</span>
                          )}
                          {/* 트레이드는 다중 선수·다중 문장이라 단일 파싱이 노이즈 — 설명 전문으로 충분. */}
                          {t.playerName && t.category !== "trade" && (
                            <span className="truncate text-xs text-neutral-500">
                              · {t.position ? `${t.position} ` : ""}{t.playerName}
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-snug text-neutral-600 dark:text-neutral-400">{t.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-xs text-neutral-400 leading-relaxed">
        트랜잭션 원문은 영문 그대로 제공됩니다. 팀명은 한국어로 표기. 트레이드는 한 건에 여러 선수가 포함될 수 있습니다.{" "}
        <Link href="/leagues/NBA" className="text-blue-600 dark:text-blue-400 hover:underline">NBA 경기·순위</Link>도 함께 확인하세요.
      </footer>
    </main>
  );
}
