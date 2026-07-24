// 테니스 대회 드로우(대진표) — 라운드별 컬럼으로 이른 라운드 → 결승까지 좁혀지게 렌더.
// ESPN 무료 피드에 매치 연결 정보가 없어(바이로 2진 트리 불성립) 선 연결 대신 라운드 컬럼 방식.

import type { DrawMatch, DrawPlayer, DrawRound, TennisDraw } from "@/lib/sports/tennis-draw";

// 세트 스코어 셀 — 타이브레이크는 세트 패자(게임 적은 쪽)에만 위첨자로 표기 (7-6⁵ 관례).
function setCells(me: DrawPlayer, opp: DrawPlayer) {
  const n = Math.max(me.sets.length, opp.sets.length);
  const cells = [];
  for (let i = 0; i < n; i++) {
    const s = me.sets[i];
    const o = opp.sets[i];
    if (!s) {
      cells.push(<span key={i} className="w-4 text-center text-neutral-300 dark:text-neutral-600">·</span>);
      continue;
    }
    const lost = o != null && s.games < o.games; // 이 세트를 진 쪽
    const showTb = lost && s.tb != null;
    cells.push(
      <span key={i} className={`w-4 text-center tabular-nums ${me.winner ? "font-bold text-neutral-900 dark:text-white" : "text-neutral-500"}`}>
        {s.games}
        {showTb && <sup className="text-[8px] text-neutral-400">{s.tb}</sup>}
      </span>,
    );
  }
  return cells;
}

function PlayerLine({ p, opp }: { p: DrawPlayer; opp: DrawPlayer }) {
  return (
    <div className="flex items-center gap-1.5">
      {p.flag ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.flag} alt="" className="w-4 h-3 shrink-0 object-cover rounded-[1px]" />
      ) : (
        <span className="w-4 h-3 shrink-0 rounded-[1px] bg-neutral-200 dark:bg-neutral-700" />
      )}
      <span
        className={`flex-1 truncate text-[12px] ${
          p.tbd
            ? "text-neutral-400"
            : p.winner
              ? "font-bold text-neutral-900 dark:text-white"
              : "text-neutral-600 dark:text-neutral-400"
        } ${p.isKorean ? "!text-rose-600 dark:!text-rose-400 font-bold" : ""}`}
      >
        {p.name}
      </span>
      <span className="flex gap-0.5 shrink-0">{setCells(p, opp)}</span>
    </div>
  );
}

function MatchCard({ m, champion }: { m: DrawMatch; champion?: boolean }) {
  const korea = m.p1.isKorean || m.p2.isKorean;
  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 space-y-1 ${
        champion
          ? "border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/[0.08]"
          : korea
            ? "border-rose-200 bg-rose-50/40 dark:border-rose-500/30 dark:bg-rose-500/[0.06]"
            : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
      }`}
    >
      <PlayerLine p={m.p1} opp={m.p2} />
      <div className="h-px bg-neutral-100 dark:bg-neutral-800" />
      <PlayerLine p={m.p2} opp={m.p1} />
      {m.state === "in" && (
        <p className="text-[9px] font-semibold uppercase tracking-wider text-rose-500">LIVE</p>
      )}
    </div>
  );
}

function RoundColumn({ round, isFinal }: { round: DrawRound; isFinal: boolean }) {
  // 결승에서 승자가 있으면 챔피언 하이라이트
  const champMatch = isFinal ? round.matches.find((m) => m.p1.winner || m.p2.winner) : undefined;
  return (
    <div className="flex flex-col justify-center gap-2 min-w-[220px] shrink-0">
      <h3 className="sticky top-0 z-10 bg-neutral-100/90 dark:bg-neutral-900/90 backdrop-blur px-2 py-1 rounded-md text-center text-[11px] font-bold tracking-wide text-neutral-600 dark:text-neutral-300">
        {round.nameKo}
        <span className="ml-1 text-[10px] font-normal text-neutral-400">{round.matches.length}</span>
      </h3>
      {round.matches.map((m) => (
        <MatchCard key={m.id} m={m} champion={m === champMatch} />
      ))}
    </div>
  );
}

export default function TennisDraw({ draw }: { draw: TennisDraw }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-min">
        {draw.rounds.map((r, i) => (
          <RoundColumn key={r.name} round={r} isFinal={i === draw.rounds.length - 1} />
        ))}
      </div>
    </div>
  );
}
