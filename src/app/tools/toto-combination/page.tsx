// 토토 복식 조합 계산기 페이지 — 승무패·승1패·승5패 14경기 조합 수·구매금액. 계산은 클라이언트 컴포넌트.
import type { Metadata } from "next";
import Link from "next/link";
import TotoCombinationCalculator from "@/components/tools/TotoCombinationCalculator";

export const metadata: Metadata = {
  title: "토토 복식 조합 계산기 — 축구 승무패·야구 승1패·농구 승5패",
  description: "축구토토 승무패, 야구토토 승1패, 농구토토 승5패 14경기에서 경기마다 고른 결과 수로 복식 조합 수와 구매금액(1조합 1,000원)을 계산합니다.",
  alternates: { canonical: "/tools/toto-combination" },
};

export default function TotoCombinationPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <nav className="text-[12px] text-neutral-500">
        <Link href="/tools" className="hover:underline">계산기</Link> › 토토 복식 조합
      </nav>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">토토 복식 조합 계산기</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-neutral-500 break-keep">
        14경기마다 결과를 고르면 조합 수와 구매금액이 바로 나옵니다. 한 경기에 결과를 두세 개 고르는 게 복식이고, 조합 수는 경기별 선택 수의 곱입니다.
      </p>
      <div className="mt-4">
        <TotoCombinationCalculator />
      </div>
      <section className="mt-6 space-y-2 text-[12px] leading-relaxed text-neutral-500 break-keep">
        <h2 className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200">읽는 법</h2>
        <p>모두 단식(경기당 1개)이면 1조합 1,000원, 두 경기를 복식 3개로 열면 3 × 3 = 9조합 9,000원입니다. 14경기 전부 세 결과를 열면 3<sup>14</sup> = 4,782,969조합이라 사실상 불가능합니다.</p>
        <p>승1패의 ‘1’은 양 팀 점수 차가 1점인 경우, 승5패의 ‘5’는 점수 차가 5점 이하인 경우입니다. 실제 발매 한도와 적중금은 회차 공지를 따릅니다.</p>
      </section>
    </div>
  );
}
