"use client";
// 야구 상황별 승리확률 + 전술 손익 계산기 — WE 테이블 조회로 즉시 산출(라이브 연산 0).
import { useMemo, useState } from "react";
import {
  type WeTable,
  type GameState,
  lookupWe,
  afterBunt,
  stealStates,
  afterIbb,
  STEAL_SUCCESS,
} from "@/lib/predict/win-expectancy";

function pct(v: number) {
  return Math.round(v * 100);
}
function fmtDelta(v: number) {
  const p = v * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%p`;
}

function DeltaCard({ label, value, na }: { label: string; value?: number; na?: boolean }) {
  const color = na
    ? "text-zinc-400 dark:text-white/30"
    : value! > 0.0005
      ? "text-emerald-600 dark:text-emerald-400"
      : value! < -0.0005
        ? "text-rose-600 dark:text-rose-400"
        : "text-zinc-400 dark:text-white/30";
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2.5 dark:bg-white/[0.04]">
      <div className="text-xs text-zinc-500 dark:text-white/50 mb-1">{label}</div>
      <div className={`text-[17px] font-semibold tabular-nums ${color}`}>
        {na ? "—" : fmtDelta(value!)}
      </div>
    </div>
  );
}

export default function WinProbabilityTool({ table, leagueLabel }: { table: WeTable; leagueLabel: string }) {
  const [s, setS] = useState<GameState>({
    inning: 8, bottom: true, outs: 0, b1: true, b2: false, b3: false, diff: 0,
  });

  const we = useMemo(() => lookupWe(table, s), [table, s]);
  const strat = useMemo(() => {
    const bunt = afterBunt(s);
    const steal = stealStates(s);
    const ibb = afterIbb(s);
    return {
      bunt: bunt ? lookupWe(table, bunt) - we : null,
      steal: steal ? STEAL_SUCCESS * lookupWe(table, steal.succ) + (1 - STEAL_SUCCESS) * lookupWe(table, steal.fail) - we : null,
      ibb: ibb ? lookupWe(table, ibb) - we : null,
    };
  }, [table, s, we]);

  const bases = [s.b1 && "1루", s.b2 && "2루", s.b3 && "3루"].filter(Boolean) as string[];
  const diffTxt = s.diff === 0 ? "동점" : s.diff > 0 ? `${s.diff}점 앞` : `${-s.diff}점 뒤`;

  const segBtn = (active: boolean) =>
    `px-3 py-1.5 text-sm transition-colors ${
      active
        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
        : "text-zinc-500 dark:text-white/50 hover:bg-zinc-50 dark:hover:bg-white/[0.04]"
    }`;
  const togBtn = (active: boolean) =>
    `w-full py-2 text-sm rounded-lg border transition-colors ${
      active
        ? "border-rose-300 bg-rose-500/10 text-rose-600 dark:border-rose-400/40 dark:text-rose-400"
        : "border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-white/50 hover:border-zinc-300 dark:hover:border-white/20"
    }`;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      {/* WE 출력 */}
      <div className="text-center">
        <div className="text-xs text-zinc-500 dark:text-white/40">공격팀 승리확률</div>
        <div className="mt-1 text-5xl font-bold tabular-nums text-zinc-900 dark:text-white">{pct(we)}%</div>
        <div className="mt-1 text-xs text-zinc-500 dark:text-white/50">
          {s.inning}회{s.bottom ? "말" : "초"} · {diffTxt} · {s.outs}아웃 · {bases.length ? bases.join("·") : "주자 없음"}
        </div>
      </div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
        <div className="bg-rose-500 transition-all duration-300" style={{ width: `${pct(we)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-zinc-400 dark:text-white/30">
        <span>공격팀</span>
        <span>수비팀</span>
      </div>

      {/* 입력 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-xs text-zinc-500 dark:text-white/40">이닝</div>
          <div className="flex gap-2">
            <select
              value={s.inning}
              onChange={(e) => setS({ ...s, inning: Number(e.target.value) })}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            >
              {Array.from({ length: 9 }, (_, i) => i + 1).map((i) => (
                <option key={i} value={i}>{i}회</option>
              ))}
            </select>
            <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200 dark:border-white/10">
              <button className={segBtn(!s.bottom)} onClick={() => setS({ ...s, bottom: false })}>초</button>
              <button className={segBtn(s.bottom)} onClick={() => setS({ ...s, bottom: true })}>말</button>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs text-zinc-500 dark:text-white/40">점수차 (공격팀)</div>
          <div className="flex items-center gap-2">
            <button
              className="h-9 w-9 rounded-lg border border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-white/70"
              onClick={() => setS({ ...s, diff: Math.max(table.dmin, s.diff - 1) })}
              aria-label="점수차 감소"
            >−</button>
            <span className="min-w-[3rem] text-center text-base tabular-nums text-zinc-900 dark:text-white">{s.diff}</span>
            <button
              className="h-9 w-9 rounded-lg border border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-white/70"
              onClick={() => setS({ ...s, diff: Math.min(table.dmax, s.diff + 1) })}
              aria-label="점수차 증가"
            >+</button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs text-zinc-500 dark:text-white/40">아웃</div>
          <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200 dark:border-white/10">
            {[0, 1, 2].map((o) => (
              <button key={o} className={segBtn(s.outs === o)} onClick={() => setS({ ...s, outs: o })}>{o}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs text-zinc-500 dark:text-white/40">주자</div>
          <div className="grid grid-cols-3 gap-1.5">
            <button className={togBtn(s.b1)} onClick={() => setS({ ...s, b1: !s.b1 })}>1루</button>
            <button className={togBtn(s.b2)} onClick={() => setS({ ...s, b2: !s.b2 })}>2루</button>
            <button className={togBtn(s.b3)} onClick={() => setS({ ...s, b3: !s.b3 })}>3루</button>
          </div>
        </div>
      </div>

      {/* 전술 손익 */}
      <div className="mt-6 mb-2 text-xs text-zinc-500 dark:text-white/40">전술별 승리확률 변화 (강공 대비)</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-lg bg-zinc-50 px-3 py-2.5 dark:bg-white/[0.04]">
          <div className="text-xs text-zinc-500 dark:text-white/50 mb-1">강공</div>
          <div className="text-[17px] font-semibold text-zinc-400 dark:text-white/30">기준</div>
        </div>
        <DeltaCard label="보내기 번트" value={strat.bunt ?? undefined} na={strat.bunt == null} />
        <DeltaCard label="도루 (2루)" value={strat.steal ?? undefined} na={strat.steal == null} />
        <DeltaCard label="고의4구" value={strat.ibb ?? undefined} na={strat.ibb == null} />
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-zinc-400 dark:text-white/30">
        {leagueLabel} 리그 평균 기준 · 마르코프 모델 + 몬테카를로 {table.trials.toLocaleString()}회 시뮬로 산출.
        특정 투수·타자·구장은 미반영. 도루 ΔWE 는 성공률 {Math.round(STEAL_SUCCESS * 100)}% 가정.
      </p>
    </div>
  );
}
