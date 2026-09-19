// sportspredictions.live(영어 예측 자매 사이트) 전용 URL 상수 — canonical·OG·sitemap·JSON-LD 가 전부 이 값을 쓴다.
// SITE_URL(site-url.ts)은 www.scorebase.kr 고정이라 자매 사이트에서는 쓰지 않는다.

export const SP_URL = "https://sportspredictions.live";
export const SP_NAME = "Sports Predictions";

/** 자매 사이트 절대 URL. path 는 사용자에게 보이는 경로("/accuracy") — 내부 /sp 접두는 넣지 않는다. */
export function spUrl(path = "/"): string {
  return `${SP_URL}${path === "/" ? "" : path}`;
}

/** 상세 분석·팀·순위는 스코어베이스 영어판으로 한 방향 링크한다. */
export const SCOREBASE_EN = "https://www.scorebase.kr/en";
