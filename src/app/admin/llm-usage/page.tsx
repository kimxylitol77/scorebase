// /admin/llm-usage — AI(LLM) 토큰·비용 계기판.
// LlmUsageStat 버킷을 태그·모델별로 합산하고 단가표로 환산해 보여준다.
// 인증은 admin/layout.tsx 가 담당하므로 여기서 다시 검사하지 않는다.

import Link from "next/link";
import { llmUsageSince, llmUsageDaily } from "@/lib/ai/usage-track";

// 30초 ISR — cron 주기(시간 단위)라 실시간일 필요가 없다. /admin/health 와 같은 정책.
export const revalidate = 30;

const RANGES = [
  { days: 1, label: "24시간" },
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
];

const nf = new Intl.NumberFormat("ko-KR");

/** 아주 작은 금액이 0 으로 보이지 않게 자릿수를 늘린다. */
function usd(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

export default async function LlmUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days = RANGES.some((r) => String(r.days) === sp.days) ? Number(sp.days) : 7;

  const [rows, daily] = await Promise.all([
    llmUsageSince(days * 24),
    llmUsageDaily(days),
  ]);

  const totalCost = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
  const totalIn = rows.reduce((s, r) => s + r.inTokens, 0);
  const totalOut = rows.reduce((s, r) => s + r.outTokens, 0);
  const unpriced = rows.filter((r) => r.costUsd == null);

  // 관측 구간이 짧을 때 월 환산이 과대·과소로 튀지 않게 실제 관측 일수로 나눈다.
  const observedDays = Math.max(daily.length, 1);
  const monthly = (totalCost / observedDays) * 30;
  const maxDailyCost = Math.max(...daily.map((d) => d.costUsd), 0.000001);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI 비용</h1>
          <p className="mt-1 text-sm text-neutral-500">
            글 생성·브리핑 등 LLM 호출의 토큰과 비용. 태그는 호출한 cron 기준.
          </p>
        </div>
        <nav className="flex gap-1.5">
          {RANGES.map((r) => (
            <Link
              key={r.days}
              href={`/admin/llm-usage?days=${r.days}`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                r.days === days
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* 요약 — 모바일 1열. 브레이크포인트 display 토글(sm:grid)은 사이트 규칙상 지양해 flex 로 짠다. */}
      <section className="flex flex-col sm:flex-row gap-3">
        <SummaryCard
          label={`최근 ${days === 1 ? "24시간" : `${days}일`} 비용`}
          value={usd(totalCost)}
          sub={`월 환산 약 ${usd(monthly)}`}
          accent
        />
        <SummaryCard label="호출" value={nf.format(totalCalls)} sub="건" />
        <SummaryCard
          label="토큰"
          value={nf.format(totalIn + totalOut)}
          sub={`입력 ${nf.format(totalIn)} · 출력 ${nf.format(totalOut)}`}
        />
      </section>

      {unpriced.length > 0 && (
        <p className="text-sm rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 px-4 py-3">
          단가가 등록되지 않은 모델 {unpriced.length}종(
          {[...new Set(unpriced.map((r) => r.model))].join(", ")})이 있어 실제 비용은 이보다
          큽니다. <code>src/lib/ai/usage-track.ts</code> 의 단가표에 추가하면 과거분까지 다시
          계산됩니다.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
          이 기간에 기록된 LLM 호출이 없습니다. 계측은 2026-08-17 부터 시작됐고, 글 생성
          cron 이 돌면 쌓입니다.
        </p>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-semibold mb-3">일별 추이</h2>
            <ul className="space-y-1.5">
              {daily.map((d) => (
                <li key={d.date} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 tabular-nums text-neutral-500">
                    {d.date.slice(5)}
                  </span>
                  <span className="flex-1 h-4 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <span
                      className="block h-full rounded bg-emerald-500/70 dark:bg-emerald-400/60"
                      style={{ width: `${Math.max((d.costUsd / maxDailyCost) * 100, 2)}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right tabular-nums font-medium">
                    {usd(d.costUsd)}
                    {/* 단가 미등록 모델이 섞인 날은 표시값이 실제보다 작다 */}
                    {d.hasUnpriced && (
                      <span className="text-amber-600 dark:text-amber-400" title="단가 미등록 모델 포함 — 실제보다 작음">
                        +
                      </span>
                    )}
                  </span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-neutral-500">
                    {nf.format(d.calls)}건
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">태그별 ({rows.length})</h2>
            <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-900/50 text-neutral-500">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">태그</th>
                    <th className="text-left font-medium px-4 py-2.5">모델</th>
                    <th className="text-right font-medium px-4 py-2.5">호출</th>
                    <th className="text-right font-medium px-4 py-2.5">입력</th>
                    <th className="text-right font-medium px-4 py-2.5">출력</th>
                    <th className="text-right font-medium px-4 py-2.5">비용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {rows.map((r) => (
                    <tr key={`${r.tag}-${r.model}`}>
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">{r.tag}</td>
                      <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">
                        {r.model.replace(/^claude-/, "").replace(/-\d{8}$/, "")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {nf.format(r.calls)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">
                        {nf.format(r.inTokens)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">
                        {nf.format(r.outTokens)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {r.costUsd == null ? (
                          <span className="text-neutral-400">단가 미등록</span>
                        ) : (
                          usd(r.costUsd)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              태그 <code>unknown</code> 은 cron 밖에서 돈 호출(스크립트 직접 실행 등)입니다.
              OpenAI 폴백 경로는 계측되지 않습니다.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex-1 rounded-xl border px-4 py-3.5 ${
        accent
          ? "border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10"
          : "border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50"
      }`}
    >
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>
    </div>
  );
}
