// 경기 상세 배당 섹션 — 베팅 시장별 격자. 수집되는 시장만 값을 채우고 나머지는 "데이터 준비 중"으로 자리만 둔다.
// 현재 수집: 승무패·핸디캡·오버/언더 (The Odds API h2h·spreads·totals). BTTS·더블찬스는 Pro 플랜 전용, 전반·코너·카드·정확한 스코어는 소스 없음.
// 가짜 값·추정값 금지 (2026-08-22 리뷰 §5).

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  odds: {
    home: number | null; draw: number | null; away: number | null;
    hcLine: number | null; hcHome: number | null; hcAway: number | null;
    totalLine: number | null; over: number | null; under: number | null;
    bttsYes: number | null; bttsNo: number | null;
    dc1X: number | null; dc12: number | null; dcX2: number | null;
  };
  bookmakers: number | null;
  /** 실시간 배당 카드가 같은 시장(승무패·핸디캡·O/U)을 이미 보여주는 리그 — 값은 생략하고 미수집 시장 칩만 */
  pendingOnly?: boolean;
}

const f = (n: number | null) => (n == null ? "—" : n.toFixed(2));

interface Market {
  key: string;
  label: string;
  cells: Array<{ label: string; value: number | null }> | null; // null = 미수집
}

export default function OddsMarketsGrid({ homeNameKo, awayNameKo, odds, bookmakers, pendingOnly = false }: Props) {
  const has = (...v: Array<number | null>) => v.some((x) => x != null);
  const markets: Market[] = [
    {
      key: "1x2",
      label: "승무패",
      cells: has(odds.home, odds.away)
        ? [{ label: `${homeNameKo} 승`, value: odds.home }, { label: "무", value: odds.draw }, { label: `${awayNameKo} 승`, value: odds.away }]
        : null,
    },
    {
      key: "hc",
      label: "핸디캡",
      // oddsHcLine 은 절대값만 저장 — 강팀(−라인)은 승무패 배당이 낮은 쪽으로 판정 (둘 다 없으면 부호 생략)
      cells: has(odds.hcHome, odds.hcAway)
        ? (() => {
            const line = odds.hcLine != null ? Math.abs(odds.hcLine) : null;
            const favHome = odds.home != null && odds.away != null ? odds.home <= odds.away : null;
            const sign = (isHome: boolean) =>
              line == null || favHome == null ? "" : ` ${(isHome ? favHome : !favHome) ? "−" : "+"}${line}`;
            return [
              { label: `${homeNameKo}${sign(true)}`, value: odds.hcHome },
              { label: `${awayNameKo}${sign(false)}`, value: odds.hcAway },
            ];
          })()
        : null,
    },
    {
      key: "ou",
      label: odds.totalLine != null ? `오버/언더 ${odds.totalLine}` : "오버/언더",
      cells: has(odds.over, odds.under) ? [{ label: "오버", value: odds.over }, { label: "언더", value: odds.under }] : null,
    },
    { key: "h1x2", label: "전반 승무패", cells: null },
    { key: "h1ou", label: "전반 오버/언더", cells: null },
    {
      key: "btts",
      label: "양팀 득점",
      cells: has(odds.bttsYes, odds.bttsNo) ? [{ label: "예", value: odds.bttsYes }, { label: "아니오", value: odds.bttsNo }] : null,
    },
    {
      key: "dc",
      label: "더블 찬스",
      cells: has(odds.dc1X, odds.dc12, odds.dcX2)
        ? [{ label: "홈/무", value: odds.dc1X }, { label: "홈/원정", value: odds.dc12 }, { label: "무/원정", value: odds.dcX2 }]
        : null,
    },
    { key: "corners", label: "코너킥", cells: null },
    { key: "cards", label: "카드", cells: null },
    { key: "cs", label: "정확한 스코어", cells: null },
  ];
  const available = markets.filter((m) => m.cells);
  const pending = markets.filter((m) => !m.cells);
  if (pendingOnly) {
    // 같은 값을 두 번 찍지 않는다 (한 페이지 배당 4중 표기 지적, 2026-08-23). 미수집 시장 안내만.
    return pending.length > 0 ? (
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400 px-1">
        <span>데이터 준비 중인 시장:</span>
        {pending.map((m) => (
          <span key={m.key} className="rounded-full border border-dashed border-neutral-300 dark:border-white/15 px-2 py-0.5">
            {m.label}
          </span>
        ))}
      </div>
    ) : null;
  }
  if (available.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-3 sm:p-4">
      <header className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[12px] font-bold">경기 전 평균 배당</div>
        <span className="text-[10px] text-neutral-500">{bookmakers ? `해외 ${bookmakers}곳 평균 · ` : ""}실시간 배당 미지원 리그</span>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {available.map((m) => (
          <div key={m.key} className="rounded-lg bg-neutral-50 dark:bg-white/[0.04] px-3 py-2">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-neutral-500 mb-1">{m.label}</div>
            <div className={`grid gap-1 ${m.cells!.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {m.cells!.map((c) => (
                <div key={c.label} className="text-center">
                  <div className="text-[10px] text-neutral-500 truncate">{c.label}</div>
                  <div className="text-[13px] font-bold tabular-nums">{f(c.value)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400">
          <span>데이터 준비 중:</span>
          {pending.map((m) => (
            <span key={m.key} className="rounded-full border border-dashed border-neutral-300 dark:border-white/15 px-2 py-0.5">
              {m.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
