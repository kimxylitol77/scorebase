// 발행 픽 마감 배당 비교(CLV) — PREVIEW 글이 발행될 때의 배당과 경기 직전 마지막 배당을 픽 쪽에서 비교한다.
// 픽 시점은 글 발행 시각 + 글에 저장된 predWinner 로 고정한다. Match.predWinner 는 갱신 시각이 없고
// 시장 배당 블렌드로 마감가를 따라가 순환 비교가 되므로 쓰지 않는다. 결정 근거는 reports/plans/accuracy-transparency/.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { ACCURACY_LEAGUES } from "@/lib/predict/accuracy-stats";
import { isSaneOdds } from "@/lib/predict/flat-roi";

export interface ClvGroup {
  n: number;
  /** 발행 가격 > 마감 가격 — 마감보다 좋은 가격에 픽을 냈다 */
  beat: number;
  /** 가격 변동 없음 */
  same: number;
  /** 평균 CLV (픽 배당 / 마감 배당 − 1) */
  avgClv: number;
}

export interface PickClvStat extends ClvGroup {
  /** 마감을 이긴 픽의 적중 / 표본 */
  beatWins: number;
  /** 마감을 못 이긴 픽(같음 포함)의 적중 / 표본 */
  otherWins: number;
  leagues: Array<ClvGroup & { league: string }>;
  asOf: string;
}

type Row = {
  league: string;
  pw: string;
  hs: number;
  as_: number;
  ph: number; pd: number | null; pa: number;
  ch: number; cd: number | null; ca: number;
};

async function computePickClvStats(): Promise<PickClvStat | null> {
  const leagueList = ACCURACY_LEAGUES.map((l) => `'${l}'`).join(",");
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT m.league, a."predWinner" AS pw, m."homeScore" AS hs, m."awayScore" AS as_,
           p."homeOdds" AS ph, p."drawOdds" AS pd, p."awayOdds" AS pa,
           c."homeOdds" AS ch, c."drawOdds" AS cd, c."awayOdds" AS ca
    FROM "Article" a
    JOIN "Match" m ON m.id = a."matchId"
    JOIN LATERAL (
      SELECT s."homeOdds", s."drawOdds", s."awayOdds" FROM "OddsSnapshot" s
      WHERE s."matchId" = m.id AND s."fetchedAt" <= COALESCE(a."publishedAt", a."createdAt")
      ORDER BY s."fetchedAt" DESC LIMIT 1
    ) p ON true
    JOIN LATERAL (
      SELECT s."homeOdds", s."drawOdds", s."awayOdds" FROM "OddsSnapshot" s
      WHERE s."matchId" = m.id AND s."fetchedAt" <= m."startTime"
      ORDER BY s."fetchedAt" DESC LIMIT 1
    ) c ON true
    WHERE a.type = 'PREVIEW' AND a."predWinner" IS NOT NULL
      AND m.status = 'FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL
      AND COALESCE(a."publishedAt", a."createdAt") < m."startTime"
      AND m.league IN (${leagueList})
  `);

  const empty = (): ClvGroup => ({ n: 0, beat: 0, same: 0, avgClv: 0 });
  const all = empty();
  const byLeague = new Map<string, ClvGroup>();
  let beatWins = 0;
  let otherWins = 0;
  for (const r of rows) {
    const i = r.pw === "HOME" ? 0 : r.pw === "DRAW" ? 1 : 2;
    const po = [r.ph, r.pd, r.pa][i];
    const co = [r.ch, r.cd, r.ca][i];
    if (!isSaneOdds(po) || !isSaneOdds(co)) continue;
    const clv = po / co - 1;
    const actual = r.hs > r.as_ ? 0 : r.hs === r.as_ ? 1 : 2;
    const won = i === actual;
    const isBeat = clv > 1e-9;
    const isSame = Math.abs(clv) <= 1e-9;
    if (won) {
      if (isBeat) beatWins++;
      else otherWins++;
    }
    const lg = byLeague.get(r.league) ?? empty();
    for (const g of [all, lg]) {
      g.n++;
      if (isBeat) g.beat++;
      if (isSame) g.same++;
      g.avgClv += clv; // 합계 — 아래에서 평균으로
    }
    byLeague.set(r.league, lg);
  }
  if (all.n === 0) return null;
  const finish = (g: ClvGroup) => ({ ...g, avgClv: g.avgClv / g.n });
  return {
    ...finish(all),
    beatWins,
    otherWins,
    leagues: [...byLeague.entries()].map(([league, g]) => ({ league, ...finish(g) })).sort((a, b) => b.n - a.n),
    asOf: new Date().toISOString(),
  };
}

/** 적중률 페이지와 통계 페이지가 같은 캐시 항목을 읽는다(두 화면 숫자 일치). */
export const pickClvStats = unstable_cache(computePickClvStats, ["pick-clv"], {
  revalidate: 3600,
  tags: ["flat-unit-roi"],
});
