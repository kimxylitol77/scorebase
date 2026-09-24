// 박스스코어 선수(ts id) ↔ 공식 경기 기록 선수(KBO·NPB 번호)를 "그 경기 기록 줄"로 잇는 순수 함수.
// 이름 표기가 달라(오기·외국인 풀네임·순서 뒤집힘) 이름 매칭이 빠뜨린 선수를 메운다. DB 접근 없음 — 테스트 대상.
import type { PlayerStatRow } from "@/lib/sports/thesports/baseball-stats";

export interface OfficialLine {
  pid: string;
  role: "P" | "B";
  team: string | null;
  opponent: string;
  ab: number | null;
  h: number | null;
  rbi: number | null;
  r: number | null;
  hr: number | null;
  bb: number | null;
  so: number | null;
  ip: string | null;
  er: number | null;
}

/** 공식 이닝 표기 → 아웃 수. "5 2/3"=17, "2/3"=2, "5"=15. 해석 불가면 null. */
export function officialIpToOuts(ip: string | null): number | null {
  if (!ip) return null;
  const m = ip.trim().match(/^(?:(\d+)\s*)?(?:([12])\/3)?\+?$/);
  if (!m || (m[1] == null && m[2] == null)) return null;
  return Number(m[1] ?? 0) * 3 + Number(m[2] ?? 0);
}

/** ts 이닝(634) → 아웃 수. 5.2 = 5⅔ 표기. */
export function tsIpToOuts(v: number | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const whole = Math.floor(v + 1e-9);
  const frac = Math.round((v - whole) * 10);
  return frac >= 0 && frac <= 2 ? whole * 3 + frac : null;
}

// ts stat_id ↔ 공식 컬럼. 타자는 타수·안타가, 투수는 아웃 수가 양쪽에 있어야 비교한다.
const BATTER_KEYS: Array<[number, keyof OfficialLine]> = [
  [614, "ab"], [616, "h"], [617, "rbi"], [615, "r"], [621, "hr"], [651, "bb"], [650, "so"],
];
// 투수 자책점(636)은 비교에서 뺀다 — ts 가 구원 투수끼리 자책을 뒤섞는 일이 잦다(9/23 KT 로건 ts 4·공식 5, 주권·문용익 맞바뀜).
const PITCHER_KEYS: Array<[number, keyof OfficialLine]> = [[635, "h"], [637, "bb"], [638, "so"]];

function sameLine(ts: PlayerStatRow, o: OfficialLine): boolean {
  if (ts.role === "batter") {
    if (o.role !== "B" || ts.stats[614] == null || o.ab == null || ts.stats[616] == null || o.h == null) return false;
    return BATTER_KEYS.every(([id, k]) => ts.stats[id] == null || o[k] == null || ts.stats[id] === o[k]);
  }
  if (o.role !== "P") return false;
  const outs = tsIpToOuts(ts.stats[634]);
  if (outs == null || outs !== officialIpToOuts(o.ip)) return false;
  return PITCHER_KEYS.every(([id, k]) => ts.stats[id] == null || o[k] == null || ts.stats[id] === o[k]);
}

/**
 * 그 날짜 공식 기록 중에서 이 경기 두 팀을 찾아(팀 이름 매핑 없이 — 맞는 줄이 가장 많은 홈·원정 팀 쌍),
 * 아직 이어지지 않은 ts 선수를 기록 줄이 **유일하게** 같은 공식 선수에 잇는다.
 * - 후보가 둘 이상(예: 0타수 대주자들)이면 잇지 않는다.
 * - 두 ts 선수가 같은 공식 선수를 가리키면 둘 다 버린다.
 * - takenPids(이름으로 이미 이어진 번호)는 후보에서 뺀다.
 * 반환: ts id → 공식 번호.
 */
export function matchByStatLine(
  sides: { home: PlayerStatRow[]; away: PlayerStatRow[] },
  official: OfficialLine[],
  skipTsIds: Set<string>,
  takenPids: Set<string>,
): Record<string, string> {
  const byTeam = new Map<string, OfficialLine[]>();
  for (const o of official) {
    if (!o.team) continue;
    byTeam.set(o.team, [...(byTeam.get(o.team) ?? []), o]);
  }
  // 1) 경기 식별 — 이름으로 이미 이어진 선수까지 전부 넣어, 기록 줄이 하나라도 맞는 ts 선수가 가장 많은 (홈 팀, 원정 팀).
  const hitCount = (rows: PlayerStatRow[], pool: OfficialLine[]) => rows.filter((ts) => pool.some((o) => sameLine(ts, o))).length;
  let pair: { home: OfficialLine[]; away: OfficialLine[] } | null = null;
  let bestScore = 0;
  for (const rows of byTeam.values()) {
    const oppRows = byTeam.get(rows[0].opponent);
    if (!oppRows) continue;
    const score = hitCount(sides.home, rows) + hitCount(sides.away, oppRows);
    if (score > bestScore) { bestScore = score; pair = { home: rows, away: oppRows }; }
  }
  const total = sides.home.length + sides.away.length;
  // 우연히 맞는 한두 줄로 다른 경기를 고르지 않게 — 전체의 절반 이상이 맞아야 그 경기로 본다.
  if (!pair || bestScore < Math.max(3, total / 2)) return {};

  // 2) 배정 — 남은 ts 선수만, 이름으로 쓰인 번호를 뺀 후보 중 기록 줄이 유일하게 같은 선수.
  const assign = (rows: PlayerStatRow[], pool: OfficialLine[], into: Map<string, string>) => {
    const free = pool.filter((o) => !takenPids.has(o.pid));
    for (const ts of rows) {
      if (skipTsIds.has(ts.playerId)) continue;
      const pids = new Set(free.filter((o) => sameLine(ts, o)).map((o) => o.pid));
      if (pids.size === 1) into.set(ts.playerId, [...pids][0]);
    }
  };
  const found = new Map<string, string>();
  assign(sides.home, pair.home, found);
  assign(sides.away, pair.away, found);
  // 같은 공식 선수를 둘이 가리키면 둘 다 버린다.
  const count = new Map<string, number>();
  for (const pid of found.values()) count.set(pid, (count.get(pid) ?? 0) + 1);
  const out: Record<string, string> = {};
  for (const [tsId, pid] of found) if (count.get(pid) === 1) out[tsId] = pid;
  return out;
}

/**
 * 두 한글 이름이 같은 사람일 만한가 — 기록 줄 매칭의 두 번째 관문.
 * 기록 줄만으로는 소스 기록이 한 칸만 어긋나도 같은 줄의 다른 선수에 붙는다(9/24 실측 KBO·NPB 각 2% 불일치).
 * 오기(권휘동/권희동)·외국인 풀네임(사뮤엘 힐리어드/힐리어드)·음역 차(다이세이/타이세이)는 통과,
 * 전혀 다른 이름(후지이 겐토/안상현)은 막는다. 한쪽이 한글이 아니면 판단 불가 → false.
 */
export function namesLikelySame(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string) => s.replace(/[\s·・.\-]/g, "");
  const x = norm(a ?? "");
  const y = norm(b ?? "");
  if (!/^[가-힣]{2,}$/.test(x) || !/^[가-힣]{2,}$/.test(y)) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const pool = [...y];
  let common = 0;
  for (const ch of x) {
    const i = pool.indexOf(ch);
    if (i >= 0) {
      common++;
      pool.splice(i, 1);
    }
  }
  return common / Math.min(x.length, y.length) >= 0.5;
}

/**
 * 이름이 달라도 믿을 만큼 뚜렷한 일치인가 — ts 이름 사전이 이름 자체를 틀리게 준 경우(9/23 NC 라일리를 "벤자민 톰슨")를 살린다.
 * 투수 3이닝 이상, 타자 4타수 이상 + 안타 2개 이상이고, 비교에서 뺀 자책점까지 공식과 같을 때만.
 */
export function isDistinctiveExact(ts: PlayerStatRow, o: OfficialLine): boolean {
  if (ts.role === "pitcher") {
    const outs = tsIpToOuts(ts.stats[634]);
    return outs != null && outs >= 9 && ts.stats[636] != null && ts.stats[636] === o.er;
  }
  return (ts.stats[614] ?? 0) >= 4 && (ts.stats[616] ?? 0) >= 2;
}
