// 2026 월드컵 본선 48개국 기본 정보 — 매치 페이지 국가 비교 카드용 정적 데이터.
// appearances = 2026 대회 포함 본선 출전 횟수 (전신 국가 승계 포함: 체코슬로바키아→체코 등).
// last = 직전 대회(2022 카타르) 결과, best = 역대 최고 성적.

export interface WcCountryFacts {
  /** 소속 대륙 (한국어) */
  continent: string;
  /** 본선 진출 횟수 (2026 포함) */
  appearances: number;
  /** 역대 최고 성적 */
  best: string;
  /** 직전 대회 (2022) 결과 — 미출전 포함 */
  last: string;
}

export const WC_COUNTRY_FACTS: Record<string, WcCountryFacts> = {
  // A조
  Mexico: { continent: "북중미", appearances: 18, best: "8강 (1970·1986)", last: "16강" },
  "South Africa": { continent: "아프리카", appearances: 4, best: "조별리그", last: "미출전" },
  "South Korea": { continent: "아시아", appearances: 12, best: "4위 (2002)", last: "16강" },
  "Czech Republic": { continent: "유럽", appearances: 10, best: "준우승 (2회)", last: "미출전" },
  Czechia: { continent: "유럽", appearances: 10, best: "준우승 (2회)", last: "미출전" }, // DB Team.name 표기 별칭
  // B조
  Canada: { continent: "북중미", appearances: 3, best: "조별리그", last: "조별리그" },
  "Bosnia & Herzegovina": { continent: "유럽", appearances: 2, best: "조별리그 (2014)", last: "미출전" },
  Qatar: { continent: "아시아", appearances: 2, best: "조별리그", last: "조별리그 (개최)" },
  Switzerland: { continent: "유럽", appearances: 13, best: "8강 (3회)", last: "16강" },
  // C조
  Brazil: { continent: "남미", appearances: 23, best: "우승 (5회)", last: "8강" },
  Morocco: { continent: "아프리카", appearances: 7, best: "4위 (2022)", last: "4위" },
  Haiti: { continent: "북중미", appearances: 2, best: "조별리그 (1974)", last: "미출전" },
  Scotland: { continent: "유럽", appearances: 9, best: "조별리그", last: "미출전" },
  // D조
  USA: { continent: "북중미", appearances: 12, best: "3위 (1930)", last: "16강" },
  Paraguay: { continent: "남미", appearances: 9, best: "8강 (2010)", last: "미출전" },
  Australia: { continent: "아시아", appearances: 7, best: "16강 (2회)", last: "16강" },
  "Türkiye": { continent: "유럽", appearances: 3, best: "3위 (2002)", last: "미출전" },
  // E조
  Germany: { continent: "유럽", appearances: 21, best: "우승 (4회)", last: "조별리그" },
  "Curaçao": { continent: "북중미", appearances: 1, best: "첫 출전", last: "미출전" },
  "Ivory Coast": { continent: "아프리카", appearances: 4, best: "조별리그", last: "미출전" },
  Ecuador: { continent: "남미", appearances: 5, best: "16강 (2006)", last: "조별리그" },
  // F조
  Netherlands: { continent: "유럽", appearances: 12, best: "준우승 (3회)", last: "8강" },
  Japan: { continent: "아시아", appearances: 8, best: "16강 (4회)", last: "16강" },
  Sweden: { continent: "유럽", appearances: 13, best: "준우승 (1958)", last: "미출전" },
  Tunisia: { continent: "아프리카", appearances: 7, best: "조별리그", last: "조별리그" },
  // G조
  Belgium: { continent: "유럽", appearances: 15, best: "3위 (2018)", last: "조별리그" },
  Egypt: { continent: "아프리카", appearances: 4, best: "조별리그", last: "미출전" },
  Iran: { continent: "아시아", appearances: 7, best: "조별리그", last: "조별리그" },
  "New Zealand": { continent: "오세아니아", appearances: 3, best: "조별리그 (무패)", last: "미출전" },
  // H조
  Spain: { continent: "유럽", appearances: 17, best: "우승 (2010)", last: "16강" },
  "Cape Verde Islands": { continent: "아프리카", appearances: 1, best: "첫 출전", last: "미출전" },
  "Saudi Arabia": { continent: "아시아", appearances: 7, best: "16강 (1994)", last: "조별리그" },
  Uruguay: { continent: "남미", appearances: 15, best: "우승 (2회)", last: "조별리그" },
  // I조
  France: { continent: "유럽", appearances: 17, best: "우승 (2회)", last: "준우승" },
  Senegal: { continent: "아프리카", appearances: 4, best: "8강 (2002)", last: "16강" },
  Iraq: { continent: "아시아", appearances: 2, best: "조별리그 (1986)", last: "미출전" },
  Norway: { continent: "유럽", appearances: 4, best: "16강 (1998)", last: "미출전" },
  // J조
  Argentina: { continent: "남미", appearances: 19, best: "우승 (3회)", last: "우승" },
  Algeria: { continent: "아프리카", appearances: 5, best: "16강 (2014)", last: "미출전" },
  Austria: { continent: "유럽", appearances: 8, best: "3위 (1954)", last: "미출전" },
  Jordan: { continent: "아시아", appearances: 1, best: "첫 출전", last: "미출전" },
  // K조
  Portugal: { continent: "유럽", appearances: 9, best: "3위 (1966)", last: "8강" },
  Colombia: { continent: "남미", appearances: 7, best: "8강 (2014)", last: "미출전" },
  Uzbekistan: { continent: "아시아", appearances: 1, best: "첫 출전", last: "미출전" },
  "Congo DR": { continent: "아프리카", appearances: 2, best: "조별리그 (1974)", last: "미출전" },
  // L조
  England: { continent: "유럽", appearances: 17, best: "우승 (1966)", last: "8강" },
  Croatia: { continent: "유럽", appearances: 7, best: "준우승 (2018)", last: "3위" },
  Ghana: { continent: "아프리카", appearances: 5, best: "8강 (2010)", last: "조별리그" },
  Panama: { continent: "북중미", appearances: 2, best: "조별리그", last: "미출전" },
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.&·'-]/g, "");
const BY_NORM = new Map(Object.entries(WC_COUNTRY_FACTS).map(([k, v]) => [norm(k), v]));

/** 팀명(영문)으로 국가 facts 조회 — 표기 차이 흡수 (diacritics·공백). 없으면 null. */
export function getWcCountryFacts(teamName: string): WcCountryFacts | null {
  return BY_NORM.get(norm(teamName)) ?? null;
}
