import type { Metadata } from "next";
import Link from "next/link";
import { getOverallRanking, getMonthlyRanking, type RankRow } from "@/lib/analysis/ranking";
import ExpertRow from "@/components/experts/ExpertRow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "예측 전문가 순위 — 스코어베이스",
  description:
    "회원들의 실제 예측 적중률 랭킹. 경기 종료 후 자동 채점되는 정직한 순위표.",
};

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function ExpertsPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const monthly = tab === "monthly";
  const rows: RankRow[] = monthly ? await getMonthlyRanking(100) : await getOverallRanking(100);

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-2">
        <p className="text-sm text-neutral-500 mb-1">예측 전문가</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">🏆 예측 전문가 순위</h1>
        <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
          회원들의 <strong className="text-neutral-700 dark:text-neutral-300">실제 예측 적중률</strong> 랭킹.
          경기 종료 후 자동 채점되는 정직한 순위표입니다.
        </p>
      </div>

      {/* 채점 방식 안내 — "승률"로 오해 방지 */}
      <details className="group my-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-neutral-800 dark:text-neutral-200 [&::-webkit-details-marker]:hidden">
          <span>🎯 순위는 어떻게 매겨지나요?</span>
          <span className="shrink-0 text-neutral-400 transition-transform duration-200 group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          <p>
            적중률 = 분석가가 건{" "}
            <strong className="font-semibold text-neutral-800 dark:text-neutral-200">
              픽(승무패·핸디캡·오버언더)이 실제 결과와 맞은 비율
            </strong>
            . “N적중”은 팀 승패가 아니라 픽이 맞은 횟수예요.
          </p>
          <p>
            순위는 단순 적중률(%)이 아니라{" "}
            <strong className="font-semibold text-neutral-800 dark:text-neutral-200">
              표본을 반영한 신뢰도 보정(Wilson 점수)
            </strong>
            으로 정렬 — 1경기 100%가 1등이 되지 않고, 꾸준히 많이 맞춘 분석가가 위로 올라갑니다.
          </p>
        </div>
      </details>

      {/* 탭 */}
      <div className="flex gap-2 mb-5">
        <Link
          href="/experts"
          className={`flex-1 text-center py-2.5 rounded-xl text-sm font-bold border transition ${
            !monthly
              ? "bg-rose-600 text-white border-rose-600"
              : "border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          전체 랭킹
        </Link>
        <Link
          href="/experts?tab=monthly"
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
        <div className="overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 divide-y divide-neutral-100 dark:divide-neutral-800/70">
          {rows.map((r, i) => (
            <ExpertRow key={r.userId} row={r} index={i} />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-400 text-center">
        {monthly ? "이번 달 채점 완료된 예측 기준" : "전체 기간 누적 · 경기 종료 후 자동 채점"}
      </p>
    </main>
  );
}
