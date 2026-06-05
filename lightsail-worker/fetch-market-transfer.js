// 빅리그 선수 몸값 + 이적 수집 (우회: worker fetch → JSON → 로컬 upsert).
// worker(TheSports IP)에서 실행. /tmp/big-teams.json(={tsTeamId: league}) 필요.
// 출력: /tmp/market-big.json, /tmp/transfer-big.json → 로컬 scp 후 PlayerMarketValue/FootballTransfer upsert.
//   node fetch-market-transfer.js
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
const TEAMS = JSON.parse(fs.readFileSync("/tmp/big-teams.json", "utf8"));
const teamSet = new Set(Object.keys(TEAMS));
console.log("big teams loaded:", teamSet.size);

async function get(path, params) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await axios.get(B + path, { params: Object.assign({ user: U, secret: S }, params), timeout: 15000 });
      return r.data;
    } catch (e) {
      if (i === 2) return { err: (e.response && e.response.status) || e.code };
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

async function fetchAll(path, filterFn, label) {
  const out = [];
  let page = 1;
  while (page <= 3000) {
    const d = await get(path, { page });
    if (d.err) { console.log(label + " page " + page + " ERR " + d.err); break; }
    const res = d.results || [];
    if (res.length === 0) break;
    for (const r of res) if (filterFn(r)) out.push(r);
    if (page % 25 === 0) console.log(label + " page " + page + " kept " + out.length);
    page++;
  }
  console.log(label + " DONE pages~" + (page - 1) + " kept " + out.length);
  return out;
}

const MODE = process.argv[2] || "all";
(async () => {
  if (MODE === "all" || MODE === "market") {
    const market = await fetchAll(
      "/v1/football/player/market/list",
      (x) => (x.history || []).some((h) => teamSet.has(h.team_id)),
      "market",
    );
    fs.writeFileSync("/tmp/market-big.json", JSON.stringify(market));
    console.log("market saved " + market.length);
  }
  if (MODE === "all" || MODE === "transfer") {
    const transfer = await fetchAll(
      "/v1/football/transfer/list",
      (x) => teamSet.has(x.to_team_id) || teamSet.has(x.from_team_id),
      "transfer",
    );
    fs.writeFileSync("/tmp/transfer-big.json", JSON.stringify(transfer));
    console.log("transfer saved " + transfer.length);
  }
  console.log("MODE " + MODE + " DONE");
})().catch((e) => console.log("FATAL", e.message));
