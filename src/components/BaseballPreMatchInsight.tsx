// 야구 경기 시작 전 매치 인사이트 — 선발 투수 카드 (사진 + ERA/WHIP/K9/W-L/IP).
// /live/{kbo,npb,mlb}/[gameId] 의 BaseballLiveDetail 가 status === "PRE" 일 때 렌더.
// 데이터: DB Match.{home,away}Starter (이미 JSON parse 된 값 prop 으로 받음).

import Link from "next/link";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { mlbHeadshotUrl } from "@/lib/sports/mlb-stats-api";

export interface StarterInfo {
  name: string;
  pid?: number | string | null;
  era?: number | null;
  whip?: number | null;
  k9?: number | null;
  wins?: number | null;
  losses?: number | null;
  ip?: string | number | null;
  hand?: "L" | "R" | null;
}

interface Props {
  league: "KBO" | "NPB" | "MLB";
  homeStarter: StarterInfo | null;
  awayStarter: StarterInfo | null;
  homeTeamName: string;
  awayTeamName: string;
  /** 사진 URL (NPB 는 SSR 단에서 미리 fetch 해서 prop 으로 주입). KBO/MLB 는 pid 로 즉시 생성. */
  homeStarterPhoto?: string | null;
  awayStarterPhoto?: string | null;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function photoFor(
  league: "KBO" | "NPB" | "MLB",
  pid: number | string | null | undefined,
  override?: string | null,
): string | null {
  if (override) return override;
  if (pid == null || pid === "") return null;
  if (league === "KBO") return kboPhotoUrl(pid);
  if (league === "MLB") {
    const id = typeof pid === "string" ? Number(pid) : pid;
    if (Number.isFinite(id)) return mlbHeadshotUrl(id);
  }
  return null;
}

function playerHref(
  league: "KBO" | "NPB" | "MLB",
  pid: number | string | null | undefined,
): string | null {
  if (pid == null || pid === "") return null;
  if (league === "KBO") return `/players/${pid}?league=KBO`;
  if (league === "NPB") return `/players/${pid}?league=NPB`;
  return `/players/${pid}`; // MLB
}

export default function BaseballPreMatchInsight({
  league,
  homeStarter,
  awayStarter,
  homeTeamName,
  awayTeamName,
  homeStarterPhoto,
  awayStarterPhoto,
}: Props) {
  const homeBetterEra =
    homeStarter?.era != null &&
    awayStarter?.era != null &&
    homeStarter.era < awayStarter.era;
  const awayBetterEra =
    homeStarter?.era != null &&
    awayStarter?.era != null &&
    awayStarter.era < homeStarter.era;

  const sourceLabel =
    league === "KBO"
      ? "KBO 공식 · statiz"
      : league === "NPB"
        ? "NPB.jp 공식 예고선발"
        : "MLB Stats API";

  if (!homeStarter && !awayStarter) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 text-center text-sm text-neutral-500">
        선발 투수 정보가 아직 발표되지 않았습니다.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase text-neutral-500">
        <span>⚾</span>
        <span>오늘의 선발 매치업</span>
        <span className="text-neutral-300 dark:text-neutral-700">·</span>
        <span className="text-[10px] font-medium normal-case tracking-normal text-neutral-400">
          {sourceLabel}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StarterPanel
          starter={awayStarter}
          teamName={awayTeamName}
          side="원정"
          highlight={!!awayBetterEra}
          league={league}
          photo={photoFor(league, awayStarter?.pid, awayStarterPhoto)}
        />
        <StarterPanel
          starter={homeStarter}
          teamName={homeTeamName}
          side="홈"
          highlight={!!homeBetterEra}
          league={league}
          photo={photoFor(league, homeStarter?.pid, homeStarterPhoto)}
        />
      </div>
      {(homeStarter?.era != null || awayStarter?.era != null) && (
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          ⓘ ERA(평균자책점)·WHIP(이닝당 출루)는 낮을수록 좋고, K/9(9이닝당 삼진)는 높을수록 좋습니다.
        </p>
      )}
    </div>
  );
}

function StarterPanel({
  starter,
  teamName,
  side,
  highlight,
  league,
  photo,
}: {
  starter: StarterInfo | null;
  teamName: string;
  side: "홈" | "원정";
  highlight: boolean;
  league: "KBO" | "NPB" | "MLB";
  photo: string | null;
}) {
  if (!starter) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 px-3 py-3 text-sm">
        <div className="text-[11px] text-neutral-500">
          {side} · {teamName}
        </div>
        <div className="mt-1 text-neutral-400">선발 미정</div>
      </div>
    );
  }
  const handLabel =
    starter.hand === "L" ? "좌완" : starter.hand === "R" ? "우완" : "";
  const hasAnyStat =
    starter.era != null || starter.whip != null || starter.k9 != null;
  const href = playerHref(league, starter.pid);
  const nameNode = href ? (
    <Link
      href={href}
      className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition"
    >
      {starter.name}
    </Link>
  ) : (
    <>{starter.name}</>
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
        <PhotoBlock photo={photo} name={starter.name} href={href} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span className="truncate">
              {side} · {teamName}
            </span>
            {handLabel && <span className="shrink-0">{handLabel}</span>}
          </div>
          <div className="mt-0.5 font-semibold tracking-tight truncate">
            {nameNode}
          </div>
          {(starter.wins != null && starter.losses != null) || starter.ip ? (
            <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
              {starter.wins != null && starter.losses != null && (
                <span className="tabular-nums">
                  {starter.wins}승 {starter.losses}패
                </span>
              )}
              {starter.ip && (
                <span className="tabular-nums">{starter.ip}IP</span>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {hasAnyStat && (
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <StatCell label="ERA" value={fmtNum(starter.era, 2)} accent />
          <StatCell label="WHIP" value={fmtNum(starter.whip, 2)} />
          <StatCell label="K/9" value={fmtNum(starter.k9, 1)} />
        </div>
      )}
    </div>
  );
}

function PhotoBlock({
  photo,
  name,
  href,
}: {
  photo: string | null;
  name: string;
  href: string | null;
}) {
  const inner = photo ? (
    // KBO/MLB 사진은 hotlink OK. NPB 는 SSR fetch 결과 사용.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt={name}
      className="w-14 h-14 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900 shrink-0"
      loading="lazy"
    />
  ) : (
    <div className="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-base font-bold text-neutral-400 shrink-0">
      {name.slice(0, 1)}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="shrink-0 hover:opacity-80 transition">
        {inner}
      </Link>
    );
  }
  return inner;
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
