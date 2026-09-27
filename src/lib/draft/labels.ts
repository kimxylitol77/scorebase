// 드래프트 화면 공용 표기 — 시즌·포지션·찬스·반지 이름 (클라이언트·서버·OG 공용, 수치 없음)
import type { DraftMode, Pos } from "./types";

/** 시즌 종료 연도 → "15-16". KBL 원년(1997)은 한 해에 치러 "1997". */
export function seasonLabel(mode: DraftMode, season: number): string {
  if (mode === "kbl" && season === 1997) return "1997";
  const two = (y: number) => String(y % 100).padStart(2, "0");
  return `${two(season - 1)}-${two(season)}`;
}

export const POS_LABEL: Record<Pos, string> = { G: "가드", F: "포워드", C: "센터" };
export const SLOT_LABELS = ["가드", "가드", "포워드", "포워드", "센터"];

export const RING_TITLE = ["반지 없음", "반지 1개", "반지 2개", "반지 3개", "반지 4개", "반지 5개", "반지 6개"];

export const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
