// lol-collector.js — TheSports lol/match/tournament → Scorebase /api/internal/lol-matches push.
// LCK 계열(본선·Cup) 일정·결과 자동 수집. systemd timer(oneshot, 6h 주기 — 경기 후 결과 동기화).
// BDL /lol/v1 401 대체 (2026-06-20). 라이브 아님 — 결과/일정 sync. League·팀 매핑은 route(서버)가 담당.
//
// 환경변수 (/home/ubuntu/.env): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;

// LCK 계열 토너먼트 id — src/lib/sports/lol-thesports.ts TS_LOL_TOURNAMENTS 와 일치.
// 워커는 어느 토너먼트를 호출할지만 알면 됨(League 결정은 route 가 tournament_id 로).
const TOURNAMENTS = ["l7oqd9kb6y6m510", "4wyrnxyt8jgm86p"]; // LCK 2026, LCK Cup 2026

if (!TS_USER || !TS_SECRET) {
  console.error("❌ THESPORTS_USER/SECRET missing");
  process.exit(1);
}
if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN missing");
  process.exit(1);
}

async function main() {
  const ts = new Date().toISOString();
  const all = [];
  for (const uuid of TOURNAMENTS) {
    try {
      const { data } = await axios.get(`${TS_BASE}/v1/lol/match/tournament`, {
        params: { user: TS_USER, secret: TS_SECRET, uuid },
        timeout: 25_000,
      });
      if (data.code === 0 && Array.isArray(data.results)) {
        all.push(...data.results);
      } else {
        console.error(`[${ts}] tournament ${uuid} code=${data.code}`);
      }
    } catch (e) {
      console.error(`[${ts}] tournament ${uuid} fail: ${e.message}`);
    }
  }
  // 0건이어도 POST — route 가 recordCronRun 으로 "실행됨" 기록(LCK 휴식기 오탐 방지).
  const res = await axios.post(
    `${SITE_URL}/api/internal/lol-matches`,
    { matches: all },
    {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      timeout: 60_000,
    },
  );
  console.log(`[${ts}] 🎮 LOL collect — fetched ${all.length}, ${JSON.stringify(res.data)}`);
}

main().catch((e) => {
  console.error(`fatal: ${e.message}`);
  process.exit(1);
});
