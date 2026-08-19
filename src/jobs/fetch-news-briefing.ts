// 해외 스포츠 브리핑 — 공신력 소스(BBC·Sky·Athletic·ESPN·리그 공식) RSS → 사실 재구성 →
// 검증 → 커뮤니티 발행 파이프라인. 저작권 가드레일: 번역 금지·인용 1문장·출처 명시.
// 과거 루머 탭 철회(810bbf4) 교훈 반영: 본문 포함 + 상위 모델 + 2단계 검증 게이트.
// cron: /api/cron/news-briefing (2h). 게시판: /news (Post.category=BRIEFING, 글 상세는 /analysis/{id})
import "@/lib/env";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { sendTelegram } from "@/lib/notify/telegram";
import { makeHideToken } from "@/lib/admin-hide-token";
import { extractTransferRumors } from "@/jobs/extract-transfer-rumors";

// 재작성·검증 모델 — 품질 사고 재발 방지용 상위 모델 (haiku 오분류로 출시 당일 철회 이력).
// sonnet-5: temperature 미지원 → claude.ts 가 model 지정 시 sampling 파라미터 미전송.
const BRIEFING_MODEL = process.env.BRIEFING_MODEL ?? "claude-sonnet-5";

const MAX_AGE_H = 48; // 이보다 오래된 원문은 무시
const MAX_NEW_PER_RUN = 44; // haiku 1회 분류 상한
// 종목별 분류 쿼터 — 소스 수가 압도적인 축구(8개 피드)가 상한을 다 먹으면 타 종목이
// 분류 단계에 도달조차 못 한다. 2026-08-19 실측: 신규 788건을 최신순 40건으로 자르니
// 야구·농구 후보가 0건이었다. 종목별로 따로 뽑아야 한다.
const NEW_PER_SPORT: Record<BriefingSport, number> = {
  soccer: 20,
  baseball: 8,
  basketball: 8,
  hockey: 8,
};
const MAX_PUBLISH_PER_RUN = 5;
const MAX_PUBLISH_PER_DAY = 16; // KST 기준 — 비용·폭주 상한 (4개 종목분)
// 종목별 런 상한 — 재료가 압도적으로 많은 축구가 캡을 독식하는 걸 막는다.
// MIN_SCORE 게이트는 그대로라 재료 없는 비시즌 종목은 억지로 채우지 않고 그냥 비운다.
const PER_SPORT_PER_RUN: Record<BriefingSport, number> = {
  soccer: 2,
  baseball: 1,
  basketball: 1,
  hockey: 1,
};
const MIN_SCORE = 5; // 뉴스가치 발행 하한 (분류 rubric 의 "신빙성 있는 이적 협상" 대역부터)
const KEEP_DAYS = 60; // 비발행 행 보존 기간

const BOT_EMAIL = "intl@scorebase.internal";
const BOT_NICKNAME = "스코어베이스 국제부";

// ── Tier 1 소스 화이트리스트 ─────────────────────────────────────────────
// direct: RSS link 가 실제 기사 URL → 본문 fetch 가능.
// gnews: Google News RSS — link 가 리다이렉트 래퍼 (2024+ 신형 인코딩이라 원 URL 복원 불가
//        → 헤드라인·요약만으로 짧게 재작성. 재료 부족하면 검증 게이트가 발행 차단).
// promote: 구글뉴스 제목 끝 " - 매체명" 을 sourceName 으로 승격 (기자 검색 피드용).
export type BriefingSport = "soccer" | "baseball" | "basketball" | "hockey";

interface SourceDef {
  name: string;
  url: string;
  kind: "direct" | "gnews";
  // 종목은 소스가 고정한다 — LLM 분류에 맡기면 오분류 시 야구 뉴스가 축구 게시판에 꽂힌다.
  sport: BriefingSport;
  tag: string; // 게시글 제목 말머리 [tag]
  journalist?: string; // 기자 단위 피드는 고정 (분류 추출보다 정확)
  promote?: boolean;
  // 루머 피드 전용 소스 (국내 매체) — 브리핑 후보에서 제외. 한국어 기사를 한국어로
  // "재구성"하면 번역이 아니라 표절 위험이라 브리핑으론 절대 안 씀.
  rumorOnly?: boolean;
}

// 종목 라벨 — 분류·재작성 프롬프트와 게시글 표시에 공유
const SPORT_LABEL: Record<BriefingSport, string> = {
  soccer: "축구",
  baseball: "야구(MLB)",
  basketball: "농구(NBA)",
  hockey: "아이스하키(NHL)",
};

const SOURCES: SourceDef[] = [
  // ── 축구 ────────────────────────────────────────────────────────────
  { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", kind: "direct", sport: "soccer", tag: "BBC" },
  { name: "Sky Sports", url: "https://www.skysports.com/rss/11095", kind: "direct", sport: "soccer", tag: "Sky" },
  {
    name: "The Athletic",
    url: "https://news.google.com/rss/search?q=site:nytimes.com/athletic%20(football%20OR%20soccer%20OR%20transfer)%20when:2d&hl=en-US&gl=US&ceid=US:en",
    kind: "gnews",
    sport: "soccer",
    tag: "Athletic",
  },
  {
    name: "Google News",
    url: "https://news.google.com/rss/search?q=%22David%20Ornstein%22%20when:2d&hl=en-US&gl=US&ceid=US:en",
    kind: "gnews",
    sport: "soccer",
    tag: "온스타인",
    journalist: "David Ornstein",
    promote: true,
  },
  {
    name: "Google News",
    url: "https://news.google.com/rss/search?q=%22Fabrizio%20Romano%22%20(transfer%20OR%20%22here%20we%20go%22)%20when:2d&hl=en-US&gl=US&ceid=US:en",
    kind: "gnews",
    sport: "soccer",
    tag: "로마노",
    journalist: "Fabrizio Romano",
    promote: true,
  },
  {
    // 구단 공식 발표 (EPL 빅6 + 레알·바르사·바이에른) — 오피셜 영입/방출/부상 공지
    name: "구단 공식",
    url: "https://news.google.com/rss/search?q=(site:manutd.com%20OR%20site:arsenal.com%20OR%20site:liverpoolfc.com%20OR%20site:chelseafc.com%20OR%20site:mancity.com%20OR%20site:tottenhamhotspur.com%20OR%20site:realmadrid.com%20OR%20site:fcbarcelona.com%20OR%20site:fcbayern.com)%20when:2d&hl=en-US&gl=US&ceid=US:en",
    kind: "gnews",
    sport: "soccer",
    tag: "오피셜",
  },
  {
    name: "Premier League",
    url: "https://news.google.com/rss/search?q=site:premierleague.com%20when:2d&hl=en-US&gl=US&ceid=US:en",
    kind: "gnews",
    sport: "soccer",
    tag: "PL 공식",
  },
  {
    // 국내 축구 전문지 — 이적 루머 피드 전용 (KO_RUMOR_KEYWORDS 프리필터, 브리핑 제외)
    name: "풋볼리스트",
    url: "https://www.footballist.co.kr/rss/allArticle.xml",
    kind: "direct",
    sport: "soccer",
    tag: "국내",
    rumorOnly: true,
  },

  // ── 야구 ────────────────────────────────────────────────────────────
  // MLB.com 직접 RSS 는 403 (2026-08-19 실측) → gnews site: 로 우회.
  { name: "ESPN", url: "https://www.espn.com/espn/rss/mlb/news", kind: "direct", sport: "baseball", tag: "ESPN" },
  {
    name: "MLB.com",
    url: "https://news.google.com/rss/search?q=site:mlb.com%20when:2d&hl=en-US&gl=US&ceid=US:en",
    kind: "gnews",
    sport: "baseball",
    tag: "MLB 공식",
  },
  {
    name: "Google News",
    url: "https://news.google.com/rss/search?q=%22Jeff%20Passan%22%20when:2d&hl=en-US&gl=US&ceid=US:en",
    kind: "gnews",
    sport: "baseball",
    tag: "패산",
    journalist: "Jeff Passan",
    promote: true,
  },

  // ── 농구 ────────────────────────────────────────────────────────────
  // NBA.com 직접 RSS 는 404 (2026-08-19 실측) → gnews site: 로 우회.
  { name: "ESPN", url: "https://www.espn.com/espn/rss/nba/news", kind: "direct", sport: "basketball", tag: "ESPN" },
  {
    name: "NBA.com",
    url: "https://news.google.com/rss/search?q=site:nba.com%20when:2d&hl=en-US&gl=US&ceid=US:en",
    kind: "gnews",
    sport: "basketball",
    tag: "NBA 공식",
  },
  {
    name: "Google News",
    url: "https://news.google.com/rss/search?q=%22Shams%20Charania%22%20when:2d&hl=en-US&gl=US&ceid=US:en",
    kind: "gnews",
    sport: "basketball",
    tag: "샴스",
    journalist: "Shams Charania",
    promote: true,
  },

  // ── 하키 ────────────────────────────────────────────────────────────
  // NHL.com 직접 RSS 는 302 리다이렉트 (2026-08-19 실측) → gnews site: 로 우회.
  { name: "ESPN", url: "https://www.espn.com/espn/rss/nhl/news", kind: "direct", sport: "hockey", tag: "ESPN" },
  {
    name: "NHL.com",
    url: "https://news.google.com/rss/search?q=site:nhl.com%20when:2d&hl=en-US&gl=US&ceid=US:en",
    kind: "gnews",
    sport: "hockey",
    tag: "NHL 공식",
  },
];

// 국내 매체 이적 키워드 프리필터 — 루머 전용 소스의 비이적 기사 컷 (철회분 로직 계승)
const KO_RUMOR_KEYWORDS =
  /(히위고|메디컬|이적\s*합의|영입\s*합의|이적\s*임박|영입\s*임박|오피셜.*(이적|영입|임대|행)|\[오피셜\]|완전\s*이적|임대\s*영입|이적료)/;

// 승격 허용 매체 화이트리스트 — gnews 기자 피드는 제목 끝 " - 매체명" 을 그대로 승격시키는데,
// 블랙리스트(TABLOID_RE)만으론 원리적으로 새어나간다. 목록에 없는 신생·군소 매체가 그냥 통과하기
// 때문 (2026-08-19 실측: MSN 25건·TheHardTackle 7건·Motorcycle Sports 6건이 이미 발행됨).
// 그래서 화이트리스트로 뒤집는다 — 여기 없는 이름으로 승격되면 항목 자체를 버린다.
// 소스 기본명으로 폴백하지 않는 이유: 남의 기사를 BBC 것으로 표기하는 오귀속이 더 큰 사고다.
const ALLOWED_PUBLISHERS =
  /^(bbc|sky ?sports?|the ?athletic|the ?new york times|nytimes|the ?guardian|reuters|associated press|espn|mlb\.com|major league baseball|nba\.com|nhl\.com|premier ?league|uefa|fifa|sportsnet|tsn\b|the ?times\b|l'?[eé]quipe|marca|kicker|gazzetta)/i;

// 기자 검색 피드에 섞여 오는 찌라시·탭로이드 중계 매체 — 화이트리스트 통과 이름의
// 유사 표기를 막는 2중 방어선 (예: "Sky Sports News HQ" 사칭류).
const TABLOID_RE =
  /daily ?mail|mailonline|the ?sun\b|daily ?star|express|mirror|caughtoffside|teamtalk|tbr ?football|football ?insider|hitc|givemesport|sport ?bible|footballtransfers|fichajes|talksport|tribuna|90min/i;

// 제목 프리필터 — LLM 비용 절감용 노이즈 컷 (최종 판별은 분류 단계가 함)
const NOISE_RE =
  /\b(quiz|podcast|gossip column|how to watch|live blog|live text|betting tips?|predictions?:|fantasy|crossword|in pictures)\b/i;

interface RssItem {
  id: string; // sha1(link)
  title: string;
  desc: string;
  link: string;
  publishedAt: Date;
  sourceName: string;
  kind: "direct" | "gnews";
  sport: BriefingSport;
  tag: string;
  journalist: string | null;
  rumorOnly: boolean;
}

// ── RSS 파싱 (의존성 없이 정규식 — 과거 fetch-transfer-rumors 검증 로직 계승) ──

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  // 구글뉴스 description 은 태그가 엔티티로 이스케이프돼 옴 (&lt;font&gt;…) —
  // 엔티티를 먼저 풀고 태그 제거, 남은 엔티티 한 번 더 정리.
  return decodeEntities(decodeEntities(s).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

// 화이트리스트 밖 매체로 승격돼 폐기된 건수 — 런 로그 진단용 (필터가 실제로 무는지 확인)
let blockedByWhitelist = 0;

function parseRss(xml: string, src: SourceDef): RssItem[] {
  const out: RssItem[] = [];
  for (const it of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const t = it.match(/<title>([\s\S]*?)<\/title>/);
    const l = it.match(/<link>([\s\S]*?)<\/link>/);
    const d = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const desc = it.match(/<description>([\s\S]*?)<\/description>/);
    if (!t || !l) continue;
    let title = decodeEntities(stripCdata(t[1]));
    let sourceName = src.name;
    // 구글뉴스는 title 끝 " - 매체명" → 기자 피드(promote)는 실제 중계 매체명으로 승격
    if (src.kind === "gnews") {
      const m = title.match(/^(.*)\s-\s([^-]{2,40})$/);
      if (m) {
        title = m[1].trim();
        if (src.promote) {
          const publisher = m[2].trim();
          // 화이트리스트 밖 매체는 폐기 — 기본 소스명으로 폴백하면 오귀속이 된다.
          if (!ALLOWED_PUBLISHERS.test(publisher)) {
            blockedByWhitelist++;
            continue;
          }
          sourceName = publisher;
        }
      } else if (src.promote) {
        // 매체명을 못 떼면 출처를 확정할 수 없다 → 폐기 (귀속 불명 발행 금지)
        blockedByWhitelist++;
        continue;
      }
    }
    // 기자 피드의 찌라시·탭로이드 중계는 화이트리스트 원칙에 따라 제외
    if (TABLOID_RE.test(sourceName)) continue;
    const link = stripCdata(l[1]).trim();
    // 한국 축구지 RSS 는 pubDate 에 타임존 표기가 없는 KST — 그대로 파싱하면 UTC 취급돼
    // 9시간 미래로 밀린다 (철회분에서 검증된 함정). TZ 표기 없으면 +0900 명시.
    let dateStr = d ? stripCdata(d[1]) : "";
    if (dateStr && !/GMT|UTC|[+-]\d{4}|Z$/i.test(dateStr)) dateStr += " +0900";
    const publishedAt = dateStr ? new Date(dateStr) : new Date();
    if (Number.isNaN(publishedAt.getTime())) continue;
    out.push({
      id: sha1(link),
      title,
      desc: desc ? stripTags(stripCdata(desc[1])).slice(0, 400) : "",
      link,
      publishedAt: publishedAt.getTime() > Date.now() ? new Date() : publishedAt,
      sourceName,
      kind: src.kind,
      sport: src.sport,
      tag: src.tag,
      journalist: src.journalist ?? null,
      rumorOnly: src.rumorOnly ?? false,
    });
  }
  return out;
}

async function fetchSource(src: (typeof SOURCES)[number]): Promise<RssItem[]> {
  try {
    const r = await fetch(src.url, {
      headers: { "User-Agent": "Mozilla/5.0 (scorebase-briefing-bot)" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.warn(`[briefing] ${src.name} HTTP ${r.status}`);
      return [];
    }
    return parseRss(await r.text(), src);
  } catch (e) {
    console.warn(`[briefing] ${src.name} fetch 실패: ${(e as Error).message}`);
    return [];
  }
}

// ── Google News 리다이렉트 래퍼 → 원 기사 URL 복원 (base64 payload 휴리스틱) ──

function resolveGnewsUrl(link: string): string | null {
  const m = link.match(/\/rss\/articles\/([^?]+)/);
  if (!m) return null;
  try {
    const raw = Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
    const urls = raw.match(/https?:\/\/[\x21-\x7e]{10,500}/g) ?? [];
    const real = urls.find((u) => !u.includes("google.com"));
    return real ? real.replace(/[^\x21-\x7e]+$/, "") : null;
  } catch {
    return null;
  }
}

// ── 기사 본문 추출 — <p> 텍스트 조합 (재작성 재료. 실패해도 헤드라인+요약으로 진행) ──

async function fetchArticleBody(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    const scope = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
    const paras = (scope.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? [])
      .map((p) => stripTags(p))
      .filter((p) => p.length > 40);
    const body = paras.join("\n").slice(0, 4000);
    return body.length > 200 ? body : null;
  } catch {
    return null;
  }
}

// ── LLM 응답 JSON 추출 ──────────────────────────────────────────────────

function extractJson<T>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = Math.min(
    ...["[", "{"].map((c) => {
      const i = cleaned.indexOf(c);
      return i < 0 ? Infinity : i;
    }),
  );
  if (!Number.isFinite(start)) return null;
  const open = cleaned[start];
  const close = open === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// ── 1차 분류 (haiku 기본 모델) — 뉴스가치·카테고리·스토리 클러스터 ──────────

interface Classified {
  i: number;
  keep: boolean;
  score: number;
  category: string;
  league: string | null;
  storyKey: string;
  journalist: string | null;
}

async function classify(items: RssItem[]): Promise<Classified[]> {
  const list = items
    .map((it, i) => `${i}\t(${SPORT_LABEL[it.sport]})\t[${it.sourceName}] ${it.title}\t${it.desc.slice(0, 200)}`)
    .join("\n");
  const prompt = [
    "다음은 해외 스포츠 뉴스 헤드라인 목록이다 (탭 구분: 번호, (종목), [소스] 제목, 요약).",
    "각 항목을 평가해 JSON 배열만 출력하라. 다른 텍스트 금지.",
    "",
    '필드: {"i":번호, "keep":불리언, "score":0-10 정수, "category":"TRANSFER|INJURY|MATCH|MANAGER|CLUB|OTHER", "league":"EPL|LALIGA|BUNDESLIGA|SERIE_A|LIGUE_1|UCL|WORLD_CUP|MLB|NBA|NHL|기타리그명|null", "storyKey":"핵심인물-팀 영소문자 슬러그(같은 사건이면 소스가 달라도 동일하게)", "journalist":"기자명 또는 null"}',
    "",
    "score 는 한국 스포츠 팬 관점의 뉴스 가치다. keep 은 score 5 이상이면 true.",
    "",
    "공통 기준.",
    "- 9-10: 확정 발표(오피셜 이적·계약·감독 선임/경질)·한국 선수 관련 소식",
    "- 7-8: 합의 임박(메디컬·최종 협상)·간판 선수 장기 부상·감독 거취·구단 공식 발표",
    "- 5-6: 실명과 구단이 특정된 신빙성 있는 협상·계약 보도·주요 구단 소식",
    "- 0-4: 칼럼·의견·경기 리뷰·평점·중계 안내·순위 예측·사소한 소식",
    "",
    "종목별 가중.",
    "- 축구: 한국 선수(손흥민·이강인·김민재 등)·빅클럽(EPL 빅6, 레알, 바르사, 바이에른) 관련은 상향.",
    "- 야구(MLB): 코리안 메이저리거(이정후·김하성 등)·FA 계약·트레이드 마감시한·포스트시즌 확정은 상향. 단일 경기 결과·개인 기록 갱신은 5 이하.",
    "- 농구(NBA): 트레이드·FA 계약·대형 부상은 상향. 단일 경기 결과·득점 기록은 5 이하.",
    "- 아이스하키(NHL): 트레이드·FA 계약·대형 부상은 상향. 단일 경기 결과는 5 이하.",
    "",
    "찌라시성 실명 없는 낚시, 단순 링크 모음, 판타지·베팅·중계 안내는 무조건 0-4.",
    "이적·계약(TRANSFER) 기사인데 헤드라인·요약에 대상 선수의 실명이 없으면 — '월드컵 스타', '5000만 유로 자원' 식 낚시 헤드라인 — 무조건 0-4. 이름 없는 이적 기사는 브리핑 가치가 없다.",
    "",
    list,
  ].join("\n");
  const res = await generate(prompt, { maxTokens: 4000, temperature: 0.2 });
  const parsed = extractJson<Classified[]>(res);
  if (!parsed || !Array.isArray(parsed)) {
    throw new Error("분류 JSON 파싱 실패");
  }
  return parsed.filter((c) => c && typeof c.i === "number" && items[c.i]);
}

// ── 2차 재작성 (sonnet) — 번역이 아닌 사실 재구성 브리핑 ─────────────────

interface Rewritten {
  titleKo: string;
  bodyKo: string;
}

// 종목별 표기 지침 — 규칙 5번(한국 커뮤니티 통용 표기)에 끼워 넣는다.
const SPORT_NAMING: Record<BriefingSport, string> = {
  soccer: "예: 맨시티, 아스널, 손흥민. 'here we go' 는 '히위고'로 표기한다.",
  baseball: "예: 다저스, 양키스, 이정후. 구단은 한국 야구 팬 통용 약칭을 쓰고, 기록 용어는 방어율·출루율·삼진 등 한국어 용어로 쓴다.",
  basketball: "예: 레이커스, 셀틱스, 워리어스. 포지션·기록은 가드·포워드·리바운드·어시스트 등 한국어 용어로 쓴다.",
  hockey: "예: 메이플리프스, 브루인스. 기록 용어는 골·어시스트·세이브율 등 한국어로 쓴다.",
};

const rewriteSystem = (sport: BriefingSport): string => [
  `너는 한국 스포츠 데이터 미디어 '스코어베이스'의 해외 ${SPORT_LABEL[sport]} 담당 기자다.`,
  "해외 보도의 사실을 추출해 한국어 브리핑을 새로 쓴다. 절대 규칙.",
  "1. 원문 문장을 번역·직역하지 마라. 사실(누가·무엇을·언제·얼마에·어느 단계)만 뽑아 완전히 새 문장으로 재구성한다.",
  "2. 직접 인용은 최대 1문장. 반드시 따옴표로 감싸고 발화자를 명시한다. 인용이 꼭 필요하지 않으면 쓰지 마라.",
  "3. 원문에 없는 사실·수치·추측을 추가하지 마라. 환율 환산도 금지. 확정이 아닌 내용은 '~라고 보도했다', '~로 알려졌다'로 명확히 귀속시켜라.",
  "4. 이적 소식은 단계를 명확히 구분하라 (보도/협상 중/합의/메디컬/오피셜).",
  `5. 선수·팀 이름은 한국 ${SPORT_LABEL[sport]} 커뮤니티 통용 표기를 쓴다. ${SPORT_NAMING[sport]}`,
  "6. 문체는 존댓말 게시판 톤. 담백하고 정확하게. 과장·이모지 금지.",
  "7. 재료가 헤드라인·요약뿐이면 확인된 사실만 2~3문장으로 짧게 써라. 배경 설명·전망·구단의 과거 행보 등 원문에 없는 내용은 한 문장도 추가하지 마라. 짧고 정확한 글이 길고 틀린 글보다 낫다.",
  "8. 본문에서 매체·기자를 언급할 땐 위에 제공된 소스명·기자명만 그대로 사용하라. 다른 매체명을 지어내지 마라.",
  "",
  "출력은 JSON 하나만. 다른 텍스트 금지.",
  '{"titleKo": "게시글 제목 (40자 이내, 낚시 금지, 핵심 사실)", "bodyKo": "본문 마크다운"}',
  "bodyKo 구성: 2~3문단(총 400~700자) — 핵심 사실 → 맥락(팀 상황·이적료·계약 등) → 마지막 줄에 토론을 여는 질문 1개.",
].join("\n");

async function rewrite(input: {
  title: string;
  desc: string;
  body: string | null;
  sourceName: string;
  journalist: string | null;
  publishedAt: Date;
  sport: BriefingSport;
}): Promise<Rewritten | null> {
  const prompt = [
    `소스: ${input.sourceName}${input.journalist ? ` (기자: ${input.journalist})` : ""}`,
    `보도 시각(UTC): ${input.publishedAt.toISOString()}`,
    `헤드라인: ${input.title}`,
    input.desc ? `요약: ${input.desc}` : "",
    input.body ? `본문:\n${input.body}` : "본문: (확보 실패 — 헤드라인·요약의 사실만 사용하라. 부족하면 짧게 써라.)",
  ]
    .filter(Boolean)
    .join("\n");
  const res = await generate(prompt, {
    system: rewriteSystem(input.sport),
    model: BRIEFING_MODEL,
    maxTokens: 2000,
  });
  const parsed = extractJson<Rewritten>(res);
  if (!parsed?.titleKo || !parsed?.bodyKo) return null;
  return parsed;
}

// ── 3차 검증 (sonnet) — 날조·직역·표기 오류 게이트. 불합격이면 발행 안 함 ──

interface Verdict {
  ok: boolean;
  problems: string[];
}

async function verify(
  input: {
    title: string;
    desc: string;
    body: string | null;
    sourceName: string;
    journalist: string | null;
    category: string | null;
  },
  out: Rewritten,
): Promise<Verdict> {
  const prompt = [
    "아래 [원문 자료]와 그것으로 작성된 [한국어 브리핑]을 대조 검수하라.",
    "",
    "불합격 기준 (하나라도 해당하면 ok=false).",
    "1. 브리핑에 원문 자료에 근거가 없는 사실·수치·인용이 있다 (날조). 단, 아래 명시된 소스명·기자명 표기는 근거 있는 것으로 본다.",
    "2. 원문 문장 구조를 그대로 옮긴 번역문이다 (직역투 — 사실 재구성이 아님).",
    "3. 직접 인용이 2문장 이상이거나 발화자 표기가 없다.",
    "4. 선수·팀 한글 표기가 명백히 틀렸다.",
    "5. 원문 자료가 빈약한데 브리핑이 그 이상을 단정한다.",
    ...(input.category === "TRANSFER"
      ? ["6. 이적 브리핑인데 대상 선수의 실명이 본문에 없다 ('이름 미확인' 류 — 정보 가치 없음)."]
      : []),
    "",
    '출력은 JSON 하나만: {"ok": true/false, "problems": ["문제 요약", ...]}',
    "",
    "[원문 자료]",
    `소스: ${input.sourceName}${input.journalist ? ` (기자: ${input.journalist})` : ""}`,
    `헤드라인: ${input.title}`,
    input.desc ? `요약: ${input.desc}` : "",
    input.body ? `본문:\n${input.body}` : "본문: 없음",
    "",
    "[한국어 브리핑]",
    `제목: ${out.titleKo}`,
    out.bodyKo,
  ]
    .filter(Boolean)
    .join("\n");
  const res = await generate(prompt, { model: BRIEFING_MODEL, maxTokens: 1200 });
  const parsed = extractJson<Verdict>(res);
  // 검증 응답 자체가 깨지면 보수적으로 불합격 (품질 사고 방지가 우선)
  if (!parsed || typeof parsed.ok !== "boolean") return { ok: false, problems: ["검증 응답 파싱 실패"] };
  return { ok: parsed.ok, problems: parsed.problems ?? [] };
}

// ── 발행 ────────────────────────────────────────────────────────────────

/** 브리핑 봇 계정 보장 — 로그인 불가 더미 해시 (manager-bot 패턴, server-only 의존 없이). */
async function ensureBriefingBot(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: BOT_EMAIL }, select: { id: true } });
  if (existing) return existing.id;
  const u = await prisma.user.create({
    data: {
      email: BOT_EMAIL,
      passwordHash: `bot-login-disabled-${randomBytes(24).toString("hex")}`,
      nickname: BOT_NICKNAME,
      badge: "OFFICIAL",
    },
    select: { id: true },
  });
  return u.id;
}

function kstLabel(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}. ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")} KST`;
}

function buildPostContent(item: RssItem, articleUrl: string, out: Rewritten, journalist: string | null): string {
  return [
    out.bodyKo.trim(),
    "",
    "---",
    "",
    `**출처** · [${item.sourceName}](${articleUrl})${journalist ? ` — ${journalist}` : ""} · ${kstLabel(item.publishedAt)} 보도`,
    "",
    "*공신력 있는 해외 보도를 사실 기반으로 재구성한 브리핑입니다. 전문 번역이 아니며, 자세한 내용은 원문에서 확인하세요.*",
  ].join("\n");
}

// ── 메인 ────────────────────────────────────────────────────────────────

export async function runNewsBriefing(opts: { dry?: boolean } = {}) {
  const dry = opts.dry ?? false;
  const started = Date.now();
  blockedByWhitelist = 0;

  // 1. 수집
  const fetched = (await Promise.all(SOURCES.map(fetchSource))).flat();
  const cutoff = Date.now() - MAX_AGE_H * 3600 * 1000;
  const seen = new Set<string>();
  const items = fetched.filter((it) => {
    if (it.publishedAt.getTime() < cutoff) return false;
    if (NOISE_RE.test(it.title)) return false;
    // 루머 전용 국내 소스는 이적 키워드 기사만 (전체 기사 RSS 라 비이적 노이즈 큼)
    if (it.rumorOnly && !KO_RUMOR_KEYWORDS.test(it.title)) return false;
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });

  // 2. dedup — 이미 본 URL 제외
  const known = new Set(
    (
      await prisma.newsBriefing.findMany({
        where: { id: { in: items.map((i) => i.id) } },
        select: { id: true },
      })
    ).map((r) => r.id),
  );
  const usedPerSport: Record<string, number> = {};
  const fresh = items
    .filter((i) => !known.has(i.id))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .filter((i) => {
      const used = usedPerSport[i.sport] ?? 0;
      if (used >= NEW_PER_SPORT[i.sport]) return false;
      usedPerSport[i.sport] = used + 1;
      return true;
    })
    .slice(0, MAX_NEW_PER_RUN);
  console.log(
    `[briefing] RSS ${fetched.length}건 → 최신 ${items.length}건 → 신규 ${fresh.length}건 [${Object.entries(
      usedPerSport,
    )
      .map(([k, v]) => `${k}:${v}`)
      .join(" ")}]${blockedByWhitelist > 0 ? ` · 비공신력 소스 차단 ${blockedByWhitelist}건` : ""}`,
  );
  if (fresh.length === 0) return { fetched: fetched.length, fresh: 0, published: 0, rumors: 0 };

  // 3. 분류
  const classified = await classify(fresh);
  const byIdx = new Map(classified.map((c) => [c.i, c]));
  // 운영 진단 — 분류 분포 (후보 0건 원인 추적용)
  const kept = classified.filter((c) => c.keep);
  console.log(
    `[briefing] 분류 ${classified.length}건 (keep ${kept.length}) — 상위: ${[...classified]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((c) => `${c.score}:${fresh[c.i]?.title.slice(0, 40)}`)
      .join(" | ")}`,
  );

  // 4. 신규 항목 전부 기록 (SEEN) — 다음 런에서 재분류 방지
  if (!dry) {
    await prisma.newsBriefing.createMany({
      data: fresh.map((it, i) => {
        const c = byIdx.get(i);
        return {
          id: it.id,
          title: it.title,
          sourceName: it.sourceName,
          sourceUrl: it.link,
          journalist: it.journalist ?? c?.journalist ?? null,
          sport: it.sport,
          category: c?.category ?? null,
          league: c?.league ?? null,
          storyKey: c?.storyKey ?? null,
          status: "SEEN",
          note: c ? `score=${c.score}` : "분류 누락",
          publishedAt: it.publishedAt,
        };
      }),
      skipDuplicates: true,
    });
  }

  // 4.5 이적 루머 추출 (통합 러닝) — TRANSFER 분류 항목 + 국내 루머 전용 소스.
  //     실패해도 브리핑 발행을 막지 않도록 격리. 상세: extract-transfer-rumors.ts
  let rumors = 0;
  try {
    const rumorIdx = new Set<number>();
    // 이적 루머 탭은 축구 전용 — 타 종목 TRANSFER 는 넣지 않는다.
    for (const c of classified) if (c.category === "TRANSFER" && fresh[c.i]?.sport === "soccer") rumorIdx.add(c.i);
    fresh.forEach((it, i) => {
      if (it.rumorOnly) rumorIdx.add(i);
    });
    const rumorInputs = [...rumorIdx]
      .map((i) => fresh[i])
      .filter(Boolean)
      .map((it) => ({
        title: it.title,
        desc: it.desc,
        link: it.link,
        publishedAt: it.publishedAt,
        sourceName: it.sourceName,
        tag: it.tag,
      }));
    rumors = await extractTransferRumors(rumorInputs, { dry });
  } catch (e) {
    console.warn(`[briefing] 루머 추출 실패 (브리핑엔 영향 없음): ${(e as Error).message}`);
  }

  // 5. 후보 선별 — score>=6, 스토리(storyKey)당 1건, 런·일일 캡
  const dayStartUtc = new Date(
    Date.UTC(
      new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear(),
      new Date(Date.now() + 9 * 3600 * 1000).getUTCMonth(),
      new Date(Date.now() + 9 * 3600 * 1000).getUTCDate(),
    ) - 9 * 3600 * 1000,
  );
  const publishedToday = dry
    ? 0
    : await prisma.newsBriefing.count({ where: { status: "PUBLISHED", createdAt: { gte: dayStartUtc } } });
  const budget = Math.min(MAX_PUBLISH_PER_RUN, Math.max(0, MAX_PUBLISH_PER_DAY - publishedToday));

  // 최근 발행 스토리와의 중복 방지 — 같은 사건을 다른 소스가 뒤늦게 실어도 재발행 금지
  const recentKeys = new Set(
    (
      await prisma.newsBriefing.findMany({
        where: { status: "PUBLISHED", createdAt: { gte: new Date(Date.now() - 48 * 3600 * 1000) } },
        select: { storyKey: true },
      })
    )
      .map((r) => r.storyKey)
      .filter((k): k is string => !!k),
  );

  // keep 불리언은 haiku 가 런마다 일관성이 낮아 참고만 하고, 게이트는 score 로 판정
  const storyBest = new Map<string, Classified>();
  for (const c of classified) {
    if (fresh[c.i]?.rumorOnly) continue; // 국내 소스는 브리핑 금지 (루머 피드 전용)
    if (c.score < MIN_SCORE) continue;
    if (recentKeys.has(c.storyKey)) continue;
    const cur = storyBest.get(c.storyKey);
    if (!cur || c.score > cur.score) storyBest.set(c.storyKey, c);
  }
  // 점수순으로 훑되 종목별 런 상한을 지킨다 — 축구가 전부 먹지 않게.
  const perSport: Record<string, number> = {};
  const candidates: Classified[] = [];
  for (const c of [...storyBest.values()].sort((a, b) => b.score - a.score)) {
    if (candidates.length >= budget) break;
    const sp = fresh[c.i]?.sport;
    if (!sp) continue;
    const used = perSport[sp] ?? 0;
    if (used >= PER_SPORT_PER_RUN[sp]) continue;
    perSport[sp] = used + 1;
    candidates.push(c);
  }
  console.log(
    `[briefing] 후보 ${storyBest.size}건 → 처리 ${candidates.length}건 [${Object.entries(perSport)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ")}] (오늘 발행 ${publishedToday}/${MAX_PUBLISH_PER_DAY})`,
  );
  if (candidates.length === 0) return { fetched: fetched.length, fresh: fresh.length, published: 0, rumors };

  const botId = dry ? "" : await ensureBriefingBot();
  let published = 0;

  // 6. 항목별 본문→재작성→검증→발행 (병렬 — 후보 최대 3건)
  await Promise.all(
    candidates.map(async (c) => {
      const item = fresh[c.i];
      const journalist = item.journalist ?? c.journalist;
      try {
        // 본문 fetch — gnews 는 원 URL 복원 시도, 실패 시 헤드라인+요약으로 진행
        const articleUrl = item.kind === "gnews" ? (resolveGnewsUrl(item.link) ?? item.link) : item.link;
        const body =
          articleUrl.includes("news.google.com") ? null : await fetchArticleBody(articleUrl);

        const out = await rewrite({
          title: item.title,
          desc: item.desc,
          body,
          sourceName: item.sourceName,
          journalist,
          publishedAt: item.publishedAt,
          sport: item.sport,
        });
        if (!out) {
          if (!dry)
            await prisma.newsBriefing.update({
              where: { id: item.id },
              data: { status: "REJECTED", note: "재작성 JSON 파싱 실패" },
            });
          return;
        }

        const verdict = await verify(
          { title: item.title, desc: item.desc, body, sourceName: item.sourceName, journalist, category: c.category ?? null },
          out,
        );
        if (!verdict.ok) {
          console.warn(`[briefing] 검증 불합격 — ${item.title} :: ${verdict.problems.join(" / ")}`);
          if (!dry)
            await prisma.newsBriefing.update({
              where: { id: item.id },
              data: { status: "REJECTED", titleKo: out.titleKo, bodyKo: out.bodyKo, note: `검증 불합격: ${verdict.problems.join(" / ").slice(0, 400)}` },
            });
          return;
        }

        const title = `[${item.tag}] ${out.titleKo}`.slice(0, 120);
        const content = buildPostContent(item, articleUrl, out, journalist);

        if (dry) {
          console.log(`\n===== DRY: ${title}\n${content}\n=====`);
          published++;
          return;
        }

        const post = await prisma.post.create({
          data: { authorId: botId, category: "BRIEFING", sport: item.sport, title, content },
          select: { id: true },
        });
        await prisma.newsBriefing.update({
          where: { id: item.id },
          data: { status: "PUBLISHED", titleKo: out.titleKo, bodyKo: out.bodyKo, postId: post.id },
        });
        published++;

        const site = process.env.SITE_URL ?? "https://www.scorebase.kr";
        const hideUrl = `${site}/api/admin/briefing-hide?id=${item.id}&t=${makeHideToken("briefing", item.id)}`;
        await sendTelegram(
          [
            `📰 <b>해외 브리핑 발행</b>`,
            ``,
            `${title}`,
            `<a href="${site}/analysis/${post.id}">글 보기</a> · <a href="${articleUrl}">원문 (${item.sourceName})</a>`,
            ``,
            `오보·품질 문제 시: <a href="${hideUrl}">원클릭 숨김</a>`,
          ].join("\n"),
        );
        console.log(`[briefing] 발행: post ${post.id} — ${title}`);
      } catch (e) {
        console.warn(`[briefing] 처리 실패 (${item.title}): ${(e as Error).message}`);
        if (!dry)
          await prisma.newsBriefing
            .update({ where: { id: item.id }, data: { note: `처리 실패: ${(e as Error).message.slice(0, 300)}` } })
            .catch(() => {});
      }
    }),
  );

  // 7. 오래된 비발행 행 정리
  if (!dry) {
    await prisma.newsBriefing.deleteMany({
      where: {
        status: { in: ["SEEN", "SKIPPED", "REJECTED"] },
        createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86400 * 1000) },
      },
    });
  }

  console.log(`[briefing] 완료 — 발행 ${published}건, ${Math.round((Date.now() - started) / 1000)}s`);
  return { fetched: fetched.length, fresh: fresh.length, published, rumors };
}

// tsx 직접 실행 (npm run job:news-briefing / DRY=1 npm run job:news-briefing)
if (import.meta.url === `file://${process.argv[1]}`) {
  runNewsBriefing({ dry: process.env.DRY === "1" })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
