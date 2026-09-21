// 회차별 AI 적중률 카드 — 기본형(승무패·승패) 우리 1X2 픽을 베트맨 공식 판정으로 채점한 결과.
// 적특·미판정은 분모에서 뺀다(집계는 lib/odds/betman-result.summarizeRound). 픽센터의 "회차별 적중률" 대응, 근거는 우리 모델.

import Link from "next/link";
import type { BetmanRoundScore } from "@/lib/odds/betman";

const SPORT_LABEL: Record<string, string> = { SC: "축구", BS: "야구", BK: "농구", VL: "배구" };

const pct = (hit: number, scored: number) => (scored > 0 ? Math.round((hit / scored) * 1000) / 10 : null);

export default function BetmanRoundScorecard({ cards, current }: { cards: BetmanRoundScore[]; current: number | null }) {
  const shown = cards.filter((c) => c.summary.total > 0);
  if (shown.length === 0) return null;
  const all = shown.reduce((a, c) => ({ hit: a.hit + c.summary.hit, scored: a.scored + c.summary.scored }), { hit: 0, scored: 0 });
  const allPct = pct(all.hit, all.scored);
  return (
    <section className="mt-4 rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-bold">
          회차별 AI 적중률
          <span className="ml-1.5 text-[11px] font-medium text-neutral-500">승무패·승패 · 베트맨 공식 판정 기준</span>
        </h2>
        {allPct != null && (
          <span className="text-[12px] tabular-nums text-neutral-600 dark:text-neutral-300">
            최근 {shown.length}회차 <strong className="font-bold text-neutral-900 dark:text-white">{allPct}%</strong>
            <span className="text-neutral-400"> ({all.hit}/{all.scored})</span>
          </span>
        )}
      </header>
      <ul className="space-y-1.5">
        {shown.map((c) => {
          const s = c.summary;
          const p = pct(s.hit, s.scored);
          const active = current === c.gmTs;
          const sports = Object.entries(s.bySport)
            .filter(([, v]) => v.scored > 0)
            .map(([k, v]) => `${SPORT_LABEL[k] ?? k} ${v.hit}/${v.scored}`)
            .join(" · ");
          return (
            <li key={c.gmTs}>
              <Link
                href={`/odds?sport=betman&round=${c.gmTs}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 transition hover:bg-neutral-50 dark:hover:bg-white/[0.04] ${
                  active ? "bg-neutral-50 ring-1 ring-neutral-200 dark:bg-white/[0.06] dark:ring-white/10" : ""
                }`}
              >
                <span className="w-16 shrink-0 text-[12px] font-semibold tabular-nums">{c.gmTs % 10000}회차</span>
                <span className="relative h-2.5 min-w-[120px] grow basis-[160px] overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  {p != null && <span style={{ width: `${p}%` }} className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" />}
                </span>
                <span className="w-24 shrink-0 text-right text-[12px] tabular-nums">
                  {p != null ? (
                    <>
                      <strong className="font-bold">{p}%</strong>
                      <span className="text-neutral-400"> {s.hit}/{s.scored}</span>
                    </>
                  ) : (
                    <span className="text-neutral-400">판정 대기</span>
                  )}
                </span>
                <span className="basis-full text-[10px] text-neutral-400 sm:basis-auto">
                  {sports}
                  {s.pending > 0 && ` · 대기 ${s.pending}`}
                  {s.void > 0 && ` · 적특 ${s.void}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] leading-relaxed text-neutral-400 break-keep">
        경기 전 저장된 우리 1X2 픽을 베트맨이 발표한 판정과 대조합니다. 적특(취소·환불)과 미판정 경기는 분모에서 뺍니다. 핸디캡·언더오버는
        베트맨 라인이 우리 기준선과 달라 여기서는 채점하지 않습니다. 시즌 전체 시장별 적중률은{" "}
        <Link href="/predictions/accuracy" className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-200">
          적중률 페이지
        </Link>
        에 있습니다.
      </p>
    </section>
  );
}
