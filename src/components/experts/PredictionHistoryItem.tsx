import type { PredictionItem } from "@/lib/analysis/profile";
import { resultBadge } from "@/lib/analysis/pick-label";
import { listTime, kickoffLabel } from "@/lib/analysis/format";

// 예측 이력 1건 — 제목 · 리그/경기/스코어 · 내 픽 · 등록일/조회 + 결과 배지.
export default function PredictionHistoryItem({ item }: { item: PredictionItem }) {
  const rb = resultBadge(item.isCorrect);
  const finished = item.status === "FINISHED" && item.homeScore != null && item.awayScore != null;

  return (
    <li className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {item.title && <p className="font-bold text-sm mb-1.5 line-clamp-1">{item.title}</p>}

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
              {item.label}
            </span>
            {item.startTime && (
              <span className="text-[11px] text-neutral-400">{kickoffLabel(item.startTime)}</span>
            )}
          </div>

          <div className="mt-1 text-sm">
            <span className="font-medium">{item.home}</span>
            {finished ? (
              <span className="font-bold text-rose-500 mx-1.5">
                {item.homeScore}:{item.awayScore}
              </span>
            ) : (
              <span className="mx-1.5 text-neutral-400">vs</span>
            )}
            <span className="font-medium">{item.away}</span>
          </div>

          {item.pickText && (
            <div className="mt-1 text-xs text-neutral-500">
              내 픽:{" "}
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                {item.pickText}
              </span>
            </div>
          )}

          <div className="mt-1.5 text-[11px] text-neutral-400">
            {listTime(item.createdAt)} · 조회 {item.views}
          </div>
        </div>

        <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded ${rb.c}`}>{rb.t}</span>
      </div>
    </li>
  );
}
