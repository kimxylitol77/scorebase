// 고급 지표 — xG·xA·빅찬스·터치 (TheStatsAPI 경기 집계, EPL·세리에A). 실제 골/도움과 비교.
// 데이터 있는 선수만(build-player-advanced-thestats.ts). FotMob식 xG 대비 실득점.

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
  const cls = d > 0 ? "초과" : d < 0 ? "미달" : "부합";
  return `실제 ${actual} (${sign}${d}, 기대 ${cls})`;
}

export default function PlayerAdvancedMetrics({ adv, goals, assists }: { adv: AdvMetrics; goals: number; assists: number }) {
  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">고급 지표</span>
        </h2>
        <span className="text-[11px] text-neutral-400">기대값(xG·xA) · {adv.apps}경기</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="기대 득점 (xG)" main={adv.xg.toFixed(1)} sub={diffText(goals, adv.xg)} />
        <Tile label="기대 도움 (xA)" main={adv.xa.toFixed(1)} sub={diffText(assists, adv.xa)} />
        <Tile label="빅찬스 창출" main={String(adv.bigChances)} />
        <Tile label="볼 터치" main={adv.touches.toLocaleString()} />
      </div>
      <p className="text-[11px] text-neutral-400 mt-3">TheStatsAPI 경기별 기대값 합산 (EPL·세리에A).</p>
    </section>
  );
}
