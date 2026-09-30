// 영어판 스코어보드 리그 제목 링크 — /en/standings 라우트가 받는 리그(STANDINGS_VALID, 라우트의 notFound 기준)만 영어,
// 나머지는 한국어 리그 페이지. WBC·IIHF_WC·LCK_CL·UFC 등 19개 리그는 /en/standings 가 404(2026-10-01 전수 실측, 축구 189개는 전부 열림).
import { STANDINGS_VALID } from "@/lib/sports/standings-valid";

export function enLeagueHref(league: string): string {
  return STANDINGS_VALID.has(league) ? `/en/standings/${league}` : `/leagues/${league}`;
}
