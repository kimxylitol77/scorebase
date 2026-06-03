import type { Metadata } from "next";
import Link from "next/link";
import { displayGrade } from "@/lib/user-level";
import { getOverallRanking, getMonthlyRanking, type RankRow } from "@/lib/analysis/ranking";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "적중률 랭킹 — 스코어베이스",
  description: "회원 예측 적중률 순위. 전체·월간 랭킹으로 누가 가장 잘 맞추는지 확인하세요.",
};

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

const MEDAL = ["🥇", "🥈", "🥉"];

export default async function RankingPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const monthly = tab === "monthly";
  const rows: RankRow[] = monthly ? await getMonthlyRanking() : await getOverallRanking();

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-14">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-sm text-neutral-500 mb-1">커뮤니티</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">🏆 적중률 랭킹</h1>
        </div>
        <Link
          href="/analysis"
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← 분석 목록
        </Link>
      </div>

      {/* 적중률 채점 방식 안내 — "승률"로 오해 방지 */}
      <details className="group mb-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-neutral-800 dark:text-neutral-200 [&::-webkit-details-marker]:hidden">
          <span>🎯 적중률은 승률이 아닙니다 — 채점 방식</span>
          <span className="shrink-0 text-neutral-400 transition-transform duration-200 group-open:rotate-45">+</span>
        </summary>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          <p>
            적중률 = 회원이 건{" "}
            <strong className="font-semibold text-neutral-800 dark:text-neutral-200">
              픽(승무패·핸디캡·오버언더)이 실제 경기 결과와 맞은 비율
            </strong>
            . 경기 종료 후 자동 채점됩니다. “N승 M패”는 팀 승패가 아니라{" "}
            <strong>N적중 · M빗나감</strong>이에요.
          </p>
          <p>
            순위는 단순 적중률(%)이 아니라{" "}
            <strong className="font-semibold text-neutral-800 dark:text-neutral-200">
              표본을 반영한 신뢰도 보정(Wilson 점수 하한)
            </strong>
            으로 정렬됩니다 — 1경기 100%가 무조건 1등이 되지 않고, 꾸준히 많이 맞춘 회원이 위로 올라갑니다.
          </p>
        </div>
      </details>

      {/* 탭 */}
      <div className="flex gap-2 mb-6">
        <Link
          href="/analysis/ranking"
          className={`flex-1 text-center py-2.5 rounded-xl text-sm font-bold border transition ${
            !monthly
              ? "bg-rose-600 text-white border-rose-600"
              : "border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          전체 랭킹
        </Link>
        <Link
          href="/analysis/ranking?tab=monthly"
          className={`flex-1 text-center py-2.5 rounded-xl text-sm font-bold border transition ${
            monthly
              ? "bg-rose-600 text-white border-rose-600"
              : "border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          월간 랭킹
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 py-20 text-center">
          아직 채점된 예측이 없습니다. 경기가 끝나면 적중 전적이 집계돼요.
        </p>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80">
          {/* header */}
          <div className="grid grid-cols-[56px_1fr_140px] gap-2 px-4 py-3 bg-neutral-50 dark:bg-neutral-900 text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
            <span className="text-center">순위</span>
            <span>닉네임</span>
            <span className="text-right">총 전적</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
            {rows.map((r, i) => {
              const g = displayGrade(r.level, r.badge);
              const medal = MEDAL[i];
              return (
                <li
                  key={r.userId}
                  className="grid grid-cols-[56px_1fr_140px] gap-2 px-4 py-3.5 items-center"
                >
                  <span className="text-center text-lg font-bold text-neutral-400">
                    {medal ?? <span className="text-sm">{i + 1}</span>}
                  </span>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span title={g.name}>{g.emoji}</span>
                    <span className="truncate font-semibold text-sm">{r.nickname}</span>
                    {r.streak >= 3 && (
                      <span className="shrink-0 text-[11px] text-orange-500 font-bold">
                        🔥{r.streak}
                      </span>
                    )}
                  </span>
                  <span className="text-right text-sm">
                    <span className="text-neutral-600 dark:text-neutral-300">
                      {r.hit}승 {r.total - r.hit}패
                    </span>{" "}
                    <span className="font-bold text-rose-500">({r.rate}%)</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-400 text-center">
        {monthly ? "이번 달 채점 완료된 예측 기준" : "전체 기간 누적 · 경기 종료 후 자동 채점"}
      </p>
    </main>
  );
}
