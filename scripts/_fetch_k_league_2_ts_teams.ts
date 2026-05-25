import axios from "axios";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const K_LEAGUE_2_CID = "kn54qllh25dqvy9";

if (!TS_USER || !TS_SECRET) {
  console.error("THESPORTS_USER / THESPORTS_SECRET 없음");
  process.exit(1);
}

async function fetchDiary(tsp: number) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  return data;
}

async function main() {
  const teams = new Map<string, { id: string; name: string; short_name?: string; logo?: string; country_id?: string }>();
  for (let d = -21; d <= 21; d++) {
    const tsp = Math.floor(Date.now() / 1000) + d * 86400;
    let data;
    try { data = await fetchDiary(tsp); } catch (e: any) { console.error(`offset=${d}: ${e.message}`); continue; }
    if (data.code !== 0) continue;
    const teamArr = (data.results_extra?.team ?? []) as Array<{ id: string; name: string; short_name?: string; logo?: string; country_id?: string }>;
    const teamById = new Map(teamArr.map((t) => [t.id, t]));
    const matches = data.results ?? [];
    let hits = 0;
    for (const m of matches) {
      if (m.competition_id !== K_LEAGUE_2_CID) continue;
      hits++;
      for (const tid of [m.home_team_id, m.away_team_id]) {
        if (!tid || teams.has(tid)) continue;
        const t = teamById.get(tid);
        teams.set(tid, t ? { id: t.id, name: t.name, short_name: t.short_name, logo: t.logo, country_id: t.country_id } : { id: tid, name: "(unknown)" });
      }
    }
    if (hits > 0) console.log(`  offset=${String(d).padStart(3)}: ${hits} hits`);
  }
  console.log(`\nK_LEAGUE_2 teams (${teams.size}):`);
  for (const t of teams.values()) {
    console.log(`  ${t.id}  ${t.name}${t.short_name ? `  (short=${t.short_name})` : ""}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
