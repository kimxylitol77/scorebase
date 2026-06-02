// 야구 라이브 페이지 "결론 3카드" — 명세 v2 §6. 페이지 최상단(스코어보드 위).
// ① AI 요약(우세팀+승률%+한줄평) ② AI 예측 결과(경기 전 기준, 종료 시 적중/빗나감) ③ 핵심 변수 TOP3.
// 승률은 단일소스(Match.pred* 스냅샷 = MatchInsight 와 동일값). 빗나간 예측도 투명 노출.

import type { ReactNode } from "react";

export interface ConclusionPred {
  favored: "home" | "draw" | "away"; // draw = 무승부(축구 등)
  pct: number; // 0~100, 캡 적용됨
  correct: boolean | null; // null=미채점, true/false=종료 후 채점
}

export interface KeyFactor {
  label: string;
  home: string;
  away: string;
  edge: "home" | "away" | "even";
}

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  pred: ConclusionPred | null;
  factors: KeyFactor[];
}

function confidencePhrase(pct: number): string {
  if (pct >= 70) return "데이터상 확실한 우세";
  if (pct >= 58) return "근소하지만 우세";
  return "박빙 — 변수에 주목";
}

export default function BaseballConclusionCards({
  homeNameKo,
  awayNameKo,
  status,
  pred,
  factors,
}: Props) {
  if (!pred && factors.length === 0) return null;
  const isFinished = status === "FINISHED";
  const favName =
    pred?.favored === "home" ? homeNameKo : pred?.favored === "draw" ? "무승부" : awayNameKo;
  const isDraw = pred?.favored === "draw";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* ① AI 요약 */}
      {pred && (
        <Card title="AI 요약">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-black tracking-tight truncate">{favName}</span>
            <span className="text-xs text-neutral-500">우세</span>
          </div>
          <div className="text-3xl font-black tabular-nums text-blue-600 dark:text-blue-400">
            {pred.pct}%
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {confidencePhrase(pred.pct)}
          </p>
        </Card>
      )}

      {/* ② AI 예측 결과 (경기 전 기준) */}
      {pred && (
        <Card title="AI 예측 결과">
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
            경기 전 기준
          </div>
          <div className="text-base font-bold tracking-tight truncate">
            {isDraw ? "무승부 예측" : `${favName} 승 예측`}
          </div>
          {isFinished && pred.correct != null ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                pred.correct
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
              }`}
            >
              {pred.correct ? "✓ 적중" : "✕ 빗나감"}
            </span>
          ) : (
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              경기 후 자동 채점
            </span>
          )}
        </Card>
      )}

      {/* ③ 핵심 변수 TOP3 */}
      {factors.length > 0 && (
        <Card title="핵심 변수">
          <div className="space-y-1.5 w-full">
            {factors.slice(0, 3).map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-neutral-500 dark:text-neutral-400 shrink-0">{f.label}</span>
                <span className="flex items-center gap-1 tabular-nums">
                  <span className={f.edge === "away" ? "font-bold text-blue-600 dark:text-blue-400" : "text-neutral-500"}>
                    {f.away}
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-600">·</span>
                  <span className={f.edge === "home" ? "font-bold text-rose-600 dark:text-rose-400" : "text-neutral-500"}>
                    {f.home}
                  </span>
                </span>
              </div>
            ))}
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 pt-0.5">
              {awayNameKo}(원정) · {homeNameKo}(홈)
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 flex flex-col gap-1.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-400 dark:text-neutral-500">
        {title}
      </div>
      {children}
    </div>
  );
}
