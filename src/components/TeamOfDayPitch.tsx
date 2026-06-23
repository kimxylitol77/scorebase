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
        {/* 피치 마킹 — 단일 SVG 오버레이. viewBox(30×42 = 컨테이너 3/4.2 비율)가 통째로
            스케일되므로 폭과 무관하게 선수(%)와 같은 비율 유지(기존 고정 px 마킹은 폭이 바뀌면 비율 어긋남). */}
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox="0 0 30 42"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          fill="none"
          stroke="white"
          strokeOpacity={0.15}
          strokeWidth={0.13}
        >
          {/* 외곽선 + 중앙선 */}
          <rect x="0.8" y="0.8" width="28.4" height="40.4" rx="0.5" />
          <line x1="0.8" y1="21" x2="29.2" y2="21" />
          {/* 센터 서클 */}
          <circle cx="15" cy="21" r="3.1" />
          {/* 페널티 박스 (위/아래 — 골라인 쪽은 외곽선과 만나는 3면) */}
          <path d="M10.85 3.9 L10.85 0.8 L19.15 0.8 L19.15 3.9" />
          <path d="M10.85 38.1 L10.85 41.2 L19.15 41.2 L19.15 38.1" />
        </svg>
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
