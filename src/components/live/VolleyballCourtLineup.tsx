// 배구 경기 상세 선발 라인업 — 양 팀 선발 6인 + 리베로를 코트 위(전위 OP·MB·OH / 후위 OH·MB·S)에 배치한다.
import type { LineupPlayer, LineupSlot, TeamLineup } from "@/lib/sports/kovo-lineup";

const FRONT: LineupSlot[] = ["OP", "MB1", "OH1"];
const BACK: LineupSlot[] = ["OH2", "MB2", "S"];
const POS_LABEL: Record<LineupSlot, string> = { OP: "OP", MB1: "MB", OH1: "OH", OH2: "OH", MB2: "MB", S: "S", L: "L" };

function kindLabel(t: TeamLineup): string {
  if (t.kind === "confirmed") return "실제 선발 (1세트)";
  if (t.kind === "lastGame" && t.basis) {
    const [, m, d] = t.basis.date.split("-");
    return `예상 · 직전 경기(${Number(m)}/${Number(d)} vs ${t.basis.opponent}) 선발`;
  }
  return "예상 · 지난 시즌 출전 세트 기준";
}

function Marker({ slot, p }: { slot: LineupSlot; p: LineupPlayer | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <span className="text-[10px] font-black tracking-wider text-amber-700/80 dark:text-amber-300/80">{POS_LABEL[slot]}</span>
      {p ? (
        p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-full bg-white object-cover object-top ring-2 ring-white dark:ring-neutral-800" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black text-neutral-700 ring-2 ring-white dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700">
            {p.backNumber ?? "-"}
          </span>
        )
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-amber-700/30 text-sm font-bold text-neutral-400 dark:border-amber-300/30">
          ?
        </span>
      )}
      <span className="max-w-full truncate whitespace-nowrap text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
        {p ? (
          <>
            <span className="mr-0.5 font-black text-amber-700 dark:text-amber-300">{p.backNumber}</span>
            {p.name}
            {p.captain && <span className="ml-0.5 text-[9px] text-neutral-500">(C)</span>}
          </>
        ) : (
          "미등록"
        )}
      </span>
    </div>
  );
}

function Court({ teamKo, t }: { teamKo: string; t: TeamLineup }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-bold">{teamKo}</span>
        <span className="text-[10px] text-neutral-500">{kindLabel(t)}</span>
      </div>
      <div className="relative overflow-hidden rounded-xl bg-amber-100/70 ring-1 ring-amber-900/10 dark:bg-amber-400/[0.08] dark:ring-amber-200/10">
        {/* 네트 */}
        <div className="h-1.5 bg-neutral-700/70 dark:bg-neutral-300/40" />
        <div className="grid grid-cols-3 gap-1 px-2 pb-3 pt-2">
          {FRONT.map((s) => <Marker key={s} slot={s} p={t.slots[s]} />)}
        </div>
        {/* 어택 라인 */}
        <div className="mx-2 border-t-2 border-dashed border-white/80 dark:border-white/20" />
        <div className="grid grid-cols-3 gap-1 px-2 pb-3 pt-2">
          {BACK.map((s) => <Marker key={s} slot={s} p={t.slots[s]} />)}
        </div>
      </div>
      <div className="mt-2 flex justify-center">
        <Marker slot="L" p={t.slots.L} />
      </div>
    </div>
  );
}

export default function VolleyballCourtLineup({
  home, away, homeKo, awayKo,
}: {
  home: TeamLineup; away: TeamLineup; homeKo: string; awayKo: string;
}) {
  const confirmed = home.kind === "confirmed" && away.kind === "confirmed";
  const hasEmpty = [home, away].some((t) => Object.values(t.slots).some((p) => p == null));
  return (
    <div className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
        {confirmed ? "선발 라인업" : "예상 선발 라인업"}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Court teamKo={homeKo} t={home} />
        <Court teamKo={awayKo} t={away} />
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-neutral-500">
        포지션별 배치이며 실제 로테이션 시작 위치와 다를 수 있습니다. 선발은 KOVO 경기 기록 기준
        {confirmed ? "입니다." : "으로 추정했고, 경기 당일 명단과 다를 수 있습니다."}
        {hasEmpty && " 빈 자리는 아직 KOVO 에 등록되지 않은 선수(외국인·아시아쿼터 등)입니다."}
      </p>
    </div>
  );
}
