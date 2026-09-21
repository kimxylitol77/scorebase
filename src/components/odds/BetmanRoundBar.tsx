// 베트맨 회차 선택 바 — "발매중" + 최근 회차 칩. 링크만 있어 서버 컴포넌트.
// 한국 구매자는 회차 번호로 발매를 기억한다(와이즈토토·픽센터 모두 회차가 첫 축).

import Link from "next/link";
import type { BetmanRound } from "@/lib/odds/betman";

const chip = (active: boolean) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 transition ${
    active
      ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white"
      : "bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50 dark:bg-white/[0.04] dark:text-neutral-300 dark:ring-white/10 dark:hover:bg-white/[0.08]"
  }`;

/** @param current 선택된 회차(gmTs). null 이면 발매중 뷰 */
export default function BetmanRoundBar({ rounds, current }: { rounds: BetmanRound[]; current: number | null }) {
  if (rounds.length === 0) return null;
  return (
    <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="회차">
      <Link href="/odds?sport=betman" className={chip(current == null)}>
        발매중
      </Link>
      {rounds.map((r) => (
        <Link
          key={r.gmTs}
          href={`/odds?sport=betman&round=${r.gmTs}`}
          className={chip(current === r.gmTs)}
          title={`${r.label} · ${r.games}경기`}
        >
          {r.gmTs % 10000}회차
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              r.onSale ? "bg-emerald-500" : r.settled ? "bg-neutral-400 dark:bg-neutral-500" : "bg-amber-400"
            }`}
            aria-label={r.onSale ? "발매중" : r.settled ? "결과 확정" : "판정 진행"}
          />
        </Link>
      ))}
    </nav>
  );
}
