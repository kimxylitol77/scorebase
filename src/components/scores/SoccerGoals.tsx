// 매치 카드 mini board 영역 — 축구 골 list.
// 좌(홈) / 우(원정) 2-컬럼 grid 시간 순. 각 골은 자기 side 에만 표시
// (다른 컬럼은 빈 cell). home 은 우측 정렬, away 는 좌측 정렬 — 점수 쪽으로 모임.

import type { SoccerGoal } from "@/lib/sports/live-scores";
import { toKoreanPlayerName } from "@/lib/player-names";

interface Props {
  goals: SoccerGoal[];
}

/** ESPN/api-football scorer 이름 한글화. 미등록은 영문 그대로. */
function localizeScorer(player: string | null | undefined): string {
  if (!player) return "—";
  const trimmed = player.trim();
  if (!trimmed) return "—";
  if (/[가-힣]/.test(trimmed)) return trimmed;
  return toKoreanPlayerName(trimmed) || trimmed;
}

function icon(g: SoccerGoal): string {
  if (g.ownGoal) return "🔁";
  if (g.penaltyKick) return "🎯";
  return "⚽";
}

function parseMinute(m: string): number {
  const mm = m.match(/(\d+)(?:\+(\d+))?/);
  if (!mm) return 0;
  // 추가시간 fractional — 전반 추가시간(45+5)이 후반(47) 앞에 오게 (합산=50 역전 버그).
  return parseInt(mm[1], 10) + (mm[2] ? parseInt(mm[2], 10) / 100 : 0);
}

export default function SoccerGoals({ goals }: Props) {
  if (!goals || goals.length === 0) return null;
  const sorted = [...goals].sort(
    (a, b) => parseMinute(a.minute) - parseMinute(b.minute),
  );

  return (
    <div className="px-3.5 sm:px-4 py-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {sorted.map((g, i) =>
        g.side === "home" ? (
          <div
            key={i}
            className="col-start-1 flex items-center justify-end gap-1.5 truncate"
          >
            <span className="font-medium truncate text-neutral-700 dark:text-neutral-300">
              {localizeScorer(g.player)}
            </span>
            {g.penaltyKick && (
              <span className="text-[10px] text-neutral-400">PK</span>
            )}
            {g.ownGoal && (
              <span className="text-[10px] text-neutral-400">자책</span>
            )}
            <span className="text-neutral-400 tabular-nums shrink-0">
              {g.minute}
            </span>
            <span aria-hidden className="shrink-0">
              {icon(g)}
            </span>
          </div>
        ) : (
          <div
            key={i}
            className="col-start-2 flex items-center justify-start gap-1.5 truncate"
          >
            <span aria-hidden className="shrink-0">
              {icon(g)}
            </span>
            <span className="text-neutral-400 tabular-nums shrink-0">
              {g.minute}
            </span>
            {g.penaltyKick && (
              <span className="text-[10px] text-neutral-400">PK</span>
            )}
            {g.ownGoal && (
              <span className="text-[10px] text-neutral-400">자책</span>
            )}
            <span className="font-medium truncate text-neutral-700 dark:text-neutral-300">
              {localizeScorer(g.player)}
            </span>
          </div>
        ),
      )}
    </div>
  );
}
