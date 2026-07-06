// 축구 포지션 코드 + 한글 라벨 + 미니 피치 좌표. 코드 산출은 derive-detail-position.ts(라인업 x/y).

export type PosCode =
  | "GK"
  | "LB" | "LWB" | "CB" | "RB" | "RWB"
  | "CDM" | "LM" | "CM" | "RM" | "CAM"
  | "LW" | "RW" | "SS" | "ST" | "CF";

// 포지션 코드 → 한글 라벨
export const POS_KO: Record<PosCode, string> = {
  GK: "골키퍼",
  LB: "레프트백", LWB: "왼쪽 윙백", CB: "센터백", RB: "라이트백", RWB: "오른쪽 윙백",
  CDM: "수비형 미드필더", LM: "왼쪽 미드필더", CM: "중앙 미드필더", RM: "오른쪽 미드필더", CAM: "공격형 미드필더",
  LW: "왼쪽 윙어", RW: "오른쪽 윙어", SS: "세컨 스트라이커", ST: "스트라이커", CF: "센터 포워드",
};

// 미니 피치 좌표 (x,y: 0~100, y=0 상단 상대골문 / y=100 자기골문)
export const POS_XY: Record<PosCode, { x: number; y: number }> = {
  GK: { x: 50, y: 94 },
  LB: { x: 16, y: 74 }, LWB: { x: 12, y: 66 }, CB: { x: 50, y: 78 }, RB: { x: 84, y: 74 }, RWB: { x: 88, y: 66 },
  CDM: { x: 50, y: 60 }, LM: { x: 18, y: 48 }, CM: { x: 50, y: 48 }, RM: { x: 82, y: 48 }, CAM: { x: 50, y: 34 },
  LW: { x: 16, y: 24 }, RW: { x: 84, y: 24 }, SS: { x: 50, y: 24 }, ST: { x: 50, y: 12 }, CF: { x: 50, y: 14 },
};
