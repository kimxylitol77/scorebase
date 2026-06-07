// 부류 B 리그의 실제 TheSports competition_id 검증.
// /home/ubuntu/verify_comp.json = { league: { registered, teams: [tsId...] } }
// diary 를 여러 날 받아 우리 팀 ts_id 가 실제 어느 competition_id 로 오는지 최빈값 산출.
// 사용: node verify-comp.js
const axios = require("axios");
const fs = require("fs");
require("dotenv").config({ path: "/home/ubuntu/.env" });
const U = process.env.THESPORTS_USER;
const S = process.env.THESPORTS_SECRET;
const TS = "https://api.thesports.com";

(async () => {
  const list = JSON.parse(fs.readFileSync("/home/ubuntu/verify_comp.json", "utf8"));
  const teamComp = {}; // teamId -> { compId: count }
  const now = Math.floor(Date.now() / 1000);
  for (let off = -12; off <= 3; off++) {
    try {
      const { data } = await axios.get(`${TS}/v1/football/match/diary`, {
        params: { user: U, secret: S, tsp: now + off * 86400 },
        timeout: 30000,
      });
      for (const m of data.results || []) {
        const comp = m.competition_id;
        for (const tid of [m.home_team_id, m.away_team_id]) {
          if (!tid) continue;
          teamComp[tid] = teamComp[tid] || {};
          teamComp[tid][comp] = (teamComp[tid][comp] || 0) + 1;
        }
      }
    } catch (e) { /* skip */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log("리그별 competition id (등록 vs 실제 diary):");
  for (const [lg, info] of Object.entries(list)) {
    const cc = {};
    for (const t of info.teams) {
      const m = teamComp[t];
      if (m) for (const c in m) cc[c] = (cc[c] || 0) + m[c];
    }
    const sorted = Object.entries(cc).sort((a, b) => b[1] - a[1]);
    const actual = sorted[0] ? sorted[0][0] : null;
    const st = !actual ? "팀 diary 안나옴" : actual === info.registered ? "OK" : "★MISMATCH → " + actual;
    console.log(`${lg.padEnd(22)} reg=${info.registered || "-"}  ${st}`);
  }
})();
