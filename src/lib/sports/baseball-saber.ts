// 야구 세이버 지표(FIP·LOB%) 계산 헬퍼 — 선발 비교 카드·프리뷰 컨텍스트 공용.

import { ipToInnings } from "./kbo-official";

/** 리그별 FIP 상수 — 득점 환경 근사치 (정석은 리그 합산 유도, 시즌 단위 재검토) */
const FIP_CONSTANTS: Record<string, number> = {
  KBO: 3.7,
  NPB: 2.9,
  MLB: 3.15,
};

/**
 * FIP = (13·HR + 3·(BB+HBP) − 2·K) / IP + 리그상수.
 * hbp 미제공(KBO 페이지 컬럼 누락 등)이면 0 근사 — 비교 목적엔 무해.
 */
export function calcFip(args: {
  league: "KBO" | "NPB" | "MLB";
  hr?: number;
  bb?: number;
  hbp?: number;
  k?: number;
  ip?: string | number;
}): number | undefined {
  const innings =
    typeof args.ip === "number" ? args.ip : ipToInnings(args.ip);
  if (!innings || innings <= 0) return undefined;
  if (args.hr == null || args.bb == null || args.k == null) return undefined;
  const hbp = args.hbp ?? 0;
  const c = FIP_CONSTANTS[args.league] ?? 3.15;
  const fip = (13 * args.hr + 3 * (args.bb + hbp) - 2 * args.k) / innings + c;
  if (!Number.isFinite(fip)) return undefined;
  return Number(fip.toFixed(2));
}

/**
 * LOB% = (H+BB+HBP−R) / (H+BB+HBP−1.4·HR) — 잔루 처리율, 높을수록 좋음.
 * 반환은 % 값 (예: 72.3). 표본 작을 때 튀는 값은 0~100 클램프.
 */
export function calcLobPct(args: {
  hits?: number;
  bb?: number;
  hbp?: number;
  r?: number;
  hr?: number;
}): number | undefined {
  const { hits, bb, r, hr } = args;
  if (hits == null || bb == null || r == null || hr == null) return undefined;
  const hbp = args.hbp ?? 0;
  const denom = hits + bb + hbp - 1.4 * hr;
  if (denom <= 0) return undefined;
  const lob = (hits + bb + hbp - r) / denom;
  if (!Number.isFinite(lob)) return undefined;
  return Number((Math.min(Math.max(lob, 0), 1) * 100).toFixed(1));
}
