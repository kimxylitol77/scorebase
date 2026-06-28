// NPB 승리확률 계산기 — 상황별 WE + 전술 손익.
import type { Metadata } from "next";
import BaseballWinProbabilityPage, { buildWpMetadata } from "@/components/BaseballWinProbabilityPage";
import type { WeTable } from "@/lib/predict/win-expectancy";
import weNpb from "../../../../data/we-npb.json";

export const metadata: Metadata = buildWpMetadata("npb");

export default function Page() {
  return <BaseballWinProbabilityPage slug="npb" table={weNpb as unknown as WeTable} />;
}
