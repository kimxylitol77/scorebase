// 전술 리뷰 본문 도식 — 두 팀의 경기 방식을 가운데 축에서 좌우로 뻗는 막대로 나란히 비교한다.
// 값은 insights.ts 가 계산한 것만 쓴다. 막대 길이는 두 팀 합 대비 비율이라 "누가 더 많이 했나"가 한눈에 보인다.
import type { TeamStyle } from "@/lib/tactical/insights";

interface Row {
  label: string;
  home: number | null;
  away: number | null;
  unit?: string;
  /** 백분율 지표 — 막대를 0~100 눈금으로 그린다 */
  percent?: boolean;
}

const HOME = "#2563eb";
const AWAY = "#dc2626";

function rowsOf(h: TeamStyle, a: TeamStyle): Row[] {
  return [
    { label: "점유율", home: h.possession, away: a.possession, unit: "%", percent: true },
    { label: "패스 성공률", home: h.passAcc, away: a.passAcc, unit: "%", percent: true },
    { label: "롱볼 비중", home: h.longBallShare, away: a.longBallShare, unit: "%" },
    { label: "크로스", home: h.crosses, away: a.crosses },
    { label: "키패스", home: h.keyPasses, away: a.keyPasses },
    { label: "박스 안 슈팅", home: h.shotsInBox, away: a.shotsInBox },
    { label: "빅찬스", home: h.bigChances, away: a.bigChances },
    { label: "경합 승률", home: h.duelWinPct, away: a.duelWinPct, unit: "%", percent: true },
    { label: "태클+가로채기", home: h.defActions, away: a.defActions },
    { label: "클리어", home: h.clearances, away: a.clearances },
  ].filter((r) => r.home != null && r.away != null && (r.home > 0 || r.away > 0));
}

export default function TacticalStyleBars({ home, away, style }: { home: string; away: string; style: { home: TeamStyle; away: TeamStyle } }) {
  const rows = rowsOf(style.home, style.away);
  if (rows.length === 0) return null;
  return (
    <figure className="not-prose my-6 overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
      <figcaption className="mb-3 flex items-center justify-between text-[13px] font-bold">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-zinc-900 dark:text-white">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: HOME }} aria-hidden />
          <span className="truncate">{home}</span>
        </span>
        <span className="shrink-0 px-2 text-[11px] font-medium text-zinc-400">경기 방식 비교</span>
        <span className="inline-flex min-w-0 items-center gap-1.5 text-zinc-900 dark:text-white">
          <span className="truncate">{away}</span>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: AWAY }} aria-hidden />
        </span>
      </figcaption>
      <ul className="space-y-2">
        {rows.map((r) => {
          const h = r.home ?? 0;
          const a = r.away ?? 0;
          const max = r.percent ? 100 : Math.max(h, a, 1);
          const lead = h === a ? null : h > a ? "home" : "away";
          return (
            <li key={r.label} className="grid grid-cols-[2.6rem_1fr_5.5rem_1fr_2.6rem] items-center gap-1.5 text-[12px] tabular-nums sm:grid-cols-[3rem_1fr_6.5rem_1fr_3rem]">
              <span className={`text-right ${lead === "home" ? "font-bold text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-white/50"}`}>
                {h}
                {r.unit}
              </span>
              <span className="flex h-2 justify-end overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                <span className="h-full rounded-full" style={{ width: `${(h / max) * 100}%`, background: HOME, opacity: lead === "away" ? 0.45 : 1 }} />
              </span>
              <span className="truncate text-center text-[11px] text-zinc-600 dark:text-white/60">{r.label}</span>
              <span className="flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                <span className="h-full rounded-full" style={{ width: `${(a / max) * 100}%`, background: AWAY, opacity: lead === "home" ? 0.45 : 1 }} />
              </span>
              <span className={lead === "away" ? "font-bold text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-white/50"}>
                {a}
                {r.unit}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
