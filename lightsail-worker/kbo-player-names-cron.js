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
const KBO_SEARCH_URL = "https://www.koreabaseball.com/ws/Controls.asmx/GetSearchPlayer";
const KBO_PHOTO_BASE = "https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle";
const KBO_PHOTO_YEAR = new Date().getFullYear();

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

// KBO 공식 선수 검색.
//   1차: nameKo 전체 검색
//   2차 (외국인 cover): last token (성, "오스틴 딘" → "오스틴" / "치리노스")
//   3차: first token
async function searchKboPlayer(nameKo) {
  const tryName = async (q) => {
    try {
      const { data } = await axios.post(
        KBO_SEARCH_URL,
        new URLSearchParams({ name: q }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "Mozilla/5.0",
            Referer: "https://www.koreabaseball.com/Player/Search.aspx",
            "X-Requested-With": "XMLHttpRequest",
          },
          timeout: 10_000,
        },
      );
      if (data?.code !== "100") return null;
      const now = data?.now || [];
      if (now.length === 0) return null;
      const exact = now.find((p) => p.P_NM === q);
      return exact || now[0];
    } catch {
      return null;
    }
  };
  let hit = await tryName(nameKo);
  if (hit) return hit;
  const tokens = nameKo.trim().split(/\s+/);
  if (tokens.length > 1) {
    hit = await tryName(tokens[tokens.length - 1]);
    if (hit) return hit;
    hit = await tryName(tokens[0]);
    if (hit) return hit;
  }
  return null;
}

async function verifyPhotoUrl(url) {
  try {
    const res = await axios.head(url, { timeout: 8_000 });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
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

  // 1) missing/nameKoNull/photoUrlNull ids
  const { missingIds, nameKoNullIds, photoUrlNullIds, totalIds } = await fetchMissingIds();
  const todo = Array.from(new Set([...missingIds, ...nameKoNullIds]));
  const photoTodo = photoUrlNullIds || [];
  console.log(`  total=${totalIds}, missing=${missingIds.length}, nameKoNull=${nameKoNullIds.length}, photoUrlNull=${photoTodo.length}, todoNames=${todo.length}`);
  if (todo.length === 0 && photoTodo.length === 0) {
    await bootHeartbeat({ totalIds, todoNames: 0, photoTodo: 0, upserted: 0 });
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

  // 5) photo enrich — KBO 공식 API 로 nameKo 검색 + photo HEAD verify + upsert.
  //    todo: photoUrlNull (이전부터 photo 없는 player) + 방금 새로 ko 채운 player 들도 동일 후보.
  const photoCandidates = [
    ...photoTodo,
    ...records.filter((r) => enToKo[r.name]).map((r) => ({ id: r.id, nameKo: enToKo[r.name] })),
  ];
  // dedup by id
  const photoMap = new Map();
  for (const p of photoCandidates) if (p.nameKo) photoMap.set(p.id, p);
  const photoList = [...photoMap.values()];
  console.log(`  ▶ photo enrich (${photoList.length}건)`);
  let photoHit = 0, photoUp = 0;
  const photoPayload = [];
  for (let i = 0; i < photoList.length; i++) {
    const { id, nameKo } = photoList[i];
    const hit = await searchKboPlayer(nameKo);
    if (!hit) {
      if ((i + 1) % 20 === 0) console.log(`    ${i + 1}/${photoList.length} search miss (last: ${nameKo})`);
      continue;
    }
    photoHit++;
    const url = `${KBO_PHOTO_BASE}/${KBO_PHOTO_YEAR}/${hit.P_ID}.jpg`;
    const ok = await verifyPhotoUrl(url);
    if (!ok) continue;
    // nameKo 도 같이 보냄 — endpoint upsert update branch 가 photoUrl 만 변경.
    // name 필드는 endpoint 가 require 하므로 dummy 라도 보내야. 기존 row 에서 update 시 보존.
    photoPayload.push({ id, name: nameKo, nameKo, sport: LEAGUE, photoUrl: url });
    if (photoPayload.length >= 50) {
      try {
        const r = await postPlayersUpsert(photoPayload);
        photoUp += r.upserted || 0;
      } catch (e) {
        console.error(`    ✗ photo upsert: ${e.message}`);
      }
      photoPayload.length = 0;
    }
    await new Promise((res) => setTimeout(res, 80));
  }
  if (photoPayload.length > 0) {
    try {
      const r = await postPlayersUpsert(photoPayload);
      photoUp += r.upserted || 0;
    } catch (e) {
      console.error(`    ✗ photo upsert final: ${e.message}`);
    }
  }
  console.log(`  ✓ photo search hit ${photoHit}/${photoList.length}, upserted ${photoUp}`);

  await bootHeartbeat({
    totalIds,
    todoNames: todo.length,
    photoTodo: photoTodo.length,
    enHit: records.length,
    koMapped: Object.keys(enToKo).length,
    namesUpserted: totalUp,
    photoSearchHit: photoHit,
    photoUpserted: photoUp,
  });
  console.log(`◀ 종료`);
}

main().catch((e) => {
  console.error("❌ fatal:", e.message);
  bootHeartbeat({ error: e.message }).finally(() => process.exit(1));
});
