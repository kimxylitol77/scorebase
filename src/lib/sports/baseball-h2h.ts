// KBO 팀 간 상대전적 매트릭스 — DB Match(FINISHED) 직접 집계.
// KBO 는 연장 12회 무승부 제도 → 승-무-패 3값. 시즌 범위는 3/1~ (시범경기는 collect 미수집 전제).
import { prisma } from "@/lib/db";

export interface H2HCell {
  w: number;
  d: number;
  l: number;
}

export interface H2HMatrix {
  /** 표시 순서 (현재 승률 순) 팀명 배열 */
  teams: string[];
  /** cells[행 팀][열 팀] = 행 팀 기준 상대전적 */
  cells: Record<string, Record<string, H2HCell>>;
}

/** league(기본 KBO) 의 올 시즌 팀 간 상대전적. 경기 0건이면 null. */
export async function getBaseballH2H(league = "KBO", seasonStart = "2026-03-01"): Promise<H2HMatrix | null> {
  const matches = await prisma.match.findMany({
    where: {
      league: league as never,
      status: "FINISHED",
      startTime: { gte: new Date(`${seasonStart}T00:00:00+09:00`) },
    },
    select: {
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (matches.length === 0) return null;

  const cells: Record<string, Record<string, H2HCell>> = {};
  const totals = new Map<string, { w: number; l: number }>(); // 정렬용 (승률)
  const cell = (a: string, b: string): H2HCell => {
    cells[a] ??= {};
    cells[a][b] ??= { w: 0, d: 0, l: 0 };
    return cells[a][b];
  };
  const tot = (t: string) => {
    if (!totals.has(t)) totals.set(t, { w: 0, l: 0 });
    return totals.get(t)!;
  };

  for (const m of matches) {
    const h = m.homeTeam.name;
    const a = m.awayTeam.name;
    const hs = m.homeScore ?? 0;
    const as = m.awayScore ?? 0;
    if (hs > as) { cell(h, a).w++; cell(a, h).l++; tot(h).w++; tot(a).l++; }
    else if (hs < as) { cell(h, a).l++; cell(a, h).w++; tot(a).w++; tot(h).l++; }
    else { cell(h, a).d++; cell(a, h).d++; }
  }

  // 현재 승률 순 정렬 (무승부 제외 승률 — KBO 공식 방식)
  const teams = [...totals.keys()].sort((x, y) => {
    const tx = totals.get(x)!;
    const ty = totals.get(y)!;
    const px = tx.w + tx.l > 0 ? tx.w / (tx.w + tx.l) : 0;
    const py = ty.w + ty.l > 0 ? ty.w / (ty.w + ty.l) : 0;
    return py - px || x.localeCompare(y);
  });
  return { teams, cells };
}
