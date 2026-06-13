// ESPN 트랜잭션 수집 잡 — 북미 종목(NBA 우선, MLB/NHL 확장 가능) 트레이드·FA·방출 등.
// /api/cron/fetch-transactions 가 호출 + 수동: npm run job:transactions
//
// ESPN 은 Vercel 에서 직접 호출 가능(IP whitelist 불필요) → cron 에서 fetch → SportsTransaction upsert.
// 합성 id(espn-transactions.ts)로 멱등 — 같은 트랜잭션 재수집 시 update 만.

import { prisma } from "@/lib/db";
import {
  fetchEspnTransactions,
  translateDescriptions,
  type TxLeague,
} from "@/lib/sports/espn-transactions";

export async function runFetchTransactions(
  leagues: TxLeague[] = ["NBA"],
): Promise<{ league: TxLeague; fetched: number; upserted: number; translated: number }[]> {
  const summary: { league: TxLeague; fetched: number; upserted: number; translated: number }[] = [];

  for (const league of leagues) {
    const txs = await fetchEspnTransactions(league);

    // 이미 번역된 트랜잭션(descriptionKo 보유)은 재번역 skip — Haiku 호출 최소화(멱등).
    const existing = await prisma.sportsTransaction.findMany({
      where: { id: { in: txs.map((t) => t.id) }, descriptionKo: { not: null } },
      select: { id: true },
    });
    const alreadyKo = new Set(existing.map((e) => e.id));
    const toTranslate = txs.filter((t) => !alreadyKo.has(t.id));
    const koByIdx = toTranslate.length
      ? await translateDescriptions(toTranslate.map((t) => t.description))
      : [];
    const koById = new Map<string, string>();
    toTranslate.forEach((t, i) => {
      if (koByIdx[i]) koById.set(t.id, koByIdx[i]);
    });

    let upserted = 0;
    for (const t of txs) {
      const ko = koById.get(t.id); // 신규 번역분만 (기존은 update 에서 미지정→보존)
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
          descriptionKo: ko ?? null,
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
          // 신규 번역분만 기록 — 기존 descriptionKo 는 ko 가 undefined 면 건드리지 않음(보존).
          ...(ko ? { descriptionKo: ko } : {}),
        },
      });
      upserted++;
    }
    summary.push({ league, fetched: txs.length, upserted, translated: koById.size });
    console.log(
      `[fetch-transactions] ${league}: fetched ${txs.length} · upserted ${upserted} · 번역 ${koById.size}`,
    );
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
