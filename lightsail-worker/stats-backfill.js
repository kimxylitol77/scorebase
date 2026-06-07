// 범용 stats 백필 — team_stats 또는 half/team_stats 를 detail(uuid) 로 수집.
// 사용: node stats-backfill.js <team|half>
// /home/ubuntu/stats_backfill.json = [[matchId, tsUuid], ...] 를 읽어 각 detail → postCache.
// rate limit 120/min → 600ms 간격.
const axios = require("axios");
const fs = require("fs");
require("dotenv").config({ path: "/home/ubuntu/.env" });

const TYPE = process.argv[2] === "team" ? "team" : "half";
const EP = TYPE === "team" ? "team_stats/detail" : "half/team_stats/detail";
const KEY = TYPE === "team" ? "teamStats" : "halfTeamStats";
const isValid =
  TYPE === "team"
    ? (r) => Array.isArray(r) && r.length >= 2
    : (r) => r && typeof r === "object" && Object.keys(r).length > 0;

const TS_BASE = "https://api.thesports.com";
const U = process.env.THESPORTS_USER;
const S = process.env.THESPORTS_SECRET;
const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const HDR = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}`, "Content-Type": "application/json" };

(async () => {
  const list = JSON.parse(fs.readFileSync("/home/ubuntu/stats_backfill.json", "utf8"));
  console.log(`${TYPE} 백필 시작: ${list.length}개`);
  let ok = 0, empty = 0, err = 0;
  for (const [matchId, uuid] of list) {
    try {
      const { data } = await axios.get(`${TS_BASE}/v1/football/match/${EP}`, {
        params: { user: U, secret: S, uuid },
        timeout: 30000,
      });
      if (data && data.code === 0 && isValid(data.results)) {
        await axios.post(`${SITE}/api/internal/thesports-cache`,
          { matchId, tsMatchId: uuid, [KEY]: data.results },
          { headers: HDR, timeout: 30000 });
        ok++;
      } else {
        empty++;
      }
    } catch (e) {
      err++;
      console.error(`  ✗ ${uuid}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log(`${TYPE} 백필 완료: ok=${ok} empty=${empty} err=${err}`);
})();
