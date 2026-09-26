// KBO·NPB 포스트시즌 선수 기록 합산 — 시리즈별 공식 표(KBO)·경기별 로그(NPB) 줄을 선수 한 줄(BbPlayerRow)로. 순수 함수.
//   비율 지표는 성분 합으로 다시 계산한다(시리즈별 타율 평균이 아니라). 출루율은 희생플라이를 모르는 소스라 (타수+볼넷+사구) 분모.
import { ipToNumber, type BbPlayerRow } from "./player-rankings";

export interface PsBatLine {
  id: string; name: string; team: string;
  g: number; ab: number; h: number; d2b: number; d3b: number; hr: number; rbi: number; bb: number; hbp: number;
}
export interface PsPitLine {
  id: string; name: string; team: string;
  g: number; w: number; l: number; sv: number; ip: number; h: number; bb: number; so: number; er: number;
}

const empty = { avg: null, hits: null, hr: null, rbi: null, ops: null, era: null, whip: null, ip: null, so: null, w: null, l: null, sv: null, salary: null };

/** 선수 id 로 묶어 합산. 이름·팀은 마지막 줄(가장 늦은 시리즈·경기) 기준. */
function group<T extends { id: string }>(lines: T[]): T[][] {
  const m = new Map<string, T[]>();
  for (const l of lines) m.set(l.id, [...(m.get(l.id) ?? []), l]);
  return [...m.values()];
}
const sum = <T>(ls: T[], f: (l: T) => number) => ls.reduce((a, l) => a + f(l), 0);

/** idField — KBO 는 externalId(kboId), NPB 는 logId(npbId): 스탯 표가 리그별로 사진·링크를 이 칸에서 찾는다. */
export function sumBatLines(lines: PsBatLine[], idField: "externalId" | "logId"): BbPlayerRow[] {
  return group(lines).map((ls) => {
    const last = ls[ls.length - 1];
    const ab = sum(ls, (l) => l.ab), h = sum(ls, (l) => l.h), bb = sum(ls, (l) => l.bb), hbp = sum(ls, (l) => l.hbp);
    const tb = h + sum(ls, (l) => l.d2b) + 2 * sum(ls, (l) => l.d3b) + 3 * sum(ls, (l) => l.hr);
    const obpDen = ab + bb + hbp;
    return {
      ...empty, key: last.id, externalId: idField === "externalId" ? last.id : null, logId: idField === "logId" ? last.id : null,
      name: last.name, nameEn: null, team: last.team, games: sum(ls, (l) => l.g),
      avg: ab > 0 ? h / ab : null, hits: h, hr: sum(ls, (l) => l.hr), rbi: sum(ls, (l) => l.rbi),
      ops: ab > 0 && obpDen > 0 ? (h + bb + hbp) / obpDen + tb / ab : null,
    };
  });
}

export function sumPitLines(lines: PsPitLine[], idField: "externalId" | "logId"): BbPlayerRow[] {
  return group(lines).map((ls) => {
    const last = ls[ls.length - 1];
    const ip = sum(ls, (l) => l.ip);
    return {
      ...empty, key: last.id, externalId: idField === "externalId" ? last.id : null, logId: idField === "logId" ? last.id : null,
      name: last.name, nameEn: null, team: last.team, games: sum(ls, (l) => l.g),
      ip, so: sum(ls, (l) => l.so), w: sum(ls, (l) => l.w), l: sum(ls, (l) => l.l), sv: sum(ls, (l) => l.sv),
      era: ip > 0 ? (sum(ls, (l) => l.er) * 9) / ip : null,
      whip: ip > 0 ? (sum(ls, (l) => l.h) + sum(ls, (l) => l.bb)) / ip : null,
    };
  });
}

/** KBO 공식 이닝 표기 "7 2/3"·"2/3"·"5" → 실수 */
export function kboIpToNumber(s: string): number {
  const m = s.trim().match(/^(\d+)?\s*(?:(\d)\/3)?$/);
  if (!m) return 0;
  return (Number(m[1]) || 0) + (Number(m[2]) || 0) / 3;
}

/** NPB 로그 이닝 "1.1"(=1⅓) → 실수 */
export const npbIpToNumber = (s: string | null) => ipToNumber(s ?? "0");

/** PlayerSeasonStatArchive 의 포스트시즌 출처 — 다른 출처(ts·af 축구)와 섞이지 않게 source 로 가른다 */
export const PS_ARCHIVE_SOURCE = { KBO: "kbo-ps", NPB: "npb-ps" } as const;
