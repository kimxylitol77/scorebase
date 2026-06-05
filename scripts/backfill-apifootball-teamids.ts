// 빅리그 5개의 api-football team id 를 TeamSourceId(source='api-football') 에 backfill.
//
// 배경: 빅리그 Team.externalId 는 football-data.org id (Arsenal=57) 라서,
//       api-football /transfers?team=57 이 Ipswich(api-football id 57)를 리턴하던 버그가 있었다.
//       api-football 매핑을 TeamSourceId 에 따로 저장해 transfers route 가 올바른 id 를 쓰게 한다.
//       (빅리그 외 97개 리그는 이미 api-football 매핑이 있어 별도 backfill 불필요)
//
// 사용:
//   npx tsx --env-file=.env.local scripts/backfill-apifootball-teamids.ts          # dry-run (insert 안 함)
//   npx tsx --env-file=.env.local scripts/backfill-apifootball-teamids.ts --apply  # 실제 upsert
import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const KEY = process.env.API_FOOTBALL_KEY!;
const APPLY = process.argv.includes("--apply");

// 우리 league code → api-football league id (api-football-pro.ts 와 동일)
const LEAGUES: Record<string, number> = {
  EPL: 39,
  LALIGA: 140,
  BUNDESLIGA: 78,
  SERIE_A: 135,
  LIGUE_1: 61,
};
const SEASON = 2025; // 2025-26 시즌 = api-football season 시작연도

// 약칭/표기 차이 보조. norm 부분매칭으로 안 잡히는 우리 Team.name → api-football team name.
// dry-run 미매칭 결과를 보고 점진 보강.
const ALIAS: Record<string, string> = {
  "Man City": "Manchester City",
  "Man United": "Manchester United",
  "Wolverhampton": "Wolves",
  "Bayern Munich": "Bayern München",
  "Hamburg SV": "Hamburger SV",
  "TSG Hoffenheim": "Hoffenheim",
  "FC Cologne": "Köln",
  "Stade Rennais": "Rennes",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

async function main() {
  let totalMatched = 0;
  let totalMiss = 0;
  for (const [lg, afLeagueId] of Object.entries(LEAGUES)) {
    const res = await axios.get("https://v3.football.api-sports.io/teams", {
      params: { league: afLeagueId, season: SEASON },
      headers: { "x-apisports-key": KEY },
      timeout: 12000,
    });
    const afTeams: { id: number; name: string }[] = (res.data.response || []).map(
      (x: { team: { id: number; name: string } }) => ({ id: x.team.id, name: x.team.name }),
    );
    const ours = await prisma.team.findMany({
      where: { league: lg },
      select: { id: true, name: true },
    });
    const misses: string[] = [];
    for (const o of ours) {
      const target = ALIAS[o.name] || o.name;
      const on = norm(target);
      const hit = afTeams.find((a) => {
        const an = norm(a.name);
        return an === on || an.includes(on) || on.includes(an);
      });
      if (!hit) {
        misses.push(o.name);
        totalMiss++;
        continue;
      }
      totalMatched++;
      if (APPLY) {
        await prisma.teamSourceId.upsert({
          where: {
            league_source_externalId: {
              league: lg,
              source: "api-football",
              externalId: String(hit.id),
            },
          },
          create: { league: lg, source: "api-football", externalId: String(hit.id), teamId: o.id },
          update: { teamId: o.id },
        });
      }
      console.log(`${APPLY ? "UPSERT" : "MATCH "} ${lg} "${o.name}" -> af ${hit.id} (${hit.name})`);
    }
    if (misses.length) console.log(`  ${lg} MISS: ${JSON.stringify(misses)}`);
  }
  console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"}  matched=${totalMatched}  miss=${totalMiss}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERR", e?.response?.status, e?.message);
  process.exit(1);
});
