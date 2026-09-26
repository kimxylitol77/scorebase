// KBO 포스트시즌 대진표 — 와일드카드 결정전·준플레이오프·플레이오프·한국시리즈 계단식 + 시드 경쟁 + AI 시리즈 확률.
// 데이터: 공식 순위(ts 캐시)·우리 Match·자체 Elo — lib/sports/baseball/kbo-npb-postseason.ts, 본문은 LadderPostseasonView 공용.
import type { Metadata } from "next";
import LadderPostseasonView from "@/components/baseball/LadderPostseasonView";
import { SITE_URL } from "@/lib/site-url";
import { getLadderPostseason, ladderSeason } from "@/lib/sports/baseball/kbo-npb-postseason";

export const revalidate = 300;

const SEASON = ladderSeason();
const PATH = "/baseball/kbo-postseason";

export const metadata: Metadata = {
  title: `KBO 포스트시즌 대진표 ${SEASON} — 와일드카드·준플레이오프·플레이오프·한국시리즈 일정`,
  description: `${SEASON} KBO 포스트시즌(가을야구) 대진표. 와일드카드 결정전부터 한국시리즈까지 시드·일정·시리즈 스코어, 진출 확정 현황과 AI 시리즈 승리 확률을 실시간으로.`,
  keywords: ["KBO 포스트시즌", "KBO 포스트시즌 대진표", "가을야구 대진표", "한국시리즈", "플레이오프", "준플레이오프", "와일드카드 결정전", "가을야구 일정", "스코어베이스"],
  alternates: { canonical: `${SITE_URL}${PATH}` },
  openGraph: { title: `KBO 포스트시즌 대진표 ${SEASON}`, description: "와일드카드 결정전부터 한국시리즈까지 — 시드·일정·시리즈 스코어·AI 시리즈 승리 확률.", url: `${SITE_URL}${PATH}` },
};

export default async function KboPostseasonPage() {
  const page = await getLadderPostseason("KBO", SEASON);
  return <LadderPostseasonView league="KBO" season={SEASON} page={page} path={PATH} />;
}
