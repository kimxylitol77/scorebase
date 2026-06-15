// 월드컵 '오늘의 베스트 XI' 4-2-3-1 피치 시각화 — team-of-day 페이지와 분석 글에서 공용.
import Link from "next/link";
import type { TodPlayer, TeamOfDay } from "@/lib/sports/thesports/team-of-day";

const koName = (p: TodPlayer) => p.name;

export default function TeamOfDayPitch({
  matches,
  xi,
}: {
  matches: TeamOfDay["matches"];
  xi: TodPlayer[];
}) {
  return (
    <>
      {/* 그날 경기 결과 */}
      <div className="flex flex-wrap justify-center gap-1.5 mb-4 text-[11px]">
        {matches.map((m, i) => (
          <span key={i} className="inline-flex items-center rounded-md bg-black/[0.05] dark:bg-white/10 px-2 py-1 text-neutral-600 dark:text-neutral-300">
            {m.homeKo} <strong className="mx-1 text-neutral-900 dark:text-white">{m.homeScore ?? "-"}:{m.awayScore ?? "-"}</strong> {m.awayKo}
          </span>
        ))}
      </div>

      {/* 피치 — 4-2-3-1 */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-emerald-700/40 shadow-2xl"
        style={{ aspectRatio: "3 / 4.2", background: "linear-gradient(to bottom, #0f5132 0%, #0c4429 50%, #0a3d27 100%)" }}>
        <div className="absolute inset-3 border-2 border-white/15 rounded-sm" />
        <div className="absolute left-3 right-3 top-1/2 border-t-2 border-white/15" />
        <div className="absolute left-1/2 top-1/2 w-24 h-24 -translate-x-1/2 -translate-y-1/2 border-2 border-white/15 rounded-full" />
        <div className="absolute left-1/2 bottom-3 w-32 h-12 -translate-x-1/2 border-2 border-t-0 border-white/15" />
        <div className="absolute left-1/2 top-3 w-32 h-12 -translate-x-1/2 border-2 border-b-0 border-white/15" />
        {xi.map((p, i) => {
          const inner = (
            <>
              <div className="relative w-14 h-14 rounded-full ring-2 ring-white/80 overflow-hidden bg-neutral-800 flex items-center justify-center shadow-lg">
                {p.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logo} alt={koName(p)} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-black text-neutral-300">{koName(p).slice(0, 1)}</span>
                )}
                {p.goals > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-amber-400 text-neutral-900 text-[9px] font-black ring-1 ring-white">⚽{p.goals > 1 ? p.goals : ""}</span>
                )}
              </div>
              <div className="mt-1 px-0.5 text-[11px] font-bold leading-tight text-center w-full break-keep text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                <span className="mr-0.5 align-middle">{p.flag}</span>{koName(p)}{p.captain && <span className="ml-0.5 text-amber-300">©</span>}
              </div>
              <div className="text-amber-400 text-[10px] leading-none tracking-tight">{"★".repeat(p.star)}<span className="text-white/25">{"★".repeat(5 - p.star)}</span></div>
              <div className="mt-0.5 inline-flex items-center rounded bg-emerald-500/20 px-1 text-[9px] font-bold text-emerald-300 leading-tight">평점 {p.rating.toFixed(1)}</div>
            </>
          );
          return (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%`, width: "88px" }}>
              {p.hasMv ? (
                <Link href={`/transfers/${p.id}`} className="flex flex-col items-center hover:opacity-80 transition" title={`${koName(p)} 시장가치·이적 보기`}>{inner}</Link>
              ) : (
                <div className="flex flex-col items-center">{inner}</div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
