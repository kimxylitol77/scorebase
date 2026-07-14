// 발롱도르 지수 계산기 페이지 — 서버에서 후보 데이터를 조립해 인터랙티브 계산기에 전달.
import type { Metadata } from "next";
import { buildBallonCandidates } from "@/lib/ballon";
import BallonCalculator from "./BallonCalculator";

export const revalidate = 1800; // 30분 ISR — LeagueLeader 매일 갱신이라 충분.

export const metadata: Metadata = {
  title: "발롱도르 지수 계산기 | Scorebase",
  description:
    "골·도움·리그 난이도·선수 평점·팀 성적·월드컵 성적을 가중치로 조절해 실시간으로 2026 발롱도르 후보 순위를 계산합니다. 스탯 기반 지수.",
  alternates: { canonical: "https://www.scorebase.kr/ballon" },
};

export default async function BallonPage() {
  const candidates = await buildBallonCandidates(40);
  // 서버에서 KST 문자열로 고정 (hydration mismatch 회피).
  const updatedAt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">발롱도르 지수 계산기</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          가중치를 조절해 2026 발롱도르 후보 순위를 직접 계산해 보세요. 골·도움에 리그 난이도 계수를
          곱하고 선수 평점·팀 성적·월드컵 성적을 더한 스탯 기반 지수입니다.
        </p>
        <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
          기준일 {updatedAt} · 후보 {candidates.length}명 (리그 득점·도움 리더 기반)
        </p>
      </header>

      <BallonCalculator candidates={candidates} />

      <section className="mt-8 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-4 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        <p className="font-semibold text-neutral-600 dark:text-neutral-300 mb-1">지수 산정 방식과 한계</p>
        <p>
          후보는 24개 리그와 월드컵의 득점·도움 리더에서 추출합니다. 실제 발롱도르는 우승·국제대회·정성적
          임팩트를 종합하지만, 이 지수는 공개 스탯만으로 근사하므로 득점·도움에 크게 기여하지 않는 수비수·골키퍼는
          후보에서 빠질 수 있습니다. 참고용 지표로 봐 주세요.
        </p>
      </section>
    </main>
  );
}
