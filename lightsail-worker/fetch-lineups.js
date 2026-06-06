// 빅5 라인업 수집 — 세부 포지션(x/y 좌표) 커버리지 확대용.
// match/recent/list?competition_id → 경기 → lineup/detail?uuid → 선수별 {position, x, y}.
// worker(TheSports IP)에서 실행. league-id-mapping.json 의 tsId(competition) 사용.
// 출력: /tmp/lineup-xy.json = [{id, position, x, y, n}] (n=출현수, x=중앙값) → 로컬 scp 후 세부 포지션 도출.
//   node fetch-lineups.js [perLeague]
const fs = require("fs");
(function loadEnv() {
  for (const p of ["/home/ubuntu/scorebase-worker/.env", "/home/ubuntu/scorebase-worker/src/.env", "/home/ubuntu/.env"]) {
    try { if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["]|["]$/g, "");
    }} catch (e) {}
  }
})();
const axios = require("/home/ubuntu/scorebase-worker/node_modules/axios");
const U = process.env.THESPORTS_USER, S = process.env.THESPORTS_SECRET, B = "https://api.thesports.com";
async function get(path, params) {
  for (let i = 0; i < 3; i++) {
    try { const r = await axios.get(B + path, { params: Object.assign({ user: U, secret: S }, params), timeout: 15000 }); return r.data; }
    catch (e) { if (i === 2) return { err: (e.response && e.response.status) || e.code }; await new Promise((r) => setTimeout(r, 1000)); }
  }
}
const MAP = "/home/ubuntu/scorebase-worker/src/league-id-mapping.json";
const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const PER = Number(process.argv[2] || "250");

function collect(lu, acc) {
  const root = (lu && lu.results) ? lu.results : lu;
  const lineup = (root && root.lineup) ? root.lineup : root;
  for (const k of ["home", "away"]) {
    const side = lineup && lineup[k];
    const players = Array.isArray(side) ? side : (side && side.players) || [];
    if (Array.isArray(players)) for (const p of players) {
      if (p && p.id && p.position && typeof p.x === "number") {
        let a = acc.get(p.id);
        if (!a) { a = { posCount: {}, xs: [], ys: [] }; acc.set(p.id, a); }
        a.posCount[p.position] = (a.posCount[p.position] || 0) + 1;
        a.xs.push(p.x); a.ys.push(typeof p.y === "number" ? p.y : 50);
      }
    }
  }
}
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const mode = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];

(async () => {
  const mapping = JSON.parse(fs.readFileSync(MAP, "utf8"));
  const comps = Object.values(mapping).filter((e) => BIG5.includes(e.code));
  console.log("빅5 대회:", comps.map((c) => c.code).join(", "), "| perLeague:", PER);
  const acc = new Map();
  let lineupCalls = 0, lineupOk = 0;
  for (const c of comps) {
    const ml = await get("/v1/football/match/recent/list", { competition_id: c.tsId });
    if (ml.err) { console.log(c.code, "match list ERR", ml.err); continue; }
    const matches = (ml.results || []).map((x) => x.id || x.match_id).filter(Boolean).slice(0, PER);
    console.log(`${c.code}: 경기 ${matches.length}`);
    for (let i = 0; i < matches.length; i++) {
      const lu = await get("/v1/football/match/lineup/detail", { uuid: matches[i] });
      lineupCalls++;
      if (!lu.err) { lineupOk++; collect(lu, acc); }
      if ((i + 1) % 50 === 0) console.log(`  ${c.code} ${i + 1}/${matches.length} | 선수 ${acc.size}`);
      await new Promise((r) => setTimeout(r, 90));
    }
  }
  const out = [...acc.entries()].map(([id, a]) => ({ id, position: mode(a.posCount), x: median(a.xs), y: median(a.ys), n: a.xs.length }));
  fs.writeFileSync("/tmp/lineup-xy.json", JSON.stringify(out));
  console.log(`DONE lineupCalls=${lineupCalls} ok=${lineupOk} 선수=${out.length}`);
})().catch((e) => console.log("FATAL", e.message));
