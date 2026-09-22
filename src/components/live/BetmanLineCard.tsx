// 경기 상세 배당 섹션 맨 위 — 베트맨(스포츠토토 프로토) 승무패 배당 + 국내 투표 분포 + 해외 평균 한 줄.
// 국내 여론과 해외 시장의 괴리를 바로 보여주는 이 사이트만의 무기 (2026-08-22 리뷰 M4).
// 2026-09-22: 초기(회차 첫 배당)·현재·해외 3열 + "이 배당대 역대 결과" 한 줄 — 톡티 벳스코어 대응.

import Link from "next/link";
import type { BetmanMatchLine } from "@/lib/odds/betman";
import type { OddsBandRow } from "@/lib/predict/odds-band-stats";

interface Props {
  line: BetmanMatchLine;
  homeNameKo: string;
  awayNameKo: string;
  /** 해외 평균 배당 (있으면 나란히) */
  overseas: { home: number | null; draw: number | null; away: number | null; books: number | null } | null;
  /** 인기픽 배당 구간의 역대 적중률(해외 평균 배당 기준 채점 경기) — 없으면 줄 생략 */
  band?: OddsBandRow | null;
}

const f = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2));
const pct = (a: number, n: number) => (n > 0 ? `${((a / n) * 100).toFixed(1)}%` : "—");

/** 초기 → 현재 방향. 오른 쪽 ▲(rose)·내린 쪽 ▼(blue) — /odds 카드와 같은 관행. */
function Move({ from, to }: { from: number | null; to: number | null }) {
  if (from == null || to == null || from === to) return null;
  const up = to > from;
  return (
    <span className={`ml-0.5 text-[9px] font-bold ${up ? "text-rose-500" : "text-blue-500"}`} aria-label={up ? "초기 대비 상승" : "초기 대비 하락"}>
      {up ? "▲" : "▼"}
    </span>
  );
}

export default function BetmanLineCard({ line, homeNameKo, awayNameKo, overseas, band }: Props) {
  const hasOpening = line.opening != null;
  const cols: Array<{ label: string; open: number | null; bm: number | null; os: number | null; vote: number | null }> = [
    { label: `${homeNameKo} 승`, open: line.opening?.win ?? null, bm: line.winAllot, os: overseas?.home ?? null, vote: line.votePct?.win ?? null },
    { label: "무", open: line.opening?.draw ?? null, bm: line.drawAllot, os: overseas?.draw ?? null, vote: line.votePct?.draw ?? null },
    { label: `${awayNameKo} 승`, open: line.opening?.lose ?? null, bm: line.loseAllot, os: overseas?.away ?? null, vote: line.votePct?.lose ?? null },
  ].filter((c) => c.bm != null);

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-3 sm:p-4">
      <header className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[12px] font-bold">
          베트맨 승부식 <span className="text-[10px] font-medium text-neutral-500">국내 합법 · 프로토 {line.gmTs % 10000}회차 #{line.matchSeq}</span>
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
              {hasOpening && <th className="text-right font-semibold py-1" title="회차 발매 시작 시점 배당">초기</th>}
              <th className="text-right font-semibold py-1">{hasOpening ? "현재" : "베트맨"}</th>
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
                  {hasOpening && <td className="py-1.5 text-right text-neutral-500">{f(c.open)}</td>}
                  <td className="py-1.5 text-right font-bold">
                    {f(c.bm)}
                    {hasOpening && <Move from={c.open} to={c.bm} />}
                  </td>
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
      {band && (
        // 이 배당대 역대 결과 — 인기픽(최저 배당) 구간별 채점 경기의 실제 적중률. 정배당·톡티의 "배당대 통계" 를 한 줄로.
        <p className="mt-2 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-[11px] text-neutral-600 dark:bg-white/[0.04] dark:text-neutral-300 break-keep">
          <span className="font-semibold">이 배당대({band.band}) 역대 결과</span> — 인기픽 적중 <strong>{pct(band.favCorrect, band.evaluated)}</strong>
          {" · "}우리 AI 적중 <strong>{pct(band.modelCorrect, band.evaluated)}</strong>
          <span className="text-neutral-400"> ({band.evaluated.toLocaleString()}경기, 해외 평균 배당 기준 채점)</span>
          {" · "}
          <Link href="/predictions/accuracy" className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 dark:hover:text-white">
            구간별 전체
          </Link>
        </p>
      )}
      <p className="mt-1.5 text-[10px] text-neutral-400 break-keep">
        {hasOpening ? `초기는 회차 발매 시작 배당, 변동 ${line.changeCount}회. ` : "베트맨 배당은 회차 발매 시점 값이며 실제 구매 배당과 다를 수 있습니다. "}
        해외 평균 대비 차이(+)는 베트맨이 더 높은 배당을 뜻합니다. 베팅을 권유하지 않습니다.
      </p>
    </section>
  );
}
