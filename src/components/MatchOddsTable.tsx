// 경기별 배당 표 (네임드 스타일) — 승무패 + 아시안 핸디캡 + 언더오버.
// 데이터: API-Sports(api-football). odds 는 live page 에서 fetchFixtureOdds 로 주입(enabled 정확화).
import type { FixtureOdds } from "@/lib/odds/api-sports-odds";

function best(map: Map<string, number[]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, arr] of map) out.set(k, Math.max(0, ...arr));
  return out;
}

export default function MatchOddsTable({ odds }: { odds: FixtureOdds }) {
  // ── 승무패 (북메이커 × 홈/무/원정) ──
  const mwRows = odds.bookmakers
    .map((b) => ({ name: b.name, v: b.markets.find((m) => m.name === "Match Winner")?.values ?? [] }))
    .filter((r) => r.v.length === 3);
  const cols = ["Home", "Draw", "Away"] as const;
  const ko: Record<string, string> = { Home: "홈", Draw: "무", Away: "원정" };
  const bestMw: Record<string, number> = { Home: 0, Draw: 0, Away: 0 };
  for (const r of mwRows) for (const v of r.v) bestMw[v.value] = Math.max(bestMw[v.value] ?? 0, parseFloat(v.odd) || 0);

  // ── 아시안 핸디캡 (라인별 최고배당) ── value: "Home -0.5" / "Away -0.5"
  const hcHome = new Map<string, number[]>();
  const hcAway = new Map<string, number[]>();
  for (const b of odds.bookmakers) {
    for (const v of b.markets.find((m) => m.name === "Asian Handicap")?.values ?? []) {
      const i = v.value.lastIndexOf(" ");
      const side = v.value.slice(0, i), line = v.value.slice(i + 1);
      const odd = parseFloat(v.odd) || 0;
      if (side === "Home") (hcHome.get(line) ?? hcHome.set(line, []).get(line)!).push(odd);
      else if (side === "Away") (hcAway.get(line) ?? hcAway.set(line, []).get(line)!).push(odd);
    }
  }
  const hcHomeBest = best(hcHome), hcAwayBest = best(hcAway);
  const hcLines = [...new Set([...hcHome.keys(), ...hcAway.keys()])]
    .sort((a, b) => parseFloat(a) - parseFloat(b)).slice(0, 6);

  // ── 언더오버 (라인별 최고배당) ── value: "Over 2.5" / "Under 2.5"
  const ouOver = new Map<string, number[]>();
  const ouUnder = new Map<string, number[]>();
  for (const b of odds.bookmakers) {
    for (const v of b.markets.find((m) => m.name === "Goals Over/Under")?.values ?? []) {
      const i = v.value.lastIndexOf(" ");
      const side = v.value.slice(0, i), line = v.value.slice(i + 1);
      const odd = parseFloat(v.odd) || 0;
      if (side === "Over") (ouOver.get(line) ?? ouOver.set(line, []).get(line)!).push(odd);
      else if (side === "Under") (ouUnder.get(line) ?? ouUnder.set(line, []).get(line)!).push(odd);
    }
  }
  const ouOverBest = best(ouOver), ouUnderBest = best(ouUnder);
  const ouLines = [...new Set([...ouOver.keys(), ...ouUnder.keys()])]
    .sort((a, b) => parseFloat(a) - parseFloat(b));

  const cell = "px-3 py-2 text-center tabular-nums";
  const headCls = "bg-neutral-50 dark:bg-neutral-900 text-[11px] uppercase tracking-wider text-neutral-500";

  return (
    <div className="space-y-5">
      {/* 승무패 */}
      {mwRows.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-tight">승무패</h3>
            <span className="text-[11px] text-neutral-500">북메이커 {odds.bookmakerCount}곳 · 최고배당 강조</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-neutral-100 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead><tr className={headCls}>
                <th className="px-3 py-2 text-left font-semibold">북메이커</th>
                {cols.map((c) => <th key={c} className="px-3 py-2 text-center font-semibold">{ko[c]}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {mwRows.map((r) => (
                  <tr key={r.name} className="hover:bg-neutral-50 dark:hover:bg-white/[0.03]">
                    <td className="px-3 py-2 text-[13px] text-neutral-700 dark:text-neutral-300 truncate">{r.name}</td>
                    {cols.map((c) => {
                      const v = r.v.find((x) => x.value === c);
                      const odd = v ? parseFloat(v.odd) || 0 : 0;
                      const isBest = odd > 0 && odd === bestMw[c];
                      return <td key={c} className={`${cell} ${isBest ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-neutral-600 dark:text-neutral-400"}`}>{v?.odd ?? "-"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 아시안 핸디캡 */}
      {hcLines.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold tracking-tight">아시안 핸디캡 <span className="text-[11px] font-normal text-neutral-500">(라인별 최고배당)</span></h3>
          <div className="overflow-hidden rounded-lg border border-neutral-100 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead><tr className={headCls}>
                <th className="px-3 py-2 text-left font-semibold">라인</th>
                <th className="px-3 py-2 text-center font-semibold">홈</th>
                <th className="px-3 py-2 text-center font-semibold">원정</th>
              </tr></thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {hcLines.map((line) => (
                  <tr key={line}>
                    <td className="px-3 py-2 text-[13px] tabular-nums text-neutral-700 dark:text-neutral-300">{line}</td>
                    <td className={`${cell} text-neutral-600 dark:text-neutral-400`}>{hcHomeBest.get(line)?.toFixed(2) ?? "-"}</td>
                    <td className={`${cell} text-neutral-600 dark:text-neutral-400`}>{hcAwayBest.get(line)?.toFixed(2) ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 언더오버 */}
      {ouLines.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold tracking-tight">언더오버 <span className="text-[11px] font-normal text-neutral-500">(라인별 최고배당)</span></h3>
          <div className="overflow-hidden rounded-lg border border-neutral-100 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead><tr className={headCls}>
                <th className="px-3 py-2 text-left font-semibold">기준선</th>
                <th className="px-3 py-2 text-center font-semibold">오버</th>
                <th className="px-3 py-2 text-center font-semibold">언더</th>
              </tr></thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {ouLines.map((line) => (
                  <tr key={line}>
                    <td className="px-3 py-2 text-[13px] tabular-nums text-neutral-700 dark:text-neutral-300">{line}</td>
                    <td className={`${cell} text-neutral-600 dark:text-neutral-400`}>{ouOverBest.get(line)?.toFixed(2) ?? "-"}</td>
                    <td className={`${cell} text-neutral-600 dark:text-neutral-400`}>{ouUnderBest.get(line)?.toFixed(2) ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-[10px] text-neutral-400">데이터: API-Sports · 참고용(베팅 권유 아님)</p>
    </div>
  );
}
