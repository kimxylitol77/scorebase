// UFC(MMA) ESPN 보강 — ESPN scoreboard 1콜로 이벤트 전체(파이트카드)의
// 전적(W-L-D)·국기·헤드샷을 수집해 MmaFighter 에 채운다 (api-sports 가 못 주는 전적 + 안정적 헤드샷).
//   - 파이터 매칭: ESPN athlete.displayName === Team.name (둘 다 영문 풀네임, The Odds/ESPN 동일 표기).
//   - ESPN 은 임박한 이벤트만 풀데이터 → 먼 미래 매치는 미커버(이벤트 임박 시 cron 이 점진 채움).
//   - 헤드샷 URL = a.espncdn.com/i/headshots/mma/players/full/{competitor.id}.png (200 확인).
// 사용: npx tsx src/jobs/enrich-mma-espn.ts
import "@/lib/env";
import { prisma } from "@/lib/db";

const ESPN_SB = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";

interface EspnCompetitor {
  id?: string;
  winner?: boolean;
  athlete?: { displayName?: string; flag?: { href?: string } };
  records?: Array<{ summary?: string }>;
}
interface EspnEvent {
  name?: string;
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
}

async function fetchEspn(dates?: string): Promise<EspnEvent[]> {
  try {
    const r = await fetch(dates ? `${ESPN_SB}?dates=${dates}` : ESPN_SB);
    if (!r.ok) return [];
    return ((await r.json()) as { events?: EspnEvent[] }).events ?? [];
  } catch {
    return [];
  }
}

export async function runEnrichMmaEspn(): Promise<{ matched: number; events: number }> {
  // UFC Team name(영문) → teamId 맵 (ESPN displayName 매칭용)
  const teams = await prisma.team.findMany({ where: { league: "UFC" }, select: { id: true, name: true } });
  const byName = new Map(teams.map((t) => [t.name.toLowerCase(), t.id]));

  // 기본 scoreboard(임박 이벤트) — ESPN 은 다가오는 이벤트만 풀데이터 제공
  const events = await fetchEspn();
  let matched = 0;
  for (const ev of events) {
    for (const comp of ev.competitions ?? []) {
      for (const c of comp.competitors ?? []) {
        const name = c.athlete?.displayName;
        if (!name) continue;
        const teamId = byName.get(name.toLowerCase());
        if (teamId == null) continue; // 우리 매치에 없는 파이터 → skip
        const record = c.records?.find((r) => r.summary)?.summary ?? null;
        const espnId = c.id ?? null;
        const headshot = espnId
          ? `https://a.espncdn.com/i/headshots/mma/players/full/${espnId}.png`
          : null;
        const flagUrl = c.athlete?.flag?.href ?? null;
        // MmaFighter row 가 있어야 update 됨 (enrich-mma-fighters 가 먼저 73명 생성).
        // record 만 있고 다른 게 null 이면(과거 이벤트 등) 기존값 유지하도록 null 은 덮지 않음.
        await prisma.mmaFighter
          .update({
            where: { teamId },
            data: {
              record: record ?? undefined,
              espnId: espnId ?? undefined,
              headshot: headshot ?? undefined,
              flagUrl: flagUrl ?? undefined,
            },
          })
          .then(() => {
            matched++;
          })
          .catch(() => {}); // row 없으면 skip
      }
    }
  }
  console.log(`[mma-espn] ${events.length}이벤트 → ${matched}명 ESPN 보강(전적/국기/헤드샷)`);
  return { matched, events: events.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEnrichMmaEspn()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
