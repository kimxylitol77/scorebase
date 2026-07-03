// 월드컵 이벤트 안내 배너 — 이벤트 기간에만 빌더·시즌리그·이적 상단 노출 (서버 컴포넌트)
import Link from "next/link";
import { wcEventActive } from "@/lib/dream-team/wc-event";

export default function WcEventBanner() {
  if (!wcEventActive()) return null;
  return (
    <Link
      href="/dream-team/fantasy"
      className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-rose-200/70 bg-gradient-to-r from-rose-50 to-amber-50 px-4 py-3 transition-colors hover:border-rose-300 dark:border-rose-500/25 dark:from-rose-500/10 dark:to-amber-500/10 dark:hover:border-rose-500/40"
    >
      <div className="min-w-0">
        <div className="text-sm font-bold text-rose-700 dark:text-rose-300">월드컵 이벤트 진행 중</div>
        <div className="mt-0.5 truncate text-xs text-neutral-600 dark:text-neutral-300">
          월드컵 활약 선수는 경기 전력 보너스 — 내 선발 11명의 실경기 판타지 포인트도 집계됩니다.
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">판타지 보기</span>
    </Link>
  );
}
