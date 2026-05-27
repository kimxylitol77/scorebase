// kbo-player-names-cron.js — Lightsail daily cron (KST 03:00 = UTC 18:00).
//
// 흐름:
//   1) GET {SITE_URL}/api/internal/baseball-missing-player-ids?days=7&league=KBO
//      → missingIds (row 없음) + nameKoNullIds (row 있지만 nameKo NULL) 받음
//   2) 각 ts player_id → TheSports player/list?uuid={id} 로 영문명 fetch
//   3) Anthropic API (Haiku) batch 50명 → 한국어 음역 (네이버 KBO 표기 기준)
//   4) POST {SITE_URL}/api/internal/ts-baseball-players { players: [{id, name, nameKo, sport:"KBO"}] }
//      → DB upsert (확장된 endpoint, team_id 없어도 sport 명시로 cover)
//
// 환경변수: THESPORTS_USER, THESPORTS_SECRET (TheSports), ANTHROPIC_API_KEY (Anthropic),
//          SITE_URL, INTERNAL_API_TOKEN (scorebase).
// 누락 시 즉시 exit 1 + bot-heartbeat 로 알림.
//
// 매일 03:00 KST. weekly mac-mini 대신 Lightsail 이관 (TheSports IP whitelist 제약 — mac-mini home IP 거부).

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const LEAGUE = "KBO";
const DAYS = 7;
const BATCH = 50;

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("❌ ANTHROPIC_API_KEY missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

async function fetchMissingIds() {
  const { data } = await axios.get(
    `${SITE_URL}/api/internal/baseball-missing-player-ids?days=${DAYS}&league=${LEAGUE}`,
    { headers: SITE_HEADERS, timeout: 30_000 },
  );
  return {
    missingIds: data.missingIds || [],
    nameKoNullIds: data.nameKoNullIds || [],
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

async function haikuTranslate(batch) {
  // en → ko 매핑 (Anthropic Haiku, 네이버 KBO 표기 기준 prompt).
  const prompt =
    "다음 KBO (한국 프로야구) 영문 선수 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n" +
    "참고: 네이버/다음 스포츠 KBO 페이지의 한국어 표기 기준.\n" +
    "- 한국 선수 (대다수): Lee Hyung-Jong → 이형종, Kim Do-yeong → 김도영, Choi Joo-hwan → 최주환\n" +
    "- 외국인 용병: Aderlin Rodriguez → 아데를린 로드리게스 같은 음역\n" +
    "- 표기 가이드: 모든 단어 합쳐서 한국식 표기 (Lee Jong-bum → 이종범, 띄어쓰기 X)\n" +
    "- 자신없으면 그 entry 제외\n\n" +
    "선수 list:\n" +
    batch.map((b, i) => `${i + 1}. "${b.name}"`).join("\n") +
    "\n\n출력 — JSON 객체 한 줄 (다른 설명 X):\n" +
    `{"Lee Hyung-Jong": "이형종", "Kim Do-yeong": "김도영", ...}`;

  try {
    const { data } = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        timeout: 60_000,
      },
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
      if (cjk && cjk.length >= 3) continue; // 일본/중국 한자 다수면 skip
      cleaned[en] = s;
    }
    return cleaned;
  } catch (e) {
    console.error(`  ! Haiku ${e.response?.status || e.message}`);
    return {};
  }
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
    await axios.post(
      `${SITE_URL}/api/internal/bot-heartbeat`,
      { name: "lightsail-kbo-player-names", metadata },
      { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 10_000 },
    );
  } catch {
    // silent
  }
}

async function main() {
  const ts0 = new Date().toISOString();
  console.log(`[${ts0}] 🚀 kbo-player-names-cron start (league=${LEAGUE}, days=${DAYS})`);

  // 1) missing/nameKoNull ids
  const { missingIds, nameKoNullIds, totalIds } = await fetchMissingIds();
  const todo = Array.from(new Set([...missingIds, ...nameKoNullIds]));
  console.log(`  total=${totalIds}, missing=${missingIds.length}, nameKoNull=${nameKoNullIds.length}, todo=${todo.length}`);
  if (todo.length === 0) {
    await bootHeartbeat({ totalIds, todo: 0, upserted: 0 });
    console.log(`◀ 매핑 대상 없음. 종료`);
    return;
  }

  // 2) 영문명 fetch (TheSports player/list?uuid). 50ms sleep — rate limit 안전.
  console.log(`  ▶ 영문명 fetch (${todo.length}건)`);
  const records = [];
  for (let i = 0; i < todo.length; i++) {
    const r = await fetchEnglishName(todo[i]);
    if (r && r.name) records.push(r);
    if ((i + 1) % 50 === 0) console.log(`    ${i + 1}/${todo.length} (hit ${records.length})`);
    await new Promise((res) => setTimeout(res, 60));
  }
  console.log(`  ✓ 영문 hit ${records.length}/${todo.length}`);
  if (records.length === 0) {
    await bootHeartbeat({ totalIds, todo: todo.length, upserted: 0, enHit: 0 });
    return;
  }

  // 3) Haiku 음역 batch
  console.log(`  ▶ Haiku 음역 batch=${BATCH}`);
  const enToKo = {};
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const map = await haikuTranslate(chunk);
    Object.assign(enToKo, map);
    console.log(`    batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(records.length / BATCH)} → +${Object.keys(map).length}`);
    await new Promise((res) => setTimeout(res, 500));
  }
  console.log(`  ✓ ko 매핑 ${Object.keys(enToKo).length}/${records.length}`);

  // 4) DB upsert via /api/internal/ts-baseball-players
  const payload = records
    .map((r) => ({
      id: r.id,
      name: r.name,
      short_name: r.short_name || undefined,
      team_id: r.team_id || undefined,
      position: r.position || undefined,
      sport: LEAGUE,
      nameKo: enToKo[r.name] || undefined,
    }))
    // nameKo 못 받은 건 upsert 해도 영문만 들어감 → 다음 cycle 재시도 가능. 일단 모두 upsert.
    .filter((p) => p.id && p.name);
  console.log(`  ▶ upsert ${payload.length}건`);
  const CHUNK = 100;
  let totalUp = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    try {
      const r = await postPlayersUpsert(slice);
      totalUp += r.upserted || 0;
    } catch (e) {
      console.error(`    ✗ upsert ${i}: ${e.message}`);
    }
  }
  console.log(`  ✓ upserted ${totalUp}`);

  await bootHeartbeat({
    totalIds,
    todo: todo.length,
    enHit: records.length,
    koMapped: Object.keys(enToKo).length,
    upserted: totalUp,
  });
  console.log(`◀ 종료`);
}

main().catch((e) => {
  console.error("❌ fatal:", e.message);
  bootHeartbeat({ error: e.message }).finally(() => process.exit(1));
});
