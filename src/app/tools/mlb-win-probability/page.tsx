// MLB 승리확률 계산기 — 상황별 WE + 전술 손익.
import type { Metadata } from "next";
import BaseballWinProbabilityPage, { buildWpMetadata } from "@/components/BaseballWinProbabilityPage";
import type { WeTable } from "@/lib/predict/win-expectancy";
import weMlb from "../../../../data/we-mlb.json";

export const metadata: Metadata = buildWpMetadata("mlb");

export default function Page() {
  return <BaseballWinProbabilityPage slug="mlb" table={weMlb as unknown as WeTable} />;
}
