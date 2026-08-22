// 경기 상세 배당 섹션 맨 위 — 베트맨(스포츠토토 프로토) 승무패 배당 + 국내 투표 분포 + 해외 평균 한 줄.
// 국내 여론과 해외 시장의 괴리를 바로 보여주는 이 사이트만의 무기 (2026-08-22 리뷰 M4).

import Link from "next/link";
import type { BetmanMatchLine } from "@/lib/odds/betman";

interface Props {
  line: BetmanMatchLine;
  homeNameKo: string;
  awayNameKo: string;
  /** 해외 평균 배당 (있으면 나란히) */
  overseas: { home: number | null; draw: number | null; away: number | null; books: number | null } | null;
}

const f = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2));

export default function BetmanLineCard({ line, homeNameKo, awayNameKo, overseas }: Props) {
  const cols: Array<{ label: string; bm: number | null; os: number | null; vote: number | null }> = [
    { label: `${homeNameKo} 승`, bm: line.winAllot, os: overseas?.home ?? null, vote: line.votePct?.win ?? null },
    { label: "무", bm: line.drawAllot, os: overseas?.draw ?? null, vote: line.votePct?.draw ?? null },
    { label: `${awayNameKo} 승`, bm: line.loseAllot, os: overseas?.away ?? null, vote: line.votePct?.lose ?? null },
  ].filter((c) => c.bm != null);

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-3 sm:p-4">
      <header className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[12px] font-bold">
          베트맨 승부식 <span className="text-[10px] font-medium text-neutral-500">국내 합법 · 프로토 {line.gmTs}회차</span>
        </div>
        <Link href="/odds?sport=betman" className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
          전체 발매 →
        </Link>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] tabular-nums">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-neutral-500">
              <th className="text-left font-semibold py-1">결과</th>
              <th className="text-right font-semibold py-1">베트맨</th>
              <th className="text-right font-semibold py-1">국내 투표</th>
              {overseas && <th className="text-right font-semibold py-1">해외 {overseas.books ? `${overseas.books}곳` : ""} 평균</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-white/10">
            {cols.map((c) => {
              const gap = c.bm != null && c.os != null ? c.bm - c.os : null;
              return (
                <tr key={c.label}>
                  <td className="py-1.5 pr-2 font-medium truncate max-w-[9rem]">{c.label}</td>
                  <td className="py-1.5 text-right font-bold">{f(c.bm)}</td>
                  <td className="py-1.5 text-right">{c.vote == null ? "—" : `${c.vote.toFixed(0)}%`}</td>
                  {overseas && (
                    <td className="py-1.5 text-right text-neutral-600 dark:text-neutral-300">
                      {f(c.os)}
                      {gap != null && Math.abs(gap) >= 0.1 && (
                        <span className={`ml-1 text-[10px] ${gap > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {gap > 0 ? "+" : ""}{gap.toFixed(2)}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px] text-neutral-400 break-keep">
        베트맨 배당은 회차 발매 시점 값이며 실제 구매 배당과 다를 수 있습니다. 해외 평균 대비 차이(+)는 베트맨이 더 높은 배당을 뜻합니다. 베팅을 권유하지 않습니다.
      </p>
    </section>
  );
}
