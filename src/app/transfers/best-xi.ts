// 시장가치 Best XI 배치 로직 — 포메이션 문자열 → 슬롯 좌표·허용 포지션, 가치순 채움.
// 렌더는 SquadBestXI.tsx. (컴포넌트와 분리해 node --test 로 검증 가능하게 둔다)

export interface XIPlayer {
  id: string;
  name: string;
  value: number; // €M
  posCode: string | null;
  photo: string | null;
}

export interface Slot {
  key: string;
  label: string; // 슬롯 포지션 라벨 (선수 세부 포지션과 다를 수 있음)
  x: number; // 피치 좌표 % (좌→우)
  y: number; // 피치 좌표 % (상=공격 → 하=골문)
  accept: string[]; // 배치 허용 포지션 — 앞일수록 우선
}

export const DEFAULT_FORMATION = "4-3-3";

/** "4-2-3-1" → [4,2,3,1] (수비→공격 줄). 합 10·3~5줄이 아니면 null. */
function parseFormation(formation: string | null | undefined): number[] | null {
  if (!formation) return null;
  const rows = formation.trim().split("-").map(Number);
  if (rows.length < 3 || rows.length > 5) return null;
  if (rows.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) return null;
  return rows.reduce((s, n) => s + n, 0) === 10 ? rows : null;
}

/** 실제로 그려지는 포메이션 — 해석 불가면 기본값. 캡션 표기와 슬롯을 일치시킨다. */
export function usedFormation(formation: string | null | undefined): string {
  return parseFormation(formation) ? formation!.trim() : DEFAULT_FORMATION;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 줄 안 m 명을 lo~hi 구간에 균등 배치. 1 명이면 중앙. */
function spread(m: number, lo: number, hi: number): number[] {
  if (m === 1) return [50];
  return Array.from({ length: m }, (_, j) => lo + (j * (hi - lo)) / (m - 1));
}

// 줄 폭별 좌우 여백 — 수비는 넓게, 미드는 좁게. (기존 4-3-3 좌표를 그대로 재현)
const DEF_SPAN: Record<number, [number, number]> = { 3: [26, 74], 4: [18, 82], 5: [12, 88] };
const MID_SPAN: Record<number, [number, number]> = { 2: [35, 65], 3: [28, 72], 4: [18, 82], 5: [12, 88] };
const ATT_SPAN: Record<number, [number, number]> = { 2: [33, 67], 3: [20, 80] };

/**
 * 포메이션 문자열 → 4-3-3 과 같은 형식의 슬롯 배열.
 * y 는 76(최후방 줄)~14(최전방 줄) 균등, GK 는 91 고정.
 * accept 는 세부 포지션 우선·coarse(DF/MF/FW) 후순위. 백3 계열의 좌우 미드는
 * 윙백이라 FB 를 함께 받는다.
 */
export function slotsForFormation(formation: string | null | undefined): Slot[] {
  const rows = parseFormation(formation) ?? parseFormation(DEFAULT_FORMATION)!;
  const R = rows.length;
  const backThree = rows[0] === 3;
  const slots: Slot[] = [];

  rows.forEach((m, i) => {
    const baseY = 76 - (i * 62) / (R - 1);
    const isDef = i === 0;
    const isAtt = i === R - 1;
    // 미드 줄 역할 — 2 줄이면 [DM, AM], 3 줄이면 [DM, CM, AM], 1 줄이면 [CM].
    const midCount = R - 2;
    const midIdx = i - 1;
    const midRole = isDef || isAtt ? null : midCount === 1 ? "CM" : midIdx === 0 ? "DM" : midIdx === midCount - 1 ? "AM" : "CM";
    const span = isDef ? DEF_SPAN[m] : isAtt ? ATT_SPAN[m] : MID_SPAN[m];
    const xs = spread(m, span?.[0] ?? 20, span?.[1] ?? 80);

    xs.forEach((x, j) => {
      const wide = j === 0 || j === m - 1;
      const side = j === 0 ? "L" : "R";
      let label: string;
      let accept: string[];
      let y = baseY;

      if (isDef) {
        if (m >= 4 && wide) {
          label = `${side}B`;
          accept = ["FB", "CB", "DF"];
          y -= 6; // 풀백은 한 칸 전진
        } else {
          label = "CB";
          accept = ["CB", "DF"];
        }
      } else if (isAtt) {
        if (m === 3 && wide) {
          label = `${side}W`;
          accept = ["W", "AM", "ST", "FW"];
          y += 10; // 윙어는 최전방보다 한 칸 뒤
        } else {
          label = "ST";
          accept = ["ST", "FW", "W", "AM"];
        }
      } else if (m >= 4 && wide) {
        label = backThree ? `${side}WB` : `${side}M`;
        accept = backThree ? ["W", "FB", "AM", "CM", "MF"] : ["W", "AM", "CM", "MF"];
      } else if (midRole === "AM") {
        // 공격형 미드 줄이 3 명이면 좌우는 사실상 윙어 자리.
        label = m === 3 && wide ? `${side}W` : "AM";
        accept = m === 3 && wide ? ["W", "AM", "CM", "MF"] : ["AM", "CM", "MF"];
      } else if (midRole === "DM" && !(m >= 3 && wide)) {
        label = "DM"; // 수비형 줄 안쪽
        accept = ["DM", "CM", "MF"];
      } else if (midRole === "CM" && m % 2 === 1 && j === (m - 1) / 2) {
        label = "DM"; // 중원 홀수 줄 한가운데는 홀딩 역할
        accept = ["DM", "CM", "MF"];
        y += 7; // 한 칸 내려 삼각형 배치
      } else {
        label = "CM";
        accept = ["CM", "DM", "AM", "MF"];
      }

      slots.push({ key: `${i}_${j}`, label, x: round1(x), y: round1(y), accept });
    });
  });

  slots.push({ key: "GK", label: "GK", x: 50, y: 91, accept: ["GK"] });
  return slots;
}

export interface FilledSlot extends Slot {
  player: XIPlayer | null;
}

// 가치순(desc) 선수 목록 → 슬롯 채움. 밀어내기(augmenting path) 배치:
//   각 선수를 accept 순위가 좋은 슬롯부터 시도 — 빈 슬롯이면 배치,
//   점유돼 있으면 "점유자가 더 싸고 다른 곳으로 옮길 수 있을 때" 연쇄 재배치 후 차지.
// 단순 그리디(고가 coarse 가 정위치 선점)·2-pass(고가 coarse 가 통째로 탈락) 의
// 양쪽 함정을 모두 피해 XI 총가치를 사실상 최대화한다 (맨유 케이스로 검증).
export function pickBestXI(players: XIPlayer[], formation?: string | null): FilledSlot[] {
  const slots: FilledSlot[] = slotsForFormation(formation).map((s) => ({ ...s, player: null }));
  const slotsFor = (p: XIPlayer) =>
    slots
      .map((s) => ({ s, idx: s.accept.indexOf(p.posCode!) }))
      .filter((x) => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.s);

  function tryPlace(p: XIPlayer, visited: Set<string>): boolean {
    const cand = slotsFor(p);
    for (const s of cand) {
      if (!s.player) { s.player = p; return true; }
    }
    // 빈 자리 없음 — 점유자보다 ① 가치 우위 또는 ② 동가+적합도(accept 순위) 우위면 차지.
    // 점유자는 연쇄 재배치 시도 — 실패해도 교체 유지 (총가치/적합도가 증가하는 방향).
    for (const s of cand) {
      const occ = s.player!;
      if (visited.has(s.key)) continue;
      const pIdx = s.accept.indexOf(p.posCode!);
      const oIdx = occ.posCode ? s.accept.indexOf(occ.posCode) : 99;
      const better = occ.value < p.value || (occ.value === p.value && oIdx > pIdx);
      if (!better) continue;
      visited.add(s.key);
      s.player = p;
      tryPlace(occ, visited);
      return true;
    }
    return false;
  }

  for (const p of players) {
    if (!p.posCode) continue;
    tryPlace(p, new Set());
    if (slots.every((s) => s.player)) break;
  }
  return slots;
}
