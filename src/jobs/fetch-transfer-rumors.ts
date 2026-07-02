// 이적 루머/임박 수집 — RSS(구글뉴스·한국 축구지) → haiku 분류·요약 → TransferRumor upsert.
// 공식 피드(FootballTransfer)의 "공식 등록까지 시차"를 메우는 히위고 단계 피드.
// cron: /api/cron/transfer-rumors (6h). /transfers?view=rumors 소스.
import "@/lib/env";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";

// 소스 — 키 불요 RSS 만. 네이버(오픈 API 키 필요)는 v2 후보.
const SOURCES: Array<{ name: string; url: string; lang: "en" | "ko" }> = [
  {
    name: "Google News",
    url: "https://news.google.com/rss/search?q=%22here%20we%20go%22%20(transfer%20OR%20signing)%20when:2d&hl=en-US&gl=US&ceid=US:en",
    lang: "en",
  },
  {
    name: "Google News",
    url: "https://news.google.com/rss/search?q=Fabrizio%20Romano%20transfer%20when:2d&hl=en-US&gl=US&ceid=US:en",
    lang: "en",
  },
  { name: "인터풋볼", url: "https://www.interfootball.co.kr/rss/allArticle.xml", lang: "ko" },
  { name: "풋볼리스트", url: "https://www.footballist.co.kr/rss/allArticle.xml", lang: "ko" },
];

// 1차 키워드 필터 — haiku 호출량 절감용 (최종 판별은 haiku 가 함).
const KO_KEYWORDS = /(히위고|메디컬|이적\s*합의|영입\s*합의|이적\s*임박|영입\s*임박|오피셜.*(이적|영입|임대|행)|\[오피셜\]|완전\s*이적|임대\s*영입)/;
const EN_KEYWORDS = /(here we go|transfer|medical|agreed|signs|signing|bid accepted|deal)/i;

const MAX_AGE_H = 48; // 이 이전 발행 기사는 무시
const BATCH = 25; // haiku 1회 분류 상한
const KEEP_DAYS = 21; // 오래된 루머 정리

const STAGE_RANK: Record<string, number> = { TALKS: 1, MEDICAL: 2, HERE_WE_GO: 3, OFFICIAL: 4 };

interface RssItem {
  title: string;
  link: string;
  publishedAt: Date;
  sourceName: string;
  lang: "en" | "ko";
}

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
    .replace(/&apos;/g, "'");
}

/** RSS <item> 파싱 — 의존성 없이 정규식. 구글뉴스는 title 끝 " - 매체명" 을 sourceName 으로 승격. */
function parseRss(xml: string, src: { name: string; lang: "en" | "ko" }): RssItem[] {
  const out: RssItem[] = [];
  for (const it of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const t = it.match(/<title>([\s\S]*?)<\/title>/);
    const l = it.match(/<link>([\s\S]*?)<\/link>/);
    const d = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!t || !l) continue;
    let title = decodeEntities(stripCdata(t[1]));
    let sourceName = src.name;
    if (src.name === "Google News") {
      const m = title.match(/^(.*)\s-\s([^-]{2,40})$/);
      if (m) {
        title = m[1].trim();
        sourceName = m[2].trim();
      }
    }
    // 한국 축구지 RSS 는 pubDate 에 타임존 표기가 없는 KST — 그대로 파싱하면 UTC 취급돼
    // 9시간 미래로 밀린다. TZ 표기 없으면 +0900 을 명시해 파싱.
    let dateStr = d ? stripCdata(d[1]) : "";
    if (dateStr && !/GMT|UTC|[+-]\d{4}|Z$/i.test(dateStr)) dateStr += " +0900";
    let publishedAt = dateStr ? new Date(dateStr) : new Date();
    if (Number.isNaN(publishedAt.getTime())) continue;
    // 일부 매체가 예약발행 등으로 미래 시각을 찍음 — 뉴스 발행시각은 현재를 넘을 수 없다
    if (publishedAt.getTime() > Date.now()) publishedAt = new Date();
    out.push({ title, link: stripCdata(l[1]), publishedAt, sourceName, lang: src.lang });
  }
  return out;
}

async function fetchSource(src: (typeof SOURCES)[number]): Promise<RssItem[]> {
  try {
    const r = await fetch(src.url, {
      headers: { "User-Agent": "Mozilla/5.0 (scorebase-rumor-bot)" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.warn(`[rumors] ${src.name} HTTP ${r.status}`);
      return [];
    }
    return parseRss(await r.text(), src);
  } catch (e) {
    console.warn(`[rumors] ${src.name} fetch 실패: ${(e as Error).message}`);
    return [];
  }
}

interface Classified {
  i: number;
  deal: boolean;
  player?: string | null;
  playerKo?: string | null;
  fromTeam?: string | null;
  toTeam?: string | null;
  fromKo?: string | null;
  toKo?: string | null;
  stage?: string | null;
  fee?: string | null;
  league?: string | null;
  summaryKo?: string | null;
}

/** haiku 일괄 분류 — 헤드라인 → 딜 여부·선수·팀·단계·한 줄 요약(JSON). */
async function classifyBatch(items: RssItem[], offset: number): Promise<Classified[]> {
  const list = items
    .map((it, i) => `${offset + i}. [${it.sourceName}] ${it.title}`)
    .join("\n");
  const prompt = `다음은 축구 이적 관련 뉴스 헤드라인 목록이다. 각 항목이 "특정 선수의 구단 간 이적 진행/성사 보도"인지 판별하고 정보를 추출하라.

${list}

JSON 배열만 출력(코드펜스·설명 금지). 각 원소:
{"i":번호,"deal":true|false,"player":"원문 선수명","playerKo":"한국 미디어 관행 한글 표기","fromTeam":"원소속 팀(불명 null)","toTeam":"행선 팀(불명 null)","fromKo":"원소속 한글","toKo":"행선 한글","stage":"OFFICIAL|HERE_WE_GO|MEDICAL|TALKS","fee":"€60M 형식 이적료(보도에 있을 때만, 없으면 null)","league":"행선팀 리그(EPL|LALIGA|BUNDESLIGA|SERIE_A|LIGUE_1|K_LEAGUE_1|SAUDI_PL|MLS 중 하나, 그 외/불명 null)","summaryKo":"한 문장 한국어 요약(~다체, 45자 이내)"}

규칙:
- deal=false: 이적 보도가 아닌 것(경기·인터뷰·연예·용품), 감독/코치 인사, 근거 없는 단순 관심설.
- deal=false 추가 기준: 재계약/계약 연장(팀 이동 없음), 방출·결렬·무산·입찰 거절 등 성사 반대 방향 보도, 축구가 아닌 종목(NBA·야구 등), 헤드라인에 선수 실명이 없는 낚시성("두 번째 영입 완료" 류).
- player·playerKo·summaryKo 는 반드시 같은 한 선수를 가리켜야 한다. 헤드라인에서 확신할 수 없으면 deal=false.
- deal=false 면 다른 필드는 전부 null 로.
- stage 판별: OFFICIAL=구단 공식 발표 완료, HERE_WE_GO=로마노 히위고·양측 합의 완료 보도, MEDICAL=메디컬 진행/예정, TALKS=구체적 협상 진행.
- 헤드라인에 없는 사실(이적료·계약 기간)을 지어내지 말 것.`;
  try {
    const text = await generate(prompt, { maxTokens: 4000, temperature: 0 });
    const jsonStr = text.replace(/```json|```/g, "").trim();
    const arr = JSON.parse(jsonStr.slice(jsonStr.indexOf("["), jsonStr.lastIndexOf("]") + 1));
    return Array.isArray(arr) ? (arr as Classified[]) : [];
  } catch (e) {
    console.warn(`[rumors] haiku 분류 실패 (offset ${offset}): ${(e as Error).message}`);
    return [];
  }
}

/** 딜 식별 키 — 선수 성(마지막 토큰)+행선팀(첫 토큰) 정규화 해시. "Tonali"/"Sandro
 *  Tonali", "Tottenham"/"Tottenham Hotspur" 처럼 기사마다 표기가 갈려도 같은 딜로
 *  병합된다. 같은 성 선수가 같은 팀으로 동시에 가는 충돌은 드물어 감수. */
function dealNorm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9가-힣\s]/g, "").trim();
}
// 언론별 팀 약칭 통일 — "Man Utd" vs "Manchester United" 가 다른 딜로 갈라지는 것 방지
const TEAM_ALIAS: Record<string, string> = {
  man: "manchester", utd: "manchester", spurs: "tottenham", barca: "barcelona",
  psg: "paris", 맨유: "맨체스터", 맨시티: "맨체스터",
};
function dealId(player: string, toTeam: string | null | undefined): string {
  const lastName = dealNorm(player).split(/\s+/).pop() ?? "";
  const first = dealNorm(toTeam ?? "").split(/\s+/)[0] ?? "";
  const teamKey = TEAM_ALIAS[first] ?? first;
  return createHash("sha1").update(`${lastName}|${teamKey}`).digest("hex").slice(0, 16);
}

export async function runFetchTransferRumors() {
  // 1) RSS 수집 + 1차 필터
  const fetched = await Promise.all(SOURCES.map(fetchSource));
  const cutoff = Date.now() - MAX_AGE_H * 3600 * 1000;
  const seen = new Set<string>();
  const candidates = fetched
    .flat()
    .filter((it) => it.publishedAt.getTime() >= cutoff)
    .filter((it) => (it.lang === "ko" ? KO_KEYWORDS.test(it.title) : EN_KEYWORDS.test(it.title)))
    .filter((it) => {
      const k = it.title.toLowerCase().slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 75); // haiku 3회 상한

  if (candidates.length === 0) {
    console.log("[rumors] 후보 0건");
    return { candidates: 0, upserted: 0 };
  }

  // 2) haiku 분류 (배치)
  const classified: Classified[] = [];
  for (let i = 0; i < candidates.length; i += BATCH) {
    classified.push(...(await classifyBatch(candidates.slice(i, i + BATCH), i)));
  }

  // 3) 딜만 추려 딜 단위 병합 (여러 기사 → 최고 stage 1건)
  const byDeal = new Map<string, { c: Classified; item: RssItem }>();
  for (const c of classified) {
    if (!c.deal || !c.player || !c.playerKo || !c.summaryKo) continue;
    // haiku 가 deal=true 로 흘려보낸 노이즈 방어 — 실명 없음 / 재계약(from=to) / 부정 보도
    if (/^unknown$/i.test(c.player) || c.playerKo.includes("미상")) continue;
    if (c.fromTeam && c.toTeam && dealNorm(c.fromTeam) === dealNorm(c.toTeam)) continue;
    if (/무산|결렬|거절|철회|재계약|연장|방출/.test(c.summaryKo)) continue;
    const item = candidates[c.i];
    if (!item) continue;
    const id = dealId(c.player, c.toTeam);
    const prev = byDeal.get(id);
    const rank = STAGE_RANK[c.stage ?? ""] ?? 0;
    const prevRank = prev ? STAGE_RANK[prev.c.stage ?? ""] ?? 0 : -1;
    if (!prev || rank > prevRank || (rank === prevRank && item.publishedAt > prev.item.publishedAt)) {
      byDeal.set(id, { c, item });
    }
  }

  // 4) upsert — 기존 행보다 낮은 stage 로는 강등하지 않음 (오래된 기사 재수집 가드)
  let upserted = 0;
  for (const [id, { c, item }] of byDeal) {
    const stage = STAGE_RANK[c.stage ?? ""] ? c.stage! : "TALKS";
    const existing = await prisma.transferRumor.findUnique({ where: { id }, select: { stage: true } });
    if (existing && (STAGE_RANK[existing.stage] ?? 0) > (STAGE_RANK[stage] ?? 0)) continue;
    await prisma.transferRumor.upsert({
      where: { id },
      create: {
        id,
        playerName: c.player!,
        playerKo: c.playerKo!,
        fromTeam: c.fromTeam ?? null,
        toTeam: c.toTeam ?? null,
        fromTeamKo: c.fromKo ?? null,
        toTeamKo: c.toKo ?? null,
        stage,
        fee: c.fee ?? null,
        league: c.league ?? null,
        summaryKo: c.summaryKo!,
        sourceName: item.sourceName,
        sourceUrl: item.link,
        publishedAt: item.publishedAt,
      },
      update: {
        stage,
        fee: c.fee ?? undefined,
        summaryKo: c.summaryKo!,
        sourceName: item.sourceName,
        sourceUrl: item.link,
        publishedAt: item.publishedAt,
      },
    });
    upserted++;
  }

  // 5) 오래된 루머 정리
  const purged = await prisma.transferRumor.deleteMany({
    where: { publishedAt: { lt: new Date(Date.now() - KEEP_DAYS * 86400 * 1000) } },
  });

  console.log(`[rumors] 후보 ${candidates.length} → 딜 ${byDeal.size} → upsert ${upserted}, purge ${purged.count}`);
  return { candidates: candidates.length, upserted };
}

// tsx 직접 실행 지원 (npm run job:rumors)
if (process.argv[1]?.includes("fetch-transfer-rumors")) {
  runFetchTransferRumors()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
