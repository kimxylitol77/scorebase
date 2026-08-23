// NbaPlayoffBracket (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import {
  ROUND_ORDER,
  getRoundLabel,
  groupByRound,
  type NbaPlayoffSeries,
  type NbaRound,
} from "@/lib/predict/nba-playoffs";
import { toEnglishTeamName } from "@/lib/i18n/en";

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
        No play-off matches yet.
      </div>
    );
  }
  const emoji = league === "NHL" ? "🏒" : "🏀";
  const title = league === "NHL" ? "NHL play-off bracket" : "NBA play-off bracket";
  // 파이널까지 끝난 브라켓 = 지난 시즌 아카이브 — "실시간" 표기는 오해 소지.
  const seasonDone =
    grouped.FINALS.length > 0 && grouped.FINALS.every((s) => s.completed);
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] p-4 sm:p-5">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span aria-hidden>{emoji}</span>
          <h3 className="font-bold text-sm sm:text-base">{title}</h3>
        </div>
        <span className="text-[10px] sm:text-[11px] text-neutral-500">
          BO7 · {seasonDone ? "Final result" : "Live"}
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
          <ConferenceGroup label="East" series={east} accent="blue" />
        )}
        {west.length > 0 && (
          <ConferenceGroup label="West" series={west} accent="rose" />
        )}
        {finals.length > 0 && (
          <ConferenceGroup label="Finals" series={finals} accent="amber" />
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
  // 실제 진행된 게임만 — 점수 있고 + 미실시(SCHEDULED/POSTPONED) 제외.
  // NHL 등은 미래·연기 경기도 0-0 점수가 들어와 브라켓에 phantom 0-0 으로 찍히던 버그.
  const playedGames = series.games.filter(
    (g) =>
      g.homeScore != null &&
      g.awayScore != null &&
      g.status !== "SCHEDULED" &&
      g.status !== "POSTPONED",
  );

  return (
    <details className="group rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
      <summary className="list-none cursor-pointer px-2.5 py-2 [&::-webkit-details-marker]:hidden">
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
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {series.summary ? (
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
              {series.summary}
            </span>
          ) : <span />}
          {playedGames.length > 0 && (
            <span className="text-[9px] text-neutral-400 group-open:hidden">
              Games ▾
            </span>
          )}
        </div>
      </summary>
      {playedGames.length > 0 && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 px-2.5 py-1.5 space-y-1">
          {playedGames.map((g, i) => (
            <GameRow
              key={i}
              game={g}
              team1Id={series.team1.id}
              team1Short={series.team1.shortName ?? series.team1.name}
              team2Short={series.team2.shortName ?? series.team2.name}
              gameNumber={i + 1}
            />
          ))}
        </div>
      )}
    </details>
  );
}

function GameRow({
  game,
  team1Id,
  team1Short,
  team2Short,
  gameNumber,
}: {
  game: NbaPlayoffSeries["games"][0];
  team1Id: number;
  team1Short: string;
  team2Short: string;
  gameNumber: number;
}) {
  // game.home/awayTeamId 가 team1 인지 team2 인지에 따라 매치업 표시
  const team1IsHome = game.homeTeamId === team1Id;
  const homeShort = team1IsHome ? team1Short : team2Short;
  const awayShort = team1IsHome ? team2Short : team1Short;
  // unstable_cache 직렬화로 Date 가 문자열이 될 수 있어 재파싱 (NHL=Date, NBA 캐시=string).
  const kst = new Date(new Date(game.date).getTime() + 9 * 3600 * 1000);
  const dateLabel = `${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;
  return (
    <div className="flex items-center justify-between text-[11px] tabular-nums text-neutral-600 dark:text-neutral-300">
      <span className="text-neutral-400 w-9 shrink-0">G{gameNumber}</span>
      <span className="text-neutral-500 w-12 shrink-0">{dateLabel}</span>
      <span className="flex-1 truncate text-center px-1">
        {awayShort} - {homeShort}
      </span>
      <span className="font-mono font-bold tabular-nums w-12 text-right shrink-0">
        {game.awayScore} - {game.homeScore}
      </span>
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
        {team.shortName || toEnglishTeamName(team.name)}
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
