// 축구 포지션 코드 + 한글 라벨 + 미니 피치 좌표.
// 산출 소스 2종: api-football grid(gridToPosition, 빅5·UCL·WC 포괄) + TheSports x/y(derive-detail-position).

export type PosCode =
  | "GK"
  | "LB" | "LWB" | "CB" | "RB" | "RWB"
  | "CDM" | "LM" | "CM" | "RM" | "CAM"
  | "LW" | "RW" | "SS" | "ST" | "CF";

// api-football 라인업 grid("row:col") + 포메이션 → 구체 포지션. row 1=GK, 세그먼트 순 수비→공격.
// col: 폭>2 일 때 최외곽만 wide(1=좌·폭=우), 폭≤2 는 중앙. (야말 4:3/4-2-3-1 → RW, 백4 센터백 CB 검증)
function lane(col: number, width: number): "L" | "C" | "R" {
  if (width <= 2) return "C";
  if (col === 1) return "L";
  if (col === width) return "R";
  return "C";
}

export function gridToPosition(formation: string | null | undefined, grid: string | null | undefined): PosCode | null {
  if (!grid) return null;
  const [rowS, colS] = grid.split(":");
  const row = Number(rowS), col = Number(colS);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  if (row === 1) return "GK";
  const segs = (formation ?? "").split("-").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (segs.length === 0) return null;
  const segIdx = row - 2;
  if (segIdx < 0 || segIdx >= segs.length) return null;
  const width = segs[segIdx];
  const S = segs.length;
  const ln = lane(col, width);
  if (segIdx === 0) {
    if (ln === "C") return "CB";
    if (width >= 5) return ln === "L" ? "LWB" : "RWB";
    return ln === "L" ? "LB" : "RB";
  }
  if (segIdx === S - 1) {
    if (width <= 2) return "ST";
    return ln === "L" ? "LW" : ln === "R" ? "RW" : "ST";
  }
  const isAttackingBand = S >= 4 && segIdx === S - 2;
  if (ln === "L") return isAttackingBand ? "LW" : "LM";
  if (ln === "R") return isAttackingBand ? "RW" : "RM";
  if (isAttackingBand) return "CAM";
  if (segIdx === 1 && width === 1) return "CDM";
  return "CM";
}

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
