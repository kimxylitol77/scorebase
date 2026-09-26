// NPB 포스트시즌 대진표 — 센트럴·퍼시픽 클라이맥스 시리즈(퍼스트·파이널)·일본시리즈 + 시드 경쟁 + AI 시리즈 확률.
// 데이터: 공식 순위(ts 캐시)·npb.jp 일정·자체 Elo — lib/sports/baseball/kbo-npb-postseason.ts, 본문은 LadderPostseasonView 공용.
import type { Metadata } from "next";
import LadderPostseasonView from "@/components/baseball/LadderPostseasonView";
import { SITE_URL } from "@/lib/site-url";
import { getLadderPostseason, ladderSeason } from "@/lib/sports/baseball/kbo-npb-postseason";

export const revalidate = 300;

const SEASON = ladderSeason();
const PATH = "/baseball/npb-postseason";

export const metadata: Metadata = {
  title: `NPB 포스트시즌 대진표 ${SEASON} — 클라이맥스 시리즈·일본시리즈 일정`,
  description: `${SEASON} 일본프로야구(NPB) 포스트시즌 대진표. 센트럴·퍼시픽 클라이맥스 시리즈(퍼스트·파이널 스테이지)와 일본시리즈의 시드·일정(한국시간)·시리즈 스코어, AI 시리즈 승리 확률까지.`,
  keywords: ["NPB 포스트시즌", "일본시리즈", "클라이맥스 시리즈", "일본프로야구 포스트시즌", "NPB 클라이맥스 시리즈 대진표", "일본시리즈 일정", "스코어베이스"],
  alternates: { canonical: `${SITE_URL}${PATH}` },
  openGraph: { title: `NPB 포스트시즌 대진표 ${SEASON}`, description: "클라이맥스 시리즈부터 일본시리즈까지 — 시드·일정·시리즈 스코어·AI 시리즈 승리 확률.", url: `${SITE_URL}${PATH}` },
};

export default async function NpbPostseasonPage() {
  const page = await getLadderPostseason("NPB", SEASON);
  return <LadderPostseasonView league="NPB" season={SEASON} page={page} path={PATH} />;
}
