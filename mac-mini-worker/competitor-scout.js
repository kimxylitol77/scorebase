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
]);

// 직접 경쟁자는 아니지만 과거 아이디어 참고 서비스로 보고한 도메인. 재보고하지 않는다.
const REFERENCE_ONLY_DOMAINS = new Set([
  "escharts.com",
]);

// 실제 검색 시험에서 드러난 오분류. 제품 유형이 맞지 않으므로 후보·참고 서비스 모두 제외한다.
const REJECTED_SCOUT_DOMAINS = new Set([
  "zed.run",       // NFT 기반 가상 경주 게임
  "betegy.com",    // B2B 스포츠 콘텐츠·마케팅 자동화
  "datarobot.com", // 범용 기업 AutoML
]);

// 직접 경쟁자로 통과하려면 제품의 핵심 기능이 아래 항목 중 최소 2개와 겹쳐야 한다.
const DIRECT_OVERLAP_TAGS = [
  "라이브스코어",
  "배당 흐름",
  "AI 예측",
  "경기 데이터",
  "성적 추적",
];

const DIRECT_PRODUCT_TYPES = [
  "소비자용 라이브스코어",
  "소비자용 경기 분석",
  "소비자용 배당 분석",
  "소비자용 AI 예측",
];

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
  "2026 launch consumer AI sports prediction platform",
  "2026 real-time football xG analysis app launch",
  "2026 sports prediction performance tracking app",
  "2026 new football live score AI analysis app",
  "2026 baseball basketball consumer prediction analytics launch",
  "2026 스포츠 AI 예측 앱 출시 경기 분석",
  "2026 축구 실시간 xG 분석 앱 출시",
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
  const allBlocked = [
    ...KNOWN_COMPETITORS,
    ...REFERENCE_ONLY_DOMAINS,
    ...REJECTED_SCOUT_DOMAINS,
    ...NON_PRODUCT_DOMAINS,
    ...reportedDomains,
  ];
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
  const pastReferences = [...REFERENCE_ONLY_DOMAINS].sort().join(", ");
  const rejectedDomains = [...REJECTED_SCOUT_DOMAINS].sort().join(", ");
  const nonProductDomains = [...NON_PRODUCT_DOMAINS].sort().join(", ");
  return `오늘은 ${todayKst()} 입니다. 당신은 Scorebase의 신규 경쟁자 발굴 전담 스카우트입니다.

## 기존 competitor-watch 와 다른 임무
- 알려진 경쟁사의 업데이트를 추적하지 않는다.
- 아직 목록에 없던 스포츠 데이터·라이브스코어·AI 예측·팬 분석 제품을 새로 찾는다.
- 단순 기사·베팅업체·제휴 사이트가 아니라 실제 사용 가능한 제품만 후보로 인정한다.

## 이미 알고 있거나 과거 보고한 도메인 — 절대 후보로 내지 말 것
${exclusions}

## 과거 아이디어 참고 서비스 — 직접 경쟁자로 승격하거나 다시 보고하지 말 것
${pastReferences}

## 제품 유형 오분류로 탈락한 도메인 — 후보·참고 서비스 모두 금지
${rejectedDomains}

## domain.com 칸에 절대 쓰지 말 도메인 — 앱스토어·기사·SNS 링크
${nonProductDomains}
- 위 도메인은 발견 근거(근거 URL)로만 쓰고, 'domain.com' 칸에는 절대 쓰지 않는다.
- 앱을 찾았으면 그 앱의 공식 웹사이트 도메인을 domain 칸에 쓴다. 앱스토어 링크(play.google.com, apps.apple.com)를 domain 으로 쓰지 않는다.
- 공식 웹사이트 도메인을 확인할 수 없으면 그 후보는 제외한다.

## 검색 범위
- 최근 90일 안에 출시·피벗·주요 기능 공개가 확인된 신흥 서비스
- 영어권뿐 아니라 한국·일본·유럽·동남아의 스포츠 데이터 제품
- 축구뿐 아니라 MLB·KBO·NBA·e스포츠의 분석·예측·시각화 제품
- 검색 결과에서 처음 본 이름은 공식 사이트를 web_fetch 해 실제 제품인지 확인

## 우선 검색문
${LOCAL_QUERIES.map((query) => `- ${query}`).join("\n")}

## 직접 경쟁자에서 반드시 제외
- NFT·판타지·가상 경주·스포츠 게임처럼 실제 프로 경기를 분석하지 않는 제품
- 스포츠북·베팅 운영사·예측시장처럼 사용자의 베팅을 직접 받는 제품
- B2B 데이터 API·화이트라벨·마케팅 콘텐츠 자동화처럼 일반 팬이 직접 쓰는 분석 화면이 없는 제품
- 범용 AI·AutoML·방송·시청률·스폰서·선수 육성 제품
- 보도자료만 있고 공식 사이트에서 가입·앱·실제 제품 화면을 확인할 수 없는 제품

## 검증 규칙
1. 후보마다 공식 제품 도메인이 있어야 한다.
2. 공식 출시·기능 페이지 또는 독립 기사 URL을 근거로 붙인다.
3. 공식 사이트에서 확인되지 않은 기능은 쓰지 않는다.
4. 검증 가능한 신규 후보가 없으면 억지로 채우지 말고 없다고 쓴다.
5. 직접 경쟁자는 일반 팬이 실제 프로 경기 분석에 쓰는 소비자용 제품이어야 한다.
6. 직접 경쟁자는 제품의 핵심 사용 목적이 아래 5개 중 최소 2개와 겹쳐야 한다.
   라이브스코어 / 배당 흐름 / AI 예측 / 경기 데이터 / 성적 추적
7. 시청률·방송·스폰서·선수 육성처럼 한 항목만 간접적으로 겹치면 '아이디어 참고 서비스'로 분류한다.
8. 최대 직접 경쟁자 2곳 + 참고 서비스 1곳, 2000자 이내, 같은 모회사·화이트라벨 서비스는 1곳으로 합친다.
9. 같은 공식 도메인을 직접 경쟁자와 참고 서비스에 동시에 쓰지 않는다. 두 분류가 겹치면 직접 경쟁자에만 남긴다.

## 출력 형식
- 서두·맺음말·마크다운 별표·HTML 없이 첫 글자부터 🛰로 시작한다.
- 후보 첫 줄은 반드시 '번호. 서비스명 | domain.com | 한 줄 설명' 형식이다.
- 근거 URL은 실제 접속한 주소를 그대로 쓰고 기사 날짜는 적지 않는다.
- 직접 겹침은 아래 허용 태그만 사용하고 반드시 2개 이상 적는다.
- 제품 유형은 아래 네 문구 중 정확히 하나만 사용한다.
  소비자용 라이브스코어 / 소비자용 경기 분석 / 소비자용 배당 분석 / 소비자용 AI 예측

🛰 신규 발굴 결과
🥊 직접 경쟁자
1. 서비스명 | domain.com | 한 줄 설명
- 근거: https://...
- 제품 유형: 소비자용 경기 분석
- 실제 경기 대상: 예
- 직접 겹침: AI 예측, 경기 데이터, 성적 추적
- 차이: 저 서비스만의 구체적 강점

🧭 아이디어 참고 서비스
1. 서비스명 | domain.com | 한 줄 설명
- 근거: https://...
- 참고 이유: 직접 경쟁자는 아니지만 참고할 구체적 방식

💡 Scorebase 아이디어
1. 바로 적용 가능한 구체적 기능 [근거: domain.com] [난이도 중·효과 상]
2. 구체적 기능 [근거: domain.com] [난이도 하·효과 중]
3. 구체적 기능 [근거: domain.com] [난이도 상·효과 상]

🎯 오늘 1순위
- 가장 먼저 실험할 한 가지와 이유

직접 경쟁자가 없을 때는 🥊 직접 경쟁자 아래에 '- 검증 가능한 직접 경쟁자 없음'이라고 쓴다.
참고 서비스도 없을 때는 🧭 아이디어 참고 서비스 아래에 '- 검증 가능한 참고 서비스 없음'이라고 쓴다.
아이디어는 검증한 직접 경쟁자 또는 참고 서비스에서 확인한 기능만 근거로 작성할 것.`;
}

function getSection(report, heading) {
  const start = report.indexOf(heading);
  if (start < 0) return "";
  const rest = report.slice(start + heading.length);
  const next = rest.search(/\n[🛰🥊🧭💡🎯]\s*/u);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function extractCandidatesFromSection(section) {
  const candidates = [];
  const re = /^\d+\.\s+([^|\n]+?)\s*\|\s*([^|\s]+)\s*\|/gm;
  let match;
  while ((match = re.exec(section)) !== null) {
    const name = match[1].trim();
    const domain = normalizeDomain(match[2]);
    if (name && domain) candidates.push({ name, domain });
  }
  return candidates.slice(0, 3);
}

function extractCandidates(report) {
  return extractCandidatesFromSection(getSection(report, "🥊 직접 경쟁자"));
}

function extractReferenceCandidates(report) {
  return extractCandidatesFromSection(getSection(report, "🧭 아이디어 참고 서비스"));
}

function candidateBlock(section, candidate) {
  const lines = section.split("\n");
  const start = lines.findIndex((line) => {
    const match = line.match(/^\d+\.\s+[^|\n]+?\s*\|\s*([^|\s]+)\s*\|/);
    return match && normalizeDomain(match[1]) === candidate.domain;
  });
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\d+\.\s+[^|\n]+?\s*\|/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function directOverlapTags(report, candidate) {
  const block = candidateBlock(getSection(report, "🥊 직접 경쟁자"), candidate);
  const overlap = block.match(/^- 직접 겹침:\s*(.+)$/m)?.[1] || "";
  return DIRECT_OVERLAP_TAGS.filter((tag) => overlap.includes(tag));
}

function validateCandidateBlock(report, heading, candidate, { direct = false } = {}) {
  const block = candidateBlock(getSection(report, heading), candidate);
  if (!/^- 근거:\s*https?:\/\/\S+/m.test(block)) {
    throw new Error(`개별 근거 URL 누락: ${candidate.domain}`);
  }
  if (!direct) return;

  const productType = block.match(/^- 제품 유형:\s*(.+)$/m)?.[1]?.trim() || "";
  if (!DIRECT_PRODUCT_TYPES.includes(productType)) {
    throw new Error(`직접 경쟁 제품 유형 오류: ${candidate.domain}`);
  }
  if (!/^- 실제 경기 대상:\s*예\s*$/m.test(block)) {
    throw new Error(`실제 경기 대상 확인 실패: ${candidate.domain}`);
  }
  const tags = directOverlapTags(report, candidate);
  if (tags.length < 2) {
    throw new Error(`직접 경쟁 기준 미달: ${candidate.domain} (${tags.length}/2 태그)`);
  }
}

function validateIdeas(report, candidates) {
  if (candidates.length === 0) return;
  const ideas = getSection(report, "💡 Scorebase 아이디어")
    .split("\n")
    .filter((line) => /^\d+\.\s+/.test(line));
  if (ideas.length < 2) throw new Error(`구체적 아이디어 부족: ${ideas.length}/2`);

  const domains = candidates.map((item) => item.domain);
  for (const idea of ideas) {
    if (!/\[난이도 (상|중|하)·효과 (상|중|하)\]/.test(idea)) {
      throw new Error("아이디어 난이도·효과 형식 오류");
    }
    const source = idea.match(/\[근거:\s*([^\]]+)\]/)?.[1]?.trim() || "";
    if (!domains.some((domain) => normalizeDomain(source) === domain)) {
      throw new Error(`아이디어 근거 도메인 오류: ${source || "없음"}`);
    }
    const body = idea
      .replace(/^\d+\.\s+/, "")
      .replace(/\[[^\]]+\]/g, "")
      .trim();
    if (body.length < 12) throw new Error("아이디어 설명이 지나치게 짧음");
  }
}

function sanitizeReport(text) {
  const normalized = String(text).replace(/^#{1,6}\s*(?=[🛰🥊🧭💡🎯])/gmu, "");
  return tidyBullets(stripPreamble(normalized, ["🛰", "🥊", "🧭", "💡", "🎯"]))
    .replace(/\*\*/g, "")
    .replace(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/\s*\(https?:\/\/[^)]+\)/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .trim();
}

function replaceSection(report, heading, content) {
  const start = report.indexOf(heading);
  if (start < 0) return report;
  const contentStart = start + heading.length;
  const rest = report.slice(contentStart);
  const next = rest.search(/\n[🛰🥊🧭💡🎯]\s*/u);
  const end = next >= 0 ? contentStart + next : report.length;
  return `${report.slice(0, contentStart)}\n${content.trim()}${report.slice(end)}`;
}

function dedupeCandidateSection(section, seenDomains, emptyText) {
  const lines = section.split("\n");
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\d+\.\s+[^|\n]+?\s*\|\s*[^|\s]+\s*\|/.test(lines[index])) starts.push(index);
  }
  if (starts.length === 0) return { section, removed: [] };

  const kept = [];
  const removed = [];
  for (let blockIndex = 0; blockIndex < starts.length; blockIndex += 1) {
    const start = starts[blockIndex];
    const end = starts[blockIndex + 1] ?? lines.length;
    const block = lines.slice(start, end).join("\n").trim();
    const domain = normalizeDomain(block.match(/^\d+\.\s+[^|\n]+?\s*\|\s*([^|\s]+)\s*\|/)?.[1]);
    if (!domain || seenDomains.has(domain)) {
      if (domain) removed.push(domain);
      continue;
    }
    seenDomains.add(domain);
    kept.push(block);
  }

  return {
    section: kept.length > 0
      ? kept.map((block, index) => block.replace(/^\d+\./, `${index + 1}.`)).join("\n\n")
      : emptyText,
    removed,
  };
}

function dedupeReportCandidates(report) {
  const seenDomains = new Set();
  const direct = dedupeCandidateSection(
    getSection(report, "🥊 직접 경쟁자"),
    seenDomains,
    "- 검증 가능한 직접 경쟁자 없음",
  );
  let clean = replaceSection(report, "🥊 직접 경쟁자", direct.section);
  const references = dedupeCandidateSection(
    getSection(clean, "🧭 아이디어 참고 서비스"),
    seenDomains,
    "- 검증 가능한 참고 서비스 없음",
  );
  clean = replaceSection(clean, "🧭 아이디어 참고 서비스", references.section);
  return { report: clean, removed: [...direct.removed, ...references.removed] };
}

function validateReport(report, state) {
  const direct = extractCandidates(report);
  const references = extractReferenceCandidates(report);
  const explicitlyEmpty = report.includes("검증 가능한 직접 경쟁자 없음");
  if (direct.length === 0 && !explicitlyEmpty) {
    throw new Error("직접 경쟁자 형식 파싱 실패 — 전송 중단");
  }

  const reportedDomains = state.discoveries.map((item) => item.domain);
  const allCandidates = [...direct, ...references];
  const excluded = allCandidates.filter((item) => isExcludedDomain(item.domain, reportedDomains));
  if (excluded.length > 0) {
    throw new Error(`기존·제외 도메인 재등장: ${excluded.map((item) => item.domain).join(", ")}`);
  }

  const unique = new Set(allCandidates.map((item) => item.domain));
  if (unique.size !== allCandidates.length) throw new Error("동일 도메인 중복 후보");
  for (const candidate of direct) {
    validateCandidateBlock(report, "🥊 직접 경쟁자", candidate, { direct: true });
  }
  for (const candidate of references) {
    validateCandidateBlock(report, "🧭 아이디어 참고 서비스", candidate);
  }
  const urlCount = (report.match(/https?:\/\//g) || []).length;
  if (allCandidates.length > 0 && urlCount < allCandidates.length) {
    throw new Error("후보별 검증 URL 부족 — 전송 중단");
  }
  validateIdeas(report, allCandidates);
  if (report.length > 2600) throw new Error(`보고서 과다 길이: ${report.length}자`);
  return { direct, references };
}

function saveResult(state, result, report) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const date = kstDateKey();
  const discoveries = [
    ...state.discoveries,
    ...result.direct.map((item) => ({ ...item, type: "direct", firstSeen: date })),
    ...result.references.map((item) => ({ ...item, type: "reference", firstSeen: date })),
  ];
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ updatedAt: new Date().toISOString(), discoveries }, null, 2),
  );
  fs.appendFileSync(IDEA_LOG, JSON.stringify({ date, ...result, report }) + "\n");
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
  // 검색 품질이 중요한 일 1회 작업이므로 다른 브리핑 봇과 분리해 강한 폴백 모델을 쓴다.
  if (!process.env.OPENAI_BRIEF_MODEL) {
    process.env.OPENAI_BRIEF_MODEL = process.env.SCOUT_OPENAI_MODEL || "gpt-5.6-sol";
  }
  const basePrompt = buildPrompt(reportedDomains);
  let clean;
  let result;
  let validationError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = validationError
      ? `${basePrompt}\n\n## 이전 결과 재검증 지시\n- 검증 실패 이유: ${validationError.message}\n- 실패한 후보의 공식 제품 페이지를 다시 확인하고, 기준을 충족하면 형식을 바로잡고 충족하지 않으면 후보에서 제거한다.\n- 검증 가능한 직접 경쟁자가 없으면 억지로 대체하지 말고 지정된 '없음' 문구를 쓴다.`
      : basePrompt;
    const text = await askWithWebSearch(prompt, {
      maxTokens: 2800,
      maxSearches: 12,
      fetch: true,
      query: LOCAL_QUERIES,
      perQuery: 6,
      when: "90d",
      maxAgeDays: 90,
    });
    if (!text) throw new Error("빈 응답 (검색 실패 가능)");

    const deduped = dedupeReportCandidates(sanitizeReport(text));
    clean = deduped.report;
    if (deduped.removed.length > 0) {
      console.warn(`[competitor-scout] 중복 후보 자동 제거: ${deduped.removed.join(", ")}`);
    }
    try {
      result = validateReport(clean, state);
      validationError = null;
      break;
    } catch (error) {
      validationError = error;
      if (attempt === 0) {
        console.warn(`[competitor-scout] 검증 실패, 1회 재검색: ${error.message}`);
      }
    }
  }
  if (validationError) throw validationError;
  if (DRY_RUN) {
    console.log(
      `[competitor-scout] DRY RUN — direct=${result.direct.length}, references=${result.references.length}\n${clean}`,
    );
    return { ...result, report: clean };
  }

  await notify({
    source: "competitor-scout",
    severity: "INFO",
    title: "🛰 신규 경쟁자 스카우트",
    message: escapeHtml(clean),
    metadata: {
      directDomains: result.direct.map((item) => item.domain),
      referenceDomains: result.references.map((item) => item.domain),
    },
  });
  saveResult(state, result, clean);
  console.log(
    `[competitor-scout] sent — direct=${result.direct.length}, references=${result.references.length}\n${clean}`,
  );
  return { ...result, report: clean };
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
  dedupeReportCandidates,
  extractCandidates,
  extractReferenceCandidates,
  isExcludedDomain,
  loadState,
  main,
  normalizeDomain,
  sanitizeReport,
  validateReport,
};
