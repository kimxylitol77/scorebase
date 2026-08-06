// 전술판 종목 정의 — 축구 외 농구·야구 보드의 포지션·배치 프리셋·보드 색.
// 좌표계는 축구와 동일(세로 기준 x 0~100, y 0~100 / 위=공격 방향)이라 드래그·공유·그리기 전부 재사용.
import type { Pos, Slot } from "./formations";

export type LineupSport = "soccer" | "basketball" | "baseball";

export function parseLineupSport(v: string | undefined | null): LineupSport {
  return v === "basketball" || v === "baseball" ? v : "soccer";
}

/** 종목별 후보 패널 포지션 필터 칩 — 순서 = 표시 순서 */
export const SPORT_POS: Record<LineupSport, { code: Pos; label: string }[]> = {
  soccer: [
    { code: "GK", label: "GK" },
    { code: "DF", label: "DF" },
    { code: "MF", label: "MF" },
    { code: "FW", label: "FW" },
  ],
  basketball: [
    { code: "G", label: "가드" },
    { code: "F", label: "포워드" },
    { code: "C", label: "센터" },
  ],
  baseball: [
    { code: "P", label: "투수" },
    { code: "B", label: "야수" },
  ],
};

export const SPORT_LABEL: Record<LineupSport, string> = {
  soccer: "축구",
  basketball: "농구",
  baseball: "야구",
};

/** 보드 배경 그라데이션 키 — 축구 kit 체계에 종목 기본값을 얹는다 */
export const SPORT_DEFAULT_KIT: Record<LineupSport, string> = {
  soccer: "grass",
  basketball: "court",
  baseball: "diamond",
};

// ── 농구 배치 프리셋 (하프코트, 바스켓 = 위) ──
// 5인 좌표. 슬롯 label 은 표시용일 뿐 자유 드래그·임의 교체 가능(축구 포메이션과 동일 규칙).
export const BASKETBALL_SETS: Record<string, Slot[]> = {
  "기본 (1-2-2)": [
    { id: "pg", pos: "G", label: "PG", x: 50, y: 78 },
    { id: "sg", pos: "G", label: "SG", x: 20, y: 58 },
    { id: "sf", pos: "F", label: "SF", x: 80, y: 58 },
    { id: "pf", pos: "F", label: "PF", x: 30, y: 30 },
    { id: "c", pos: "C", label: "C", x: 62, y: 22 },
  ],
  "3아웃 2인": [
    { id: "pg", pos: "G", label: "PG", x: 50, y: 80 },
    { id: "sg", pos: "G", label: "SG", x: 16, y: 62 },
    { id: "sf", pos: "F", label: "SF", x: 84, y: 62 },
    { id: "pf", pos: "F", label: "PF", x: 34, y: 24 },
    { id: "c", pos: "C", label: "C", x: 66, y: 24 },
  ],
  "5아웃": [
    { id: "pg", pos: "G", label: "PG", x: 50, y: 82 },
    { id: "sg", pos: "G", label: "SG", x: 15, y: 64 },
    { id: "sf", pos: "F", label: "SF", x: 85, y: 64 },
    { id: "pf", pos: "F", label: "PF", x: 26, y: 38 },
    { id: "c", pos: "C", label: "C", x: 74, y: 38 },
  ],
  "2-3 존 수비": [
    { id: "g1", pos: "G", label: "G", x: 34, y: 58 },
    { id: "g2", pos: "G", label: "G", x: 66, y: 58 },
    { id: "f1", pos: "F", label: "F", x: 20, y: 30 },
    { id: "c", pos: "C", label: "C", x: 50, y: 22 },
    { id: "f2", pos: "F", label: "F", x: 80, y: 30 },
  ],
};

// ── 야구 수비 배치 프리셋 (홈플레이트 = 아래) ──
export const BASEBALL_SETS: Record<string, Slot[]> = {
  "기본 수비": [
    { id: "cf", pos: "B", label: "CF", x: 50, y: 14 },
    { id: "lf", pos: "B", label: "LF", x: 20, y: 22 },
    { id: "rf", pos: "B", label: "RF", x: 80, y: 22 },
    { id: "ss", pos: "B", label: "SS", x: 36, y: 43 },
    { id: "b2", pos: "B", label: "2B", x: 64, y: 43 },
    { id: "b3", pos: "B", label: "3B", x: 24, y: 56 },
    { id: "b1", pos: "B", label: "1B", x: 76, y: 56 },
    { id: "p", pos: "P", label: "P", x: 50, y: 62 },
    { id: "c", pos: "B", label: "C", x: 50, y: 90 },
  ],
  "좌타 시프트": [
    { id: "cf", pos: "B", label: "CF", x: 56, y: 14 },
    { id: "lf", pos: "B", label: "LF", x: 26, y: 24 },
    { id: "rf", pos: "B", label: "RF", x: 84, y: 20 },
    { id: "ss", pos: "B", label: "SS", x: 48, y: 42 },
    { id: "b2", pos: "B", label: "2B", x: 72, y: 46 },
    { id: "b3", pos: "B", label: "3B", x: 30, y: 52 },
    { id: "b1", pos: "B", label: "1B", x: 78, y: 56 },
    { id: "p", pos: "P", label: "P", x: 50, y: 62 },
    { id: "c", pos: "B", label: "C", x: 50, y: 90 },
  ],
  "우타 시프트": [
    { id: "cf", pos: "B", label: "CF", x: 44, y: 14 },
    { id: "lf", pos: "B", label: "LF", x: 16, y: 20 },
    { id: "rf", pos: "B", label: "RF", x: 74, y: 24 },
    { id: "ss", pos: "B", label: "SS", x: 28, y: 46 },
    { id: "b2", pos: "B", label: "2B", x: 52, y: 42 },
    { id: "b3", pos: "B", label: "3B", x: 22, y: 56 },
    { id: "b1", pos: "B", label: "1B", x: 70, y: 52 },
    { id: "p", pos: "P", label: "P", x: 50, y: 62 },
    { id: "c", pos: "B", label: "C", x: 50, y: 90 },
  ],
  "번트 대비": [
    { id: "cf", pos: "B", label: "CF", x: 50, y: 16 },
    { id: "lf", pos: "B", label: "LF", x: 20, y: 24 },
    { id: "rf", pos: "B", label: "RF", x: 80, y: 24 },
    { id: "ss", pos: "B", label: "SS", x: 40, y: 44 },
    { id: "b2", pos: "B", label: "2B", x: 66, y: 48 },
    { id: "b3", pos: "B", label: "3B", x: 30, y: 66 },
    { id: "b1", pos: "B", label: "1B", x: 70, y: 66 },
    { id: "p", pos: "P", label: "P", x: 50, y: 68 },
    { id: "c", pos: "B", label: "C", x: 50, y: 90 },
  ],
};

/** 종목별 프리셋 묶음 — 축구는 기존 FORMATIONS 를 그대로 쓰므로 여기 없음 */
export const SPORT_SETS: Record<Exclude<LineupSport, "soccer">, Record<string, Slot[]>> = {
  basketball: BASKETBALL_SETS,
  baseball: BASEBALL_SETS,
};
