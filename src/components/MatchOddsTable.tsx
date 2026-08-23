// 경기별 배당 표 — 아시안 핸디캡 라인 + 기준선별 언더오버 (승무패·북메이커 표는 실시간 카드와 중복이라 제거, 2026-08-23).
// 데이터: API-Sports(api-football). odds 는 live page 에서 fetchFixtureOdds 로 주입(enabled 정확화).
import type { FixtureOdds } from "@/lib/odds/api-sports-odds";

function best(map: Map<string, number[]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, arr] of map) out.set(k, Math.max(0, ...arr));
  return out;
}

// 한쪽 배당이 이 값 미만이면 사실상 확정(정보 가치 없음) → 해당 라인 제외.
const MIN_LINE_ODD = 1.5;

const cell = "px-3 py-2.5 text-center tabular-nums";
const headCls =
  "bg-neutral-50 dark:bg-neutral-900/60 text-[11px] uppercase tracking-wider text-neutral-500";
const boxCls =
  "overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800";

// 배당 셀 — 최고배당이면 초록 칩 + 링으로 강조.
function OddCell({ value, isBest }: { value: number; isBest: boolean }) {
  if (!value) return <span className="text-neutral-400 dark:text-neutral-600">-</span>;
  if (isBest)
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-600 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400">
        {value.toFixed(2)}
      </span>
    );
  return <span className="text-neutral-600 dark:text-neutral-300">{value.toFixed(2)}</span>;
}

export default function MatchOddsTable({ odds }: { odds: FixtureOdds }) {
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
  // 한쪽 배당이 너무 낮은(거의 확정) 라인 제외 + 0 근처 메인 6개, 표시는 숫자순.
  const hcLines = [...new Set([...hcHome.keys(), ...hcAway.keys()])]
    .filter((line) => {
      const h = hcHomeBest.get(line) ?? 0, a = hcAwayBest.get(line) ?? 0;
      return h > 0 && a > 0 && Math.min(h, a) >= MIN_LINE_ODD;
    })
    .sort((a, b) => Math.abs(parseFloat(a)) - Math.abs(parseFloat(b)))
    .slice(0, 6)
    .sort((a, b) => parseFloat(a) - parseFloat(b));

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
  // 핵심 기준선만 — .5 라인 우선 + 한쪽 배당이 너무 낮은(거의 확정) 라인 제외, 2.5 중심 6개.
  const ouAll = [...new Set([...ouOver.keys(), ...ouUnder.keys()])];
  const ouHalf = ouAll.filter((l) => /\.5$/.test(l));
  const ouLines = (ouHalf.length >= 3 ? ouHalf : ouAll)
    .filter((line) => {
      const o = ouOverBest.get(line) ?? 0, u = ouUnderBest.get(line) ?? 0;
      return o > 0 && u > 0 && Math.min(o, u) >= MIN_LINE_ODD;
    })
    .sort((a, b) => Math.abs(parseFloat(a) - 2.5) - Math.abs(parseFloat(b) - 2.5))
    .slice(0, 6)
    .sort((a, b) => parseFloat(a) - parseFloat(b));

  return (
    <div className="space-y-4">
      {/* 승무패 요약·북메이커별 표는 제거 — 실시간 배당 카드와 중복(표본 13곳 vs 11곳으로 값이 달라 혼란, 2026-08-23 리뷰 N1).
          이 표의 고유 정보인 아시안 핸디캡 라인·기준선별 O/U 만 남긴다. */}
      {/* 아시안 핸디캡 — 기본 접힘 */}
      {hcLines.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-1 py-1.5 hover:bg-neutral-50 dark:hover:bg-white/[0.04] list-none [&::-webkit-details-marker]:hidden">
            <h3 className="text-sm font-bold tracking-tight">
              아시안 핸디캡 <span className="text-[11px] font-normal text-neutral-500">(라인별 최고배당 · {hcLines.length}라인)</span>
            </h3>
            <span className="ml-auto text-[10px] text-neutral-400 transition-transform group-open:rotate-90" aria-hidden>▶</span>
          </summary>
          <div className={`${boxCls} mt-3`}>
            <table className="w-full min-w-[300px] text-sm">
              <thead>
                <tr className={headCls}>
                  <th className="px-3 py-2 text-left font-semibold">라인</th>
                  <th className="px-3 py-2 text-center font-semibold">홈</th>
                  <th className="px-3 py-2 text-center font-semibold">원정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
                {hcLines.map((line) => {
                  const h = hcHomeBest.get(line) ?? 0, a = hcAwayBest.get(line) ?? 0;
                  return (
                    <tr key={line} className="hover:bg-neutral-50 dark:hover:bg-white/[0.03]">
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-neutral-700 dark:text-neutral-300">{line}</td>
                      <td className={cell}><OddCell value={h} isBest={false} /></td>
                      <td className={cell}><OddCell value={a} isBest={false} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* 언더오버 — 기본 접힘 */}
      {ouLines.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-1 py-1.5 hover:bg-neutral-50 dark:hover:bg-white/[0.04] list-none [&::-webkit-details-marker]:hidden">
            <h3 className="text-sm font-bold tracking-tight">
              언더오버 <span className="text-[11px] font-normal text-neutral-500">(기준선별 최고배당 · {ouLines.length}기준선)</span>
            </h3>
            <span className="ml-auto text-[10px] text-neutral-400 transition-transform group-open:rotate-90" aria-hidden>▶</span>
          </summary>
          <div className={`${boxCls} mt-3`}>
            <table className="w-full min-w-[300px] text-sm">
              <thead>
                <tr className={headCls}>
                  <th className="px-3 py-2 text-left font-semibold">기준선</th>
                  <th className="px-3 py-2 text-center font-semibold">오버</th>
                  <th className="px-3 py-2 text-center font-semibold">언더</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
                {ouLines.map((line) => {
                  const o = ouOverBest.get(line) ?? 0, u = ouUnderBest.get(line) ?? 0;
                  return (
                    <tr key={line} className="hover:bg-neutral-50 dark:hover:bg-white/[0.03]">
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-neutral-700 dark:text-neutral-300">{line}</td>
                      <td className={cell}><OddCell value={o} isBest={false} /></td>
                      <td className={cell}><OddCell value={u} isBest={false} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <p className="text-[10px] text-neutral-400">
        데이터: API-Sports 북메이커 {odds.bookmakerCount}곳 · 라인별 최고배당이라 위 실시간 평균과 표본이 다릅니다 · 참고용(베팅 권유 아님)
      </p>
    </div>
  );
}
