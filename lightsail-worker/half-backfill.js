// 일회성 백필 — 종료 매치 halfTeamStats 를 half/team_stats/detail(uuid) 로 수집.
// /home/ubuntu/half_backfill.json = [[matchId, tsUuid], ...] 를 읽어 각 detail → postCache.
// rate limit 120/min → 600ms 간격.
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (half-backfill)";
const fs = require("fs");
require("dotenv").config({ path: "/home/ubuntu/.env" });

const TS_BASE = "https://api.thesports.com";
const U = process.env.THESPORTS_USER;
const S = process.env.THESPORTS_SECRET;
const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const HDR = { Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}`, "Content-Type": "application/json" };

(async () => {
  const list = JSON.parse(fs.readFileSync("/home/ubuntu/half_backfill.json", "utf8"));
  console.log(`백필 시작: ${list.length}개`);
  let ok = 0, empty = 0, err = 0;
  for (const [matchId, uuid] of list) {
    try {
      const { data } = await axios.get(`${TS_BASE}/v1/football/match/half/team_stats/detail`, {
        params: { user: U, secret: S, uuid },
        timeout: 30000,
      });
      if (data && data.code === 0 && data.results && Object.keys(data.results).length > 0) {
        await axios.post(`${SITE}/api/internal/thesports-cache`,
          { matchId, tsMatchId: uuid, halfTeamStats: data.results },
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
  console.log(`백필 완료: ok=${ok} empty=${empty} err=${err}`);
})();
