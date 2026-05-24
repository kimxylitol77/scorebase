// NHL 경기 시작 전/후 골리 매치업 카드 — 사진 + GAA/Save%/W-L/SO.
// 데이터: DB Match.{home,away}Goalie JSON. /live/NHL/[gameId] 에서 사용.

import Link from "next/link";

export interface GoalieInfo {
  name: string;
  pid?: number | string | null;
  gaa?: number | null;
  savePctg?: number | null;
  wins?: number | null;
  losses?: number | null;
  gamesPlayed?: number | null;
  shutouts?: number | null;
  isBest?: boolean;
}

interface Props {
  homeGoalie: GoalieInfo | null;
  awayGoalie: GoalieInfo | null;
  homeTeamName: string;
  awayTeamName: string;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `.${Math.round(n * 1000)}`;
}

function nhlHeadshot(pid: number | string | null | undefined): string | null {
  if (pid == null || pid === "") return null;
  return `https://assets.nhle.com/mugs/nhl/latest/${pid}.png`;
}

export default function NhlGoalieInsight({
  homeGoalie,
  awayGoalie,
  homeTeamName,
  awayTeamName,
}: Props) {
  const homeBetterGaa =
    homeGoalie?.gaa != null &&
    awayGoalie?.gaa != null &&
    homeGoalie.gaa < awayGoalie.gaa;
  const awayBetterGaa =
    homeGoalie?.gaa != null &&
    awayGoalie?.gaa != null &&
    awayGoalie.gaa < homeGoalie.gaa;

  if (!homeGoalie && !awayGoalie) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 text-center text-sm text-neutral-500">
        선발 골리 정보가 아직 발표되지 않았습니다.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase text-neutral-500">
        <span>🥅</span>
        <span>오늘의 선발 골리 매치업</span>
        <span className="text-neutral-300 dark:text-neutral-700">·</span>
        <span className="text-[10px] font-medium normal-case tracking-normal text-neutral-400">
          NHL 공식
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <GoaliePanel
          goalie={awayGoalie}
          teamName={awayTeamName}
          side="원정"
          highlight={!!awayBetterGaa}
        />
        <GoaliePanel
          goalie={homeGoalie}
          teamName={homeTeamName}
          side="홈"
          highlight={!!homeBetterGaa}
        />
      </div>
      {(homeGoalie?.gaa != null || awayGoalie?.gaa != null) && (
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          ⓘ GAA(평균실점)는 낮을수록, Save%(세이브 성공률)는 높을수록 좋습니다.
        </p>
      )}
    </div>
  );
}

function GoaliePanel({
  goalie,
  teamName,
  side,
  highlight,
}: {
  goalie: GoalieInfo | null;
  teamName: string;
  side: "홈" | "원정";
  highlight: boolean;
}) {
  if (!goalie) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 px-3 py-3 text-sm">
        <div className="text-[11px] text-neutral-500">
          {side} · {teamName}
        </div>
        <div className="mt-1 text-neutral-400">선발 미정</div>
      </div>
    );
  }
  const photo = nhlHeadshot(goalie.pid);
  const href = goalie.pid != null ? `/players/${goalie.pid}?league=NHL` : null;
  const nameNode = href ? (
    <Link
      href={href}
      className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition"
    >
      {goalie.name}
    </Link>
  ) : (
    <>{goalie.name}</>
  );

  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        highlight
          ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/5"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-start gap-3">
        {photo && href ? (
          <Link href={href} className="shrink-0 hover:opacity-80 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={goalie.name}
              className="w-14 h-14 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900"
              loading="lazy"
            />
          </Link>
        ) : photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={goalie.name}
            className="w-14 h-14 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900 shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-base font-bold text-neutral-400 shrink-0">
            {goalie.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-neutral-500 truncate">
            {side} · {teamName}
          </div>
          <div className="mt-0.5 font-semibold tracking-tight truncate">
            {nameNode}
          </div>
          {(goalie.wins != null && goalie.losses != null) || goalie.gamesPlayed ? (
            <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
              {goalie.wins != null && goalie.losses != null && (
                <span className="tabular-nums">
                  {goalie.wins}승 {goalie.losses}패
                </span>
              )}
              {goalie.gamesPlayed != null && (
                <span className="tabular-nums">{goalie.gamesPlayed}경기</span>
              )}
              {goalie.shutouts != null && goalie.shutouts > 0 && (
                <span className="tabular-nums">SO {goalie.shutouts}</span>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {(goalie.gaa != null || goalie.savePctg != null) && (
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-center">
          <StatCell label="GAA" value={fmtNum(goalie.gaa, 2)} accent />
          <StatCell label="Save%" value={fmtPct(goalie.savePctg)} />
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded px-1.5 py-1 ${
        accent
          ? "bg-emerald-50 dark:bg-emerald-500/10"
          : "bg-neutral-50 dark:bg-neutral-900"
      }`}
    >
      <div className="text-[9px] uppercase tracking-wider text-neutral-400">
        {label}
      </div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}
