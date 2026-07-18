// kbo-player-names-cron.js — Lightsail daily cron (KST 03:00 = UTC 18:00).
// (파일명은 레거시 'kbo' 지만 KBO/NPB/MLB 전부 커버 — service/timer 그대로 사용)
//
// 흐름 (리그별 반복):
//   1) GET {SITE_URL}/api/internal/baseball-missing-player-ids?days=7&league=<L>
//      → missingIds (row 없음) + nameKoNullIds (row 있지만 nameKo NULL)
//   2) 각 ts player_id → TheSports player/list?uuid={id} 로 영문/로마자명 fetch
//   3) Anthropic API (Haiku) batch 50명 → 한국어 음역 (리그별 표기 기준 prompt)
//   4) POST {SITE_URL}/api/internal/ts-baseball-players { players: [{id, name, nameKo, sport:<L>}] }
//   5) (KBO 전용) KBO 공식 API 로 photo enrich
//
// 환경변수: THESPORTS_USER, THESPORTS_SECRET, ANTHROPIC_API_KEY, SITE_URL, INTERNAL_API_TOKEN
//          PLAYER_NAME_LEAGUES (선택, 기본 "KBO,NPB,MLB")
// 매일 03:00 KST.

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (kbo-player-names-cron)";

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const LEAGUES = (process.env.PLAYER_NAME_LEAGUES || "KBO,NPB,MLB,LMB,CPBL")
  .split(",").map((s) => s.trim()).filter(Boolean);
const DAYS = 7;
const BATCH = 50;
const KBO_SEARCH_URL = "https://www.koreabaseball.com/ws/Controls.asmx/GetSearchPlayer";
const KBO_PHOTO_BASE = "https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle";
const KBO_PHOTO_YEAR = new Date().getFullYear();

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("❌ ANTHROPIC_API_KEY missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

// 리그별 음역 prompt 헤더 — 표기 기준이 다름 (KBO 한국선수 / NPB 일본선수 / MLB 영미).
function promptIntro(league) {
  if (league === "NPB") {
    return (
      "다음 NPB (일본 프로야구) 로마자 선수 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n" +
      "참고: 네이버/다음 스포츠 일본야구 표기 기준. 일본 선수는 '성 이름' 순서.\n" +
      "- 일본 선수: Shohei Ohtani → 오타니 쇼헤이, Munetaka Murakami → 무라카미 무네타카, Roki Sasaki → 사사키 로키\n" +
      "- 외국인 용병: 음역 (예: Tyler Austin → 타일러 오스틴)\n" +
      "- 한 단어만 있으면 그대로 음역 (Tima → 티마)\n"
    );
  }
  if (league === "MLB") {
    return (
      "다음 MLB (메이저리그) 영문 선수 이름을 한국 스포츠 미디어 표기로 음역해주세요.\n" +
      "참고: 네이버/스탯티즈 MLB 표기 기준.\n" +
      "- Mike Trout → 마이크 트라웃, Aaron Judge → 애런 저지, Shohei Ohtani → 오타니 쇼헤이(일본계는 일본식)\n" +
      "- 성+이름 순서(영미식): 마이크 트라웃 (띄어쓰기 유지)\n"
    );
  }
  if (league === "LMB") {
    return (
      "다음 LMB (멕시코 프로야구) 선수 이름을 한국 스포츠 미디어 음역으로 변환해주세요.\n" +
      "대부분 중남미(스페인어) 선수. 네이버/스탯티즈 중남미 야구 표기 기준.\n" +
      "- Aderlin Rodriguez → 아데를린 로드리게스, Jose Cardona → 호세 카르도나, Robinson Cano → 로빈슨 카노\n" +
      "- 성+이름 순서 유지 (음역, 띄어쓰기 유지)\n"
    );
  }
  if (league === "CPBL") {
    return (
      "다음 CPBL (대만 프로야구) 선수 이름을 한국 스포츠 미디어 음역으로 변환해주세요.\n" +
      "- 대만/중화권 선수는 한국 한자음 또는 음역, 외국인 용병은 음역\n"
    );
  }
  // KBO (기본)
  return (
    "다음 KBO (한국 프로야구) 영문 선수 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n" +
    "참고: 네이버/다음 스포츠 KBO 페이지의 한국어 표기 기준.\n" +
    "- 한국 선수 (대다수): Lee Hyung-Jong → 이형종, Kim Do-yeong → 김도영, Choi Joo-hwan → 최주환\n" +
    "- 외국인 용병: Aderlin Rodriguez → 아데를린 로드리게스 같은 음역\n" +
    "- 표기 가이드: 한국 선수는 모든 단어 합쳐서 (Lee Jong-bum → 이종범, 띄어쓰기 X)\n"
  );
}

async function fetchMissingIds(league) {
  const { data } = await axios.get(
    `${SITE_URL}/api/internal/baseball-missing-player-ids?days=${DAYS}&league=${league}`,
    { headers: SITE_HEADERS, timeout: 30_000 },
  );
  return {
    missingIds: data.missingIds || [],
    nameKoNullIds: data.nameKoNullIds || [],
    photoUrlNullIds: data.photoUrlNullIds || [],
    totalIds: data.totalIds || 0,
  };
}

async function fetchEnglishName(pid) {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/baseball/player/list`, {
      params: { user: TS_USER, secret: TS_SECRET, uuid: pid },
      timeout: 15_000,
    });
    const p = data?.results?.[0];
    if (!p) return null;
    return {
      id: pid,
      name: (p.name || "").trim() || null,
      short_name: (p.short_name || "").trim() || null,
      team_id: p.team_id || null,
      position: p.position || null,
    };
  } catch (e) {
    return null;
  }
}

async function haikuTranslate(batch, league) {
  const prompt =
    promptIntro(league) +
    "- 자신없으면 그 entry 제외\n\n" +
    "선수 list:\n" +
    batch.map((b, i) => `${i + 1}. "${b.name}"`).join("\n") +
    "\n\n출력 — JSON 객체 한 줄 (다른 설명 X):\n" +
    `{"${batch[0]?.name || "Name"}": "음역결과", ...}`;
  try {
    const { data } = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: ANTHROPIC_MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] },
      { headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, timeout: 60_000 },
    );
    const text = (data?.content?.[0]?.text || "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const obj = JSON.parse(m[0]);
    const cleaned = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const s = ko.trim();
      if (!s) continue;
      if (!/[가-힣]/.test(s)) continue;
      const cjk = s.match(/[一-鿿]/g);
      if (cjk && cjk.length >= 3) continue;
      cleaned[en] = s;
    }
    return cleaned;
  } catch (e) {
    console.error(`  ! Haiku ${e.response?.status || e.message}`);
    return {};
  }
}

async function searchKboPlayer(nameKo) {
  const tryName = async (q) => {
    try {
      const { data } = await axios.post(
        KBO_SEARCH_URL,
        new URLSearchParams({ name: q }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "User-Agent": "Mozilla/5.0", Referer: "https://www.koreabaseball.com/Player/Search.aspx", "X-Requested-With": "XMLHttpRequest" }, timeout: 10_000 },
      );
      if (data?.code !== "100") return null;
      const now = data?.now || [];
      if (now.length === 0) return null;
      return now.find((p) => p.P_NM === q) || now[0];
    } catch { return null; }
  };
  let hit = await tryName(nameKo);
  if (hit) return hit;
  const tokens = nameKo.trim().split(/\s+/);
  if (tokens.length > 1) {
    hit = await tryName(tokens[tokens.length - 1]); if (hit) return hit;
    hit = await tryName(tokens[0]); if (hit) return hit;
  }
  return null;
}

async function verifyPhotoUrl(url) {
  try { const res = await axios.head(url, { timeout: 8_000 }); return res.status >= 200 && res.status < 300; }
  catch { return false; }
}

async function postPlayersUpsert(players) {
  const { data } = await axios.post(
    `${SITE_URL}/api/internal/ts-baseball-players`,
    { players },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 60_000 },
  );
  return data;
}

async function bootHeartbeat(metadata) {
  try {
    await axios.post(`${SITE_URL}/api/internal/bot-heartbeat`, { name: "lightsail-baseball-player-names", metadata }, { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 10_000 });
  } catch { /* silent */ }
}

// 리그 1개 처리 (이름 음역 upsert + KBO 전용 사진). 통계 반환.
async function processLeague(league) {
  const { missingIds, nameKoNullIds, photoUrlNullIds, totalIds } = await fetchMissingIds(league);
  const todo = Array.from(new Set([...missingIds, ...nameKoNullIds]));
  const photoTodo = photoUrlNullIds || [];
  console.log(`  [${league}] total=${totalIds} missing=${missingIds.length} nameKoNull=${nameKoNullIds.length} photoNull=${photoTodo.length} → todoNames=${todo.length}`);
  if (todo.length === 0 && photoTodo.length === 0) return { league, totalIds, upserted: 0 };

  // 2) 영문/로마자명 fetch
  const records = [];
  for (let i = 0; i < todo.length; i++) {
    const r = await fetchEnglishName(todo[i]);
    if (r && r.name) records.push(r);
    await new Promise((res) => setTimeout(res, 60));
  }
  console.log(`  [${league}] 영문 hit ${records.length}/${todo.length}`);

  // 3) Haiku 음역
  const enToKo = {};
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    Object.assign(enToKo, await haikuTranslate(chunk, league));
    await new Promise((res) => setTimeout(res, 500));
  }
  console.log(`  [${league}] ko 매핑 ${Object.keys(enToKo).length}/${records.length}`);

  // 4) upsert
  const payload = records
    .map((r) => ({ id: r.id, name: r.name, short_name: r.short_name || undefined, team_id: r.team_id || undefined, position: r.position || undefined, sport: league, nameKo: enToKo[r.name] || undefined }))
    .filter((p) => p.id && p.name);
  let totalUp = 0;
  for (let i = 0; i < payload.length; i += 100) {
    try { const r = await postPlayersUpsert(payload.slice(i, i + 100)); totalUp += r.upserted || 0; }
    catch (e) { console.error(`    ✗ [${league}] upsert ${i}: ${e.message}`); }
  }
  console.log(`  [${league}] ✓ names upserted ${totalUp}`);

  // 5) KBO 전용 photo enrich
  let photoUp = 0;
  if (league === "KBO") {
    const photoMap = new Map();
    for (const p of [...photoTodo, ...records.filter((r) => enToKo[r.name]).map((r) => ({ id: r.id, nameKo: enToKo[r.name] }))]) {
      if (p.nameKo) photoMap.set(p.id, p);
    }
    const photoList = [...photoMap.values()];
    const photoPayload = [];
    for (const { id, nameKo } of photoList) {
      const hit = await searchKboPlayer(nameKo);
      if (!hit) continue;
      const url = `${KBO_PHOTO_BASE}/${KBO_PHOTO_YEAR}/${hit.P_ID}.jpg`;
      if (!(await verifyPhotoUrl(url))) continue;
      photoPayload.push({ id, name: nameKo, nameKo, sport: league, photoUrl: url });
      if (photoPayload.length >= 50) { try { const r = await postPlayersUpsert(photoPayload); photoUp += r.upserted || 0; } catch {} photoPayload.length = 0; }
      await new Promise((res) => setTimeout(res, 80));
    }
    if (photoPayload.length > 0) { try { const r = await postPlayersUpsert(photoPayload); photoUp += r.upserted || 0; } catch {} }
    console.log(`  [KBO] ✓ photo upserted ${photoUp}`);
  }

  return { league, totalIds, todoNames: todo.length, enHit: records.length, koMapped: Object.keys(enToKo).length, namesUpserted: totalUp, photoUpserted: photoUp };
}

async function main() {
  const ts0 = new Date().toISOString();
  console.log(`[${ts0}] 🚀 baseball-player-names-cron start (leagues=${LEAGUES.join(",")}, days=${DAYS})`);
  const results = [];
  for (const league of LEAGUES) {
    try { results.push(await processLeague(league)); }
    catch (e) { console.error(`❌ [${league}] ${e.message}`); results.push({ league, error: e.message }); }
  }
  await bootHeartbeat({ leagues: LEAGUES, results });
  console.log(`◀ 종료 — ${results.map((r) => `${r.league}:${r.namesUpserted ?? "err"}`).join(" ")}`);
}

main().catch((e) => {
  console.error("❌ fatal:", e.message);
  bootHeartbeat({ error: e.message }).finally(() => process.exit(1));
});
