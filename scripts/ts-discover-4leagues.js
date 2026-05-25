// Discover 4 leagues (ARGENTINA_PL, BOLIVIA_PD, URUGUAY_PD, NWSL) in TheSports.
// Run on lightsail (IP whitelist required).
//   scp scripts/ts-discover-4leagues.js ubuntu@15.164.60.238:/home/ubuntu/scorebase-worker/src/
//   ssh ubuntu@... "cd /home/ubuntu/scorebase-worker/src && node ts-discover-4leagues.js"
//
// Output: /home/ubuntu/scorebase-worker/logs/ts-discover-4leagues.json

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const OUT = "/home/ubuntu/scorebase-worker/logs/ts-discover-4leagues.json";

if (!TS_USER || !TS_SECRET) { console.error("env missing"); process.exit(1); }

const SWEEP_DAYS = [];
for (let d = -7; d <= 14; d++) SWEEP_DAYS.push(d);

// Name patterns for 4 leagues.
// Multiple candidates per league (case-insensitive substring).
const TARGETS = {
  ARGENTINA_PL: [
    "argentin", // + (primera | liga profesional | torneo betano | copa de la liga prof)
  ],
  BOLIVIA_PD: [
    "bolivia", // + (división profesional | primera división)
  ],
  URUGUAY_PD: [
    "uruguay", // + (primera división | torneo intermedio | clausura | apertura)
  ],
  NWSL: [
    "nwsl", "women's soccer", "national women's soccer",
  ],
};

async function fetchDiary(tsp) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  return data;
}

function matchesLeague(name, ourLeague) {
  const n = (name || "").toLowerCase();
  if (ourLeague === "ARGENTINA_PL") {
    if (!n.includes("argentin")) return false;
    // 1부 = "Liga Profesional" 또는 "Primera Division" 또는 "Copa de la Liga Profesional"
    // 제외: "primera nacional" (2부), "primera b", "torneo federal" (3-4부), "copa argentina"
    if (n.includes("primera nacional")) return false;
    if (n.includes("primera b")) return false;
    if (n.includes("torneo federal")) return false;
    if (n.includes("federal a")) return false;
    if (n.includes("reserve")) return false;
    if (n.includes("women")) return false;
    if (n.includes("u-")) return false;
    if (n.includes("youth")) return false;
    return n.includes("liga profesional") || n.includes("primera division") || n.includes("primera división") || n.includes("copa de la liga prof");
  }
  if (ourLeague === "BOLIVIA_PD") {
    if (!n.includes("bolivia")) return false;
    if (n.includes("women")) return false;
    if (n.includes("u-")) return false;
    if (n.includes("youth")) return false;
    if (n.includes("copa")) return false;
    return n.includes("división profesional") || n.includes("division profesional") || n.includes("primera división") || n.includes("primera division");
  }
  if (ourLeague === "URUGUAY_PD") {
    if (!n.includes("uruguay")) return false;
    if (n.includes("women")) return false;
    if (n.includes("u-")) return false;
    if (n.includes("youth")) return false;
    if (n.includes("segunda")) return false;
    return n.includes("primera división") || n.includes("primera division") || n.includes("torneo intermedio") || n.includes("apertura") || n.includes("clausura");
  }
  if (ourLeague === "NWSL") {
    return n.includes("nwsl") || n.includes("national women's soccer");
  }
  return false;
}

async function main() {
  console.log(`Starting discovery — ${SWEEP_DAYS.length} day sweep`);
  // Map: competition_id → { name, our_league, team_ids: Set, team_meta: Map(team_id → name) }
  const found = new Map();
  const seenComp = new Map(); // comp_id → name (debug)

  for (const offset of SWEEP_DAYS) {
    const tsp = Math.floor(Date.now() / 1000) + offset * 86400;
    let data;
    try {
      data = await fetchDiary(tsp);
    } catch (e) {
      console.error(`  ✗ offset=${offset}: ${e.message}`);
      continue;
    }
    if (data.code !== 0) { console.error(`  ✗ offset=${offset} code=${data.code}`); continue; }
    const matches = data.results || [];
    const comps = (data.results_extra && data.results_extra.competition) || [];
    const teams = (data.results_extra && data.results_extra.team) || [];
    const compById = new Map(comps.map(c => [c.id, c]));
    const teamById = new Map(teams.map(t => [t.id, t]));

    for (const c of comps) seenComp.set(c.id, c.name);

    for (const m of matches) {
      const comp = compById.get(m.competition_id);
      if (!comp) continue;
      for (const ourLeague of Object.keys(TARGETS)) {
        if (matchesLeague(comp.name, ourLeague)) {
          if (!found.has(m.competition_id)) {
            found.set(m.competition_id, {
              competition_id: m.competition_id,
              competition_name: comp.name,
              our_league: ourLeague,
              cur_season_id: comp.cur_season_id,
              team_ids: new Set(),
              team_meta: new Map(),
            });
          }
          const f = found.get(m.competition_id);
          for (const tid of [m.home_team_id, m.away_team_id]) {
            f.team_ids.add(tid);
            const t = teamById.get(tid);
            if (t) f.team_meta.set(tid, { id: t.id, name: t.name, short_name: t.short_name, logo: t.logo, country_id: t.country_id });
          }
          break;
        }
      }
    }
    console.log(`  offset=${offset.toString().padStart(3)}: ${matches.length} matches, ${comps.length} comps, ${teams.length} teams, found=${found.size} competitions`);
  }

  // Serialize.
  const out = {};
  for (const ourLeague of Object.keys(TARGETS)) {
    out[ourLeague] = [];
  }
  for (const [cid, f] of found.entries()) {
    out[f.our_league].push({
      competition_id: cid,
      competition_name: f.competition_name,
      cur_season_id: f.cur_season_id,
      team_count: f.team_ids.size,
      teams: Array.from(f.team_meta.values()),
    });
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n✅ wrote ${OUT}`);
  for (const ourLeague of Object.keys(TARGETS)) {
    const arr = out[ourLeague];
    console.log(`  ${ourLeague}: ${arr.length} competitions, ${arr.reduce((s, c) => s + c.team_count, 0)} teams total`);
    for (const c of arr) console.log(`    - ${c.competition_id} ${c.competition_name} (${c.team_count} teams)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
