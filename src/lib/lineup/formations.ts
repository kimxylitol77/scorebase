// 라인업 전술판 포메이션 정의 — 슬롯 위치(x,y %)·포지션. 빌더 피치와 OG 카드가 공용.
// 좌표계: 세로 피치 기준 x(좌 0 ~ 우 100), y(위/공격 0 ~ 아래/GK 100).

export type Pos = "GK" | "DF" | "MF" | "FW";

export interface Slot {
  id: string;
  pos: Pos;
  label: string;
  x: number; // 0~100 (%)
  y: number; // 0~100 (%)
}

// 슬롯은 항상 같은 순서로 나열한다(공유 URL이 순서로 슬롯을 식별 — formations.ts:순서 고정 의존).
export const FORMATIONS: Record<string, Slot[]> = {
  "4-3-3": [
    { id: "lw", pos: "FW", label: "LW", x: 20, y: 18 },
    { id: "st", pos: "FW", label: "ST", x: 50, y: 15 },
    { id: "rw", pos: "FW", label: "RW", x: 80, y: 18 },
    { id: "lcm", pos: "MF", label: "CM", x: 28, y: 42 },
    { id: "cm", pos: "MF", label: "CM", x: 50, y: 44 },
    { id: "rcm", pos: "MF", label: "CM", x: 72, y: 42 },
    { id: "lb", pos: "DF", label: "LB", x: 14, y: 66 },
    { id: "lcb", pos: "DF", label: "CB", x: 38, y: 68 },
    { id: "rcb", pos: "DF", label: "CB", x: 62, y: 68 },
    { id: "rb", pos: "DF", label: "RB", x: 86, y: 66 },
    { id: "gk", pos: "GK", label: "GK", x: 50, y: 92 },
  ],
  "4-4-2": [
    { id: "st1", pos: "FW", label: "ST", x: 35, y: 16 },
    { id: "st2", pos: "FW", label: "ST", x: 65, y: 16 },
    { id: "lm", pos: "MF", label: "LM", x: 14, y: 42 },
    { id: "lcm", pos: "MF", label: "CM", x: 38, y: 44 },
    { id: "rcm", pos: "MF", label: "CM", x: 62, y: 44 },
    { id: "rm", pos: "MF", label: "RM", x: 86, y: 42 },
    { id: "lb", pos: "DF", label: "LB", x: 14, y: 67 },
    { id: "lcb", pos: "DF", label: "CB", x: 38, y: 69 },
    { id: "rcb", pos: "DF", label: "CB", x: 62, y: 69 },
    { id: "rb", pos: "DF", label: "RB", x: 86, y: 67 },
    { id: "gk", pos: "GK", label: "GK", x: 50, y: 92 },
  ],
  "4-2-3-1": [
    { id: "st", pos: "FW", label: "ST", x: 50, y: 14 },
    { id: "lam", pos: "MF", label: "AM", x: 24, y: 35 },
    { id: "cam", pos: "MF", label: "AM", x: 50, y: 37 },
    { id: "ram", pos: "MF", label: "AM", x: 76, y: 35 },
    { id: "ldm", pos: "MF", label: "DM", x: 36, y: 56 },
    { id: "rdm", pos: "MF", label: "DM", x: 64, y: 56 },
    { id: "lb", pos: "DF", label: "LB", x: 14, y: 74 },
    { id: "lcb", pos: "DF", label: "CB", x: 38, y: 76 },
    { id: "rcb", pos: "DF", label: "CB", x: 62, y: 76 },
    { id: "rb", pos: "DF", label: "RB", x: 86, y: 74 },
    { id: "gk", pos: "GK", label: "GK", x: 50, y: 93 },
  ],
  "3-5-2": [
    { id: "st1", pos: "FW", label: "ST", x: 35, y: 16 },
    { id: "st2", pos: "FW", label: "ST", x: 65, y: 16 },
    { id: "lm", pos: "MF", label: "LM", x: 12, y: 42 },
    { id: "lcm", pos: "MF", label: "CM", x: 31, y: 44 },
    { id: "cm", pos: "MF", label: "CM", x: 50, y: 45 },
    { id: "rcm", pos: "MF", label: "CM", x: 69, y: 44 },
    { id: "rm", pos: "MF", label: "RM", x: 88, y: 42 },
    { id: "lcb", pos: "DF", label: "CB", x: 27, y: 67 },
    { id: "cb", pos: "DF", label: "CB", x: 50, y: 69 },
    { id: "rcb", pos: "DF", label: "CB", x: 73, y: 67 },
    { id: "gk", pos: "GK", label: "GK", x: 50, y: 92 },
  ],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);
// 포메이션 선택지 — "자유"는 슬롯 프리셋 없이 빈 피치(자유 배치).
export const FREE_FORMATION = "자유";
export const FORMATION_OPTIONS = [...FORMATION_NAMES, FREE_FORMATION];

// 맞대결 양 팀 색 — home(하단)·away(상단) 배지 구분. 단일 모드는 미사용.
export interface SideColor {
  solid: string;
  soft: string;
  ring: string;
}
export const SIDE_COLORS: Record<"home" | "away", SideColor> = {
  home: { solid: "#e11d48", soft: "rgba(225,29,72,0.20)", ring: "rgba(225,29,72,0.9)" },
  away: { solid: "#2563eb", soft: "rgba(37,99,235,0.20)", ring: "rgba(37,99,235,0.9)" },
};

// 가로 피치 표시 좌표 변환 — 저장은 항상 세로(x,y)이고 가로는 90도 회전해 렌더만(공격=우측).
// portrait: 위(y작음)=공격. landscape: 우(x큼)=공격 → dx=100-y, dy=x.
export function toDisplayXY(x: number, y: number, landscape: boolean): { x: number; y: number } {
  return landscape ? { x: 100 - y, y: x } : { x, y };
}
// 가로에서 포인터 입력(표시 좌표) → 저장 좌표 역변환.
export function fromDisplayXY(dx: number, dy: number, landscape: boolean): { x: number; y: number } {
  return landscape ? { x: dy, y: 100 - dx } : { x: dx, y: dy };
}

// 키트(피치 배경) 프리셋 — 카드·빌더 공용. 그라데이션 두 색.
export interface Kit {
  key: string;
  label: string;
  from: string;
  to: string;
}
export const KITS: Kit[] = [
  { key: "grass", label: "그라스", from: "#0f5132", to: "#0a3d27" },
  { key: "night", label: "나이트", from: "#0f172a", to: "#1e293b" },
  { key: "rose", label: "로즈", from: "#4c0519", to: "#881337" },
  { key: "royal", label: "로열", from: "#172554", to: "#1e3a8a" },
  { key: "mono", label: "모노", from: "#27272a", to: "#09090b" },
];
export const KIT_BY_KEY: Record<string, Kit> = Object.fromEntries(KITS.map((k) => [k.key, k]));
