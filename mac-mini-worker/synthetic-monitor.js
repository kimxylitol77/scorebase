// synthetic-monitor.js — 시간당 핵심 페이지 "실제 콘텐츠" 합성 검증 (mac-mini).
//
// endpoint-monitor 는 응답코드만 봄 — "200 인데 빈 화면/핵심 섹션 소실"은 못 잡는다.
// SSR 사이트라 fetch HTML 에 본문이 다 있으므로 마커 문자열 검증으로 충분 (Playwright 불필요).
// 실패 시 heartbeat ok:false → 서버가 즉시 텔레그램 정밀 알림 (heartbeat v2).
//
// launchd: com.scorebase.synthetic-monitor (1h). 환경: mac-mini-worker/.env

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const axios = require("axios");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const UA = { "User-Agent": "scorebase-synthetic/1.0 (mac-mini internal monitor)" };

// [경로, 필수 마커들, 최소 바이트] — 마커는 SSR 본문에 항상 있어야 하는 텍스트
const CHECKS = [
  ["/", ["숫자로 보는 경기", "라이브"], 30000],
  ["/scores", ["라이브 스코어"], 20000],
  ["/transfers?view=latest", ["최신 이적", "이적시장"], 30000],
  ["/transfers?view=team&team=1539", ["시장가치 Best XI", "감독"], 30000],
  ["/coaches/e4wyrn4h25dq86p", ["감독 경력", "선호 포메이션"], 15000],
  ["/leagues/KBO", ["KBO"], 15000],
];

async function checkOne([p, markers, minBytes]) {
  try {
    const r = await axios.get(`${SITE}${p}`, { timeout: 25_000, headers: UA, validateStatus: () => true });
    if (r.status !== 200) return `${p} → HTTP ${r.status}`;
    const html = String(r.data);
    if (html.length < minBytes) return `${p} → 본문 ${html.length}B < ${minBytes}B (빈 화면 의심)`;
    for (const m of markers) {
      if (!html.includes(m)) return `${p} → 마커 "${m}" 소실`;
    }
    return null;
  } catch (e) {
    return `${p} → ${e.message}`;
  }
}

async function heartbeat(body) {
  try {
    await axios.post(
      `${SITE}/api/internal/bot-heartbeat`,
      { name: "mac-mini-synthetic-monitor", ...body },
      { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, timeout: 10_000 },
    );
  } catch { /* silent */ }
}

(async () => {
  const t0 = Date.now();
  const fails = [];
  for (const c of CHECKS) {
    const err = await checkOne(c);
    if (err) {
      // 일시 순단 흡수 — 10s 후 1회 재검 (자가치유와 동일 사상)
      await new Promise((r) => setTimeout(r, 10_000));
      const err2 = await checkOne(c);
      if (err2) fails.push(err2);
    }
  }
  const dur = Date.now() - t0;
  if (fails.length) {
    console.error(`❌ ${fails.length}건 실패:\n${fails.join("\n")}`);
    await heartbeat({ ok: false, durationMs: dur, error: fails.join(" | ").slice(0, 380) });
    process.exit(1);
  }
  console.log(`✓ ${CHECKS.length}개 페이지 정상 (${Math.round(dur / 1000)}s)`);
  await heartbeat({ ok: true, durationMs: dur, metadata: { pages: CHECKS.length } });
})();
