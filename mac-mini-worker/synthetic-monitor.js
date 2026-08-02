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

// 원문 노출 검사 — 한국어 화면에 일본어(가나·한자)가 그대로 나가는 것.
// 마커 검사는 "있어야 할 게 있나"만 보므로 이 유형은 원천적으로 못 잡았다
// (2026-07-31: 선발 투수·로스터·라이브 타자 표의 한자 이름을 사람이 먼저 발견).
//
// 원어 병기가 정상인 페이지(/players 의 "일본어 이름: 井上 温大")는 대상에서 뺀다.
// 검사는 script·style 제거 후 본문 텍스트에만 적용 — JSON-LD 원문은 화면이 아니다.
// 값이 안 채워진 채 렌더된 흔적. 정상 한국어 본문에는 나올 수 없는 문자열만 골랐다
// ("null"·"NaN" 은 영어 본문·팀명에 섞일 수 있어 제외).
const BROKEN_MARKERS = ["undefined", "[object Object]", "Invalid Date"];

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

// [경로, 필수 마커들, 최소 바이트, 옵션]
//   opts.noJapanese — 본문에 가나·한자가 하나라도 보이면 실패
const CHECKS = [
  ["/", ["숫자로 보는 경기", "라이브"], 30000],
  ["/scores", ["라이브 스코어"], 20000],
  ["/transfers?view=latest", ["최신 이적", "이적시장"], 30000],
  ["/transfers?view=team&team=1539", ["시장가치 Best XI", "감독"], 30000],
  ["/coaches/e4wyrn4h25dq86p", ["감독 경력", "선호 포메이션"], 15000],
  ["/leagues/KBO", ["KBO"], 15000],
  // 일본 선수명이 흐르는 경로 — 전부 한글이어야 한다
  ["/predictions/starters", ["선발"], 15000, { noJapanese: true }],
  ["/previews/NPB", ["NPB 경기 분석"], 10000, { noJapanese: true }],
  // NPB 12팀 전부 — 표본 2팀만 보던 때 나머지 10팀의 한자 노출을 놓쳤다
  //  (2026-08-02: 요미우리 1명만 잡혔는데 실제로는 7개 팀 14명. 1군 승격 선수가 팀별로 흩어진다).
  ...Array.from({ length: 12 }, (_, i) => [`/teams/${23329 + i}`, ["로스터"], 10000, { noJapanese: true }]),
  // 종목별 팀 페이지 1개씩 — 같은 라우트라도 종목마다 다른 소스를 타서 한 종목만 죽을 수 있다
  //  (2026-08-01 ISR 전환 뒤 NHL 32팀만 500 이었는데 감시 대상이 NPB 뿐이라 하루 넘게 못 봤다).
  ["/teams/719", ["로스터"], 10000], // NHL 뉴욕 아일랜더스
  ["/teams/515", ["로스터"], 10000], // NBA
  ["/teams/965", ["로스터"], 10000], // MLB
  ["/teams/3813", ["로스터"], 10000], // KBO
  ["/teams/1539", ["스쿼드"], 10000], // 축구
];

async function checkOne([p, markers, minBytes, opts]) {
  try {
    const r = await axios.get(`${SITE}${p}`, { timeout: 25_000, headers: UA, validateStatus: () => true });
    if (r.status !== 200) return `${p} → HTTP ${r.status}`;
    const html = String(r.data);
    if (html.length < minBytes) return `${p} → 본문 ${html.length}B < ${minBytes}B (빈 화면 의심)`;
    for (const m of markers) {
      if (!html.includes(m)) return `${p} → 마커 "${m}" 소실`;
    }
    const text = visibleText(html);
    // 렌더 사고 — 값이 안 채워진 채 화면에 나간 흔적. 전 페이지 공통.
    const broken = BROKEN_MARKERS.filter((m) => text.includes(m));
    if (broken.length) return `${p} → 깨진 값 노출: ${broken.join(", ")}`;
    if (opts?.noJapanese) {
      const hits = [...new Set(text.match(/[぀-ヿ㐀-鿿]+/g) ?? [])];
      if (hits.length) {
        return `${p} → 일본어 원문 노출 ${hits.length}건: ${hits.slice(0, 5).join(", ")}`;
      }
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
