// ESPN 트랜잭션 수집 잡 — 북미 종목(NBA 우선, MLB/NHL 확장 가능) 트레이드·FA·방출 등.
// /api/cron/fetch-transactions 가 호출 + 수동: npm run job:transactions
//
// ESPN 은 Vercel 에서 직접 호출 가능(IP whitelist 불필요) → cron 에서 fetch → SportsTransaction upsert.
// 합성 id(espn-transactions.ts)로 멱등 — 같은 트랜잭션 재수집 시 update 만.

import { prisma } from "@/lib/db";
import { fetchEspnTransactions, type TxLeague } from "@/lib/sports/espn-transactions";

export async function runFetchTransactions(
  leagues: TxLeague[] = ["NBA"],
): Promise<{ league: TxLeague; fetched: number; upserted: number }[]> {
  const summary: { league: TxLeague; fetched: number; upserted: number }[] = [];

  for (const league of leagues) {
    const txs = await fetchEspnTransactions(league);
    let upserted = 0;
    for (const t of txs) {
      await prisma.sportsTransaction.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          league: t.league,
          date: t.date,
          teamId: t.teamId,
          teamName: t.teamName,
          teamAbbr: t.teamAbbr,
          teamLogo: t.teamLogo,
          description: t.description,
          category: t.category,
          playerName: t.playerName,
          position: t.position,
        },
        update: {
          // 설명/팀이 정정될 수 있어 재수집 시 갱신 (date·league·id 는 불변).
          teamId: t.teamId,
          teamName: t.teamName,
          teamAbbr: t.teamAbbr,
          teamLogo: t.teamLogo,
          description: t.description,
          category: t.category,
          playerName: t.playerName,
          position: t.position,
        },
      });
      upserted++;
    }
    summary.push({ league, fetched: txs.length, upserted });
    console.log(`[fetch-transactions] ${league}: fetched ${txs.length} · upserted ${upserted}`);
  }

  return summary;
}

// 직접 실행 (npm run job:transactions [NBA,MLB,NHL])
if (process.argv[1]?.includes("fetch-transactions")) {
  const arg = process.argv[2];
  const leagues = (arg ? arg.split(",") : ["NBA"]) as TxLeague[];
  runFetchTransactions(leagues)
    .then((s) => {
      console.log("done:", JSON.stringify(s));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
