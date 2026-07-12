// 신규 경쟁자 스카우트 — 이미 알려진 경쟁사 변화가 아니라 새 스포츠 데이터·AI 서비스를 발굴한다.
// launchd: 매일 08:40 KST. 검증 가능한 공식 도메인과 근거 URL이 있는 후보만 텔레그램으로 전송.
const path = require("path");
const fs = require("fs");
const {
  askWithWebSearch,
  notify,
  escapeHtml,
  stripPreamble,
  tidyBullets,
  todayKst,
} = require("./ai-brief-lib");

const STATE_DIR = path.resolve(__dirname, "state");
const STATE_FILE = path.join(STATE_DIR, "competitor-scout.json");
const IDEA_LOG = path.join(STATE_DIR, "competitor-scout-ideas.jsonl");
const DRY_RUN = process.env.SCOUT_DRY_RUN === "1" || process.argv.includes("--dry-run");

// competitor-watch 가 이미 추적하는 고정 목록. 이 봇은 아래 도메인을 절대 다시 보고하지 않는다.
const KNOWN_COMPETITORS = new Set([
  "sofascore.com",
  "fotmob.com",
  "theanalyst.com",
  "whoscored.com",
  "understat.com",
  "flashscore.com",
  "aiscore.com",
  "buildup-football.com",
  "naver.com",
  "footballist.co.kr",
  "interfootball.co.kr",
  "besteleven.com",
  "sportalkorea.com",
  "osen.co.kr",
  "jumpball.co.kr",
  "forebet.com",
  "windrawwin.com",
  "predictz.com",
  "infogol.net",
  "worldcup26simulator.com",
  "dimers.com",
  "rithmm.com",
  "oddstrader.com",
  "thestatwire.com",
  "propsbot.com",
  "baseballpredict.com",
  "covers.com",
  "theathletic.com",
  "espn.com",
  "onefootball.com",
  "365scores.com",
  "fangraphs.com",
  "baseballsavant.mlb.com",
  "statiz.co.kr",
  // 2026-07-12 최초 스카우트 결과로 운영자에게 보고한 뒤 중복 방지 목록에 편입.
  "escharts.com",
]);

// 기사·커뮤니티·앱스토어는 발견 근거가 될 수 있지만 경쟁자 자체 도메인으로 저장하지 않는다.
const NON_PRODUCT_DOMAINS = new Set([
  "google.com",
  "news.google.com",
  "youtube.com",
  "reddit.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "medium.com",
  "substack.com",
  "techcrunch.com",
  "venturebeat.com",
  "prnewswire.com",
  "businesswire.com",
  "apps.apple.com",
  "play.google.com",
  "github.com",
]);

const LOCAL_QUERIES = [
  "new sports analytics startup launch",
  "new AI sports prediction platform",
  "football analytics app startup launch",
  "baseball analytics AI startup",
  "sports fan data visualization startup",
  "스포츠 데이터 스타트업 신규 서비스",
  "AI 스포츠 예측 플랫폼 출시",
];

function kstDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeDomain(value) {
  if (!value) return "";
  let raw = String(value).trim().toLowerCase();
  if (!/^https?:\/\//.test(raw)) raw = `https://${raw}`;
  try {
    return new URL(raw).hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

function domainMatches(domain, blocked) {
  return domain === blocked || domain.endsWith(`.${blocked}`);
}

function isExcludedDomain(domain, reportedDomains = []) {
  const normalized = normalizeDomain(domain);
  if (!normalized || !normalized.includes(".")) return true;
  const allBlocked = [...KNOWN_COMPETITORS, ...NON_PRODUCT_DOMAINS, ...reportedDomains];
  return allBlocked.some((blocked) => domainMatches(normalized, normalizeDomain(blocked)));
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      updatedAt: parsed.updatedAt || null,
      discoveries: Array.isArray(parsed.discoveries) ? parsed.discoveries : [],
    };
  } catch {
    return { updatedAt: null, discoveries: [] };
  }
}

function buildPrompt(reportedDomains) {
  const exclusions = [...KNOWN_COMPETITORS, ...reportedDomains].sort().join(", ");
  return `오늘은 ${todayKst()} 입니다. 당신은 Scorebase의 신규 경쟁자 발굴 전담 스카우트입니다.

## 기존 competitor-watch 와 다른 임무
- 알려진 경쟁사의 업데이트를 추적하지 않는다.
- 아직 목록에 없던 스포츠 데이터·라이브스코어·AI 예측·팬 분석 제품을 새로 찾는다.
- 단순 기사·베팅업체·제휴 사이트가 아니라 실제 사용 가능한 제품만 후보로 인정한다.

## 이미 알고 있거나 과거 보고한 도메인 — 절대 후보로 내지 말 것
${exclusions}

## 검색 범위
- 최근 90일 안에 출시·피벗·주요 기능 공개가 확인된 신흥 서비스
- 영어권뿐 아니라 한국·일본·유럽·동남아의 스포츠 데이터 제품
- 축구뿐 아니라 MLB·KBO·NBA·e스포츠의 분석·예측·시각화 제품
- 검색 결과에서 처음 본 이름은 공식 사이트를 web_fetch 해 실제 제품인지 확인

## 검증 규칙
1. 후보마다 공식 제품 도메인이 있어야 한다.
2. 공식 출시·기능 페이지 또는 독립 기사 URL을 근거로 붙인다.
3. 공식 사이트에서 확인되지 않은 기능은 쓰지 않는다.
4. 검증 가능한 신규 후보가 없으면 억지로 채우지 말고 없다고 쓴다.
5. 최대 2곳, 1800자 이내, 같은 모회사·화이트라벨 서비스는 1곳으로 합친다.

## 출력 형식
- 서두·맺음말·마크다운 별표·HTML 없이 첫 글자부터 🛰로 시작한다.
- 후보 첫 줄은 반드시 '번호. 서비스명 | domain.com | 한 줄 설명' 형식이다.
- 근거 URL은 실제 접속한 주소를 그대로 쓰고 기사 날짜는 적지 않는다.

🛰 신규 경쟁자
1. 서비스명 | domain.com | 한 줄 설명
- 근거: https://...
- 겹침: Scorebase의 어느 기능과 경쟁하는지
- 차이: 저 서비스만의 구체적 강점

💡 Scorebase 아이디어
1. 바로 적용 가능한 아이디어 [난이도 상/중/하·효과 상/중/하]
2. 아이디어
3. 아이디어

🎯 오늘 1순위
- 가장 먼저 실험할 한 가지와 이유

신규 후보가 없을 때는 🛰 신규 경쟁자 아래에 '- 검증 가능한 신규 후보 없음'이라고 쓰고 아이디어도 근거 없이 만들지 말 것.`;
}

function extractCandidates(report) {
  const candidates = [];
  const re = /^\d+\.\s+([^|\n]+?)\s*\|\s*([^|\s]+)\s*\|/gm;
  let match;
  while ((match = re.exec(report)) !== null) {
    const name = match[1].trim();
    const domain = normalizeDomain(match[2]);
    if (name && domain) candidates.push({ name, domain });
  }
  return candidates.slice(0, 3);
}

function sanitizeReport(text) {
  const normalized = String(text).replace(/^#{1,6}\s*(?=[🛰💡🎯])/gm, "");
  return tidyBullets(stripPreamble(normalized, ["🛰", "💡", "🎯"]))
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .trim();
}

function validateReport(report, state) {
  const candidates = extractCandidates(report);
  const explicitlyEmpty = report.includes("검증 가능한 신규 후보 없음");
  if (candidates.length === 0 && !explicitlyEmpty) {
    throw new Error("신규 후보 형식 파싱 실패 — 전송 중단");
  }

  const reportedDomains = state.discoveries.map((item) => item.domain);
  const excluded = candidates.filter((item) => isExcludedDomain(item.domain, reportedDomains));
  if (excluded.length > 0) {
    throw new Error(`기존·제외 도메인 재등장: ${excluded.map((item) => item.domain).join(", ")}`);
  }

  const unique = new Set(candidates.map((item) => item.domain));
  if (unique.size !== candidates.length) throw new Error("동일 도메인 중복 후보");
  const urlCount = (report.match(/https?:\/\//g) || []).length;
  if (candidates.length > 0 && urlCount < candidates.length) {
    throw new Error("후보별 검증 URL 부족 — 전송 중단");
  }
  if (report.length > 2600) throw new Error(`보고서 과다 길이: ${report.length}자`);
  return candidates;
}

function saveResult(state, candidates, report) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const date = kstDateKey();
  const discoveries = [
    ...state.discoveries,
    ...candidates.map((item) => ({ ...item, firstSeen: date })),
  ];
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ updatedAt: new Date().toISOString(), discoveries }, null, 2),
  );
  fs.appendFileSync(IDEA_LOG, JSON.stringify({ date, candidates, report }) + "\n");
}

async function main() {
  const state = loadState();
  const reportedDomains = state.discoveries.map((item) => item.domain);
  // 다른 브리핑이 비용 절약용 local 모드여도 신규 도메인 검증은 실제 웹 검색을 사용한다.
  // SCOUT_PROVIDER 가 있으면 우선하고, 없으면 사용 가능한 원격 provider 로 자동 전환한다.
  if (process.env.SCOUT_PROVIDER) {
    process.env.BRIEF_PROVIDER = process.env.SCOUT_PROVIDER;
  } else if (process.env.BRIEF_PROVIDER === "local") {
    if (process.env.OPENAI_API_KEY) process.env.BRIEF_PROVIDER = "openai";
    else if (process.env.ANTHROPIC_API_KEY) delete process.env.BRIEF_PROVIDER;
  }
  const text = await askWithWebSearch(buildPrompt(reportedDomains), {
    maxTokens: 2800,
    maxSearches: 12,
    fetch: true,
    query: LOCAL_QUERIES,
    perQuery: 6,
    when: "90d",
    maxAgeDays: 90,
  });
  if (!text) throw new Error("빈 응답 (검색 실패 가능)");

  const clean = sanitizeReport(text);
  const candidates = validateReport(clean, state);
  if (DRY_RUN) {
    console.log(`[competitor-scout] DRY RUN — candidates=${candidates.length}\n${clean}`);
    return { candidates, report: clean };
  }

  await notify({
    source: "competitor-scout",
    severity: "INFO",
    title: "🛰 신규 경쟁자 스카우트",
    message: escapeHtml(clean),
    metadata: { domains: candidates.map((item) => item.domain) },
  });
  saveResult(state, candidates, clean);
  console.log(`[competitor-scout] sent — candidates=${candidates.length}\n${clean}`);
  return { candidates, report: clean };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error("[competitor-scout] error:", error.message);
      if (!DRY_RUN) {
        try {
          await notify({
            source: "competitor-scout",
            severity: "WARN",
            title: "⚠️ 신규 경쟁자 스카우트 실패",
            message: escapeHtml(error.message || String(error)),
          });
        } catch {}
      }
      process.exit(1);
    });
}

module.exports = {
  buildPrompt,
  extractCandidates,
  isExcludedDomain,
  loadState,
  main,
  normalizeDomain,
  sanitizeReport,
  validateReport,
};
