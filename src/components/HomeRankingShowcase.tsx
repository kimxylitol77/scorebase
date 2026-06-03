// 메인 페이지 — "예측 적중률 랭킹" 쇼케이스.
// /analysis 커뮤니티(회원 승부예측 자동채점)의 후킹 포인트 = 적중률·연승 랭킹을
// 홈에 노출해 게시판 유입을 만든다. 데이터 없으면(채점 0) 섹션 자체를 숨김.

import Link from "next/link";
import { getOverallRanking } from "@/lib/analysis/ranking";
import { displayGrade } from "@/lib/user-level";

const MEDAL = ["🥇", "🥈", "🥉"];

export default async function HomeRankingShowcase() {
  const rows = await getOverallRanking(5);
  if (rows.length === 0) return null;

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 mt-8 mb-10"
      aria-label="예측 적중률 랭킹"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            🏆 예측 적중률 랭킹
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            회원 승부예측이 실제 경기 결과로 자동 채점 — 누가 가장 잘 맞추나.
          </p>
        </div>
        <Link
          href="/analysis/ranking"
          className="hidden sm:inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
        >
          전체 랭킹 →
        </Link>
      </div>

      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 overflow-hidden">
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
          {rows.map((r, i) => {
            const g = displayGrade(r.level, r.badge);
            const medal = MEDAL[i];
            return (
              <li key={r.userId}>
                <Link
                  href="/analysis/ranking"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition"
                >
                  <span className="w-7 shrink-0 text-center text-lg font-bold text-neutral-400">
                    {medal ?? <span className="text-sm">{i + 1}</span>}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span title={g.name}>{g.emoji}</span>
                    <span className="truncate text-sm font-semibold">{r.nickname}</span>
                    {r.streak >= 3 && (
                      <span className="shrink-0 text-[11px] font-bold text-orange-500">
                        🔥{r.streak}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <span className="text-xs text-neutral-500">
                      {r.hit}승 {r.total - r.hit}패
                    </span>{" "}
                    <span className="font-bold tabular-nums text-rose-500">{r.rate}%</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/analysis"
          className="block border-t border-neutral-100 px-4 py-3 text-center text-sm font-semibold text-blue-600 transition hover:bg-neutral-50 dark:border-neutral-800/70 dark:text-blue-400 dark:hover:bg-neutral-900/50"
        >
          스포츠 분석 게시판에서 예측 올리기 →
        </Link>
      </div>
    </section>
  );
}
