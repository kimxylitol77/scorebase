// data/team-venues.json — 축구 팀 홈구장(venue) + 팀 메타(창단·외국인선수·시장가치·웹사이트).
//  TheSports football team/additional(venue_id·메타) + venue/list(uuid) 합성. teams/{축구팀} 보강.
//  Vercel 은 TheSports 호출 불가(IP whitelist) → 로컬 1회 수집 정적 json. 멱등(기존 merge).
//  npx tsx --env-file=.env.local scripts/build-team-venues.ts
import { PrismaClient } from "@prisma/client";
import { SOCCER_LEAGUES } from "../src/lib/sports/sport-leagues";
import { thesportsGet } from "../src/lib/sports/thesports/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const OUT = path.join(__dirname, "..", "data", "team-venues.json");

interface TeamVenue {
  venueName?: string;
  capacity?: number;
  city?: string;
  country?: string;
  foundation?: number;
  website?: string;
  marketValue?: number;
  currency?: string;
  totalPlayers?: number;
  foreignPlayers?: number;
}

async function main() {
  const lgs = [...SOCCER_LEAGUES];
  const tss = await prisma.teamSourceId.findMany({
    where: { source: "thesports", team: { league: { in: lgs } } },
    select: { externalId: true },
  });
  const tsIds = [...new Set(tss.map((t) => t.externalId))];
  const existing: Record<string, TeamVenue> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = tsIds.filter((id) => !existing[id]);
  console.log(`축구 ts팀 ${tsIds.length} / 기존 ${Object.keys(existing).length} / 조회 ${todo.length}`);

  const venueCache = new Map<string, { name?: string; capacity?: number; city?: string; country?: string }>();
  let ok = 0, miss = 0;
  for (const id of todo) {
    try {
      const add = await thesportsGet<{ code: number;
        results: Array<{ venue_id?: string; foundation_time?: number; website?: string; market_value?: number; market_value_currency?: string; total_players?: number; foreign_players?: number }>;
      }>("/v1/football/team/additional/list", { uuid: id });
      const a = add.results?.[0];
      if (!a) { miss++; await sleep(350); continue; }
      const tv: TeamVenue = {
        foundation: a.foundation_time || undefined,
        website: a.website || undefined,
        marketValue: a.market_value || undefined,
        currency: a.market_value_currency || undefined,
        totalPlayers: a.total_players || undefined,
        foreignPlayers: a.foreign_players || undefined,
      };
      if (a.venue_id) {
        let v = venueCache.get(a.venue_id);
        if (!v) {
          const vr = await thesportsGet<{ code: number; results: Array<{ name?: string; capacity?: number; city?: string; country?: string }> }>(
            "/v1/football/venue/list", { uuid: a.venue_id });
          v = vr.results?.[0] ?? {};
          venueCache.set(a.venue_id, v);
          await sleep(350);
        }
        tv.venueName = v.name;
        tv.capacity = v.capacity;
        tv.city = v.city;
        tv.country = v.country;
      }
      existing[id] = tv;
      ok++;
    } catch {
      miss++;
    }
    await sleep(350);
    if (ok && ok % 50 === 0) console.log(`  ${ok} 수집 (누적 ${Object.keys(existing).length})`);
  }
  fs.writeFileSync(OUT, JSON.stringify(existing));
  console.log(`수집 ${ok} / 실패 ${miss} → 총 ${Object.keys(existing).length}`);
  await prisma.$disconnect();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
main().catch((e) => { console.error("ERR", e); process.exit(1); });
