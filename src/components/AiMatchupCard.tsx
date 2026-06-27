// 매치 페이지 AI 예측 대결 카드 — 이 경기에 대한 우리 모델 vs GPT-5.5 의 1X2 픽을 나란히.
// 데이터 = Match.aiPredictions (없으면 렌더 안 함). 종료 경기는 적중/실패 배지도 표시.
import Link from "next/link";
import { Check, X, Sparkles } from "lucide-react";

type Winner = "HOME" | "DRAW" | "AWAY";

export interface AiMatchupPrediction {
  model: string;
  pick: string;
  prob: number;
  reason: string | null;
  correct: boolean | null;
}

const LABEL: Record<string, { name: string; dot: string; text: string }> = {
  scorebase: { name: "스코어베이스 AI", dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  "gpt-5.5": { name: "GPT-5.5", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
};

function pickLabel(pick: string, home: string, away: string): string {
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  return "무승부";
}

export default function AiMatchupCard({
  homeKo,
  awayKo,
  predictions,
}: {
  homeKo: string;
  awayKo: string;
  predictions: AiMatchupPrediction[];
}) {
  const sb = predictions.find((p) => p.model === "scorebase");
  const gpt = predictions.find((p) => p.model === "gpt-5.5");
  if (!sb || !gpt) return null;

  const graded = sb.correct !== null && gpt.correct !== null;

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-white">
          <Sparkles className="h-4 w-4 text-rose-500" aria-hidden /> AI 예측 대결
        </h3>
        <Link
          href="/predictions/scorecard"
          className="text-[12px] font-medium text-rose-600 underline-offset-2 hover:underline dark:text-rose-400"
        >
          전체 성적표 →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[sb, gpt].map((p) => {
          const meta = LABEL[p.model] ?? { name: p.model, dot: "bg-zinc-400", text: "text-zinc-600" };
          return (
            <div
              key={p.model}
              className="rounded-xl bg-zinc-50 p-3.5 ring-1 ring-zinc-100 dark:bg-white/[0.03] dark:ring-white/[0.06]"
            >
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500 dark:text-white/50">
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden /> {meta.name}
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-[15px] font-bold text-zinc-900 dark:text-white">
                  {pickLabel(p.pick, homeKo, awayKo)}
                </span>
                <span className={`text-[13px] font-semibold tabular-nums ${meta.text}`}>
                  {(p.prob * 100).toFixed(0)}%
                </span>
                {graded && (
                  <span
                    className={`ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full ${
                      p.correct
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                        : "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
                    }`}
                  >
                    {p.correct ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                  </span>
                )}
              </div>
              {p.reason && (
                <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-zinc-400 dark:text-white/35">
                  {p.reason}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-zinc-400 dark:text-white/30">
        두 AI가 경기 전 제출한 1X2 픽. GPT-5.5는 우리 모델 수치를 보지 않고 독립 예측합니다.
      </p>
    </section>
  );
}
