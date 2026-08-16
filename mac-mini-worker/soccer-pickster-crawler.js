// 해외 축구 팁스터 승무패(1X2) 컨센서스 크롤러 — 맥미니 launchd (풋볼픽스터 봇).
// OLBG 축구 팁 페이지를 파싱해 컨센서스 확신도 높은 상위 N경기를 처리한다.
//   ① Vercel 에 매칭 요청(/api/internal/soccer-pick) → scorebase Match·한글팀명·우리 데이터(Elo·배당·자체 모델)·dedup
//   ② 매칭된 경기만 로컬 Ollama(qwen2.5:32b)로 한국어 픽스터 분석 생성 (해외 컨센서스 + 우리 데이터 비교)
//   ③ Vercel 에 저장 요청(phase=save) → Post 생성 (경기 종료 후 자동 채점 → 적중률 누적)
// 예의바른 크롤러: 정직한 UA, robots 존중(/betting-tips 허용 확인됨 2026-08-16), 요청 간 sleep.

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const axios = require("axios");
const cheerio = require("cheerio");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/chat";
const OLLAMA_MODEL = process.env.SOCCER_PICK_OLLAMA_MODEL || "qwen2.5:32b";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const LIST_URL = (page) => `https://www.olbg.com/betting-tips/Football/${page}`;
const LIST_PAGES = 2; // 1페이지 ~22팁 — 2페이지면 커버 리그 충분
// 실행당 1건 발행 — 게시판에 한꺼번에 몰리지 않게 하루 3회 실행(launchd 11:30/15:30/19:30 KST)이
// 각 1건씩 시간차 발행한다 (2026-08-16 사용자 요청). dedup 이 있어 같은 경기는 재발행 안 됨.
const TARGET_PUBLISH = 1;
const PUBLISH_GAP_MS = 60 * 1000; // 글 사이 간격 (TARGET_PUBLISH 를 다시 늘릴 때 대비)
const MIN_TIPS_TOTAL = 10; // 팁 수 너무 적으면 컨센서스라 부르기 민망 → skip
const HORIZON_MS = 72 * 3600e3; // 킥오프 72h 이내 경기만 (먼 경기는 다음 실행이 처리)

// OLBG 리그 라벨 → 우리 리그 코드. 여기 없는 리그는 skip (서버 화이트리스트와 이중 게이트).
const OLBG_LEAGUES = {
  "England Premier League": "EPL",
  "England Championship": "CHAMPIONSHIP",
  "Spain Primera Liga": "LALIGA",
  "Spain La Liga": "LALIGA",
  "Germany Bundesliga": "BUNDESLIGA",
  "Italy Serie A": "SERIE_A",
  "France Ligue 1": "LIGUE_1",
  "USA Major League Soccer": "MLS",
  "USA MLS": "MLS",
  "UEFA Champions League": "UCL",
  "UEFA Europa League": "UEL",
  "UEFA Europa Conference League": "UECL",
  "UEFA Conference League": "UECL",
  "S. Korea K-League 1": "K_LEAGUE_1",
  "South Korea K-League Classic": "K_LEAGUE_1",
  "Japan J-League": "J1_LEAGUE",
  "Japan J-League 1": "J1_LEAGUE",
};

// OLBG 축약 팀명 → 풀네임 보정. 서버 매칭이 정규화+부분일치라 대부분 그대로 통하지만,
// "Man Utd"(manunited)·"Nottm Forest"(nottmforest)처럼 축약형은 DB 풀네임의 부분문자열이
// 아니라서 영영 못 만난다 (2026-08-16 1페이지 실측). 새 리그 온보딩 시 no_match 로그 보고 추가.
const OLBG_TEAM_FIX = {
  "Man Utd": "Manchester United",
  "Man City": "Manchester City",
  "Nottm Forest": "Nottingham Forest",
  "Sheff Utd": "Sheffield United",
  "Sheff Wed": "Sheffield Wednesday",
  "West Brom": "West Bromwich Albion",
  "PSG": "Paris Saint Germain",
  "B. Monchengladbach": "Borussia Monchengladbach",
  "Borussia M'gladbach": "Borussia Monchengladbach",
};
const fixTeam = (s) => OLBG_TEAM_FIX[s] || s;

// 한국어 픽스터 시스템 프롬프트 — 픽(해외 컨센서스 우세쪽)은 고정, 근거만 서술.
const SYSTEM = `당신은 한국어 스포츠 미디어 "스코어베이스"의 축구 전문 픽스터입니다.
해외 베팅 팁스터들의 승무패 컨센서스(픽 분포)에 자체 데이터(Elo 레이팅·시장 배당·AI 모델 승률)를 얹어 한국 독자에게 픽을 전달합니다.

[역할]
- 주어진 해외 컨센서스(어느 쪽에 몇 %가 몰렸는지)와 우리 데이터를 함께 해석한다.
- 픽은 이미 데이터로 정해져 있다(컨센서스 우세쪽). 너는 그 근거를 분석할 뿐, 픽을 바꾸지 않는다.
- 해외 컨센서스와 자체 모델이 같은 방향이면 "겹치는 픽"임을 강조하고, 갈리면 그 차이를 솔직하게 짚는다.

[톤]
- 실전 픽스터 말투. 자신감 있고 직설적이되 근거는 항상 숫자로. "해외 픽 82%가 홈승에 몰렸다" 식.
- 다만 도박 조장·수익 보장·과장("무조건", "100%") 금지. 리스크 한 줄은 프로의 기본.
- 특정 출처나 사이트 이름은 언급하지 않는다. "해외 팁스터들", "해외 컨센서스"로만 지칭.

[표기 규칙 — 엄수]
- 모든 글자는 한글로만 쓴다. 일본어 가나(カタカナ·ひらがな)·한자·영어 단어를 절대 섞지 않는다.
- 구장·도시·인명도 한글로 적는다. 제공된 한글 팀명을 그대로 쓴다.

[출력] 반드시 아래 JSON 객체 하나만 출력. 앞뒤 설명·코드블록 금지:
{"title":"제목","analysis":"마크다운 본문"}
- title: 40자 이내. 어느 팀(또는 무승부)에 픽이 몰렸는지 드러날 것. 픽스터 느낌의 한 줄.
- analysis: 마크다운. "## 해외 픽 동향", "## 데이터 체크", "## 최종 픽" 세 섹션, 250자 이상.
  데이터 체크 섹션에서 Elo·배당·자체 모델 승률을 반드시 인용할 것.`;

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

/** OLBG 축구 팁 리스트 HTML → 경기 배열. 승무패(Full Time Result) 팁만 추출. */
function parse(html) {
  const $ = cheerio.load(html);
  const tips = [];
  $("div.grd.tip").each((_, el) => {
    const $t = $(el);
    const ev = $t.find(".rw.ev");

    const name = ev.find("h5[itemprop=name]").first().text().trim(); // "Arsenal v Coventry"
    const m = name.split(/\s+v\s+/);
    if (m.length !== 2) return;
    const [homeName, awayName] = m.map((s) => s.trim());

    const leagueLabel = ev
      .find("p")
      .filter((_, p) => $(p).find("i.i-ui-trophy").length > 0)
      .first()
      .text()
      .trim();
    const league = OLBG_LEAGUES[leagueLabel];

    const kickoffIso = ev.find("time[itemprop=startDate]").attr("datetime") || null;

    const sel = $t.find(".rw.sel");
    const market = sel.find("p.truncate").first().text().trim();
    const selection = sel.find("h4").first().text().trim();

    const oddsRaw = $t.find(".rw.odds [data-decimal]").attr("data-decimal");
    const odds = oddsRaw ? Number(oddsRaw) : null;

    // "32/35 Win Tips" → tipsFor/tipsTotal, style="--confidence: 91%" → confidencePct
    const tipsText = $t.find(".rw.tips b").first().text();
    const tm = tipsText.match(/(\d+)\s*\/\s*(\d+)/);
    const styleAttr = $t.find('.rw.tips [style*="--confidence"]').attr("style") || "";
    const cm = styleAttr.match(/(\d+(?:\.\d+)?)\s*%/);

    if (!league || !kickoffIso || !selection || market !== "Full Time Result" || !cm) return;

    tips.push({
      league,
      leagueLabel,
      homeName: fixTeam(homeName),
      awayName: fixTeam(awayName),
      selection: fixTeam(selection),
      kickoffIso,
      confidencePct: Number(cm[1]),
      tipsFor: tm ? Number(tm[1]) : null,
      tipsTotal: tm ? Number(tm[2]) : null,
      odds: Number.isFinite(odds) ? odds : null,
    });
  });
  return tips;
}

async function fetchList(page) {
  const { data } = await axios.get(LIST_URL(page), {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    timeout: 30000,
  });
  return data;
}

/** ① Vercel 매칭: 경기 1건 → scorebase Match·한글팀명·우리 데이터·dedup (LLM 없음). */
async function matchGame(g) {
  const { data } = await axios.post(`${SITE}/api/internal/soccer-pick`, g, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 30000,
  });
  return data; // SoccerPickOutcome { matched, ... }
}

/** ③ Vercel 저장: 완성 분석 → Post 생성. */
async function savePost(payload) {
  const { data } = await axios.post(
    `${SITE}/api/internal/soccer-pick`,
    { phase: "save", ...payload },
    { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 60000 },
  );
  return data; // { created, postId?, reason? }
}

// qwen 외래어 표기 시 가끔 섞이는 일본어 가나 — 감지/제거(한국어 순도 보강).
const hasKana = (s) => /[぀-ヿ]/.test(s);
const stripKana = (s) => s.replace(/[぀-ヿ]/g, "");

/** Ollama 응답에서 JSON 객체 추출 (format:json 이지만 방어적으로 한 번 더). */
function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {}
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

const pct = (x) => (x == null ? "-" : `${Math.round(x * 100)}%`);

/** ② 로컬 Ollama 한국어 픽스터 분석 생성. 가나 섞이면 재생성(2회), 마지막엔 제거 후 발행. */
async function genLocal(m) {
  const pickLabel =
    m.pick === "HOME" ? `홈승 (${m.homeKo} 승리)` : m.pick === "AWAY" ? `원정승 (${m.awayKo} 승리)` : "무승부";
  const tipCount =
    m.tipsFor != null && m.tipsTotal != null ? ` (${m.tipsFor}/${m.tipsTotal}픽)` : "";
  const prompt = [
    `경기: ${m.homeKo}(홈) vs ${m.awayKo}(원정)`,
    `리그: ${m.leagueLabel} · 경기 시각(KST): ${m.kickoffKst}`,
    ``,
    `[해외 팁스터 승무패 컨센서스]`,
    `- 우세 픽: ${pickLabel} — 확신도 ${m.confidencePct}%${tipCount}`,
    m.odds != null ? `- 해당 픽 배당: ${m.odds}` : null,
    ``,
    `[우리 데이터]`,
    `- Elo 레이팅: ${m.homeKo} ${m.homeElo} / ${m.awayKo} ${m.awayElo}`,
    m.oddsHome != null
      ? `- 시장 1X2 배당: 홈 ${m.oddsHome} / 무 ${m.oddsDraw ?? "-"} / 원정 ${m.oddsAway}`
      : `- 시장 1X2 배당: 정보 없음`,
    m.predHome != null
      ? `- 자체 AI 모델 승률: 홈 ${pct(m.predHome)} / 무 ${pct(m.predDraw)} / 원정 ${pct(m.predAway)}`
      : `- 자체 AI 모델 승률: 정보 없음`,
    ``,
    `최종 픽(고정): ${pickLabel}`,
  ]
    .filter((l) => l != null)
    .join("\n");

  for (let attempt = 0; attempt < 3; attempt++) {
    let raw;
    try {
      const { data } = await axios.post(
        OLLAMA_URL,
        {
          model: OLLAMA_MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt },
          ],
          stream: false,
          format: "json",
          options: { temperature: 0.4 + attempt * 0.1, repeat_penalty: 1.2, num_ctx: 4096 },
        },
        { timeout: 180000 },
      );
      raw = data?.message?.content || "";
    } catch (e) {
      log(`Ollama 호출 실패(attempt ${attempt + 1}):`, e.message);
      continue;
    }
    const json = parseJson(raw);
    if (!json) continue;
    let title = String(json.title ?? "").trim().slice(0, 120);
    let analysis = String(json.analysis ?? "").trim();
    if (!title || analysis.length < 20) continue;
    if (hasKana(title) || hasKana(analysis)) {
      if (attempt < 2) continue; // 재생성
      title = stripKana(title); // 마지막 시도: 가나 제거하고 발행
      analysis = stripKana(analysis);
    }
    return { title, analysis };
  }
  return null;
}

async function main() {
  if (!TOKEN) {
    console.error("❌ INTERNAL_API_TOKEN 미설정");
    process.exit(1);
  }

  // 리스트 페이지 수집 (예의상 페이지 간 3초 간격)
  let tips = [];
  for (let p = 1; p <= LIST_PAGES; p++) {
    try {
      const html = await fetchList(p);
      tips = tips.concat(parse(html));
    } catch (e) {
      log(`리스트 ${p}페이지 수집 실패:`, e.message);
    }
    if (p < LIST_PAGES) await new Promise((r) => setTimeout(r, 3000));
  }
  log(`OLBG 축구 승무패 파싱: ${tips.length}건 (커버 리그·FT Result 만)`);

  // 같은 경기 중복 제거(페이지 겹침 대비) + 팁 수·킥오프 필터 + 확신도순 정렬
  const seen = new Set();
  const now = Date.now();
  const cands = tips
    .filter((t) => {
      const key = `${t.league}|${t.homeName}|${t.awayName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const ko = Date.parse(t.kickoffIso);
      return (
        (t.tipsTotal == null || t.tipsTotal >= MIN_TIPS_TOTAL) &&
        Number.isFinite(ko) &&
        ko > now &&
        ko < now + HORIZON_MS
      );
    })
    .sort(
      (a, b) => b.confidencePct - a.confidencePct || (b.tipsTotal ?? 0) - (a.tipsTotal ?? 0),
    );
  log(`후보: ${cands.length}건`);

  let created = 0;
  for (const g of cands) {
    if (created >= TARGET_PUBLISH) break;
    const tag = `[${g.league}] ${g.homeName} v ${g.awayName}`;

    // ① 매칭
    let m;
    try {
      m = await matchGame(g);
    } catch (e) {
      log(`${tag} 매칭 실패:`, e.response?.data || e.message);
      continue;
    }
    if (!m || !m.matched) {
      log(`${tag} skip: ${m?.reason || "match_err"}`);
      continue;
    }

    // ② 로컬 Ollama 픽스터 분석 생성
    const gen = await genLocal(m);
    if (!gen) {
      log(`${tag} 생성 실패(gen_fail)`);
      continue;
    }

    // ③ 저장
    let r;
    try {
      r = await savePost({
        matchId: m.matchId,
        pick: m.pick,
        title: gen.title,
        analysis: gen.analysis,
      });
    } catch (e) {
      log(`${tag} 저장 실패:`, e.response?.data || e.message);
      continue;
    }
    if (r && r.created) {
      created++;
      log(`✅ ${tag} ${m.pick} 발행 (post ${r.postId})`);
      await new Promise((res) => setTimeout(res, PUBLISH_GAP_MS)); // 분 단위 분산 발행
    } else {
      log(`${tag} 미발행: ${r?.reason || "?"}`);
    }
  }
  log(`완료: ${created}건 발행`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { parse };
