// 야구 주간 리뷰 본문에 순위 카드 이미지(OG)를 삽입. alt 는 롱테일 SEO 키워드.
// 이미지는 검색엔진이 텍스트로 못 읽으므로 alt 키워드가 이미지 검색 노출의 핵심.
import { SITE_URL } from "@/lib/site-url";
import type { BaseballWeeklyReviewData } from "./weekly-review";

const LEAGUE_LABEL: Record<string, string> = { MLB: "MLB", KBO: "KBO 리그", NPB: "일본프로야구" };
const DIV_LABEL: Record<string, string> = {
  "AL 동부": "아메리칸리그 동부지구", "AL 중부": "아메리칸리그 중부지구", "AL 서부": "아메리칸리그 서부지구",
  "NL 동부": "내셔널리그 동부지구", "NL 중부": "내셔널리그 중부지구", "NL 서부": "내셔널리그 서부지구",
  "센트럴": "센트럴리그", "퍼시픽": "퍼시픽리그",
};
// 카드를 붙일 ## 섹션(순서 = 우선순위). 치열한 지구부터 이 순서로 배치.
const SECTION_HEADINGS = ["순위 판도", "이번 주 핫이슈", "팀 타격·투구 지표"];

function cardUrl(league: string, div: string): string {
  const p = new URLSearchParams({ league });
  if (div) p.set("div", div);
  return `${SITE_URL}/api/og/baseball-standings?${p.toString()}`;
}

/** 롱테일 SEO alt — 리그·지구·1위/2위팀·주차·지표 키워드를 자연스러운 한 문장으로. */
function altKeyword(d: BaseballWeeklyReviewData, div: string, rows: BaseballWeeklyReviewData["standings"]): string {
  const lg = LEAGUE_LABEL[d.league] ?? d.league;
  const divLabel = div ? (DIV_LABEL[div] ?? div) : "";
  const scope = divLabel ? `${lg} ${divLabel}` : lg; // 단일 리그(KBO)는 리그명 중복 없이
  const lead = rows[0];
  const second = rows[1];
  const chase = second ? ` ${second.team} 추격` : "";
  return `${scope} 순위표 — ${lead.team} 선두${chase}, ${d.season}년 ${d.weekLabelKo} 승-패·승률·게임차 정리`;
}

/** 리그별 카드 배치 — 헤딩 → 카드 markdown. MLB 는 치열한(2위 게임차 작은) 지구 3개 우선. */
export function buildCardsByHeading(d: BaseballWeeklyReviewData): Map<string, string> {
  const divs = [...new Set(d.standings.map((s) => s.division))].filter((x): x is string => Boolean(x));
  const out = new Map<string, string>();
  const mk = (div: string, heading: string) => {
    const rows = d.standings.filter((s) => (div ? s.division === div : !s.division));
    if (rows.length === 0) return;
    out.set(heading, `![${altKeyword(d, div, rows)}](${cardUrl(d.league, div)})`);
  };

  if (divs.length === 0) {
    mk("", SECTION_HEADINGS[0]); // KBO 단일 → 순위 판도 1개
  } else if (divs.length <= 2) {
    divs.forEach((div, i) => mk(div, SECTION_HEADINGS[i])); // NPB 센/퍼 2개
  } else {
    // MLB 6지구 → 이번 주 가장 치열한(2위 선두 대비 게임차 작은) 지구 3개
    const ranked = divs
      .map((div) => ({ div, gb2: d.standings.filter((s) => s.division === div)[1]?.gb ?? 999 }))
      .sort((a, b) => a.gb2 - b.gb2)
      .slice(0, 3);
    ranked.forEach((x, i) => mk(x.div, SECTION_HEADINGS[i]));
  }
  return out;
}

/** 본문의 지정 ## 헤딩 직후에 순위 카드 이미지를 삽입한 새 본문 반환. */
export function insertStandingsCards(content: string, d: BaseballWeeklyReviewData): string {
  const cards = buildCardsByHeading(d);
  if (cards.size === 0) return content;
  const out: string[] = [];
  for (const line of content.split("\n")) {
    out.push(line);
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m && cards.has(m[1])) out.push("", cards.get(m[1])!, "");
  }
  return out.join("\n");
}
