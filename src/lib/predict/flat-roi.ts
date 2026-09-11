// 플랫 유닛 수익률 단일 계산기 — "매 픽 1유닛, 맞으면 배당−1, 틀리면 −1" 을 한 곳에서.
// /predictions/accuracy(모델 vs 시장)·/picks·/picks/me(회원 픽)·/lab(봇 백테스트)이 전부 이 함수를 쓴다.
// 화면마다 같은 식을 따로 두면 표본 규칙(배당 없음·이상치 제외)이 갈려 숫자가 어긋난다(감사 §4 "중복 구현 금지").

export interface FlatRoiResult {
  /** 배당이 있어 정산에 들어간 픽 수 */
  evaluated: number;
  wins: number;
  /** 누적 손익(유닛) — 소수 둘째 자리 반올림 */
  units: number;
  /** units / evaluated. 표본 0 이면 0 */
  roi: number;
  /** 배당이 없거나 이상치(1.01 미만·30 초과)라 제외된 픽 수 — 화면에 "배당 없음 N건 제외" 로 반드시 보인다 */
  excluded: number;
  /** 정산 픽의 평균 배당. 표본 0 이면 null */
  avgOdds: number | null;
}

export interface FlatBet {
  odds: number | null | undefined;
  won: boolean;
}

/** accuracy 페이지와 같은 이상치 규칙 — 수집 오류·서스펜드 라인 방어 */
export function isSaneOdds(o: number | null | undefined): o is number {
  return o != null && Number.isFinite(o) && o >= 1.01 && o <= 30;
}

export function settleFlatUnits(bets: Iterable<FlatBet>): FlatRoiResult {
  let evaluated = 0;
  let wins = 0;
  let units = 0;
  let excluded = 0;
  let oddsSum = 0;
  for (const b of bets) {
    if (!isSaneOdds(b.odds)) {
      excluded++;
      continue;
    }
    evaluated++;
    oddsSum += b.odds;
    if (b.won) {
      wins++;
      units += b.odds - 1;
    } else {
      units -= 1;
    }
  }
  return {
    evaluated,
    wins,
    units: Math.round(units * 100) / 100,
    roi: evaluated > 0 ? units / evaluated : 0,
    excluded,
    avgOdds: evaluated > 0 ? oddsSum / evaluated : null,
  };
}

/** "+12.3%" / "-3.8%" — accuracy 페이지 표기와 동일(toFixed(1)) */
export const fmtRoiPct = (r: number) => `${r > 0 ? "+" : ""}${(r * 100).toFixed(1)}%`;
/** "+4.5u" / "-69.8u" */
export const fmtUnits = (u: number) => `${u > 0 ? "+" : ""}${u.toFixed(1)}u`;
