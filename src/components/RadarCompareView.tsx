// 선수 비교 공용 레이아웃 — 헤더 2명 + 레이더 오버레이 + 스탯 표. 축구·NBA·NHL·LOL 공용(종목별 page 가 정규화해 전달).
import Link from "next/link";
import { ArrowLeft, Repeat2 } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import ComparePlayerRadar from "@/components/ComparePlayerRadar";
import type { RadarAxis } from "@/lib/player-radar";

export interface CmpHead {
  id: string;
  name: string;
  photo: string | null;
  sub: string | null; // "포지션 · 팀 · 리그" 등
  valueEurM?: number | null; // 축구 시장가치(€M), 그 외 미사용
  href?: string | null; // 선수 페이지 링크(없으면 비링크)
}
export interface CmpStatRow {
  label: string;
  a: string;
  b: string;
  aBetter: boolean;
  bBetter: boolean;
}

const EUR_KRW = 1791.5;
function krw(eurM: number): string {
  const eok = (eurM * 1e6 * EUR_KRW) / 1e8;
  if (eok >= 10000) return (eok / 10000).toFixed(2) + "조";
  return Math.round(eok).toLocaleString() + "억";
}

function PlayerHead({ p, side }: { p: CmpHead; side: "A" | "B" }) {
  const accent = side === "A" ? "text-rose-600 dark:text-rose-400" : "text-cyan-600 dark:text-cyan-400";
  const ring = side === "A" ? "ring-rose-500/30" : "ring-cyan-500/30";
  const inner = (
    <>
      <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 overflow-hidden flex items-center justify-center ring-2 ${ring}`}>
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo} alt={p.name} className="w-full h-full object-cover transition group-hover:scale-105" />
        ) : (
          <span className="text-2xl font-bold text-neutral-500">{p.name.slice(0, 1)}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="font-bold text-lg sm:text-xl tracking-tight break-keep group-hover:underline">{p.name}</div>
        <div className="text-xs text-neutral-500 truncate">{p.sub || "—"}</div>
        {p.valueEurM != null && (
          <div className={`mt-1 text-sm font-black tabular-nums ${accent}`}>€{p.valueEurM}M <span className="font-normal text-neutral-400">{krw(p.valueEurM)}</span></div>
        )}
      </div>
    </>
  );
  return p.href ? (
    <Link href={p.href} className="flex flex-col items-center text-center gap-2 group min-w-0 flex-1">{inner}</Link>
  ) : (
    <div className="flex flex-col items-center text-center gap-2 min-w-0 flex-1">{inner}</div>
  );
}

export default function RadarCompareView({
  sport,
  a,
  b,
  axesA,
  axesB,
  radarNote,
  rows,
  caption,
  swapHref,
}: {
  sport: string;
  a: CmpHead;
  b: CmpHead;
  axesA: RadarAxis[] | null;
  axesB: RadarAxis[] | null;
  radarNote?: string | null;
  rows: CmpStatRow[];
  caption: string;
  swapHref: string;
}) {
  const bothRadar = !!axesA && !!axesB && axesA.length > 0 && axesA.length === axesB.length;
  return (
    <article className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-7">
      <AmbientGlow />
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/compare${sport === "SOCCER" ? "" : `?sport=${sport}`}`}
          className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden /> 선수 비교
        </Link>
        <Link href={swapHref} className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition" title="좌우 바꾸기">
          <Repeat2 className="h-3.5 w-3.5" aria-hidden /> 좌우 바꾸기
        </Link>
      </div>

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-500 mb-3 text-center">선수 비교</p>
        <div className="flex items-start gap-3">
          <PlayerHead p={a} side="A" />
          <span className="self-center text-sm font-black text-neutral-400 shrink-0 pt-8">VS</span>
          <PlayerHead p={b} side="B" />
        </div>
      </header>

      <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <h2 className="text-base font-bold tracking-tight mb-3">
          <span className="bg-gradient-to-r from-rose-500 to-cyan-500 bg-clip-text text-transparent">시즌 지표 레이더</span>
        </h2>
        {bothRadar ? (
          <>
            <ComparePlayerRadar axesA={axesA!} axesB={axesB!} nameA={a.name} nameB={b.name} />
            {radarNote && <p className="text-center text-[11px] text-amber-600 dark:text-amber-400 mt-1">{radarNote}</p>}
          </>
        ) : (
          <p className="text-sm text-neutral-500 py-8 text-center">{radarNote || "두 선수 모두 이번 시즌 기록이 있어야 레이더를 표시합니다."}</p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-sm dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold text-rose-600 dark:text-rose-400 w-1/3 truncate">{a.name}</th>
              <th className="px-2 py-2.5 text-center font-medium">지표</th>
              <th className="px-3 py-2.5 text-left font-semibold text-cyan-600 dark:text-cyan-400 w-1/3 truncate">{b.name}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className={`px-3 py-2.5 text-right tabular-nums ${r.aBetter ? "font-black text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}>{r.a}</td>
                <td className="px-2 py-2.5 text-center text-xs text-neutral-500 whitespace-nowrap">{r.label}</td>
                <td className={`px-3 py-2.5 text-left tabular-nums ${r.bBetter ? "font-black text-cyan-600 dark:text-cyan-400" : "text-neutral-700 dark:text-neutral-300"}`}>{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">{caption}</p>
    </article>
  );
}
