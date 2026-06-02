// UFC(MMA) collector — 경기·배당은 The Odds API, 파이터 프로필(사진)은 추후 api-sports.
// MMA 는 팀 스포츠가 아니라 파이터(개인)지만, Match.homeTeam/awayTeam(=파이터 Team) 재사용.
//   - Team: league="UFC", externalId="ufc-{slug(파이터명)}", name=파이터명
//   - Match: league="UFC", externalId=The Odds event id, home/awayTeamId=파이터
// 사용: npx tsx src/jobs/collect-mma.ts
import "@/lib/env";
import { prisma } from "@/lib/db";

const ODDS_BASE = "https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts";

function fighterExternalId(name: string): string {
  return "ufc-" + name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function upsertFighter(name: string): Promise<number> {
  const externalId = fighterExternalId(name);
  const t = await prisma.team.upsert({
    where: { league_externalId: { league: "UFC", externalId } },
    update: { name },
    create: { league: "UFC", externalId, name },
  });
  return t.id;
}

export async function runCollectMma() {
  const key = process.env.ODDS_API_KEY ?? "";
  if (!key) {
    console.error("[mma] ODDS_API_KEY 없음 — 중단");
    return;
  }

  // 1) 다가오는 경기 + h2h 배당
  const r = await fetch(`${ODDS_BASE}/odds?apiKey=${key}&regions=us&markets=h2h&oddsFormat=decimal`);
  const events: unknown = await r.json();
  if (!Array.isArray(events)) {
    console.error("[mma] odds 응답 이상:", JSON.stringify(events).slice(0, 200));
    return;
  }
  console.log(`[mma] odds ${events.length}경기 수신`);

  let n = 0;
  for (const ev of events as Array<Record<string, unknown>>) {
    const home = ev.home_team as string | undefined;
    const away = ev.away_team as string | undefined;
    const id = ev.id as string | undefined;
    const commence = ev.commence_time as string | undefined;
    if (!home || !away || !id || !commence) continue;
    const homeId = await upsertFighter(home);
    const awayId = await upsertFighter(away);
    await prisma.match.upsert({
      where: { league_externalId: { league: "UFC", externalId: id } },
      update: {
        homeTeamId: homeId,
        awayTeamId: awayId,
        startTime: new Date(commence),
        raw: JSON.stringify(ev),
      },
      create: {
        league: "UFC",
        externalId: id,
        homeTeamId: homeId,
        awayTeamId: awayId,
        status: "SCHEDULED",
        startTime: new Date(commence),
        raw: JSON.stringify(ev),
      },
    });
    n++;
  }
  console.log(`[mma] ${n}경기 upsert (파이터 Team 포함)`);

  // 2) 완료 경기 결과 — scores (status FINISHED + 승자)
  try {
    const sr = await fetch(`${ODDS_BASE}/scores?apiKey=${key}&daysFrom=3`);
    const scores: unknown = await sr.json();
    if (Array.isArray(scores)) {
      let done = 0;
      for (const ev of scores as Array<Record<string, unknown>>) {
        if (!ev.completed || !Array.isArray(ev.scores)) continue;
        const home = ev.home_team as string;
        const away = ev.away_team as string;
        const arr = ev.scores as Array<{ name: string; score: string }>;
        const hs = arr.find((s) => s.name === home)?.score;
        const as_ = arr.find((s) => s.name === away)?.score;
        await prisma.match.updateMany({
          where: { league: "UFC", externalId: ev.id as string },
          data: {
            status: "FINISHED",
            homeScore: hs != null ? Number(hs) : null,
            awayScore: as_ != null ? Number(as_) : null,
          },
        });
        done++;
      }
      console.log(`[mma] 결과 ${done}경기 FINISHED 반영`);
    }
  } catch (e) {
    console.warn("[mma] scores fetch 실패:", (e as Error).message);
  }

  await prisma.$disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCollectMma()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
