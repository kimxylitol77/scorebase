// Covers.com MLB 오버/언더 대중 베팅 컨센서스 크롤러 — 맥미니 launchd.
// Covers OU consensus 페이지를 파싱해 컨센서스 격차 큰 상위 N경기를 처리한다.
//   ① Vercel 에 매칭 요청(/api/internal/consensus-pick) → scorebase Match·한글팀명·dedup
//   ② 매칭된 경기만 로컬 Ollama(qwen2.5:32b)로 한국어 분석 생성 (Anthropic 크레딧 0 무관)
//   ③ Vercel 에 저장 요청(phase=save) → Post 생성
// 예의바른 크롤러: 정직한 UA, robots 존중(/consensus 허용 확인됨), 요청 간 sleep.

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const axios = require("axios");
const cheerio = require("cheerio");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/chat";
const OLLAMA_MODEL = process.env.CONSENSUS_OLLAMA_MODEL || "qwen2.5:32b";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const COVERS_URL = "https://contests.covers.com/consensus/topoverunderconsensus/mlb/overall";
const TARGET_PUBLISH = 4; // 발행 목표 경기 수 (SEO·도배 방지로 소량 선별)
const PUBLISH_GAP_MS = 60 * 1000; // 글 사이 1분 간격 (분 단위 분산 발행)

// 한국어 분석가 시스템 프롬프트 — 픽(컨센서스 우세쪽)은 고정, 근거만 서술.
const SYSTEM = `당신은 한국어 스포츠 미디어 "스코어베이스"의 해외 베팅 동향 분석가입니다.
해외 베팅 대중의 오버/언더(총득점) 컨센서스(수만 명 참가자의 픽 분포)를 한국 독자에게 전달합니다.

[역할]
- 주어진 컨센서스 데이터(오버/언더 비율, 총득점 기준선, 픽 수)를 해석한다.
- "대중이 오버와 언더 중 어느 쪽에 얼마나 몰렸는지"와 그 의미를 설명한다.
- 픽은 이미 데이터로 정해져 있다(컨센서스 우세쪽). 너는 그 근거를 분석할 뿐, 픽을 바꾸지 않는다.

[톤]
- 정보 전달형 문어체. "대중의 70%가 오버에" 식.
- 양 팀 타선·선발 투수 맥락을 곁들이되, 컨센서스가 항상 옳지 않음(대중 편향) 가능성을 한 줄 짚으면 좋다.
- 과장·자극 금지. 특정 출처나 사이트 이름은 언급하지 않는다.

[표기 규칙 — 엄수]
- 모든 글자는 한글로만 쓴다. 일본어 가나(カタカナ·ひらがな)·한자·영어 단어를 절대 섞지 않는다.
- 구장·도시·인명도 한글로 적는다 (예: 양키 스타디움, 펜웨이 파크). "ヤンキー" 같은 외국 문자 혼입 금지.
- 제공된 한글 팀명을 그대로 쓰거나 지역명으로 줄인다. 별명만 단독으로 쓰지 않는다.

[출력] 반드시 아래 JSON 객체 하나만 출력. 앞뒤 설명·코드블록 금지:
{"title":"제목","analysis":"마크다운 본문"}
- title: 40자 이내. 오버/언더 어느 쪽에 몰렸는지 드러낼 것.
- analysis: 마크다운. "## 오버언더 컨센서스", "## 기준선·픽 분포", "## 해석" 세 섹션, 200자 이상.`;

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

/** Covers OU consensus HTML → 경기 배열. 오버/언더 %·기준선·픽수 추출. */
function parse(html) {
  const $ = cheerio.load(html);
  const games = [];
  $("td.covers-CoversConsensus-table--matchupColumn").each((_, td) => {
    const $cell = $(td);
    const logos = $cell.find("img.covers-CoversConsensus-mainLogo");
    if (logos.length < 2) return;

    const abbrOf = (img) => {
      const src = $(img).attr("src") || "";
      const m = src.match(/\/mlb\/([a-z0-9]+)\.(?:png|gif)/i);
      return m ? m[1].toLowerCase() : null;
    };
    const awayAbbr = abbrOf(logos[0]);
    const homeAbbr = abbrOf(logos[1]);
    if (!awayAbbr || !homeAbbr) return;

    // 같은 행의 다음 td 들: [0]=시간 [1]=오버/언더% [2]=기준선 [3]=픽수
    const sib = $cell.nextAll("td");
    const gameTimeEt = sib.eq(0).text().replace(/\s+/g, " ").trim() || null;
    const ouPcts = [...sib.eq(1).text().matchAll(/(\d+)\s*%/g)].map((m) => Number(m[1]));
    const line = Number(sib.eq(2).text().replace(/[^\d.]/g, ""));
    // 픽수는 붙어 나올 수 있어(11751) 자식 텍스트 노드 단위로 분리.
    const pickTexts = sib
      .eq(3)
      .find("*")
      .addBack()
      .contents()
      .filter((_, n) => n.type === "text")
      .map((_, n) => $(n).text().trim())
      .get()
      .filter((t) => /^\d+$/.test(t));
    const picks = pickTexts.map(Number);

    if (ouPcts.length < 2 || !Number.isFinite(line)) return; // 핵심 데이터 없으면 skip

    games.push({
      awayAbbr,
      homeAbbr,
      overPct: ouPcts[0],
      underPct: ouPcts[1],
      line,
      overPicks: Number.isFinite(picks[0]) ? picks[0] : null,
      underPicks: Number.isFinite(picks[1]) ? picks[1] : null,
      gameTimeEt,
    });
  });
  return games;
}

async function fetchCovers() {
  const { data } = await axios.get(COVERS_URL, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    timeout: 30000,
  });
  return data;
}

/** ① Vercel 매칭: 경기 1건 → scorebase Match·한글팀명·dedup (LLM 없음). */
async function matchGame(g) {
  const { data } = await axios.post(`${SITE}/api/internal/consensus-pick`, g, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 30000,
  });
  return data; // MatchOutcome { matched, ... }
}

/** ③ Vercel 저장: 완성 분석 → Post 생성. */
async function savePost(payload) {
  const { data } = await axios.post(
    `${SITE}/api/internal/consensus-pick`,
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

/** ② 로컬 Ollama 한국어 분석 생성. 가나 섞이면 재생성(2회), 마지막엔 제거 후 발행. */
async function genLocal(m) {
  const favLabel = m.pick === "OVER" ? "오버" : "언더";
  const favPct = m.pick === "OVER" ? m.overPct : m.underPct;
  const pk = (x) => (x == null ? "" : ` (${x}픽)`);
  const prompt = [
    `경기: ${m.awayKo}(원정) vs ${m.homeKo}(홈)`,
    `리그: MLB · 경기 시각(KST): ${m.kickoffKst}`,
    `총득점 기준선(O/U line): ${m.line}`,
    `해외 베팅 대중 오버/언더 컨센서스:`,
    `- 오버: ${m.overPct}%${pk(m.overPicks)}`,
    `- 언더: ${m.underPct}%${pk(m.underPicks)}`,
    `대중 우세: ${favLabel} (${favPct}%)`,
  ].join("\n");

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
  const html = await fetchCovers();
  const games = parse(html);
  log(`Covers MLB OU 파싱: ${games.length}경기`);
  // 컨센서스 격차 큰 순으로 상위 N개만 (Vercel 쪽도 55% 미만 skip).
  games.sort((a, b) => Math.max(b.overPct, b.underPct) - Math.max(a.overPct, a.underPct));
  let created = 0;
  for (const g of games) {
    if (created >= TARGET_PUBLISH) break;
    const tag = `${g.awayAbbr}@${g.homeAbbr}`;

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

    // ② 로컬 Ollama 분석 생성
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
        line: m.line,
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
