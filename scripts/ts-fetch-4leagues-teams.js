// Fetch teams for 4 specific competition_ids via diary sweep.
require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
const fs = require("fs");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const OUT = "/home/ubuntu/scorebase-worker/logs/ts-fetch-4leagues-teams.json";

const TARGETS = {
  ARGENTINA_PL: "p3glrw7hevqdyjv",
  BOLIVIA_PD: "kn54qllh02qvy9d",
  URUGUAY_PD: "v2y8m4zhydql074",
  NWSL: "4zp5rzghvzq82w1",
};
const TARGET_IDS = new Set(Object.values(TARGETS));
const REVERSE = Object.fromEntries(Object.entries(TARGETS).map(([k,v]) => [v,k]));

async function fetchDiary(tsp) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp }, timeout: 30_000,
  });
  return data;
}

async function main() {
  // Map: comp_id → { competition_name, cur_season_id, teams: Map(team_id → meta) }
  const acc = {};
  for (const cid of TARGET_IDS) acc[cid] = { competition_id: cid, competition_name: null, cur_season_id: null, teams: new Map() };

  for (let d = -14; d <= 21; d++) {
    const tsp = Math.floor(Date.now() / 1000) + d * 86400;
    let data;
    try { data = await fetchDiary(tsp); } catch (e) { console.error(`offset=${d}: ${e.message}`); continue; }
    if (data.code !== 0) continue;
    const comps = (data.results_extra && data.results_extra.competition) || [];
    const teams = (data.results_extra && data.results_extra.team) || [];
    const matches = data.results || [];
    const compById = new Map(comps.map(c => [c.id, c]));
    const teamById = new Map(teams.map(t => [t.id, t]));

    let hits = 0;
    for (const m of matches) {
      if (!TARGET_IDS.has(m.competition_id)) continue;
      hits++;
      const meta = compById.get(m.competition_id);
      if (meta) {
        acc[m.competition_id].competition_name = meta.name;
        acc[m.competition_id].cur_season_id = meta.cur_season_id;
      }
      for (const tid of [m.home_team_id, m.away_team_id]) {
        if (!acc[m.competition_id].teams.has(tid)) {
          const t = teamById.get(tid);
          acc[m.competition_id].teams.set(tid, t ? { id: t.id, name: t.name, short_name: t.short_name, logo: t.logo, country_id: t.country_id } : { id: tid, name: null });
        }
      }
    }
    if (hits > 0) console.log(`  offset=${d.toString().padStart(3)}: ${hits} hits`);
  }

  // Serialize per our league code.
  const out = {};
  for (const cid of TARGET_IDS) {
    const ourLeague = REVERSE[cid];
    const a = acc[cid];
    out[ourLeague] = {
      competition_id: cid,
      competition_name: a.competition_name,
      cur_season_id: a.cur_season_id,
      team_count: a.teams.size,
      teams: Array.from(a.teams.values()),
    };
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n✅ wrote ${OUT}`);
  for (const k of Object.keys(out)) {
    console.log(`  ${k}: ${out[k].team_count} teams (${out[k].competition_name})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
