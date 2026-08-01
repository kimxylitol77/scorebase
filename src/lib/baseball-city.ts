// 야구 홈 구장 도시 lookup (KBO·MLB·NPB) — 매치 카드 날씨 배지용 정적 매핑.
// key = DB Team.name. 올스타/이벤트 팀은 매핑 제외 → 날씨 미표시.

export interface BaseballCity {
  /** geocoding 질의용 영문 도시명 */
  city: string;
  country: string;
  /** 배지 표시용 한글 도시명 */
  label: string;
}

const KBO: Record<string, BaseballCity> = {
  "KIA 타이거즈": { city: "Gwangju", country: "South Korea", label: "광주" },
  "KT 위즈": { city: "Suwon", country: "South Korea", label: "수원" },
  "LG 트윈스": { city: "Seoul", country: "South Korea", label: "서울" },
  "NC 다이노스": { city: "Changwon", country: "South Korea", label: "창원" },
  "SSG 랜더스": { city: "Incheon", country: "South Korea", label: "인천" },
  "두산 베어스": { city: "Seoul", country: "South Korea", label: "서울" },
  "롯데 자이언츠": { city: "Busan", country: "South Korea", label: "부산" },
  "삼성 라이온즈": { city: "Daegu", country: "South Korea", label: "대구" },
  "키움 히어로즈": { city: "Seoul", country: "South Korea", label: "서울" },
  "한화 이글스": { city: "Daejeon", country: "South Korea", label: "대전" },
};

const MLB: Record<string, BaseballCity> = {
  "Arizona Diamondbacks": { city: "Phoenix", country: "United States", label: "피닉스" },
  // 2025~ 새크라멘토 임시 홈 (라스베이거스 이전 전)
  Athletics: { city: "Sacramento", country: "United States", label: "새크라멘토" },
  "Atlanta Braves": { city: "Atlanta", country: "United States", label: "애틀랜타" },
  "Baltimore Orioles": { city: "Baltimore", country: "United States", label: "볼티모어" },
  "Boston Red Sox": { city: "Boston", country: "United States", label: "보스턴" },
  "Chicago Cubs": { city: "Chicago", country: "United States", label: "시카고" },
  "Chicago White Sox": { city: "Chicago", country: "United States", label: "시카고" },
  "Cincinnati Reds": { city: "Cincinnati", country: "United States", label: "신시내티" },
  "Cleveland Guardians": { city: "Cleveland", country: "United States", label: "클리블랜드" },
  "Colorado Rockies": { city: "Denver", country: "United States", label: "덴버" },
  "Detroit Tigers": { city: "Detroit", country: "United States", label: "디트로이트" },
  "Houston Astros": { city: "Houston", country: "United States", label: "휴스턴" },
  "Kansas City Royals": { city: "Kansas City", country: "United States", label: "캔자스시티" },
  "Los Angeles Angels": { city: "Anaheim", country: "United States", label: "애너하임" },
  "Los Angeles Dodgers": { city: "Los Angeles", country: "United States", label: "로스앤젤레스" },
  "Miami Marlins": { city: "Miami", country: "United States", label: "마이애미" },
  "Milwaukee Brewers": { city: "Milwaukee", country: "United States", label: "밀워키" },
  "Minnesota Twins": { city: "Minneapolis", country: "United States", label: "미니애폴리스" },
  "New York Mets": { city: "New York", country: "United States", label: "뉴욕" },
  "New York Yankees": { city: "New York", country: "United States", label: "뉴욕" },
  "Philadelphia Phillies": { city: "Philadelphia", country: "United States", label: "필라델피아" },
  "Pittsburgh Pirates": { city: "Pittsburgh", country: "United States", label: "피츠버그" },
  "San Diego Padres": { city: "San Diego", country: "United States", label: "샌디에이고" },
  "San Francisco Giants": { city: "San Francisco", country: "United States", label: "샌프란시스코" },
  "Seattle Mariners": { city: "Seattle", country: "United States", label: "시애틀" },
  "St. Louis Cardinals": { city: "St. Louis", country: "United States", label: "세인트루이스" },
  "Tampa Bay Rays": { city: "Tampa", country: "United States", label: "탬파" },
  "Texas Rangers": { city: "Arlington", country: "United States", label: "알링턴" },
  "Toronto Blue Jays": { city: "Toronto", country: "Canada", label: "토론토" },
  "Washington Nationals": { city: "Washington", country: "United States", label: "워싱턴" },
};

const NPB: Record<string, BaseballCity> = {
  "도쿄 야쿠르트 스왈로스": { city: "Tokyo", country: "Japan", label: "도쿄" },
  "도호쿠 라쿠텐 골든이글스": { city: "Sendai", country: "Japan", label: "센다이" },
  "사이타마 세이부 라이온스": { city: "Tokorozawa", country: "Japan", label: "도코로자와" },
  "오릭스 버팔로스": { city: "Osaka", country: "Japan", label: "오사카" },
  "요미우리 자이언츠": { city: "Tokyo", country: "Japan", label: "도쿄" },
  "요코하마 디엔에이 베이스타스": { city: "Yokohama", country: "Japan", label: "요코하마" },
  "주니치 드래곤스": { city: "Nagoya", country: "Japan", label: "나고야" },
  "지바 롯데 마린스": { city: "Chiba", country: "Japan", label: "지바" },
  "한신 타이거스": { city: "Nishinomiya", country: "Japan", label: "니시노미야" },
  // 에스콘 필드는 기타히로시마 — 히로시마현 동명 지역 오매칭 방지 위해 인접 삿포로 사용
  "홋카이도 닛폰햄 파이터즈": { city: "Sapporo", country: "Japan", label: "삿포로" },
  "후쿠오카 소프트뱅크 호크스": { city: "Fukuoka", country: "Japan", label: "후쿠오카" },
  "히로시마 도요 카프": { city: "Hiroshima", country: "Japan", label: "히로시마" },
};

const BY_LEAGUE: Record<string, Record<string, BaseballCity>> = {
  KBO,
  MLB,
  NPB,
};

/** 야구 홈팀 구장 도시. 매핑 없는 리그(CPBL 등)/팀은 null. */
export function getBaseballCity(
  league: string,
  homeTeamName: string,
): BaseballCity | null {
  return BY_LEAGUE[league]?.[homeTeamName] ?? null;
}
