// 프로토 승부식 조합 계산기 페이지 — 합성 배당·예상 적중금. 계산은 클라이언트 컴포넌트.
import type { Metadata } from "next";
import Link from "next/link";
import ProtoComboCalculator from "@/components/tools/ProtoComboCalculator";

export const metadata: Metadata = {
  title: "프로토 승부식 조합 계산기 — 합성 배당·예상 적중금 | 스코어베이스",
  description: "프로토 승부식 경기별 배당을 넣으면 합성 배당(곱, 둘째 자리 절사)과 구매금액 기준 예상 적중금, 배당이 말하는 확률을 바로 계산합니다. 최대 10경기.",
  alternates: { canonical: "/tools/proto-calculator" },
};

export default function ProtoCalculatorPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <nav className="text-[12px] text-neutral-500">
        <Link href="/tools" className="hover:underline">계산기</Link> › 프로토 승부식 조합
      </nav>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">프로토 승부식 조합 계산기</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-neutral-500 break-keep">
        경기별 배당을 넣으면 합성 배당과 예상 적중금을 계산합니다. 오늘 발매 중인 경기의 배당·국내 투표 분포는{" "}
        <Link href="/odds?sport=betman" className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 dark:hover:text-white">베트맨 배당</Link>
        에서 볼 수 있습니다.
      </p>
      <div className="mt-4">
        <ProtoComboCalculator />
      </div>
      <section className="mt-6 space-y-2 text-[12px] leading-relaxed text-neutral-500 break-keep">
        <h2 className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200">읽는 법</h2>
        <p>합성 배당이 커질수록 배당이 말하는 확률은 급격히 낮아집니다. 예를 들어 1.85 × 1.62 × 2.10 = 6.29 는 확률로 약 15.9% 이고, 여기엔 경기마다 붙는 발매사 마진(승부식 실측 13~15%)이 누적돼 실제 확률은 그보다 더 낮습니다.</p>
        <p>같은 경기의 해외 평균 배당과 마진 차이는 경기 상세의 베트맨 카드에서 나란히 볼 수 있습니다.</p>
      </section>
    </div>
  );
}
