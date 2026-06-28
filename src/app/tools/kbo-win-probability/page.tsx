// KBO 승리확률 계산기 — 상황별 WE + 전술 손익 (국내 최초 KBO 전용).
import type { Metadata } from "next";
import BaseballWinProbabilityPage, { buildWpMetadata } from "@/components/BaseballWinProbabilityPage";
import type { WeTable } from "@/lib/predict/win-expectancy";
import weKbo from "../../../../data/we-kbo.json";

export const metadata: Metadata = buildWpMetadata("kbo");

export default function Page() {
  return <BaseballWinProbabilityPage slug="kbo" table={weKbo as unknown as WeTable} />;
}
