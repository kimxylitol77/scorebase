// NBA 플레이오프 브라켓 — 1라운드 → 컨퍼런스 세미 → 컨퍼런스 파이널 → NBA 파이널.
// 4 컬럼 트리. 동/서 컨퍼런스 분리.

import {
  ROUND_ORDER,
  getRoundLabel,
  groupByRound,
  type NbaPlayoffSeries,
  type NbaRound,
} from "@/lib/predict/nba-playoffs";
import { toKoreanTeamName } from "@/lib/team-names";

interface Props {
  series: NbaPlayoffSeries[];
  /** NBA / NHL — round 라벨 + 헤더 표시 분기 */
  league?: "NBA" | "NHL";
}

export default function NbaPlayoffBracket({ series, league = "NBA" }: Props) {
  const grouped = groupByRound(series);
  const total = ROUND_ORDER.reduce((s, r) => s + grouped[r].length, 0);
  const labels = getRoundLabel(league);
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-neutral-500 text-sm">
        플레이오프 매치가 아직 없습니다.
      </div>
    );
  }
  const emoji = league === "NHL" ? "🏒" : "🏀";
  const title = league === "NHL" ? "NHL 플레이오프 브라켓" : "NBA 플레이오프 브라켓";
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span aria-hidden>{emoji}</span>
          <h3 className="font-bold text-sm sm:text-base">{title}</h3>
        </div>
        <span className="text-[10px] sm:text-[11px] text-neutral-500">
          BO7 · ESPN 실시간
        </span>
      </header>

      <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-3 sm:gap-4 min-w-max">
          {ROUND_ORDER.map((round) => (
            <BracketColumn
              key={round}
              round={round}
              list={grouped[round]}
              labels={labels}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function BracketColumn({
  round,
  list,
  labels,
}: {
  round: NbaRound;
  list: NbaPlayoffSeries[];
  labels: Record<NbaRound, string>;
}) {
  // 컨퍼런스별 정렬 (East / West / null=Finals)
  const east = list.filter((s) => s.conference === "EAST");
  const west = list.filter((s) => s.conference === "WEST");
  const finals = list.filter((s) => s.conference === null);
  return (
    <div className="flex flex-col gap-2 w-[240px] sm:w-[260px] shrink-0">
      <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-500 text-center">
        {labels[round]}
      </div>
      <div className="flex flex-col gap-2">
        {east.length > 0 && (
          <ConferenceGroup label="동부" series={east} accent="blue" />
        )}
        {west.length > 0 && (
          <ConferenceGroup label="서부" series={west} accent="rose" />
        )}
        {finals.length > 0 && (
          <ConferenceGroup label="결승" series={finals} accent="amber" />
        )}
      </div>
    </div>
  );
}

function ConferenceGroup({
  label,
  series,
  accent,
}: {
  label: string;
  series: NbaPlayoffSeries[];
  accent: "blue" | "rose" | "amber";
}) {
  const accentText =
    accent === "blue"
      ? "text-blue-600 dark:text-blue-400"
      : accent === "rose"
        ? "text-rose-600 dark:text-rose-400"
        : "text-amber-600 dark:text-amber-400";
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`text-[10px] font-bold ${accentText}`}>{label}</div>
      {series.map((s, i) => (
        <SeriesCard key={i} series={s} />
      ))}
    </div>
  );
}

function SeriesCard({ series }: { series: NbaPlayoffSeries }) {
  const winner = series.completed
    ? series.team1.wins > series.team2.wins
      ? "team1"
      : "team2"
    : null;
  const leading = series.team1.wins > series.team2.wins
    ? "team1"
    : series.team2.wins > series.team1.wins
      ? "team2"
      : null;
  // BO7 → 4선승. 진행률 = max(wins) / 4
  const winsNeeded = Math.ceil(series.totalGames / 2);

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 px-2.5 py-2">
      <TeamRow
        team={series.team1}
        isWinner={winner === "team1"}
        isLeading={!winner && leading === "team1"}
        winsNeeded={winsNeeded}
      />
      <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-1.5" />
      <TeamRow
        team={series.team2}
        isWinner={winner === "team2"}
        isLeading={!winner && leading === "team2"}
        winsNeeded={winsNeeded}
      />
      {series.summary && (
        <div className="mt-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
          {series.summary}
        </div>
      )}
    </div>
  );
}

function TeamRow({
  team,
  isWinner,
  isLeading,
  winsNeeded,
}: {
  team: NbaPlayoffSeries["team1"];
  isWinner: boolean;
  isLeading: boolean;
  winsNeeded: number;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${
        isWinner
          ? "font-bold text-emerald-700 dark:text-emerald-400"
          : isLeading
            ? "font-semibold text-neutral-900 dark:text-white"
            : "text-neutral-600 dark:text-neutral-400"
      }`}
    >
      {team.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={team.logoUrl}
          alt=""
          className="w-5 h-5 object-contain shrink-0"
          loading="lazy"
        />
      )}
      <span className="text-xs truncate flex-1">
        {team.shortName || toKoreanTeamName(team.name)}
      </span>
      <span
        className={`text-xs tabular-nums font-mono shrink-0 ${
          team.wins >= winsNeeded ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
      >
        {team.wins}
      </span>
    </div>
  );
}
