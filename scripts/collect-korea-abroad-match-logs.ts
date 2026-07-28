// 해외파 한국 선수 경기별 출전 로그 수집 → PlayerMatchLog (선수 페이지 "경기" 탭 동력).
//
// 왜 전용 스크립트인가: 기존 collect-player-match-logs 는 빅5+유럽대항전+빅5 국내컵만 훑고,
//   af↔ts 매핑(ts-af-player-map)이 있는 선수만 저장한다. 해외파는 리그도 매핑도 밖이라 9/25 만 있었다.
//
// 비용 절약: 리그 전수를 훑지 않는다. 리그 fixture 목록은 리그당 1콜이므로 먼저 받아
//   **우리 선수 소속팀이 낀 완료 경기만** 골라 경기당 1콜(/fixtures/players)을 쓴다.
//   해외파 25명 기준 리그 13콜 + 경기 약 900콜. af Ultra 일 75,000 한도 내.
//
//   npx tsx --env-file=.env.local scripts/collect-korea-abroad-match-logs.ts            (시즌 전체 backfill)
//   npx tsx --env-file=.env.local scripts/collect-korea-abroad-match-logs.ts --days=10  (주간 증분)
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fetchFixturesByLeagueId, fetchFixturePlayerStats, type AfFixtureRich } from "../src/lib/sports/api-football-pro";
import { LEAGUES } from "./build-korea-abroad";

const prisma = new PrismaClient();
const KA = path.join(__dirname, "..", "data", "korea-abroad.json");
const DAYS = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? "0");
const CONC = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Spell {
  league: string;
  team: { afId: number };
}
interface KaPlayer {
  afId: number;
  tsId: string | null;
  nameKo: string;
  league: string;
  team: { afId: number };
  spells: Spell[] | null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        out[i] = await fn(items[i]);
        await sleep(100);
      }
    }),
  );
  return out;
}

async function main() {
  const doc = JSON.parse(fs.readFileSync(KA, "utf8")) as { players: KaPlayer[] };
  const players = doc.players.filter((p) => p.tsId);
  const afToTs = new Map(players.map((p) => [p.afId, p.tsId!]));
  const nameOf = new Map(players.map((p) => [p.afId, p.nameKo]));

  // 선수가 실제로 뛴 (리그, 팀) 조합만 — 임대로 두 리그를 뛴 선수는 spells 도 포함
  const teamsByLeague = new Map<string, Set<number>>();
  for (const p of players) {
    const pairs = [{ league: p.league, afId: p.team.afId }, ...(p.spells ?? []).map((s) => ({ league: s.league, afId: s.team.afId }))];
    for (const { league, afId } of pairs) {
      if (!afId) continue;
      const set = teamsByLeague.get(league) ?? new Set<number>();
      set.add(afId);
      teamsByLeague.set(league, set);
    }
  }
  console.log(`대상 선수 ${players.length} · 리그 ${teamsByLeague.size}`);

  const from = DAYS ? new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 10) : undefined;

  // 1) 리그별 fixture 목록 (리그당 1콜) → 우리 팀이 낀 완료 경기만
  const wanted = new Map<number, AfFixtureRich>();
  for (const [code, teamSet] of teamsByLeague) {
    const lg = LEAGUES.find((l) => l.code === code);
    if (!lg) {
      console.log(`  ${code} — LEAGUES 정의 없음, 건너뜀`);
      continue;
    }
    const fixtures = await fetchFixturesByLeagueId(lg.afId, lg.season, from ? { from } : {});
    let hit = 0;
    for (const f of fixtures) {
      if (f.homeScore == null || f.awayScore == null) continue; // 미종료
      if (!teamSet.has(f.homeId) && !teamSet.has(f.awayId)) continue;
      wanted.set(f.id, f);
      hit++;
    }
    console.log(`  ${code.padEnd(16)} fixture ${fixtures.length} → 대상 ${hit}`);
    await sleep(250);
  }
  console.log(`\n경기별 선수 스탯 조회 ${wanted.size}건`);

  // 2) 경기당 1콜 → 우리 선수 행만 적재
  const fixtures = [...wanted.values()];
  let done = 0;
  const nested = await mapPool(fixtures, CONC, async (fx) => {
    const stats = await fetchFixturePlayerStats(fx.id);
    if (++done % 100 === 0) console.log(`  ...${done}/${fixtures.length}`);
    const rows = [];
    for (const s of stats) {
      const tsId = afToTs.get(s.playerId);
      if (!tsId) continue;
      rows.push({
        id: `match:${tsId}:${fx.id}`,
        playerId: tsId,
        fixtureId: fx.id,
        date: new Date(fx.dateMs),
        leagueName: fx.leagueName,
        leagueFlag: fx.leagueFlag ?? null,
        homeName: fx.homeName,
        homeLogo: fx.homeLogo ?? null,
        awayName: fx.awayName,
        awayLogo: fx.awayLogo ?? null,
        homeScore: fx.homeScore,
        awayScore: fx.awayScore,
        playerSide: s.teamId === fx.homeId ? "H" : "A",
        rating: s.rating,
        minutes: s.minutes,
        goals: s.goals,
        assists: s.assists,
        yellow: s.yellow,
        red: s.red,
        started: s.started,
      });
    }
    return rows;
  });

  const byId = new Map(nested.flat().map((r) => [r.id, r]));
  const unique = [...byId.values()];
  let created = 0;
  for (let i = 0; i < unique.length; i += 1000) {
    const r = await prisma.playerMatchLog.createMany({ data: unique.slice(i, i + 1000), skipDuplicates: true });
    created += r.count;
  }

  const perPlayer = new Map<string, number>();
  for (const r of unique) perPlayer.set(r.playerId, (perPlayer.get(r.playerId) ?? 0) + 1);
  console.log(`\nfixture ${fixtures.length} · 로그 행 ${unique.length} · 신규 ${created}`);
  for (const p of players) {
    const n = perPlayer.get(p.tsId!) ?? 0;
    if (n === 0) console.log(`  기록 없음: ${p.nameKo}`);
  }
  console.log(`선수별 평균 ${(unique.length / Math.max(1, perPlayer.size)).toFixed(1)}경기 · 기록 보유 ${perPlayer.size}/${players.length}`);
  void nameOf;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
