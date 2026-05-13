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
  league: "KBO" | "MLB",
  homeTeam: string,
): number {
  const map = league === "KBO" ? KBO_PARK_FACTORS : MLB_PARK_FACTORS;
  const key = homeTeam.replace(/\s+/g, "").toLowerCase();
  if (map[key] != null) return map[key];
  // 부분 매칭 — "LG 트윈스" / "Boston Red Sox" 같은 풀네임도 잡힘
  for (const k of Object.keys(map)) {
    if (key.includes(k) || k.includes(key)) return map[k];
  }
  return 1.0;
}
