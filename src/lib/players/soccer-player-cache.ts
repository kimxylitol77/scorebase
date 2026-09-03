// 축구 선수 페이지 path 전용 cached wrapper. (mlb-cache.ts · npb-cache.ts 와 같은 패턴)
//
// api-football-pro 는 axios 로 v3.football.api-sports.io 를 호출한다 — Next.js fetch 캐시가
// 걸리지 않아 /players/{pid} 가 매 요청 af 를 1~2회 때렸다(generateMetadata + 본문, 시즌 2개를
// 순회하므로 첫 시즌이 비면 2회). React 의 cache() 는 **요청 단위 메모이제이션**이라
// 요청이 끝나면 사라진다 — 영속 캐시가 아니다.
//
// 실측 (2026-09-03 route-guardian 첫 완주). 가장 느린 20개 중 17개가 /players/{id} 로
// 10.2~13.8초였고, af 일일 사용량은 af-pro:players 하나가 12,984콜/일이었다.
// MLB 는 2026-08-01 에 같은 증상("느림 43건")을 unstable_cache 로 해결했는데 축구 경로만
// 그 처방을 못 받고 있었다.
//
// TTL 6시간 — 선수 시즌 누적 성적은 경기가 끝나야 바뀌고 경기는 주 2~3회다. MLB(1h)보다
// 길게 잡은 이유는 이 페이지가 2,016개(sitemap)라 크롤러·검색봇 반복 유입이 지배적이기 때문.
//
// ⚠ unstable_cache 는 Next.js request context 안에서만 작동 → cron 잡 / tsx CLI 는 raw 함수를
// 그대로 쓸 것. 페이지 path 에서만 import 한다.
import { unstable_cache } from "next/cache";
import { fetchSoccerPlayerProfile } from "@/lib/sports/api-football-pro";

const PROFILE_TTL = 6 * 3600;

export const fetchSoccerPlayerProfileCached = unstable_cache(
  fetchSoccerPlayerProfile,
  ["soccer-player-profile"],
  { revalidate: PROFILE_TTL, tags: ["soccer-player"] },
);
