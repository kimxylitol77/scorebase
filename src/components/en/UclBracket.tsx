// UclBracket (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import type {
  BracketSeries,
  UclRoundSlug,
} from "@/lib/predict/ucl-bracket";
import { ROUND_LABEL, ROUND_ORDER, groupByRound } from "@/lib/predict/ucl-bracket";
import { toEnglishTeamName } from "@/lib/i18n/en";

interface Props {
  series: BracketSeries[];
}

export default function UclBracket({ series }: Props) {
  const grouped = groupByRound(series);
  const totalSeries = ROUND_ORDER.reduce(
    (s, r) => s + grouped[r].length,
    0,
  );
  if (totalSeries === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-neutral-500 text-sm">
        No knockout matches yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <div className="px-4 sm:px-0 flex gap-3 sm:gap-4 min-w-max">
        {ROUND_ORDER.map((round) => (
          <BracketColumn
            key={round}
            round={round}
            list={grouped[round]}
          />
        ))}
      </div>
    </div>
  );
}

function BracketColumn({
  round,
  list,
}: {
  round: UclRoundSlug;
  list: BracketSeries[];
}) {
  const cardCount = list.length;
  return (
    <div className="flex flex-col min-w-[200px] sm:min-w-[230px]">
      <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-neutral-500 dark:text-neutral-400 mb-3 pl-1">
        {ROUND_LABEL[round]}{" "}
        <span className="text-neutral-400 dark:text-neutral-600">
          · {cardCount} matches
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-around gap-3">
        {list.length === 0 ? (
          <EmptySlot label={ROUND_LABEL[round]} />
        ) : (
          list.map((s) => <SeriesCard key={s.key} series={s} />)
        )}
      </div>
    </div>
  );
}

function EmptySlot({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-3 py-4 text-center text-xs text-neutral-400">
      {label} Draw pending
    </div>
  );
}

function SeriesCard({ series }: { series: BracketSeries }) {
  const t1Won = series.winnerTeamId === series.team1.id;
  const t2Won = series.winnerTeamId === series.team2.id;
  const agg = series.aggregate;
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 overflow-hidden text-sm">
      <TeamRow
        team={series.team1}
        won={t1Won}
        aggregate={agg?.team1}
        completed={series.completed}
        winnerDecided={!!series.winnerTeamId}
      />
      <div className="border-t border-neutral-100 dark:border-neutral-800" />
      <TeamRow
        team={series.team2}
        won={t2Won}
        aggregate={agg?.team2}
        completed={series.completed}
        winnerDecided={!!series.winnerTeamId}
      />
      <SeriesFooter series={series} />
    </div>
  );
}

function TeamRow({
  team,
  won,
  aggregate,
  completed,
  winnerDecided,
}: {
  team: { id: number; name: string; logoUrl: string | null };
  won: boolean;
  aggregate?: number;
  completed: boolean;
  winnerDecided: boolean;
}) {
  const dim = completed && winnerDecided && !won;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 ${
        won
          ? "bg-cyan-50 dark:bg-cyan-500/10"
          : ""
      }`}
    >
      {team.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={team.logoUrl}
          alt=""
          className={`w-5 h-5 object-contain shrink-0 ${dim ? "opacity-50" : ""}`}
          loading="lazy"
        />
      ) : (
        <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[9px] font-bold text-neutral-500">
          {team.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span
        className={`flex-1 truncate ${
          won
            ? "font-bold text-cyan-700 dark:text-cyan-300"
            : dim
              ? "text-neutral-400"
              : "font-medium"
        }`}
      >
        {toEnglishTeamName(team.name)}
      </span>
      <span
        className={`tabular-nums text-sm font-bold ${
          won
            ? "text-cyan-700 dark:text-cyan-300"
            : dim
              ? "text-neutral-400"
              : "text-neutral-700 dark:text-neutral-300"
        }`}
      >
        {aggregate ?? "—"}
      </span>
    </div>
  );
}

function SeriesFooter({ series }: { series: BracketSeries }) {
  if (series.legs.length === 0) return null;
  // 결승(1-leg) — 단순 스코어 한 줄
  if (series.round === "final") {
    const leg = series.legs[0];
    if (leg.status !== "FINISHED") {
      return (
        <div className="px-3 py-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
          {leg.startTime.toLocaleString("ko-KR", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Seoul",
          })}{" "}
          KST · final (single leg)
        </div>
      );
    }
    return null;
  }
  // 2-leg — 각 leg 스코어 표시
  return (
    <div className="px-3 py-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 space-y-0.5">
      {series.legs.map((leg, i) => {
        const label = leg.legLabel
          ? `${leg.legLabel === "1st" ? "1st leg" : "2nd leg"}`
          : `Leg ${i + 1}`;
        const isPending = leg.status !== "FINISHED";
        return (
          <div key={leg.matchId} className="flex justify-between gap-2">
            <span>{label}</span>
            <span className="tabular-nums">
              {isPending
                ? leg.startTime.toLocaleDateString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                  })
                : `${leg.homeScore ?? "-"} : ${leg.awayScore ?? "-"}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
