// 테니스 시즌 상금(YTD) — data/tennis-prize-money.json 로더 (ATP·WTA 공식 주간 PDF 큐레이션).
//
// 소스(공식, 주간 갱신 PDF).
//   ATP: https://www.protennislive.com/posting/ramr/current_prize.pdf
//   WTA: https://wtafiles.wtatennis.com/pdf/rankings/All_YTD_Prize_Money.pdf
// atptour.com 웹 리더보드는 Cloudflare 차단이라 위 PDF 를 파싱해 JSON 으로 커밋한다(수동 갱신).
// 금액 = 단식+복식(+혼합) 합산 YTD, USD. 동률(ATP "30T")은 같은 순위.

import prizeData from "../../../data/tennis-prize-money.json";

export interface TennisPrizeRow {
  rank: number;
  playerName: string;
  /** IOC 3자리 국가코드 — ATP PDF 는 국적 미제공(null). */
  country: string | null;
  salary: number; // 시즌 상금 (USD)
}

interface PrizeData {
  asOf: string;
  season: string;
  sources: { atp: string; wta: string };
  atp: TennisPrizeRow[];
  wta: TennisPrizeRow[];
}

const DATA = prizeData as PrizeData;

/** 상금 기준일 ("YYYY-MM-DD") — 페이지 출처 표기용. */
export const TENNIS_PRIZE_AS_OF: string = DATA.asOf;
export const TENNIS_PRIZE_SEASON: string = DATA.season;

export function getTennisPrizeMoney(tour: "ATP" | "WTA"): TennisPrizeRow[] {
  return tour === "ATP" ? DATA.atp : DATA.wta;
}
