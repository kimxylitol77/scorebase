// api-football odds 응답의 부가 마켓(BTTS·더블찬스)을 북메이커 평균 decimal 배당으로 정리하는 순수 함수.
// The Odds API 는 요금제상 btts·double_chance 를 받지 않아(odds-api.ts markets 주석) af 가 유일한 원천이다.

export interface AfSideBookmaker {
  bets?: Array<{ id?: number; values?: Array<{ value?: string; odd?: string }> }>;
}

export interface AfSideMarkets {
  btts: { yes: number; no: number; bookmakers: number } | null;
  dc: { oneX: number; twelve: number; xTwo: number; bookmakers: number } | null;
}

// af bet id — 8 = Both Teams Score, 12 = Double Chance (2026-09-28 EPL 응답 실측)
const BET_BTTS = 8;
const BET_DC = 12;

function odd(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 1 ? n : null;
}

export function sideMarketsFromAfBookmakers(bookmakers: AfSideBookmaker[] | undefined): AfSideMarkets {
  let yes = 0, no = 0, nB = 0;
  let oneX = 0, twelve = 0, xTwo = 0, nD = 0;
  for (const b of bookmakers ?? []) {
    const bt = (b.bets ?? []).find((x) => x.id === BET_BTTS);
    if (bt) {
      const y = odd(bt.values?.find((v) => v.value === "Yes")?.odd);
      const n = odd(bt.values?.find((v) => v.value === "No")?.odd);
      if (y != null && n != null) { yes += y; no += n; nB++; }
    }
    const dc = (b.bets ?? []).find((x) => x.id === BET_DC);
    if (dc) {
      const hx = odd(dc.values?.find((v) => v.value === "Home/Draw")?.odd);
      const ha = odd(dc.values?.find((v) => v.value === "Home/Away")?.odd);
      const xa = odd(dc.values?.find((v) => v.value === "Draw/Away")?.odd);
      if (hx != null && ha != null && xa != null) { oneX += hx; twelve += ha; xTwo += xa; nD++; }
    }
  }
  return {
    btts: nB ? { yes: yes / nB, no: no / nB, bookmakers: nB } : null,
    dc: nD ? { oneX: oneX / nD, twelve: twelve / nD, xTwo: xTwo / nD, bookmakers: nD } : null,
  };
}

/** Match update 용 patch — 값이 없는 마켓은 키 자체를 빼서 기존 값을 null 로 덮지 않는다. */
export function sideMarketsPatch(s: AfSideMarkets): Record<string, number> {
  return {
    ...(s.btts ? { oddsBttsYes: s.btts.yes, oddsBttsNo: s.btts.no } : {}),
    ...(s.dc ? { oddsDc1X: s.dc.oneX, oddsDc12: s.dc.twelve, oddsDcX2: s.dc.xTwo } : {}),
  };
}
