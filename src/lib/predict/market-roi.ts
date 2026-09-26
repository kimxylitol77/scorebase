// 마켓별(핸디캡·오버언더) 모델 픽 → 1유닛 베팅 변환 — 수익률 배지의 순수 규칙. DB 조회는 model-vs-market.ts.
// 모델은 리그별 고정 기준선(축구 오버 2.5·핸디 0.5 등)에서 픽하고, 시장 배당은 그날 기준선이 제각각이다.
// 기준선이 다른 배당에 모델 픽을 붙이면 다른 내기를 채점하게 되므로, 시장 기준선이 모델과 같은 경기만 베팅으로 만든다.
import type { FlatBet } from "./flat-roi";

interface Scores {
  homeScore: number;
  awayScore: number;
}

export interface OuSource extends Scores {
  predOverPick: string | null;
  oddsTotalLine: number | null;
  oddsOver: number | null;
  oddsUnder: number | null;
}

/** 오버언더 — 시장 기준선이 모델 기준선과 같을 때만. 총점이 기준선과 같으면(적중 무효) 제외. */
export function ouBetOf(m: OuSource, modelLine: number | null | undefined): FlatBet | null {
  if (!m.predOverPick || modelLine == null || m.oddsTotalLine !== modelLine) return null;
  const total = m.homeScore + m.awayScore;
  if (total === modelLine) return null;
  const over = m.predOverPick === "OVER";
  return { odds: over ? m.oddsOver : m.oddsUnder, won: over ? total > modelLine : total < modelLine };
}

export interface HcSource extends Scores {
  predHcPick: string | null;
  predHcLine: number | null;
  oddsHcLine: number | null;
  oddsHcHome: number | null;
  oddsHcAway: number | null;
  /** Match.oddsBookmakers — books[].hl = 업체별 홈 핸디 기준선(부호 포함) */
  oddsBookmakers: unknown;
}

/**
 * 시장 홈 핸디 기준선(부호 포함). oddsHcLine 은 절댓값만 저장돼 어느 팀이 핸디를 주는지는
 * 업체별 배당(books[].hl)에만 남는다 — 그 기준선을 쓴 업체들의 다수결 부호.
 */
export function marketHomeHcPoint(oddsBookmakers: unknown, absLine: number): number | null {
  const books = (oddsBookmakers as { books?: Array<{ hl?: unknown }> } | null)?.books;
  if (!Array.isArray(books)) return null;
  let fav = 0;
  let dog = 0;
  for (const b of books) {
    if (typeof b?.hl !== "number" || Math.abs(b.hl) !== absLine) continue;
    if (b.hl < 0) fav++;
    else if (b.hl > 0) dog++;
  }
  if (fav === dog) return null;
  return fav > dog ? -absLine : absLine;
}

/**
 * 핸디캡 — 모델 핸디는 항상 "홈 −기준선"(HOME=홈이 기준선 넘게 이김, AWAY=못 넘김).
 * 시장도 홈이 같은 기준선으로 핸디를 줄 때만 같은 내기다. 원정이 핸디를 주는 경기는 제외.
 */
export function hcBetOf(m: HcSource): FlatBet | null {
  const line = m.predHcLine;
  if (!m.predHcPick || line == null || line <= 0 || m.oddsHcLine == null || Math.abs(m.oddsHcLine) !== line) return null;
  if (marketHomeHcPoint(m.oddsBookmakers, line) !== -line) return null;
  const margin = m.homeScore - m.awayScore;
  if (margin === line) return null;
  const home = m.predHcPick === "HOME";
  return { odds: home ? m.oddsHcHome : m.oddsHcAway, won: home ? margin > line : margin < line };
}
