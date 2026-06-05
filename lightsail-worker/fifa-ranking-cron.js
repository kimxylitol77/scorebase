// FIFA 남/여 국가대표 + 클럽 순위 → POST /api/internal/ranking-cache → RankingCache upsert.
// FIFA 는 거의 안 변함 → 1일 1회. crontab 예: 0 9 * * * node ~/scorebase-worker/src/fifa-ranking-cron.js
const fs = require("fs");
(function loadEnv() {
  if (process.env.THESPORTS_USER) return;
  for (const p of ["/home/ubuntu/scorebase-worker/.env", "/home/ubuntu/scorebase-worker/src/.env", "/home/ubuntu/.env"]) {
    try {
      if (fs.existsSync(p)) {
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
          const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
          if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["]|["]$/g, "");
        }
      }
    } catch (e) {}
  }
})();
const axios = require("/home/ubuntu/scorebase-worker/node_modules/axios");
const U = process.env.THESPORTS_USER, S = process.env.THESPORTS_SECRET;
const B = "https://api.thesports.com";
const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;

async function getRank(path) {
  const r = await axios.get(B + path, { params: { user: U, secret: S }, timeout: 15000 });
  return r.data;
}
async function push(kind, payload, pubTime) {
  const r = await axios.post(
    SITE + "/api/internal/ranking-cache",
    { kind, payload, pubTime: pubTime ?? null },
    { headers: { authorization: "Bearer " + TOKEN }, timeout: 25000 },
  );
  console.log(kind + " pushed:", JSON.stringify(r.data));
}
// FIFA: results.items[{team{id,name,logo,country_logo}, region_id, ranking, points, previous_points, position_changed}]
function mapFifa(d) {
  const items = (d.results && d.results.items) || [];
  return items
    .map((i) => ({
      rank: i.ranking,
      name: i.team && i.team.name,
      teamId: i.team && i.team.id,
      points: i.points,
      regionId: i.region_id,
      prevPoints: i.previous_points,
      posChange: i.position_changed,
      logo: i.team && i.team.logo,
      countryLogo: i.team && i.team.country_logo,
    }))
    .filter((x) => x.name)
    .sort((a, b) => a.rank - b.rank);
}
// club: results[{team{id,name,logo}, ranking, points, ...}]
function mapClub(d) {
  const items = d.results || [];
  return items
    .map((i) => ({
      rank: i.ranking,
      name: i.team && i.team.name,
      teamId: i.team && i.team.id,
      points: i.points,
      logo: i.team && i.team.logo,
    }))
    .filter((x) => x.name)
    .sort((a, b) => a.rank - b.rank);
}

(async () => {
  const men = await getRank("/v1/football/ranking/fifa/men");
  await push("fifa_men", mapFifa(men), men.results && men.results.pub_time);

  const women = await getRank("/v1/football/ranking/fifa/women");
  await push("fifa_women", mapFifa(women), women.results && women.results.pub_time);

  const club = await getRank("/v1/football/ranking/club");
  await push("club", mapClub(club), null);

  console.log("fifa-ranking-cron DONE");
})().catch((e) => {
  console.log("FATAL", e.response ? e.response.status + " " + JSON.stringify(e.response.data).slice(0, 120) : e.message);
  process.exit(1);
});
