// 고급 지표 (영어판). scripts/en-mirror 로 자동 생성.

export interface AdvMetrics { xg: number; xa: number; touches: number; bigChances: number; apps: number }

function Tile({ label, main, sub }: { label: string; main: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-3.5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="text-[11px] text-neutral-500 mb-1">{label}</div>
      <div className="text-lg font-bold tabular-nums">{main}</div>
      {sub && <div className="text-[11px] mt-0.5 tabular-nums">{sub}</div>}
    </div>
  );
}

// xG 대비 실득점 차이 표기 (+초과달성 / -기대미달)
function diffText(actual: number, expected: number): string {
  const d = Math.round((actual - expected) * 10) / 10;
  const sign = d > 0 ? "+" : "";
  const cls = d > 0 ? "above" : d < 0 ? "below" : "in line";
  return `actual ${actual} (${sign}${d}, expected ${cls})`;
}

export default function PlayerAdvancedMetrics({ adv, goals, assists }: { adv: AdvMetrics; goals: number; assists: number }) {
  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">Advanced metrics</span>
        </h2>
        <span className="text-[11px] text-neutral-400">Expected values (xG·xA) · {adv.apps}Apps</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Expected goals (xG)" main={adv.xg.toFixed(1)} sub={diffText(goals, adv.xg)} />
        <Tile label="Expected assists (xA)" main={adv.xa.toFixed(1)} sub={diffText(assists, adv.xa)} />
        <Tile label="Big chances created" main={String(adv.bigChances)} />
        <Tile label="Touches" main={adv.touches.toLocaleString()} />
      </div>
      <p className="text-[11px] text-neutral-400 mt-3">Per-match expected values from TheStatsAPI (Premier League and Serie A only).</p>
    </section>
  );
}
