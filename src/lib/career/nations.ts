// 커리어 시뮬레이터 국적 목록 — 국기·한국어명, 자국 리그는 leagues.ts 의 country 로 역참조
export interface Nation {
  code: string;
  label: string;
  flag: string;
}

/** 선택 가능한 국적. 한국을 맨 앞에 둔다. */
export const NATIONS: Nation[] = [
  { code: "KOR", label: "대한민국", flag: "🇰🇷" },
  { code: "JPN", label: "일본", flag: "🇯🇵" },
  { code: "ENG", label: "잉글랜드", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { code: "ESP", label: "스페인", flag: "🇪🇸" },
  { code: "GER", label: "독일", flag: "🇩🇪" },
  { code: "ITA", label: "이탈리아", flag: "🇮🇹" },
  { code: "FRA", label: "프랑스", flag: "🇫🇷" },
  { code: "BRA", label: "브라질", flag: "🇧🇷" },
  { code: "ARG", label: "아르헨티나", flag: "🇦🇷" },
  { code: "NED", label: "네덜란드", flag: "🇳🇱" },
  { code: "POR", label: "포르투갈", flag: "🇵🇹" },
  { code: "BEL", label: "벨기에", flag: "🇧🇪" },
  { code: "SCO", label: "스코틀랜드", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  { code: "TUR", label: "튀르키예", flag: "🇹🇷" },
  { code: "USA", label: "미국", flag: "🇺🇸" },
  { code: "MEX", label: "멕시코", flag: "🇲🇽" },
  { code: "CHN", label: "중국", flag: "🇨🇳" },
  { code: "THA", label: "타이", flag: "🇹🇭" },
  { code: "IND", label: "인도", flag: "🇮🇳" },
  { code: "POL", label: "폴란드", flag: "🇵🇱" },
  { code: "UKR", label: "우크라이나", flag: "🇺🇦" },
  { code: "RUS", label: "러시아", flag: "🇷🇺" },
  { code: "DEN", label: "덴마크", flag: "🇩🇰" },
  { code: "CZE", label: "체코", flag: "🇨🇿" },
  { code: "KSA", label: "사우디아라비아", flag: "🇸🇦" },
  { code: "IRL", label: "아일랜드", flag: "🇮🇪" },
  { code: "WAL", label: "웨일스", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿" },
  { code: "KAZ", label: "카자흐스탄", flag: "🇰🇿" },
  { code: "BLR", label: "벨라루스", flag: "🇧🇾" },
  { code: "ROU", label: "루마니아", flag: "🇷🇴" },
  { code: "LVA", label: "라트비아", flag: "🇱🇻" },
  { code: "EST", label: "에스토니아", flag: "🇪🇪" },
  { code: "LTU", label: "리투아니아", flag: "🇱🇹" },
];

export const NATION_BY_CODE: Record<string, Nation> = Object.fromEntries(
  NATIONS.map((n) => [n.code, n]),
);
