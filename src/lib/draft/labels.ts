// 드래프트 화면 공용 표기 — 시즌·포지션·찬스·반지 이름 (클라이언트·서버·OG 공용, 수치 없음)
import { MODES, type DraftMode } from "./modes";

/** 시즌 종료 연도 → "15-16" (한 해에 끝나는 리그는 "2015"). KBL 원년(1997)은 한 해에 치러 "1997". */
export function seasonLabel(mode: DraftMode, season: number): string {
  if (MODES[mode].calendarYear || (mode === "kbl" && season === 1997)) return String(season);
  const two = (y: number) => String(y % 100).padStart(2, "0");
  return `${two(season - 1)}-${two(season)}`;
}

export const posLabel = (mode: DraftMode, pos: string) => MODES[mode].posLabel[pos] ?? pos;
export const slotLabels = (mode: DraftMode) => MODES[mode].slots.map((p) => posLabel(mode, p));

export const RING_TITLE = ["반지 없음", "반지 1개", "반지 2개", "반지 3개", "반지 4개", "반지 5개", "반지 6개"];

/** 백분위 0~100 → "상위 12%". 꼴찌도 "상위 99%" 로 — "하위 N%" 는 읽는 사람 기분만 상하게 한다. */
export function rankLabel(percentile: number): string {
  return `상위 ${Math.min(99, Math.max(1, 100 - percentile))}%`;
}

export const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
