"use client";
// 라이브 경기 현재 승리확률 + 전술 손익 — KBO 라이브 상세에 현재 base-out 상태로 자동 산출.
// 테이블 import 가 51K 라 BaseballLiveDetail 에서 dynamic import 로 KBO 일 때만 로드한다.
import {
  type WeTable,
  type GameState,
  lookupWe,
  afterBunt,
  stealStates,
  afterIbb,
  STEAL_SUCCESS,
} from "@/lib/predict/win-expectancy";
import weKbo from "../../../data/we-kbo.json";

const table = weKbo as unknown as WeTable;

function fmtDelta(v: number) {
  const p = v * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}`;
}
function deltaColor(v: number) {
  return v > 0.0005 ? "#34d399" : v < -0.0005 ? "#fb7185" : "#94a3b8";
}

export default function LiveWinProbability({
  bases,
  outs,
  inning,
  bottom,
  homeScore,
  awayScore,
  homeName,
  awayName,
}: {
  bases: string;
  outs: number;
  inning: number;
  bottom: boolean; // true=말(홈 공격)
  homeScore: number;
  awayScore: number;
  homeName: string;
  awayName: string;
}) {
  const safe = /^[01]{3}$/.test(bases) ? bases : "000";
  const battingName = bottom ? homeName : awayName;
  const diff = bottom ? homeScore - awayScore : awayScore - homeScore;
  const s: GameState = {
    inning, bottom, outs,
    b1: safe[0] === "1", b2: safe[1] === "1", b3: safe[2] === "1",
    diff,
  };
  const we = lookupWe(table, s);
  const pct = Math.round(we * 100);

  const bunt = afterBunt(s);
  const steal = stealStates(s);
  const ibb = afterIbb(s);
  const tactics = [
    bunt && { label: "번트", d: lookupWe(table, bunt) - we },
    steal && { label: "도루", d: STEAL_SUCCESS * lookupWe(table, steal.succ) + (1 - STEAL_SUCCESS) * lookupWe(table, steal.fail) - we },
    ibb && { label: "고의4구", d: lookupWe(table, ibb) - we },
  ].filter(Boolean) as { label: string; d: number }[];

  return (
    <div
      className="rounded-xl p-3 sm:p-4 w-full"
      style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] uppercase tracking-wider text-neutral-400">현재 승리확률</span>
        <span className="text-[10px] text-neutral-500">KBO 리그평균 기준</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-neutral-200 truncate max-w-[55%]">{battingName}</span>
        <span className="text-2xl font-bold tabular-nums text-white">{pct}%</span>
        <span className="text-[11px] text-neutral-500">공격 중</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full" style={{ background: "rgba(148,163,184,.18)" }}>
        <div style={{ width: `${pct}%`, background: "#f43f5e" }} />
      </div>
      {tactics.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-[10px] text-neutral-500">전술 손익(%p)</span>
          {tactics.map((t) => (
            <span key={t.label} className="text-xs text-neutral-300">
              {t.label}{" "}
              <span className="font-semibold tabular-nums" style={{ color: deltaColor(t.d) }}>{fmtDelta(t.d)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
