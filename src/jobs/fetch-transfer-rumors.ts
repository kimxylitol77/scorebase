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

/** 딜 병합 규칙 — 성(마지막 토큰)+행선팀(첫 토큰)이 같고 **이름이 호환**될 때만 같은 딜.
 *  "Tonali"⊆"Sandro Tonali" 는 병합, "Bruno Fernandes" vs "Matheus Fernandes" 는
 *  성이 같아도 분리 (2026-07-02 실사고 — 성만으로 병합해 다른 선수 기사가 덮임). */
function dealNorm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9가-힣\s]/g, "").trim();
}
function nameTokens(s: string): string[] {
  return dealNorm(s).split(/\s+/).filter(Boolean);
}
/** 짧은 표기의 토큰이 긴 표기에 전부 포함되면 같은 선수로 간주. */
function namesCompatible(a: string, b: string): boolean {
  const ta = nameTokens(a), tb = nameTokens(b);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.length > 0 && short.every((t) => long.includes(t));
}
// 언론별 팀 약칭 통일 — "Man Utd" vs "Manchester United" 가 다른 딜로 갈라지는 것 방지
const TEAM_ALIAS: Record<string, string> = {
  man: "manchester", utd: "manchester", spurs: "tottenham", barca: "barcelona",
  psg: "paris", 맨유: "맨체스터", 맨시티: "맨체스터",
};
function teamKeyOf(toTeam: string | null | undefined): string {
  const first = dealNorm(toTeam ?? "").split(/\s+/)[0] ?? "";
  return TEAM_ALIAS[first] ?? first;
}
/** 그룹 키 — 성+행선팀. 같은 키 안에서 namesCompatible 로 최종 판별. */
function dealKey(player: string, toTeam: string | null | undefined): string {
  return `${nameTokens(player).pop() ?? ""}|${teamKeyOf(toTeam)}`;
}
// 한글 표기 수동 교정 — haiku 음역 오기 반복분 (player-name-manual-fix 패턴)
const KO_NAME_FIX: Record<string, string> = { 촉아메니: "추아메니" };
function fixKo(s: string): string {
  let out = s;
  for (const [bad, good] of Object.entries(KO_NAME_FIX)) out = out.split(bad).join(good);
  return out;
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

  // 3) 딜만 추려 딜 단위 병합 — 같은 그룹키(성+행선팀)여도 이름 호환일 때만 같은 딜
  interface DealAcc { c: Classified; item: RssItem; fullPlayer: string; fullPlayerKo: string }
  const merged: DealAcc[] = [];
  for (const c of classified) {
    if (!c.deal || !c.player || !c.playerKo || !c.summaryKo) continue;
    // haiku 가 deal=true 로 흘려보낸 노이즈 방어 — 실명 없음 / 재계약(from=to) / 부정 보도
    if (/^unknown$/i.test(c.player) || c.playerKo.includes("미상")) continue;
    if (c.fromTeam && c.toTeam && dealNorm(c.fromTeam) === dealNorm(c.toTeam)) continue;
    if (/무산|결렬|거절|철회|재계약|연장|방출/.test(c.summaryKo)) continue;
    const item = candidates[c.i];
    if (!item) continue;
    const key = dealKey(c.player, c.toTeam);
    const rank = STAGE_RANK[c.stage ?? ""] ?? 0;
    const prev = merged.find(
      (m) => dealKey(m.fullPlayer, m.c.toTeam) === key && namesCompatible(m.fullPlayer, c.player!),
    );
    if (!prev) {
      merged.push({ c, item, fullPlayer: c.player, fullPlayerKo: c.playerKo });
      continue;
    }
    // 더 긴(완전한) 표기 유지 + 높은 stage/최신 기사 내용으로 갱신
    if (nameTokens(c.player).length > nameTokens(prev.fullPlayer).length) {
      prev.fullPlayer = c.player;
      prev.fullPlayerKo = c.playerKo;
    }
    const prevRank = STAGE_RANK[prev.c.stage ?? ""] ?? 0;
    if (rank > prevRank || (rank === prevRank && item.publishedAt > prev.item.publishedAt)) {
      prev.c = c;
      prev.item = item;
    }
  }

  // 4) upsert — 지난 14일 내 같은 딜(이름 호환+같은 행선팀) 행이 있으면 그 id 재사용해
  //    표기 변형으로 인한 중복 행 방지. 기존 행보다 낮은 stage 로는 강등하지 않음.
  const recentRows = await prisma.transferRumor.findMany({
    where: { publishedAt: { gte: new Date(Date.now() - 14 * 86400 * 1000) } },
    select: { id: true, playerName: true, playerKo: true, toTeam: true, stage: true },
  });
  let upserted = 0;
  for (const { c, item, fullPlayer, fullPlayerKo } of merged) {
    const stage = STAGE_RANK[c.stage ?? ""] ? c.stage! : "TALKS";
    const key = dealKey(fullPlayer, c.toTeam);
    const ex = recentRows.find(
      (r) => dealKey(r.playerName, r.toTeam) === key && namesCompatible(r.playerName, fullPlayer),
    );
    const id = ex
      ? ex.id
      : createHash("sha1").update(`${dealNorm(fullPlayer)}|${teamKeyOf(c.toTeam)}`).digest("hex").slice(0, 16);
    if (ex && (STAGE_RANK[ex.stage] ?? 0) > (STAGE_RANK[stage] ?? 0)) continue;
    // 기존 행 이름이 더 완전하면 유지 — 짧은 표기 헤드라인이 풀네임을 덮지 않게
    const keepExName = ex && nameTokens(ex.playerName).length >= nameTokens(fullPlayer).length;
    await prisma.transferRumor.upsert({
      where: { id },
      create: {
        id,
        playerName: fullPlayer,
        playerKo: fixKo(fullPlayerKo),
        fromTeam: c.fromTeam ?? null,
        toTeam: c.toTeam ?? null,
        fromTeamKo: c.fromKo ?? null,
        toTeamKo: c.toKo ?? null,
        stage,
        fee: c.fee ?? null,
        league: c.league ?? null,
        summaryKo: fixKo(c.summaryKo!),
        sourceName: item.sourceName,
        sourceUrl: item.link,
        publishedAt: item.publishedAt,
      },
      update: {
        ...(keepExName ? {} : { playerName: fullPlayer, playerKo: fixKo(fullPlayerKo) }),
        stage,
        fee: c.fee ?? undefined,
        summaryKo: fixKo(c.summaryKo!),
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

  console.log(`[rumors] 후보 ${candidates.length} → 딜 ${merged.length} → upsert ${upserted}, purge ${purged.count}`);
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
