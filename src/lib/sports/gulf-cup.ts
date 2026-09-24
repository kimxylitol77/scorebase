// 걸프컵(제27회, 2026 제다) 조별리그 규칙 — 조 판별·자체 순위 계산·확정 구역.
// 공식 조 편성(9/23 개막 전 추첨): A조 사우디(개최국)·이라크·오만·쿠웨이트 / B조 바레인·UAE·카타르·예멘.
// 조별 1회전 3라운드, 조 1·2위 4강. af·ts 모두 순위표를 주지 않아(af coverage.standings=false)
// 종료 경기로 직접 계산한다. prisma 없음(테스트용).

export const GULF_MATCHDAYS = 3;
/** 개최국 — 이 팀이 속한 조가 A조(공식 추첨). 경기 데이터엔 조 이름이 없다. */
export const GULF_HOST = "Saudi Arabia";

/** 조별리그 경기로 팀을 조로 묶는다 — 같은 조끼리만 붙으므로 연결된 팀끼리 한 조. */
export function groupTeams(pairs: Array<[number, number]>): number[][] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const [a, b] of pairs) parent.set(find(a), find(b));
  const groups = new Map<number, number[]>();
  for (const x of parent.keys()) {
    const r = find(x);
    groups.set(r, [...(groups.get(r) ?? []), x]);
  }
  return [...groups.values()];
}

export interface GulfResult {
  homeId: number;
  awayId: number;
  homeScore: number;
  awayScore: number;
}
export interface GulfRow {
  teamId: number;
  position: number;
  played: number;
  won: number;
  draw: number;
  loss: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

/**
 * 종료 경기로 조 순위 — 승점 → 득실 → 다득점. 여기서 가르지 못하는 동률은 순서가 임시다
 * (공식 규정은 상대 전적 등을 먼저 볼 수 있다). 동률끼리는 같은 순위 번호를 준다.
 * @param nameOf 동률일 때 화면 순서를 고정하기 위한 이름(순위 번호엔 영향 없음)
 */
export function computeGroupTable(teamIds: number[], results: GulfResult[], nameOf: (id: number) => string): GulfRow[] {
  const acc = new Map<number, GulfRow>(
    teamIds.map((id) => [id, { teamId: id, position: 0, played: 0, won: 0, draw: 0, loss: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 }]),
  );
  for (const r of results) {
    const h = acc.get(r.homeId);
    const a = acc.get(r.awayId);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.goalsFor += r.homeScore; h.goalsAgainst += r.awayScore;
    a.goalsFor += r.awayScore; a.goalsAgainst += r.homeScore;
    if (r.homeScore > r.awayScore) { h.won++; a.loss++; h.points += 3; }
    else if (r.homeScore < r.awayScore) { a.won++; h.loss++; a.points += 3; }
    else { h.draw++; a.draw++; h.points++; a.points++; }
  }
  const rows = [...acc.values()].map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }));
  const key = (r: GulfRow) => [r.points, r.goalDiff, r.goalsFor] as const;
  const cmp = (x: GulfRow, y: GulfRow) => {
    const [a, b] = [key(x), key(y)];
    return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
  };
  rows.sort((x, y) => cmp(x, y) || nameOf(x.teamId).localeCompare(nameOf(y.teamId), "ko"));
  rows.forEach((r, i) => {
    r.position = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].position : i + 1;
  });
  return rows;
}

/**
 * 4강권(1·2위) 표시 — computeGroupTable 순서 그대로 받는다. 조에서 한 경기라도 치른 뒤에만,
 * 그리고 세 번째 줄과 완전 동률인 팀은 빼고. 동률이면 우리 계산 순서가 공식과 다를 수 있다.
 * (순위 번호로 비교하면 2위가 두 팀 동률일 때 둘 다 칠해진다 — 줄 순서로 본다.)
 */
export function gulfZones(rows: GulfRow[], groupPlayed: boolean): ("sf" | null)[] {
  if (!groupPlayed) return rows.map(() => null);
  const third = rows[2];
  const tied = (a: GulfRow, b: GulfRow) => a.points === b.points && a.goalDiff === b.goalDiff && a.goalsFor === b.goalsFor;
  return rows.map((r, i) => (i < 2 && !(third && tied(r, third)) ? "sf" : null));
}
