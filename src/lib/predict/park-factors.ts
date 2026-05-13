// 구장별 득점 보정 계수 (park factor).
// 1.0 = 중립, >1.0 = 타자 친화 구장 (홈런/장타 많음), <1.0 = 투수 친화.
//
// 출처: KBO 는 최근 3시즌 평균 득점/이닝 (자체 집계), MLB 는 FanGraphs Park Factor.

export const KBO_PARK_FACTORS: Record<string, number> = {
  // KBO 10구단 — 팀명 / 영문 코드 / 도시 모두 lookup 가능하게.
  // key 는 소문자 lowercase + 공백 제거.
  jamsil: 0.92, // 잠실 (LG / 두산 공동 홈)
  lg: 0.92,
  두산: 0.92,
  lg트윈스: 0.92,
  두산베어스: 0.92,
  gocheok: 0.95, // 고척 (키움)
  키움: 0.95,
  키움히어로즈: 0.95,
  incheon: 1.02, // 인천 SSG 랜더스필드
  ssg: 1.02,
  ssg랜더스: 1.02,
  daegu: 1.05, // 대구 라이온즈파크 (삼성)
  삼성: 1.05,
  삼성라이온즈: 1.05,
  gwangju: 1.03, // 광주 (KIA)
  kia: 1.03,
  kia타이거즈: 1.03,
  busan: 1.0, // 사직 (롯데)
  롯데: 1.0,
  롯데자이언츠: 1.0,
  changwon: 1.04, // 창원 NC파크
  nc: 1.04,
  nc다이노스: 1.04,
  suwon: 0.98, // 수원 KT위즈파크
  kt: 0.98,
  kt위즈: 0.98,
  daejeon: 1.06, // 대전 한화생명이글스파크
  한화: 1.06,
  한화이글스: 1.06,
};

export const NPB_PARK_FACTORS: Record<string, number> = {
  // NPB 12구단 — 한글 표기/영문/도시 lookup.
  // 한신 코시엔 (외야 깊고 클래식) = 투수 친화, 야쿠르트 진구 (좁음) = 타자 친화 등.
  koshien: 0.95, // 한신 코시엔
  한신: 0.95,
  한신타이거스: 0.95,
  tokyodome: 1.02, // 도쿄돔 (요미우리)
  요미우리: 1.02,
  요미우리자이언츠: 1.02,
  jingu: 1.05, // 메이지진구 (야쿠르트) — 좁은 외야, 타자 친화
  야쿠르트: 1.05,
  도쿄야쿠르트스왈로스: 1.05,
  vantelin: 0.96, // 반테린 돔 (주니치)
  주니치: 0.96,
  주니치드래곤스: 0.96,
  matsuda: 0.97, // 마쓰다 스타디움 (히로시마)
  히로시마: 0.97,
  히로시마도요카프: 0.97,
  yokohama: 0.98, // 요코하마 스타디움
  요코하마: 0.98,
  요코하마디엔에이베이스타스: 0.98,
  kyocera: 1.0, // 교세라 돔 (오릭스)
  오릭스: 1.0,
  오릭스버팔로스: 1.0,
  rakuten: 1.02, // 라쿠텐 모바일 파크 (센다이)
  라쿠텐: 1.02,
  도호쿠라쿠텐골든이글스: 1.02,
  paypay: 1.0, // 페이페이 돔 (소프트뱅크)
  소프트뱅크: 1.0,
  후쿠오카소프트뱅크호크스: 1.0,
  belluna: 1.04, // 베르나 돔 (세이부) — 타자 친화
  세이부: 1.04,
  사이타마세이부라이온스: 1.04,
  zozo: 0.95, // ZOZO 마린 (지바 롯데) — 바람 강함, 투수 친화
  지바롯데: 0.95,
  지바롯데마린스: 0.95,
  escon: 1.0, // 에스콘 필드 홋카이도 (닛폰햄, 2023 개장 신구장)
  닛폰햄: 1.0,
  홋카이도닛폰햄파이터즈: 1.0,
};

export const MLB_PARK_FACTORS: Record<string, number> = {
  // 주요 타자/투수 구장 위주. 미등록 팀은 1.0 fallback.
  coors: 1.3, // Coors Field (Rockies) — 타자 천국 (고지대)
  colorado: 1.3,
  coloradorockies: 1.3,
  fenway: 1.05, // Fenway Park (Red Sox)
  boston: 1.05,
  bostonredsox: 1.05,
  yankee: 1.05, // Yankee Stadium
  newyorkyankees: 1.05,
  greatamerican: 1.08, // Great American Ball Park (Reds)
  cincinnati: 1.08,
  cincinnatireds: 1.08,
  oracle: 0.93, // Oracle Park (Giants) — 투수 친화
  sanfrancisco: 0.93,
  sanfranciscogiants: 0.93,
  petco: 0.95, // Petco Park (Padres)
  sandiego: 0.95,
  sandiegopadres: 0.95,
  tropicana: 0.92, // Tropicana Field (Rays)
  tampabay: 0.92,
  tampabayrays: 0.92,
  oakland: 0.94,
  athletics: 0.94,
  miami: 0.94,
  miamimarlins: 0.94,
};

/**
 * 홈 팀명/구장명 으로 park factor lookup.
 * 한글/영문 모두 시도. 미매칭 시 1.0 (중립).
 */
export function getParkFactor(
  league: "KBO" | "NPB" | "MLB",
  homeTeam: string,
): number {
  const map =
    league === "KBO"
      ? KBO_PARK_FACTORS
      : league === "NPB"
        ? NPB_PARK_FACTORS
        : MLB_PARK_FACTORS;
  const key = homeTeam.replace(/\s+/g, "").toLowerCase();
  if (map[key] != null) return map[key];
  // 부분 매칭 — "LG 트윈스" / "Boston Red Sox" 같은 풀네임도 잡힘
  for (const k of Object.keys(map)) {
    if (key.includes(k) || k.includes(key)) return map[k];
  }
  return 1.0;
}
