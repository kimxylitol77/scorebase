// 팀 능력치 레이더 섹션 — 리그 안 순위 5축(공격·수비·전력·폼·원정)을 SVG 레이더 + 축별 맞대결 막대로.
// 다음 경기 상대가 같은 리그면 겹쳐 그리고(예측 연동), 없으면 리그 중간(50) 점선 링과 비교한다.
// 레이더는 서버에서 그리는 순수 SVG — recharts 는 hydration 시 0 에서 멈추는 함정이 있고 JS 도 필요 없다.
import Link from "next/link";
import { ArrowRight, Radar, TrendingDown, TrendingUp } from "lucide-react";
import { RADAR_MIN_PLAYED, radarSummary, type RadarRow, type TeamRadar } from "@/lib/predict/team-radar";

export interface RadarOpponent {
  name: string;
  radar: TeamRadar;
  href: string;
  dateLabel: string;
}

const rankText = (r: RadarRow) => (r.rank == null ? "—" : `${r.tied ? "공동 " : ""}${r.rank}위`);

// ── SVG 레이더 ─────────────────────────────────────────────
const W = 360;
const H = 330;
const CX = W / 2;
const CY = 170;
const R = 118;

function point(i: number, n: number, v: number): [number, number] {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const r = (R * Math.max(0, Math.min(100, v))) / 100;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
/** 축 라벨 자리 — 바깥 링(R)보다 gap 만큼 밖. point() 는 값을 100 에서 자르므로 따로 둔다. */
function labelPoint(i: number, n: number, gap: number): [number, number] {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [CX + (R + gap) * Math.cos(a), CY + (R + gap) * Math.sin(a)];
}
const poly = (vals: number[]) => vals.map((v, i) => point(i, vals.length, v).map((x) => x.toFixed(1)).join(",")).join(" ");

function RadarSvg({ rows, opp, teamName, oppName }: { rows: RadarRow[]; opp: RadarRow[] | null; teamName: string; oppName: string | null }) {
  const n = rows.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[420px]" role="img" aria-label={`${teamName} 능력치 레이더${oppName ? ` — ${oppName} 비교` : ""}`}>
      {/* 링 — 25·75·100 실선, 50(리그 중간) 점선 */}
      {[25, 75, 100].map((v) => (
        <polygon key={v} points={poly(Array(n).fill(v))} className="fill-none stroke-neutral-200 dark:stroke-white/10" strokeWidth={1} />
      ))}
      <polygon points={poly(Array(n).fill(50))} className="fill-none stroke-neutral-400 dark:stroke-white/30" strokeWidth={1} strokeDasharray="3 3" />
      {rows.map((_, i) => {
        const [x, y] = point(i, n, 100);
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} className="stroke-neutral-200 dark:stroke-white/10" strokeWidth={1} />;
      })}
      {opp && (
        <polygon points={poly(opp.map((r) => r.value))} className="fill-cyan-500/10 stroke-cyan-500 dark:stroke-cyan-400" strokeWidth={1.5} strokeLinejoin="round" />
      )}
      <polygon points={poly(rows.map((r) => r.value))} className="fill-rose-500/25 stroke-rose-500 dark:fill-rose-400/25 dark:stroke-rose-400" strokeWidth={2} strokeLinejoin="round" />
      {rows.map((r, i) => {
        const [x, y] = point(i, n, r.value);
        return <circle key={i} cx={x} cy={y} r={3.5} className="fill-rose-500 stroke-white dark:fill-rose-400 dark:stroke-[#0a0a0a]" strokeWidth={1.5} />;
      })}
      {/* 축 라벨 + 순위 */}
      {rows.map((r, i) => {
        const [x, y] = labelPoint(i, n, 14);
        const anchor = Math.abs(x - CX) < 8 ? "middle" : x > CX ? "start" : "end";
        // 위 꼭짓점은 두 줄(축·순위)이 링 위로 올라가게, 아래 꼭짓점은 링 아래로
        const dy = y < CY - 40 ? -14 : y > CY + 40 ? 6 : -4;
        return (
          <text key={r.axis} x={x} y={y + dy} textAnchor={anchor} className="fill-neutral-700 dark:fill-white/80" style={{ fontSize: 12, fontWeight: 600 }}>
            {r.axis}
            <tspan x={x} dy={14} className="fill-rose-600 dark:fill-rose-400" style={{ fontSize: 11, fontWeight: 700 }}>
              {rankText(r)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

// ── 섹션 ───────────────────────────────────────────────────
export default function TeamRadarSection({
  teamName,
  radar,
  opponent,
  seasonNote,
}: {
  teamName: string;
  radar: TeamRadar | null;
  opponent: RadarOpponent | null;
  /** 지난 시즌 경기로 계산했을 때 그 사실 — 현재 값처럼 보이지 않게 */
  seasonNote: string | null;
}) {
  const card =
    "rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6 dark:bg-white/[0.04] dark:shadow-none dark:ring-white/10";
  const header = (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="team-radar-h" className="flex items-center gap-2 text-xl font-bold tracking-tight text-zinc-950 break-keep dark:text-white">
          <Radar className="h-5 w-5 text-rose-500" aria-hidden />
          팀 능력치
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 break-keep dark:text-white/50">
          같은 리그 팀들 사이 순위를 0~100으로 — 1위 100 · 꼴찌 0
          {seasonNote && <span className="text-amber-600 dark:text-amber-400"> · {seasonNote}</span>}
        </p>
      </div>
      {radar && (
        <div className="flex items-center gap-3 text-[11px] font-medium text-zinc-600 dark:text-white/60">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden /> {teamName}
          </span>
          {opponent && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-cyan-500" aria-hidden /> {opponent.name}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-t border-dashed border-neutral-400" aria-hidden /> 리그 중간
          </span>
        </div>
      )}
    </div>
  );

  if (!radar) {
    return (
      <section aria-labelledby="team-radar-h" className={card}>
        {header}
        <p className="rounded-2xl bg-neutral-50 px-4 py-6 text-center text-sm text-zinc-500 break-keep dark:bg-white/[0.03] dark:text-white/50">
          리그 경기가 {RADAR_MIN_PLAYED}경기 이상 쌓이면 리그 안 공격·수비·전력·폼·원정 순위를 그립니다.
        </p>
      </section>
    );
  }

  // 강점·약점 — 값이 뚜렷한 축만(60 이상·40 이하), 각 2개까지
  const sorted = [...radar.rows].filter((r) => r.rank != null).sort((a, b) => b.value - a.value);
  const strong = sorted.filter((r) => r.value >= 60).slice(0, 2);
  const weak = sorted.filter((r) => r.value <= 40).reverse().slice(0, 2);
  const opp = opponent?.radar.rows ?? null;
  const ahead = opp ? radar.rows.filter((r, i) => r.value > opp[i].value).length : 0;

  return (
    <section aria-labelledby="team-radar-h" className={card}>
      {header}

      {(strong.length > 0 || weak.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {strong.map((r) => (
            <span key={r.axis} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden /> 강점 {r.axis} {rankText(r)}
            </span>
          ))}
          {weak.map((r) => (
            <span key={r.axis} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-3 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-500/20 dark:text-white/60">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden /> 약점 {r.axis} {rankText(r)}
            </span>
          ))}
        </div>
      )}

      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <RadarSvg rows={radar.rows} opp={opp} teamName={teamName} oppName={opponent?.name ?? null} />

        <div>
          {opponent && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-white/[0.03]">
              <div className="text-sm text-zinc-700 break-keep dark:text-white/80">
                <span className="text-xs text-zinc-500 dark:text-white/50">다음 경기 {opponent.dateLabel} · </span>
                vs <span className="font-semibold">{opponent.name}</span>
                <span className="ml-2 font-bold tabular-nums text-rose-600 dark:text-rose-400">5개 축 중 {ahead}개 우세</span>
              </div>
              <Link
                href={opponent.href}
                prefetch={false}
                className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-rose-600"
              >
                경기 예측 <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}

          <ul className="space-y-3.5">
            {radar.rows.map((r, i) => {
              const o = opp?.[i];
              const lead = o ? (r.value > o.value ? "me" : r.value < o.value ? "opp" : null) : null;
              return (
                <li key={r.axis}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-white">{r.axis}</span>
                    <span className="text-xs tabular-nums text-zinc-500 dark:text-white/50">
                      <span className={lead === "me" ? "font-bold text-rose-600 dark:text-rose-400" : ""}>{r.of}팀 중 {rankText(r)}</span>
                      {o && (
                        <>
                          <span className="mx-1.5 text-zinc-300 dark:text-white/20">|</span>
                          <span className={lead === "opp" ? "font-bold text-cyan-700 dark:text-cyan-400" : ""}>상대 {rankText(o)}</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="relative mt-1.5 space-y-1" aria-hidden>
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
                      <div className="h-full rounded-full bg-rose-500 dark:bg-rose-400" style={{ width: `${Math.max(r.value, 2)}%` }} />
                    </div>
                    {o && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
                        <div className="h-full rounded-full bg-cyan-500/70 dark:bg-cyan-400/70" style={{ width: `${Math.max(o.value, 2)}%` }} />
                      </div>
                    )}
                    {/* 리그 중간 눈금 */}
                    <span className="absolute left-1/2 top-[-2px] h-[calc(100%+4px)] w-px bg-neutral-400/60 dark:bg-white/25" />
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-zinc-500 dark:text-white/45">{r.raw}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <p className="mt-5 border-t border-black/5 pt-3 text-[11px] leading-relaxed text-zinc-500 break-keep dark:border-white/10 dark:text-white/45">
        {radarSummary(radar)}. 공격·수비는 경기당 득실, 전력은 Elo 레이팅, 최근 폼은 최근 5경기 승점, 원정은 원정 경기당
        승점(무승부 없는 종목은 승률) 기준입니다. 막대 가운데 선이 리그 중간입니다.
      </p>
    </section>
  );
}
