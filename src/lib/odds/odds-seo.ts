// /odds SEO·GEO 재료 — 종목별 제목·설명·키워드, Dataset·Breadcrumb·FAQ 구조화 데이터, 화면 설명 절 문장.
// 화면 FAQ 와 FAQPage 스키마는 같은 함수(oddsFaq)에서 만든다 — 구조화 데이터는 화면 내용과 일치해야 리치 결과 자격이 있다.
// 페이지가 force-dynamic 이라 실측 숫자(흐름 적중 비율·회차·경기 수)를 설명에 넣어도 낡지 않는다.
import { SITE_URL } from "@/lib/site-url";
import { breadcrumbLd, orgRef } from "@/lib/seo/jsonld";
import type { FlowHitrate } from "@/lib/odds/flow-hitrate";

export type OddsSportKey = "soccer" | "baseball" | "basketball" | "hockey" | "volleyball" | "esports" | "mma";

export const ODDS_SPORT_META: Record<OddsSportKey, { label: string; leagues: string; title: string }> = {
  soccer: { label: "축구", leagues: "EPL·라리가·분데스리가·세리에 A·리그 1·K리그·J리그·UCL 등 100여 리그", title: "축구 배당 흐름 — 오픈 대비 배당 변동·돈이 몰리는 방향" },
  baseball: { label: "야구", leagues: "KBO·MLB·NPB", title: "야구 배당 흐름 — KBO·MLB·NPB 머니라인 변동" },
  basketball: { label: "농구", leagues: "NBA·WNBA·KBL", title: "농구 배당 흐름 — NBA·WNBA·KBL 머니라인 변동" },
  hockey: { label: "하키", leagues: "NHL·유럽 리그", title: "하키 배당 흐름 — NHL·유럽 리그 머니라인 변동" },
  volleyball: { label: "배구", leagues: "V-리그·VNL·국제대회", title: "배구 배당 흐름 — 머니라인·세트핸디캡 변동" },
  esports: { label: "LOL", leagues: "LCK·LPL·LEC·LCS", title: "LOL 배당 흐름 — LCK·LPL 머니라인 변동" },
  mma: { label: "UFC", leagues: "UFC", title: "UFC 배당 흐름 — 파이터별 머니라인 변동" },
};

const pct1 = (v: number | null) => (v == null ? null : `${v.toFixed(1)}%`);

/** 종목 탭 메타데이터 — 제목·설명·키워드·canonical·OG 제목 */
export function flowMetadata(sport: OddsSportKey, hr: FlowHitrate | null, matchCount: number) {
  const m = ODDS_SPORT_META[sport];
  const stat = hr && hr.hitPct != null && hr.total >= 30 ? ` 최근 ${hr.windowDays}일 ${hr.total.toLocaleString()}경기에서 배당이 내려간(돈 몰린) 쪽이 실제로 이긴 비율 ${pct1(hr.hitPct)}.` : "";
  return {
    title: `${m.title} | 스코어베이스`,
    description: `${m.leagues} ${m.label} 경기 배당이 오픈 대비 어느 쪽으로 움직였는지 시계열로 봅니다. 하락·상승 필터, 리그·날짜 칩, 우리 AI 모델 확률과 시장 내재확률 비교.${stat} 현재 ${matchCount}경기.`,
    keywords: [`${m.label} 배당 흐름`, "배당 변동", "배당 하락", "라인 무브먼트", "line movement", "돈 몰리는 쪽", "배당 흐름 적중률", "AI 예측 vs 배당", "스코어베이스"],
    canonical: `${SITE_URL}/odds?sport=${sport}`,
    ogTitle: `${m.label} 배당 흐름 — 돈이 몰리는 방향 · 스코어베이스`,
    ogSubtitle: `${m.leagues} · 오픈 대비 변동 · AI 모델 vs 시장`,
  };
}

/** 베트맨 탭 메타데이터 */
export function betmanMetadata(round: number | null, matchCount: number, days: number) {
  return {
    title: "베트맨 배당 — 프로토 승부식 배당·국내 투표 분포 | 스코어베이스",
    description: `베트맨(스포츠토토) 프로토 승부식 배당과 국내 구매자 투표 분포를 오늘·내일·모레 날짜별로 봅니다. 배당이 매긴 확률과 실제 투표 비율을 나란히, 핸디캡·언더오버·전반 라인, 단폭 가능 여부와 발매 마감 시각.${round ? ` ${round} 회차` : ""} 발매 중 ${matchCount}경기 · ${days}일치.`,
    keywords: ["베트맨 배당", "프로토 승부식", "프로토 배당", "베트맨 투표율", "국내 투표 분포", "단폭", "프로토 마감시간", "핸디캡 배당", "언더오버 배당", "스포츠토토"],
    canonical: `${SITE_URL}/odds?sport=betman`,
    ogTitle: "베트맨 배당 — 프로토 승부식 배당·국내 투표 분포",
    ogSubtitle: `${round ? `${round} 회차 · ` : ""}${matchCount}경기 · 단폭·마감 시각 표시`,
  };
}

export function flowJsonLd(sport: OddsSportKey) {
  const m = ODDS_SPORT_META[sport];
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `스코어베이스 ${m.label} 배당 흐름 — 오픈 대비 배당 변동 시계열`,
      description: `${m.leagues} ${m.label} 경기의 해외 북메이커 평균 배당을 시간순으로 기록해 오픈 대비 현재 변동률과 하락 신호를 계산한 데이터. 우리 AI 모델 확률과 시장 내재확률을 같은 표에 둔다.`,
      url: `${SITE_URL}/odds?sport=${sport}`,
      keywords: [`${m.label} 배당 흐름`, "line movement", "배당 하락", "AI 예측 vs 배당"],
      creator: orgRef(),
      isAccessibleForFree: true,
      measurementTechnique: "북메이커 평균 배당 스냅샷(2시간·야구는 15분 버킷) 시계열 → 오픈 대비 변동률, 하락 1.5% 이상을 돈 몰림 신호로 집계",
    },
    breadcrumbLd([{ name: "홈", path: "/" }, { name: "배당 흐름", path: "/odds?sport=soccer" }, { name: m.label, path: `/odds?sport=${sport}` }]),
  ];
}

export function betmanJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "스코어베이스 베트맨 배당 — 프로토 승부식 배당·국내 투표 분포",
      description: "베트맨(스포츠토토) 프로토 승부식의 경기별 배당(승무패·핸디캡·언더오버·홀짝·전반)과 국내 구매자 투표 분포, 단폭 가능 여부, 발매 마감 시각을 하루 2회 수집한 데이터.",
      url: `${SITE_URL}/odds?sport=betman`,
      keywords: ["베트맨 배당", "프로토 승부식", "국내 투표 분포", "단폭", "발매 마감"],
      creator: orgRef(),
      isAccessibleForFree: true,
      measurementTechnique: "베트맨 공개 회차 데이터 09:00·21:00 수집, 배당 → 마진 제거 내재확률 환산 후 투표 비율과 대조",
    },
    breadcrumbLd([{ name: "홈", path: "/" }, { name: "배당 흐름", path: "/odds?sport=soccer" }, { name: "베트맨 배당", path: "/odds?sport=betman" }]),
  ];
}

export interface FaqItem { q: string; a: string }

/** 배당 흐름 FAQ — 화면·스키마 공용. 실측(hr)이 있으면 숫자를 문장에 박는다. */
export function flowFaq(sport: OddsSportKey, hr: FlowHitrate | null): FaqItem[] {
  const m = ODDS_SPORT_META[sport];
  const stat = hr && hr.hitPct != null && hr.total >= 30
    ? `스코어베이스 ${m.label} 실측으로는 최근 ${hr.windowDays}일 ${hr.total.toLocaleString()}경기에서 배당이 1.5% 이상 내려간 쪽이 실제로 이긴 비율이 ${pct1(hr.hitPct)}였습니다${hr.threeWay ? "(승·무·패 3지선다라 무승부는 미적중으로 집계)" : ""}.`
    : "돈이 몰린 쪽이 항상 이기는 것은 아니며, 스코어베이스는 종목별 실측 적중 비율을 표 위에 공개합니다.";
  return [
    { q: "배당 흐름이란 무엇인가요?", a: `배당 흐름은 경기 배당이 처음 공개된 값(오픈)에서 현재까지 어느 쪽으로 얼마나 움직였는지를 말합니다. 배당이 내려가는 쪽은 돈이 몰리거나 북메이커가 확률을 높게 고쳐 잡은 쪽이고, 올라가는 쪽은 그 반대입니다. 스코어베이스는 ${m.leagues} ${m.label} 경기의 해외 북메이커 평균 배당을 시간순으로 기록해 이 변동을 표와 그래프로 보여줍니다.` },
    { q: "배당이 내려간 쪽이 실제로 얼마나 이기나요?", a: stat },
    { q: "AI 모델 vs 시장 열은 무엇을 뜻하나요?", a: "돈이 몰린 쪽에 대해 스코어베이스 AI 모델의 승리 확률과 시장 배당을 확률로 바꾼 값을 나란히 놓은 것입니다. 모델이 5%p 이상 높으면 'AI 동의'로 흐름에 근거가 있다는 뜻이고, 5%p 이상 낮으면 'AI 신중'으로 시장이 과열됐을 수 있다는 신호입니다. 밸류 베트 페이지와 같은 잣대입니다." },
    { q: "배당 흐름은 얼마나 자주 갱신되나요?", a: "해외 북메이커 평균 배당은 2시간마다 스냅샷을 남기고, 야구·하키·배구는 업체별 히스토리를 15분 버킷으로 내려 더 촘촘하게 봅니다. 페이지는 요청마다 최신 값을 읽으며 목록은 2분 캐시입니다." },
    { q: "이 페이지는 베팅을 권유하나요?", a: "아닙니다. 스코어베이스는 베팅을 중개하거나 권유하지 않으며, 배당은 시장의 예측치로서 분석·검증 대상으로만 다룹니다. 모든 확률과 흐름 신호는 통계 모델 기반의 참고용 정보이고 경기 결과를 보장하지 않습니다." },
  ];
}

/** 베트맨 FAQ — 화면·스키마 공용 */
export function betmanFaq(round: number | null, matchCount: number): FaqItem[] {
  return [
    { q: "베트맨 배당 페이지에는 무엇이 있나요?", a: `베트맨(스포츠토토) 프로토 승부식의 발매 중 경기${round ? `(${round} 회차)` : ""} ${matchCount}건을 오늘·내일·모레 날짜별로 묶어 보여줍니다. 경기마다 승무패(야구·농구·배구는 승패) 배당과 국내 구매자 투표 분포, 펼치면 핸디캡·언더오버·홀짝·전반 라인이 나옵니다.` },
    { q: "투표 분포와 배당 기준 확률이 다르면 어떻게 읽나요?", a: "투표 분포는 국내 구매자가 실제로 어디에 걸었는지이고, 배당 기준 확률은 배당에서 마진을 뺀 시장의 예측치입니다. 둘이 크게 벌어진 경기는 국내 여론과 시장이 다르게 보는 경기입니다. 어느 쪽이 맞는지는 결과가 말해 주므로, 스코어베이스는 판단을 대신하지 않고 두 숫자를 나란히 둡니다." },
    { q: "단폭 표시는 무슨 뜻인가요?", a: "단폭은 그 유형을 1경기만 단독으로 살 수 있다는 뜻입니다. 프로토 승부식은 여러 경기를 묶어 사는 조합 구매가 기본이고, 단폭 허용 경기만 1경기 구매가 됩니다. 베트맨 원본의 단폭 플래그를 그대로 표시합니다." },
    { q: "마감 시각은 왜 경기 시작과 다른가요?", a: "대부분 경기는 발매 마감이 경기 시작과 같지만, 회차 마감 뒤에 시작하는 경기나 새벽 경기는 그보다 먼저 발매가 끝납니다. 스코어베이스는 경기 시작보다 먼저 마감되는 경기에만 마감 시각을 붙이고, 1시간 이내면 빨간색, 지나면 '발매 마감'으로 바꿉니다." },
    { q: "베트맨 배당은 얼마나 자주 갱신되나요?", a: "하루 두 번, 09:00와 21:00(한국시간)에 베트맨 공개 데이터를 수집합니다. 페이지는 10분 캐시라 수집 직후 늦어도 10분 안에 반영됩니다." },
    { q: "이 페이지는 베팅을 중개하나요?", a: "아닙니다. 스코어베이스는 베팅을 중개하거나 권유하지 않는 데이터 분석 미디어이며, 국내 합법 사업자(스포츠토토)의 공개 배당과 투표 분포를 분석·검증 대상으로만 다룹니다. 만 19세 미만은 이용할 수 없고 실제 구매는 이용자 본인의 책임입니다." },
  ];
}

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
