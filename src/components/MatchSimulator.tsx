"use client";

// 단일 경기 "직접 5,000번 돌려보기" 버튼 — 표시 확률로 주사위를 던져 수렴을 체감시키는
// "모델 속 열어보기" UI. 클릭마다 새 주사위(시드 없음), 결과는 /api/match-sim 에서 받는다.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface SimResponse {
  ok: boolean;
  n: number;
  used: { home: number; draw: number; away: number };
  outcomes: { home: number; draw: number; away: number };
  scores: { type: "score" | "margin"; top: { label: string; count: number }[] } | null;
  ou: { line: number; over: number } | null;
  omitted: "drift" | null;
}

interface Props {
  matchId: number;
  homeName: string;
  awayName: string;
  hideDraw: boolean;
}

const ANIM_MS = 1100;

export default function MatchSimulator({ matchId, homeName, awayName, hideDraw }: Props) {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<SimResponse | null>(null);
  const rafRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function run() {
    setPhase("running");
    setCount(0);
    setResult(null);
    const start = performance.now();
    const tick = (t: number) => {
      const el = t - start;
      setCount(Math.min(5000, Math.round((5000 * el) / ANIM_MS)));
      if (el < ANIM_MS) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    try {
      const res = await fetch(`/api/match-sim?matchId=${matchId}`);
      const j = (await res.json()) as SimResponse;
      if (!res.ok || !j.ok) throw new Error("sim failed");
      const wait = Math.max(0, ANIM_MS - (performance.now() - start));
      timerRef.current = setTimeout(() => {
        setCount(5000);
        setResult(j);
        setPhase("done");
      }, wait);
    } catch {
      cancelAnimationFrame(rafRef.current);
      setPhase("error");
    }
  }

  return (
    <div className="rounded-[1rem] bg-zinc-50 p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      {phase === "idle" && (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={run}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-white/80"
          >
            직접 5,000번 돌려보기
          </button>
          <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
            위에 표시된 모델 확률로 주사위를 5,000번 던져 승패가 어떻게 갈리는지 직접 확인합니다.
          </p>
        </div>
      )}

      {phase === "running" && (
        <div className="py-2 text-center">
          <div className="text-2xl font-black tabular-nums text-zinc-900 dark:text-white">
            {count.toLocaleString()} <span className="text-sm font-semibold text-zinc-400 dark:text-white/40">/ 5,000</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-white/45">주사위 굴리는 중</div>
        </div>
      )}

      {phase === "error" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-600 dark:text-white/55">시뮬 결과를 불러오지 못했습니다.</p>
          <button
            type="button"
            onClick={run}
            className="rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-800 transition hover:bg-zinc-300 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            다시 시도
          </button>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-4">
          <div className="space-y-2">
            <OutcomeBar
              label={`${homeName} 승`}
              count={result.outcomes.home}
              n={result.n}
              color="bg-blue-500"
            />
            {result.outcomes.draw > 0 && (
              <OutcomeBar
                label={hideDraw ? "연장 승부 구간" : "무승부"}
                count={result.outcomes.draw}
                n={result.n}
                color="bg-neutral-400"
              />
            )}
            <OutcomeBar
              label={`${awayName} 승`}
              count={result.outcomes.away}
              n={result.n}
              color="bg-rose-500"
            />
          </div>

          {result.scores && result.scores.top.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-white/45">
                가장 많이 나온 결과 TOP5
                {result.scores.type === "score" && (
                  <span className="ml-1.5 font-normal normal-case tracking-normal">(홈-원정 스코어)</span>
                )}
              </div>
              <div className="space-y-1">
                {result.scores.top.map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 truncate font-semibold tabular-nums text-zinc-700 dark:text-white/80">
                      {s.label}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-zinc-500 dark:bg-white/50"
                        style={{ width: `${Math.min(100, (s.count / Math.max(1, result.scores!.top[0].count)) * 100)}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right tabular-nums text-zinc-500 dark:text-white/45">
                      {s.count.toLocaleString()}회
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.ou && (
            <p className="text-xs text-zinc-600 dark:text-white/55">
              총 득점 {result.ou.line} 초과(OVER){" "}
              <span className="font-bold tabular-nums text-zinc-900 dark:text-white">
                {((result.ou.over / result.n) * 100).toFixed(1)}%
              </span>{" "}
              ({result.ou.over.toLocaleString()}/{result.n.toLocaleString()}회)
            </p>
          )}

          {result.omitted === "drift" && (
            <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
              이 경기는 스코어 엔진의 기대값이 표시 승률과 달라, 스코어 분포는 표시하지 않습니다.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-black/5 pt-3 dark:border-white/10">
            <button
              type="button"
              onClick={run}
              className="rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-800 transition hover:bg-zinc-300 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              다시 5,000번 돌려보기
            </button>
            <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
              시뮬 주사위는 이 페이지의 모델 확률로 만들어집니다. 실제 성적 검증은{" "}
              <Link href="/predictions/accuracy" className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-white/70">
                적중률 보드
              </Link>
              에서 확인하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function OutcomeBar({
  label,
  count,
  n,
  color,
}: {
  label: string;
  count: number;
  n: number;
  color: string;
}) {
  const pct = (count / n) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 truncate font-semibold text-zinc-700 dark:text-white/80">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right tabular-nums text-zinc-500 dark:text-white/45">
        <span className="font-bold text-zinc-900 dark:text-white">{pct.toFixed(1)}%</span> · {count.toLocaleString()}회
      </span>
    </div>
  );
}
