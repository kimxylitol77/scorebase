// match-narrator.js — Mac mini Ollama 워커. 라이브 매치 진행 상황 박스 (3-4문장) 5분 주기 생성.
//
// 흐름:
//   1) heartbeat POST (워커 살아있음 알림)
//   2) GET /api/internal/live-matches-for-bot → LIVE 매치 리스트
//   3) 각 매치:
//      - 직전 summary 가 5분 이내면 skip (TTL)
//      - Ollama (qwen2.5:14b) 호출 → 3-4문장 한국어 분석
//      - POST /api/internal/live-commentary → DB upsert
//   4) sleep 5min, 반복
//
// 실행:
//   cd ~/scorebase/mac-mini-worker
//   npm install
//   cp .env.example .env && vi .env  # INTERNAL_API_TOKEN 채우기
//   node match-narrator.js
//
// 환경변수 (.env):
//   INTERNAL_API_TOKEN  — scorebase Vercel env 와 동일 값
//   SITE_URL            — 기본 https://www.scorebase.kr
//   OLLAMA_HOST         — 기본 http://localhost:11434
//   OLLAMA_MODEL        — 기본 qwen2.5:14b
//   LEAGUES             — 기본 KBO (콤마구분 가능: "KBO,NPB,MLB")

const path = require("path");
// 1. mac-mini-worker/.env 우선 (개별 봇 설정)
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
// 2. ../.env.local fallback (scorebase 키 자동 활용)
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");
const os = require("os");

// ── config ────────────────────────────────────────────────────
const SCOREBASE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
// launchd 환경에 Ollama 앱이 OLLAMA_HOST=0.0.0.0:11434 (listen 주소) 를 미리 set 해놓는
// 경우 있음 — 스킴 보강 + 0.0.0.0 (outbound 불가) 을 localhost 로 정규화.
const OLLAMA = (() => {
  const raw = process.env.OLLAMA_HOST || "http://localhost:11434";
  const withScheme = /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/^https?:\/\/0\.0\.0\.0(?=[:/]|$)/, "http://localhost");
})();
const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:14b";
// 야구 5리그 (2026-05-27 CPBL/LMB 확장 포함). 추후 농구/축구 cover 시 env 로 override.
const LEAGUES = (process.env.LEAGUES || "KBO,NPB,MLB,CPBL,LMB").split(",").map((s) => s.trim());
// LLM provider — "anthropic" (Haiku) 또는 "ollama" (Qwen). 기본 anthropic.
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const WORKER_NAME = "mac-mini-match-narrator";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5분 주기
const SUMMARY_TTL_MS = 5 * 60 * 1000; // 직전 summary 5분 이내면 skip
const OLLAMA_TIMEOUT_MS = 180_000; // 14B 추론 최대 3분 허용
const ANTHROPIC_TIMEOUT_MS = 30_000;

if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN 미설정 — .env 확인");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

// ── helpers ───────────────────────────────────────────────────
function tsKst() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function logPrefix() {
  return `[${tsKst()}]`;
}

async function sendHeartbeat() {
  try {
    await axios.post(
      `${SCOREBASE}/api/internal/bot-heartbeat`,
      {
        name: WORKER_NAME,
        metadata: {
          host: os.hostname(),
          provider: LLM_PROVIDER,
          model: LLM_PROVIDER === "anthropic" ? ANTHROPIC_MODEL : MODEL,
          leagues: LEAGUES,
        },
      },
      { headers, timeout: 10_000 },
    );
  } catch (e) {
    console.warn(`${logPrefix()} ⚠️ heartbeat 실패:`, e.message);
  }
}

async function fetchLiveMatches() {
  const { data } = await axios.get(`${SCOREBASE}/api/internal/live-matches-for-bot`, {
    params: { leagues: LEAGUES.join(",") },
    headers,
    timeout: 30_000,
  });
  return data.matches || [];
}

// predictionEngine 결과 fetch. NO_PICK 또는 null 이면 caller 가 LLM 호출 skip + 고정 문구.
// timeout 30s — Vercel cold start + 시즌 매치 query (1년 window) 가 첫 호출 시 길어짐.
// 같은 cycle 내 second+ 매치는 function instance 재사용으로 빠름.
async function fetchPrediction(matchId) {
  try {
    const { data } = await axios.get(`${SCOREBASE}/api/internal/predict-match`, {
      params: { id: matchId },
      headers,
      timeout: 30_000,
    });
    return data?.prediction ?? null;
  } catch (e) {
    console.error(`${logPrefix()}   ⚠ predict fetch fail matchId=${matchId}:`, e.message);
    return null;
  }
}

// pick 정보 한국어 라벨 (prompt + fixed 문구용)
function pickLabel(pred, homeName, awayName) {
  if (!pred) return null;
  if (pred.pick === "HOME") return homeName;
  if (pred.pick === "AWAY") return awayName;
  if (pred.pick === "DRAW") return "무승부";
  return null;
}

const NO_PICK_FIXED_SUMMARY = "현재 경기는 확신도가 낮아 추천에서 제외되었습니다.";

// 리그 → 종목 분류 (prompt sport-aware 분기용).
const BASEBALL_LEAGUES = new Set([
  "KBO", "NPB", "MLB", "CPBL", "LMB",
  "KBO_FUTURES", "NPB_MINOR", "CARIBBEAN_SERIES",
  "WBC", "WBSC_PREMIER_12", "ASIAN_GAMES_BB", "OLYMPICS_BB",
]);
const BASKETBALL_LEAGUES = new Set(["NBA", "WNBA", "KBL", "WKBL"]);
const HOCKEY_LEAGUES = new Set(["NHL"]);
const ESPORTS_LEAGUES = new Set(["LOL"]);

function sportOf(league) {
  if (BASEBALL_LEAGUES.has(league)) return "baseball";
  if (BASKETBALL_LEAGUES.has(league)) return "basketball";
  if (HOCKEY_LEAGUES.has(league)) return "hockey";
  if (ESPORTS_LEAGUES.has(league)) return "esports";
  return "football";
}

// 종목별 어휘 규칙 — LLM 이 잘못된 종목 용어 (예: 야구에 "선제골") 섞는 사고 차단.
// 답변 본문에 이 단어가 나오면 후처리에서 reject (post-gen 검증).
const SPORT_VOCAB = {
  baseball: {
    allow: "득점, 이닝, 회초/회말, 타선, 타자, 주자, 투수, 선발, 불펜, 수비, 도루, 안타, 홈런, 볼넷, 삼진",
    ban: "골, 선제골, 어시스트, 미드필더, 공격수, 수비수, 골키퍼, 중원, 킥오프, 전반, 후반, PK, 페널티킥",
    sport: "야구",
  },
  basketball: {
    allow: "득점, 쿼터, 어시스트, 리바운드, 3점, 자유투, 페인트존, 트랜지션, 파울, 턴오버",
    ban: "골, 선제골, 미드필더, 공격수, 수비수, 골키퍼, 중원, 킥오프, 전반, 후반, PK, 이닝, 타자, 투수, 주자, 안타, 홈런",
    sport: "농구",
  },
  hockey: {
    allow: "득점, 골, 어시스트, 피리어드, 파워플레이, 페널티 박스, 세이브, 슛, 페이스오프",
    ban: "이닝, 타자, 투수, 안타, 홈런, 중원, 미드필더, 쿼터",
    sport: "아이스하키",
  },
  football: {
    allow: "골, 어시스트, 미드필더, 공격수, 수비수, 골키퍼, 중원, 점유율, 전반, 후반, PK, 코너킥, 프리킥",
    ban: "이닝, 타자, 투수, 주자, 안타, 홈런, 볼넷, 삼진, 쿼터, 리바운드, 피리어드",
    sport: "축구",
  },
  esports: {
    allow: "킬, 어시스트, 데스, 라인전, 한타, 오브젝트, 드래곤, 바론, 미드, 정글, 서포터",
    ban: "이닝, 타자, 골, 미드필더, 쿼터, 피리어드",
    sport: "e스포츠",
  },
};

// score 결정론적 비교 문구 — LLM 의 score 격차 hallucination 차단용 prepend.
function scoreFactLine(match) {
  const hs = match.homeScore ?? 0;
  const as_ = match.awayScore ?? 0;
  if (hs === as_) return `현재 ${as_}-${hs} 동점.`;
  if (hs > as_) return `현재 ${match.awayName} ${as_} - ${hs} ${match.homeName} → 홈팀 ${match.homeName} 이 ${hs - as_}점 앞섭니다.`;
  return `현재 ${match.awayName} ${as_} - ${hs} ${match.homeName} → 어웨이팀 ${match.awayName} 이 ${as_ - hs}점 앞섭니다.`;
}

function buildPrompt(match, prediction) {
  const home = match.homeName;
  const away = match.awayName;
  const hs = match.homeScore ?? 0;
  const as_ = match.awayScore ?? 0;
  const sport = sportOf(match.league);
  const vocab = SPORT_VOCAB[sport];
  const factLine = scoreFactLine(match);

  // prediction 이 PICK 이면 prompt 에 inject — LLM 이 AI 분석과 같은 방향으로 작성.
  let predictionBlock = "";
  if (prediction && prediction.pick !== "NO_PICK") {
    const teamLabel = pickLabel(prediction, home, away) ?? prediction.pick;
    const reasonText = (prediction.reasons || [])
      .slice(0, 3)
      .map((r) => `- ${r.tag}: ${r.detail}`)
      .join("\n");
    predictionBlock = `\n[AI 승률 예측 — 분석에 반영]\n- 추천: ${teamLabel} (확신도 ${prediction.confidence}%)\n- 확률: 홈 ${Math.round(prediction.probHome * 100)}% / 어웨이 ${Math.round(prediction.probAway * 100)}%${prediction.probDraw > 0.01 ? ` / 무 ${Math.round(prediction.probDraw * 100)}%` : ""}\n- 주요 이유:\n${reasonText || "  (시그널 부족)"}\n분석 문구는 이 예측과 일관된 톤으로 작성. 예측 반대 방향 강조 금지.\n`;
  }

  return `너는 한국 ${vocab.sport} 라이브 캐스터다. 다음 ${match.league} 매치의 현재 상황을 한국어 3-4문장으로 분석하시오.

[필수 사실 — 절대 변경 금지]
${factLine}
스코어 격차를 다르게 쓰면 안 됨. 위 문장 그대로 사용하거나 동일한 점수차로만 표현하시오.

[종목]
이 매치는 ${vocab.sport} 입니다.
- 사용 가능한 용어: ${vocab.allow}
- 절대 사용 금지: ${vocab.ban}
다른 종목 용어를 한 단어라도 섞으면 답변을 reject 합니다.
${predictionBlock}
[지침]
- 데이터 기반, 추측·hallucination 금지
- "지금" 시점의 긴장감·흐름·다음 변수 포함
- 짧고 강렬하게 (3-4문장)
- 답은 본문만 (인사·해설자 멘트 X)

[매치 정보]
- 리그: ${match.league} (${vocab.sport})
- 어웨이: ${away} (${as_}점)
- 홈: ${home} (${hs}점)
- 스코어: ${away} ${as_} - ${hs} ${home}
`;
}

// summary 가 predictionEngine 의 pick 과 반대 방향 강조하면 reject.
// 휴리스틱: ban 단어 + "앞서가" 같은 양상 단어 기준. 단순하지만 명백한 mismatch catch.
function validatePredictionConsistency(summary, match, prediction) {
  if (!prediction || prediction.pick === "NO_PICK") return { ok: true };
  const home = match.homeName;
  const away = match.awayName;
  const text = summary;

  // 양 팀 이름이 "주도" / "리드" / "앞서" / "장악" / "우위" 같은 강조 단어와 함께 등장하는지
  const POSITIVE = ["주도", "리드", "앞서", "장악", "우위", "압도", "우세"];
  function teamHasPositive(team) {
    const idx = text.indexOf(team);
    if (idx === -1) return false;
    const window = text.slice(idx, Math.min(text.length, idx + 60));
    return POSITIVE.some((p) => window.includes(p));
  }
  const homePositive = teamHasPositive(home);
  const awayPositive = teamHasPositive(away);

  // pick=HOME 인데 away 만 positive 면 mismatch
  if (prediction.pick === "HOME" && awayPositive && !homePositive) {
    return { ok: false, reason: `pred=HOME 인데 summary 가 ${away} 우세 강조` };
  }
  if (prediction.pick === "AWAY" && homePositive && !awayPositive) {
    return { ok: false, reason: `pred=AWAY 인데 summary 가 ${home} 우세 강조` };
  }
  return { ok: true };
}

// 생성된 summary 가 (a) ban 용어 포함 또는 (b) 점수 격차 hallucination 이면 reject.
function validateSummary(summary, match) {
  const sport = sportOf(match.league);
  const vocab = SPORT_VOCAB[sport];
  const banList = vocab.ban.split(",").map((s) => s.trim()).filter(Boolean);
  const leaked = banList.filter((t) => summary.includes(t));
  if (leaked.length > 0) {
    return { ok: false, reason: `금지 용어 leak: ${leaked.join(", ")}` };
  }
  // 점수 격차 hallucination — "N점" 패턴 추출 후 실제 diff 와 비교
  const hs = match.homeScore ?? 0;
  const as_ = match.awayScore ?? 0;
  const actualDiff = Math.abs(hs - as_);
  const diffMatches = [...summary.matchAll(/(\d+)\s*점\s*(?:차이?|리드|앞서|뒤지|차로)/g)];
  for (const m of diffMatches) {
    const claimed = parseInt(m[1], 10);
    // 격차가 실제와 다르면 (단 0 인 동점은 lenient — 동점일 때 LLM 이 "0점차" 안 쓰는 게 자연)
    if (Number.isFinite(claimed) && claimed !== actualDiff) {
      return { ok: false, reason: `점수 격차 hallucination: "${claimed}점" (실제 ${actualDiff}점)` };
    }
  }
  return { ok: true };
}

async function generateAnthropic(prompt) {
  const { data } = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    },
    {
      timeout: ANTHROPIC_TIMEOUT_MS,
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    },
  );
  return data?.content?.[0]?.text?.trim() ?? null;
}

async function generateOllama(prompt) {
  const { data } = await axios.post(
    `${OLLAMA}/v1/chat/completions`,
    {
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 400,
    },
    { timeout: OLLAMA_TIMEOUT_MS },
  );
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

async function generateSummary(match, prediction) {
  const prompt = buildPrompt(match, prediction);
  if (LLM_PROVIDER === "anthropic") {
    if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY 미설정");
    return await generateAnthropic(prompt);
  }
  return await generateOllama(prompt);
}

function makeScoreSnapshot(m) {
  return `${m.awayScore ?? 0}:${m.homeScore ?? 0}`;
}

async function postCommentary(match, summary, snapshot) {
  await axios.post(
    `${SCOREBASE}/api/internal/live-commentary`,
    {
      matchId: match.matchId,
      league: match.league,
      matchSummary: summary,
      scoreSnapshot: snapshot,
      model: LLM_PROVIDER === "anthropic" ? `anthropic-${ANTHROPIC_MODEL}` : `ollama-${MODEL}`,
    },
    { headers, timeout: 30_000 },
  );
}

// ── main loop ─────────────────────────────────────────────────
async function runOnce() {
  const cycleStart = Date.now();
  console.log(`\n${logPrefix()} ▶ cycle start`);

  await sendHeartbeat();

  let matches;
  try {
    matches = await fetchLiveMatches();
  } catch (e) {
    console.error(`${logPrefix()} ✗ live-matches fetch 실패:`, e.message);
    return;
  }
  console.log(`${logPrefix()}   live 매치: ${matches.length}건`);

  for (const m of matches) {
    const label = `${m.awayName} vs ${m.homeName} (matchId=${m.matchId})`;
    const currentSnap = makeScoreSnapshot(m);
    try {
      // TTL skip — 단, score 가 바뀌었으면 force regenerate (stale commentary 차단).
      // 2026-05-27 사용자 신고: "LG 6:6 롯데인데 'LG 4점 리드'" 같은 score 변동 후 stale 문제.
      if (m.lastSummaryAt && m.lastScoreSnapshot === currentSnap) {
        const age = Date.now() - new Date(m.lastSummaryAt).getTime();
        if (age < SUMMARY_TTL_MS) {
          const ageS = Math.round(age / 1000);
          console.log(`${logPrefix()}   ↩ skip ${label} (${ageS}s 전 생성, score 동일)`);
          continue;
        }
      }
      if (m.lastScoreSnapshot && m.lastScoreSnapshot !== currentSnap) {
        console.log(`${logPrefix()}   🔄 regenerate ${label} (score ${m.lastScoreSnapshot} → ${currentSnap})`);
      }

      const t0 = Date.now();

      // predictionEngine 먼저 호출 — NO_PICK 이면 LLM skip + 고정 문구만 저장.
      // PICK 이면 결과를 buildPrompt 에 inject → LLM 이 예측과 일관된 분석 작성.
      const prediction = await fetchPrediction(m.matchId);
      if (prediction && prediction.pick === "NO_PICK") {
        await postCommentary(m, NO_PICK_FIXED_SUMMARY, currentSnap);
        const dur = Date.now() - t0;
        console.log(`${logPrefix()}   ⊘ ${label} NO_PICK (conf ${prediction.confidence}%) → 고정 문구 (${dur}ms)`);
        continue;
      }

      let summary = await generateSummary(m, prediction);
      if (!summary) {
        console.warn(`${logPrefix()}   ⚠ empty ${label}`);
        continue;
      }

      // Qwen 중국어 혼입 차단 — 한자 (CJK) 5자 이상이면 reject, DB 저장 skip
      const cjk = summary.match(/[一-鿿]/g);
      if ((cjk?.length ?? 0) >= 5) {
        console.warn(
          `${logPrefix()}   ✗ ${label} 중국어 혼입 (한자 ${cjk.length}자) — skip`,
        );
        continue;
      }

      // 종목 용어 leak + score 격차 hallucination 검증. 실패 시 1회 재시도 후 reject.
      let validation = validateSummary(summary, m);
      // prediction 과 summary 의 추천 방향 일관성 추가 검증 — 예측이 HOME 인데 summary 가
      // away 우세로 쓰여있으면 사용자 혼란. (간단 휴리스틱: 팀명 첫 등장 위치 비교).
      if (validation.ok && prediction && prediction.pick !== "NO_PICK") {
        const consistency = validatePredictionConsistency(summary, m, prediction);
        if (!consistency.ok) validation = consistency;
      }
      if (!validation.ok) {
        console.warn(`${logPrefix()}   ⚠ ${label} validation fail: ${validation.reason} — retry`);
        const retry = await generateSummary(m, prediction);
        if (retry) {
          let retryV = validateSummary(retry, m);
          if (retryV.ok && prediction && prediction.pick !== "NO_PICK") {
            const rc = validatePredictionConsistency(retry, m, prediction);
            if (!rc.ok) retryV = rc;
          }
          if (retryV.ok) {
            summary = retry;
            validation = retryV;
          }
        }
        if (!validation.ok) {
          console.warn(`${logPrefix()}   ✗ ${label} retry 후 여전히 실패: ${validation.reason} — skip DB 저장`);
          continue;
        }
      }

      await postCommentary(m, summary, currentSnap);
      const dur = Date.now() - t0;
      const predTag = prediction && prediction.pick !== "NO_PICK"
        ? ` [pred=${prediction.pick} ${prediction.confidence}%]`
        : "";
      console.log(
        `${logPrefix()}   ✓ ${label}${predTag} (${dur}ms): ${summary.slice(0, 60).replace(/\n/g, " ")}...`,
      );
    } catch (e) {
      console.error(`${logPrefix()}   ✗ ${label}:`, e.message);
    }
  }

  const cycleDur = ((Date.now() - cycleStart) / 1000).toFixed(1);
  console.log(`${logPrefix()} ◀ cycle done (${cycleDur}s)`);
}

async function main() {
  console.log(`▶ ${WORKER_NAME} 시작`);
  console.log(`   site=${SCOREBASE}`);
  if (LLM_PROVIDER === "anthropic") {
    console.log(`   provider=anthropic model=${ANTHROPIC_MODEL} key=${ANTHROPIC_KEY ? "set" : "MISSING"}`);
  } else {
    console.log(`   provider=ollama host=${OLLAMA} model=${MODEL}`);
  }
  console.log(`   leagues=${LEAGUES.join(",")}`);
  console.log(`   refresh=${REFRESH_INTERVAL_MS / 1000}s, ttl=${SUMMARY_TTL_MS / 1000}s`);

  // graceful shutdown
  process.on("SIGTERM", () => {
    console.log(`\n${logPrefix()} SIGTERM — 종료`);
    process.exit(0);
  });
  process.on("SIGINT", () => {
    console.log(`\n${logPrefix()} SIGINT — 종료`);
    process.exit(0);
  });

  while (true) {
    try {
      await runOnce();
    } catch (e) {
      console.error(`${logPrefix()} cycle error:`, e.message);
    }
    await new Promise((r) => setTimeout(r, REFRESH_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
