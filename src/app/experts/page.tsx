// 예측 전문가 순위 — 분석가·회원 적중률 랭킹(Wilson 점수 하한 정렬).
import type { Metadata } from "next";
import Link from "next/link";
import { getOverallRanking, getMonthlyRanking, type RankRow } from "@/lib/analysis/ranking";
import { prisma } from "@/lib/db";
import ExpertRow from "@/components/experts/ExpertRow";
import AiBenchmark from "@/components/experts/AiBenchmark";
import { Trophy, Target } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "예측 전문가 순위",
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
  // 팔로워 수 — 보조 지표 (0이면 행에서 숨김). 주 랭킹은 Wilson 적중률 유지.
  const followCounts = await prisma.userAnalystFollow.groupBy({
    by: ["analystId"],
    _count: true,
  });
  const followerMap = new Map(followCounts.map((f) => [f.analystId, f._count]));

  return (
    <main className="relative max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      {/* 앰비언트 배경 */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[440px] overflow-hidden">
        <div className="absolute -top-40 left-[15%] h-96 w-96 rounded-full bg-rose-500/10 blur-[130px] dark:bg-rose-500/15" />
        <div className="absolute -top-32 right-[12%] h-[26rem] w-[26rem] rounded-full bg-emerald-500/[0.06] blur-[140px] dark:bg-emerald-500/10" />
      </div>

      <div className="mb-5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 예측 전문가
        </span>
        <h1 className="mt-4 flex items-center gap-2 text-3xl sm:text-4xl font-bold tracking-tight break-keep">
          <Trophy className="h-7 w-7 shrink-0 text-amber-500" aria-hidden /> 예측 전문가 순위
        </h1>
        <p className="mt-3 text-sm text-neutral-500 leading-relaxed break-keep">
          회원들의 <strong className="text-neutral-700 dark:text-neutral-300">실제 예측 적중률</strong> 랭킹.
          경기 종료 후 자동 채점되는 정직한 순위표입니다.
        </p>
      </div>

      {/* 채점 방식 안내 — "승률"로 오해 방지 */}
      <details className="group my-5 rounded-2xl bg-white/60 px-5 py-4 ring-1 ring-black/5 backdrop-blur dark:bg-white/[0.04] dark:ring-white/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-neutral-800 dark:text-neutral-200 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><Target className="h-4 w-4 shrink-0 text-rose-500" aria-hidden /> 순위는 어떻게 매겨지나요?</span>
          <span className="shrink-0 text-neutral-400 transition-transform duration-300 group-open:rotate-45">
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

      {/* AI 원탁 벤치마크 — AI 를 이긴 회원 수 */}
      <AiBenchmark memberRows={rows} />

      {/* 탭 */}
      <div className="flex gap-2 mb-5">
        <Link
          href="/experts"
          className={`flex-1 text-center py-2.5 rounded-full text-sm font-bold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            !monthly
              ? "bg-rose-600 text-white ring-rose-600 shadow-[0_8px_24px_-10px_rgba(225,29,72,0.6)]"
              : "bg-white/60 text-neutral-500 ring-black/10 hover:bg-white dark:bg-white/5 dark:ring-white/15 dark:hover:bg-white/10"
          }`}
        >
          전체 랭킹
        </Link>
        <Link
          href="/experts?tab=monthly"
          className={`flex-1 text-center py-2.5 rounded-full text-sm font-bold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            monthly
              ? "bg-rose-600 text-white ring-rose-600 shadow-[0_8px_24px_-10px_rgba(225,29,72,0.6)]"
              : "bg-white/60 text-neutral-500 ring-black/10 hover:bg-white dark:bg-white/5 dark:ring-white/15 dark:hover:bg-white/10"
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
        <div className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-black/5 shadow-[0_28px_70px_-34px_rgba(15,23,30,0.35)] divide-y divide-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:divide-white/5 dark:shadow-none">
          {rows.map((r, i) => (
            <ExpertRow
              key={r.userId}
              row={r}
              index={i}
              followers={followerMap.get(r.userId) ?? 0}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-400 text-center">
        {monthly ? "이번 달 채점 완료된 예측 기준" : "전체 기간 누적 · 경기 종료 후 자동 채점"}
      </p>
    </main>
  );
}
