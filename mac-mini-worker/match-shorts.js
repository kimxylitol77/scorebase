// 빅5 경기 종료 직후 데이터 카드 쇼츠 자동 생성·업로드 봇 (맥미니, 5분 주기).
//   1) DB: 최근 3시간 내 FINISHED 빅5 경기 중 state 에 없는 것
//   2) build-match-short.ts (종료코드 3 = xG 미제공 → 다음 tick 재시도, FT+90분 넘으면 포기)
//   3) Remotion 렌더 → youtube-upload.mts(비공개, 구글 검수 전) → 텔레그램 링크 → state 기록
//   상한: 리그당 하루 1편 (주말 40경기+ 가 유튜브 업로드 한도를 넘기므로). 테스트: node match-shorts.js --once <matchId>
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const { PrismaClient } = require("@prisma/client");

const SCOREBASE = path.resolve(__dirname, "..");
const SHORTS = path.join(process.env.HOME, "dev/scorebase-shorts");
const OUT = path.join(process.env.HOME, "dev/shorts-out");
const STATE = path.join(process.env.HOME, "dev/state/match-shorts.json");
const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const INTERVAL = 5 * 60_000, WINDOW_H = 3, GIVEUP_MIN = 90;
const PER_LEAGUE_PER_DAY = Number(process.env.MATCH_SHORTS_PER_LEAGUE || 1);
const p = new PrismaClient();
const log = (s) => console.log(`${new Date().toISOString()} ${s}`);
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return { done: {}, skipped: {} }; } };
const saveState = (st) => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(st, null, 2)); };
const kstDay = (d) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const tg = async (text) => { if (!process.env.TELEGRAM_BOT_TOKEN) return; await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }) }).catch(() => {}); };
const heartbeat = async () => { if (!TOKEN) return; await fetch(`${SITE}/api/internal/bot-heartbeat`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ bot: "mac-mini-match-shorts", host: require("node:os").hostname() }) }).catch(() => {}); };
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` }, maxBuffer: 64 << 20 });
const SELECT = { id: true, league: true, startTime: true, homeScore: true, awayScore: true, updatedAt: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } };

async function processMatch(m, st, { ignoreCap }) {
  const day = kstDay(m.startTime);
  const doneToday = Object.values(st.done).filter((d) => d.league === m.league && d.day === day).length;
  if (!ignoreCap && doneToday >= PER_LEAGUE_PER_DAY) { st.skipped[m.id] = { why: "league-cap", day }; return; }
  const ftAgeMin = (Date.now() - m.updatedAt.getTime()) / 60000;
  log(`▶ ${m.league} ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name} (FT+${Math.round(ftAgeMin)}분)`);
  const b = run("npx", ["tsx", "--env-file=.env.local", "scripts/shorts/build-match-short.ts", String(m.id)], SCOREBASE);
  if (b.status === 3) { if (ftAgeMin > GIVEUP_MIN) { st.skipped[m.id] = { why: "no-xg", day }; log("  xG 미제공 — 포기"); } else log("  xG 아직 없음 — 다음 tick"); return; }
  if (b.status !== 0) { st.skipped[m.id] = { why: "build-fail", day }; log(`  빌드 실패: ${(b.stderr || "").slice(-300)}`); await tg(`[경기 쇼츠] 빌드 실패 ${m.homeTeam.name} v ${m.awayTeam.name}\n${(b.stderr || "").slice(-200)}`); return; }
  const data = JSON.parse(fs.readFileSync(path.join(SHORTS, "data/match-short.json"), "utf8"));
  fs.writeFileSync(path.join(SHORTS, "data/_render_mss.json"), JSON.stringify(data.props));
  fs.mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, `경기쇼츠_${m.league}_${m.id}.mp4`);
  const r = run("npx", ["remotion", "render", "src/index.ts", "MatchShotShort", mp4, "--props=data/_render_mss.json", "--log=error"], SHORTS);
  if (r.status !== 0 || !fs.existsSync(mp4)) { st.skipped[m.id] = { why: "render-fail", day }; log(`  렌더 실패: ${(r.stderr || "").slice(-300)}`); await tg(`[경기 쇼츠] 렌더 실패 ${m.homeTeam.name} v ${m.awayTeam.name}`); return; }
  let url = "";
  if (process.env.YOUTUBE_REFRESH_TOKEN) {
    const u = run("npx", ["tsx", "--env-file=.env.local", "scripts/shorts/youtube-upload.mts", mp4, path.join(SHORTS, "data/match-short.json"), process.env.MATCH_SHORTS_PRIVACY || "private"], SCOREBASE);
    url = (u.stdout || "").trim(); if (u.status !== 0) log(`  업로드 실패: ${(u.stderr || "").slice(-300)}`);
  }
  const elapsed = Math.round((Date.now() - m.updatedAt.getTime()) / 60000);
  st.done[m.id] = { league: m.league, day, url, at: new Date().toISOString(), ftPlusMin: elapsed };
  log(`  ✓ 완료 FT+${elapsed}분 ${url || mp4}`);
  const P = data.props;
  await tg(`[경기 쇼츠] ${P.home.name} ${P.home.score}-${P.away.score} ${P.away.name}\nxG ${P.home.xg} vs ${P.away.xg} · FT+${elapsed}분\n${url ? url + "\n스튜디오에서 공개로 바꾸면 됩니다." : "업로드 생략 (토큰 없음): " + mp4}`);
}

async function tick() {
  await heartbeat();
  const st = loadState();
  const since = new Date(Date.now() - WINDOW_H * 3600000);
  const rows = await p.match.findMany({ where: { league: { in: BIG5 }, status: "FINISHED", startTime: { gte: new Date(since.getTime() - 2 * 3600000) }, updatedAt: { gte: since } }, select: SELECT });
  const cands = rows.filter((m) => !st.done[m.id] && !st.skipped[m.id]);
  if (!cands.length) return;
  for (const m of cands.sort((a, b) => b.updatedAt - a.updatedAt)) await processMatch(m, st, {});
  saveState(st);
}

async function once(matchId) {
  const m = await p.match.findUnique({ where: { id: matchId }, select: SELECT });
  if (!m) throw new Error(`경기 없음 ${matchId}`);
  const st = loadState(); delete st.done[m.id]; delete st.skipped[m.id];
  await processMatch(m, st, { ignoreCap: true }); saveState(st);
}

(async () => {
  const i = process.argv.indexOf("--once");
  if (i >= 0) { await once(Number(process.argv[i + 1])); await p.$disconnect(); return; }
  log("match-shorts 시작");
  for (;;) { try { await tick(); } catch (e) { log(`tick 오류: ${e.message}`); } await new Promise((r) => setTimeout(r, INTERVAL)); }
})();
