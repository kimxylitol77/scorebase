// half-backfill.js — 종료 매치의 halfTeamStats 를 half/team_stats/detail(uuid) 로 메운다.
//
// 왜 필요한가. football-poller 는 SCHEDULED|LIVE 매치만 순회하고 cycle 당 20건만 처리한다.
// 동시 진행이 20건을 넘으면 뒤쪽 매치는 순번을 못 받고, 그대로 종료되면 목록에서 빠져
// halfTeamStats 를 영영 못 채운다. delta list 엔드포인트도 직전 120s 변경분만 줘서
// 5분 cycle 이 대부분을 놓친다. 그래서 "끝난 뒤 uuid 로 다시 긁는" 이 경로가 필요하다.
// 2026-08-03 실측: 최근 30일 1,106건 누락, 표본 30건 전부 ts 에는 데이터가 있었다.
//
// 대상 목록은 서버가 준다 — GET /api/internal/football-half-missing?days=&limit=
// (예전엔 사람이 만든 /home/ubuntu/half_backfill.json 을 읽는 일회성 스크립트였다.
//  자동으로 안 돌아 매일 같은 구멍이 다시 생겼다.)
//
// rate limit 120/min → 600ms 간격.

const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (half-backfill)";
require("dotenv").config({ path: "/home/ubuntu/.env" });

const TS_BASE = "https://api.thesports.com";
const U = process.env.THESPORTS_USER;
const S = process.env.THESPORTS_SECRET;
const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const HDR = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const DAYS = parseInt(process.env.HALF_BACKFILL_DAYS || "3", 10);
const LIMIT = parseInt(process.env.HALF_BACKFILL_LIMIT || "400", 10);
const GAP_MS = 600;

if (!U || !S || !TOKEN) {
  console.error("❌ env missing (THESPORTS_USER/SECRET, INTERNAL_API_TOKEN)");
  process.exit(1);
}

(async () => {
  const startedAt = new Date().toISOString();
  let list;
  try {
    const { data } = await axios.get(`${SITE}/api/internal/football-half-missing`, {
      params: { days: DAYS, limit: LIMIT },
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 30000,
    });
    list = Array.isArray(data.matches) ? data.matches : [];
  } catch (e) {
    console.error(`[${startedAt}] ❌ 대상 목록 조회 실패: ${e.message}`);
    process.exit(1);
  }

  console.log(`[${startedAt}] 전반통계 백필 시작 — 대상 ${list.length}건 (최근 ${DAYS}일)`);
  let ok = 0, empty = 0, err = 0;
  for (const { matchId, tsMatchId } of list) {
    try {
      const { data } = await axios.get(`${TS_BASE}/v1/football/match/half/team_stats/detail`, {
        params: { user: U, secret: S, uuid: tsMatchId },
        timeout: 30000,
      });
      const p = data && data.code === 0 ? data.results : null;
      if (p && typeof p === "object" && p.p1 && Object.keys(p.p1).length > 0) {
        await axios.post(`${SITE}/api/internal/thesports-cache`,
          { matchId, tsMatchId, halfTeamStats: p },
          { headers: HDR, timeout: 30000 });
        ok++;
      } else {
        // ts 가 아직 안 만들었거나 그 매치엔 전반 통계 자체가 없음 — 실패 아님.
        empty++;
      }
    } catch (e) {
      err++;
      console.error(`  ✗ match=${matchId} uuid=${tsMatchId}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
  console.log(`[${new Date().toISOString()}] 백필 완료: 채움=${ok} 미제공=${empty} 실패=${err}`);
})();
