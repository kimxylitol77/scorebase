// /experts 상단 "AI 원탁 벤치마크" — 6개 AI의 채점 적중률을 회원 랭킹 위에 세우고,
// 기준 AI(표본 30건+ 중 최고 적중률)를 이긴 회원 수를 헤드라인으로 보여준다.
// "AI를 이긴 회원 N명" 자체가 가입·참여 동기 = 전환 콘텐츠.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { predictedBeforeKickoff } from "@/lib/predict/scorecard-eligibility";
import type { RankRow } from "@/lib/analysis/ranking";

const RANK_MIN = 30; // 소표본 왜곡 방지 — 성적표와 동일 기준
const MEMBER_MIN = 10; // "AI를 이긴 회원" 집계 최소 표본

const AI_META: Record<string, { label: string; order: number }> = {
  scorebase: { label: "스코어베이스", order: 0 },
  gpt: { label: "GPT-5.6 Sol", order: 1 },
  grok: { label: "Grok", order: 2 },
  gemini: { label: "Gemini", order: 3 },
  "qwen2.5-32b": { label: "Qwen", order: 4 },
  claude: { label: "Claude", order: 5 },
  "kimi-k3": { label: "Kimi K3", order: 6 },
};

export default async function AiBenchmark({ memberRows }: { memberRows: RankRow[] }) {
  const rows = await prisma.aiPrediction.findMany({
    where: { correct: { not: null }, published: true },
    select: { model: true, correct: true, predictedAt: true, match: { select: { startTime: true } } },
  });
  const tally = new Map<string, { total: number; hit: number }>();
  for (const r of rows) {
    if (!predictedBeforeKickoff(r)) continue;
    const m = r.model.startsWith("gpt-") ? "gpt" : r.model;
    if (!AI_META[m]) continue;
    const t = tally.get(m) ?? { total: 0, hit: 0 };
    t.total++;
    if (r.correct) t.hit++;
    tally.set(m, t);
  }
  const ais = [...tally.entries()]
    .map(([model, t]) => ({ model, ...AI_META[model], ...t, rate: t.total > 0 ? t.hit / t.total : 0 }))
    .sort((a, b) => a.order - b.order);
  const qualified = ais.filter((a) => a.total >= RANK_MIN).sort((a, b) => b.rate - a.rate);
  const benchmark = qualified[0];
  if (!benchmark) return null;

  const beaters = memberRows.filter((r) => r.total >= MEMBER_MIN && r.rate > benchmark.rate).length;

  return (
    <section className="my-5 rounded-2xl bg-gradient-to-br from-emerald-500/[0.06] to-sky-500/[0.06] p-5 ring-1 ring-emerald-500/15 dark:from-emerald-500/10 dark:to-sky-500/10">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-400">
          AI 원탁 벤치마크
        </h2>
        <Link href="/predictions/scorecard" className="text-[12px] text-neutral-400 underline-offset-2 hover:underline">
          AI 성적표 전체 보기
        </Link>
      </div>

      <p className="mt-2 text-[15px] text-neutral-700 dark:text-neutral-300 break-keep">
        현재 최고 성적 AI는 <strong>{benchmark.label}</strong>({(benchmark.rate * 100).toFixed(1)}%,{" "}
        {benchmark.hit}/{benchmark.total}) —{" "}
        {beaters > 0 ? (
          <>이 AI보다 적중률이 높은 회원이 <strong className="text-emerald-700 dark:text-emerald-400">{beaters}명</strong> 있습니다.</>
        ) : (
          <>아직 이 AI를 이긴 회원(표본 {MEMBER_MIN}건 이상)이 없습니다. <strong>첫 주인공에 도전해 보세요.</strong></>
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ais.map((a) => (
          <span
            key={a.model}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ring-1 ${
              a.model === benchmark.model
                ? "bg-emerald-500/10 font-bold text-emerald-700 ring-emerald-500/25 dark:text-emerald-300"
                : "bg-white/60 text-neutral-600 ring-black/5 dark:bg-white/[0.05] dark:text-neutral-300 dark:ring-white/10"
            }`}
          >
            {a.label}
            <span className="tabular-nums opacity-80">
              {a.total >= RANK_MIN ? `${(a.rate * 100).toFixed(1)}%` : `표본 ${a.total}건`}
            </span>
          </span>
        ))}
      </div>

      <p className="mt-3 text-[12px] text-neutral-500 dark:text-neutral-400 break-keep">
        AI 픽과 회원 픽은 같은 기준(경기 종료 후 자동 채점)으로 집계됩니다. 픽을 남기면 이 보드에서 AI와 직접 비교됩니다.
      </p>
    </section>
  );
}
