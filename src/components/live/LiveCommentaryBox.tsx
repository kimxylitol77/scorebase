// 🤖 Ollama (Mac mini, Qwen 2.5 14B) 가 생성한 매치 상황 코멘터리 박스.
// matchSummary 가 없으면 null 반환 — 사이트에 미표시 (안전한 점진 노출).
//
// variant:
//   - "default": 라이브 페이지 어디든 사용 가능한 풀 박스 (border + padding).
//   - "inline":  다이아몬드 옆 등 기존 컨테이너 안에 끼워 넣는 가벼운 텍스트 블록.
//
// 데이터 source: prisma.LiveCommentary (matchId PK).
// 갱신 주기: Mac mini match-narrator worker (~5분).

import type { ReactElement } from "react";

export interface LiveCommentaryData {
  matchSummary: string | null;
  summaryAt: Date | string | null;
  scoreSnapshot: string | null;
}

interface Props extends LiveCommentaryData {
  variant?: "default" | "inline";
}

function timeAgoKo(at: Date | string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const diff = Math.max(0, Date.now() - date.getTime());
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}초 전`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  return `${hr}시간 전`;
}

export default function LiveCommentaryBox({
  matchSummary,
  summaryAt,
  scoreSnapshot,
  variant = "default",
}: Props): ReactElement | null {
  if (!matchSummary?.trim()) return null;

  const meta = (
    <div className="text-[10px] sm:text-xs text-neutral-500 flex items-center gap-1.5 flex-wrap">
      <span className="font-semibold">🤖 AI 코멘터리</span>
      {scoreSnapshot && <span className="text-neutral-600">· {scoreSnapshot}</span>}
      {summaryAt && (
        <span className="text-neutral-600 ml-auto">{timeAgoKo(summaryAt)}</span>
      )}
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="flex-1 min-w-0 max-w-md">
        {meta}
        <p className="mt-1 text-xs sm:text-sm text-neutral-300 leading-relaxed">
          {matchSummary}
        </p>
      </div>
    );
  }

  // default
  return (
    <div
      className="rounded-xl p-3 sm:p-4"
      style={{
        background: "rgba(255,255,255,.02)",
        border: "1px solid rgba(255,255,255,.06)",
      }}
    >
      {meta}
      <p className="mt-2 text-sm text-neutral-200 leading-relaxed">{matchSummary}</p>
    </div>
  );
}
