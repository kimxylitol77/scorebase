// event-radar 의 2차 레이어 — 월 1회 로컬 Qwen 에게 "다음 ~75일 주요 스포츠 특별 이벤트"를
// 브레인스토밍시켜, 시드(sports-events-seed.json)에 없는 것만 텔레그램으로 제안한다.
// 시드에 자동 추가는 하지 않는다(LLM 날짜 부정확 가능) — 사용자가 확인 후 시드에 넣는다.
//
// 흐름:
//   1) 시드 로드 → 앞으로 90일 내 이벤트의 {sport, date} 를 "이미 추적 중" 목록으로 프롬프트에 전달
//   2) 로컬 Ollama(qwen) 에 JSON 강제로 이벤트 후보 요청
//   3) 코드에서 시드와 종목+날짜 ±10일 근접 중복 제거
//   4) 남은 후보를 "제안(확인 필요)" 으로 텔레그램 1건, 없으면 조용히 종료
//
// 환경변수(../.env 또는 ../.env.local): SITE_URL, INTERNAL_API_TOKEN, OLLAMA_URL, QWEN_PANEL_MODEL
// 옵션: --dry (알림 없이 LLM 후보·필터 결과를 콘솔 출력)

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const axios = require("axios");
const fs = require("fs");

const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/chat";
const OLLAMA_MODEL = process.env.QWEN_PANEL_MODEL || "qwen2.5:32b";
const WORKER_NAME = "mac-mini-event-radar-monthly";
const DRY = process.argv.includes("--dry");

const SEED_PATH = path.resolve(__dirname, "../data/sports-events-seed.json");
const HORIZON_DAYS = 75; // 브레인스토밍 대상 기간
const DEDUP_WINDOW = 10; // 시드와 이 일수 이내 + 같은 종목이면 중복 간주

if (!TOKEN && !DRY) {
  console.error("❌ INTERNAL_API_TOKEN 미설정 — .env 확인");
  process.exit(1);
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

async function askOllama(system, user) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await axios.post(
        OLLAMA_URL,
        {
          model: OLLAMA_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          stream: false,
          format: "json",
          options: { temperature: 0.2, num_ctx: 4096 },
        },
        { timeout: 180000 },
      );
      const content = ((data && data.message && data.message.content) || "").trim();
      if (content) return content;
    } catch (e) {
      console.error(`Ollama 호출 실패(attempt ${attempt + 1}): ${e.message}`);
    }
  }
  return null;
}

async function notify(payload) {
  await axios.post(
    `${SITE_URL}/api/internal/notify`,
    { source: WORKER_NAME, ...payload },
    { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15_000 },
  );
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  const today = kstToday();
  const events = Array.isArray(seed.events) ? seed.events : [];

  // 앞으로 HORIZON_DAYS+30 내 시드 이벤트 = 이미 추적 중 (중복 필터 + 프롬프트 힌트)
  const tracked = events
    .map((e) => ({ sport: e.sport, date: e.date, name: e.name, dday: daysBetween(today, e.date) }))
    .filter((e) => e.dday >= -5 && e.dday <= HORIZON_DAYS + 30);

  const trackedLines = tracked.map((e) => `- ${e.sport} / ${e.date}`).join("\n") || "(none)";

  const system =
    "You are a sports calendar assistant. Return ONLY valid JSON. " +
    "List notable SPECIAL sports events (all-star games, award ceremonies, drafts, " +
    "trade deadlines, playoff/championship finals, esports finals) — NOT regular-season matches.";
  const user =
    `Today is ${today}. List notable special sports events in the next ${HORIZON_DAYS} days ` +
    `for these sports only: football/soccer, baseball (MLB, KBO, NPB), basketball (NBA, KBL), ` +
    `ice hockey (NHL), MMA (UFC), esports (LoL/LCK).\n\n` +
    `EXCLUDE anything already tracked (same sport near these dates):\n${trackedLines}\n\n` +
    `Return JSON: {"events":[{"name":"...","sport":"soccer|baseball|basketball|hockey|MMA|esports",` +
    `"date":"YYYY-MM-DD (best estimate)","note":"one short line"}]}. ` +
    `Only include events you are reasonably confident exist. If unsure of exact date, give your best estimate.`;

  const raw = await askOllama(system, user);
  if (!raw) {
    console.error("LLM 응답 없음 — 종료");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`LLM JSON 파싱 실패 — 종료. raw: ${raw.slice(0, 200)}`);
    return;
  }
  const cand = Array.isArray(parsed.events) ? parsed.events : [];

  // 종목 정규화(한글 시드 ↔ 영문 LLM 매칭용)
  const SPORT_KO = {
    soccer: "축구", football: "축구", baseball: "야구",
    basketball: "농구", hockey: "하키", "ice hockey": "하키", mma: "UFC", esports: "LOL",
  };
  function normSport(s) {
    return SPORT_KO[String(s || "").toLowerCase()] || s;
  }

  // 시드와 중복 제거: 같은 종목 + 날짜 ±DEDUP_WINDOW 이면 skip. 날짜 파싱 실패도 skip(신뢰 낮음).
  const fresh = [];
  for (const c of cand) {
    const csport = normSport(c.sport);
    const cdate = String(c.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cdate)) continue;
    const dd = daysBetween(today, cdate);
    if (dd < 0 || dd > HORIZON_DAYS + 20) continue; // 기간 밖
    const dup = tracked.some(
      (t) => t.sport === csport && Math.abs(daysBetween(t.date, cdate)) <= DEDUP_WINDOW,
    );
    if (dup) continue;
    fresh.push({ ...c, sport: csport, date: cdate, dday: dd });
  }
  fresh.sort((a, b) => a.dday - b.dday);

  if (DRY) {
    console.log(`\n=== LLM 후보 ${cand.length}개 → 시드 중복 제거 후 ${fresh.length}개 ===`);
    for (const f of fresh) {
      console.log(`  D-${f.dday}  ${f.name} [${f.sport}] ${f.date} — ${f.note || ""}`);
    }
    console.log("\n[dry] 알림 생략");
    return;
  }

  if (!fresh.length) {
    console.error("시드에 없는 신규 이벤트 제안 없음 — 종료");
    return;
  }

  const lines = fresh.map(
    (f) =>
      `• <b>D-${f.dday}</b> ${escapeHtml(f.name)} [${escapeHtml(f.sport)}] ~${f.date}` +
      (f.note ? ` — ${escapeHtml(f.note)}` : ""),
  );
  await notify({
    severity: "INFO",
    title: `시드에 없는 이벤트 제안 ${fresh.length}건 (LLM·확인 필요)`,
    message:
      lines.join("\n") +
      "\n\n<i>LLM 브레인스토밍 결과입니다. 실제 있는 이벤트인지·정확한 날짜를 확인 후 " +
      "sports-events-seed.json 에 추가하세요.</i>",
    action: "확인 후 시드 추가 (자동 추가 안 함)",
  });
  console.error(`제안 ${fresh.length}건 전송 완료`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`❌ event-radar-monthly 실패: ${e.stack || e.message}`);
    process.exit(1);
  });
