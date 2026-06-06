// 빅리그 팀 스쿼드 수집 (영문명 + 포지션 복구용).
// team/squad/list?uuid={tsTeamId} 팀단위 호출 → {playerId, 영문명, position}.
// worker(TheSports IP)에서 실행. /tmp/big-teams.json(={tsTeamId: league}) 필요.
// 출력: /tmp/squad-big.json → 로컬 scp 후 position 보강 + Wikidata 이름/국적 보강에 영문명 사용.
//   node fetch-squad.js
const fs = require("fs");
(function loadEnv() {
  for (const p of ["/home/ubuntu/scorebase-worker/.env", "/home/ubuntu/scorebase-worker/src/.env", "/home/ubuntu/.env"]) {
    try {
      if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["]|["]$/g, "");
      }
    } catch (e) {}
  }
})();
const axios = require("/home/ubuntu/scorebase-worker/node_modules/axios");
const U = process.env.THESPORTS_USER, S = process.env.THESPORTS_SECRET, B = "https://api.thesports.com";
async function get(path, params) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await axios.get(B + path, { params: Object.assign({ user: U, secret: S }, params), timeout: 15000 });
      return r.data;
    } catch (e) {
      if (i === 2) return { err: (e.response && e.response.status) || e.code };
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}
const TEAMS = JSON.parse(fs.readFileSync("/tmp/big-teams.json", "utf8"));
const teamIds = Object.keys(TEAMS);
console.log("팀 수:", teamIds.length);
(async () => {
  const out = [];
  let i = 0, errs = 0;
  for (const tid of teamIds) {
    const d = await get("/v1/football/team/squad/list", { uuid: tid });
    if (d.err) { errs++; if (errs <= 5) console.log("ERR", tid, d.err); continue; }
    const r = (d.results || [])[0];
    if (r && Array.isArray(r.squad)) {
      for (const s of r.squad) {
        if (s.player && s.player.id) {
          out.push({ id: s.player.id, name: s.player.name || null, position: s.position || null, teamId: tid, league: TEAMS[tid] });
        }
      }
    }
    if (++i % 25 === 0) console.log(`${i}/${teamIds.length} teams, players ${out.length}`);
    await new Promise((r) => setTimeout(r, 120));
  }
  fs.writeFileSync("/tmp/squad-big.json", JSON.stringify(out));
  console.log(`DONE teams=${teamIds.length} errs=${errs} players=${out.length}`);
})();
