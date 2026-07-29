"use client";
// 리그 일정 탭 — 라운드(matchweek) 선택 + 팀 필터 뷰. 라운드를 읽을 수 있는 리그에서만 쓰인다.
// 팀명·국기·로고는 서버가 미리 계산해 넘긴다(팀명 사전을 클라이언트 번들에 싣지 않기 위해).
import { useMemo, useState } from "react";
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 프리시즌 친선처럼 라운드가 없는 경기를 모아두는 가상 라운드 키. */
export const FRIENDLY_KEY = -1;

export interface FixtureRow {
  id: number;
  externalId: string;
  startTime: string; // ISO
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  round: number | null;
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  homeFlag: string;
  awayFlag: string;
  homeLogo: string | null;
  awayLogo: string | null;
  isFriendly: boolean;
}

function kstParts(iso: string) {
  const k = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return {
    dateKey: `${k.getUTCFullYear()}-${k.getUTCMonth() + 1}-${k.getUTCDate()}`,
    label: `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${DAYS[k.getUTCDay()]})`,
    time: `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function MatchRow({ m, league }: { m: FixtureRow; league: string }) {
  const linkLeague = m.isFriendly ? "CLUB_FRIENDLY" : league;
  const live = m.status === "LIVE";
  const done = m.status === "FINISHED";
  const center = live || done ? `${m.homeScore ?? 0} - ${m.awayScore ?? 0}` : "vs";
  const right = live ? "🔴 LIVE" : done ? "종료" : kstParts(m.startTime).time;
  const inner = (
    <span className="flex items-center gap-2 text-sm px-3 py-2.5">
      <span className="flex-1 flex items-center justify-end gap-1.5 min-w-0 font-medium">
        <span className="truncate">{m.homeName}</span>
        {m.homeFlag && <span className="shrink-0" aria-hidden>{m.homeFlag}</span>}
        <TeamBadge logoUrl={m.homeLogo} size={20} className="bg-white rounded-sm" />
      </span>
      <span
        className={`w-14 text-center tabular-nums font-bold shrink-0 ${
          live ? "text-rose-600 dark:text-rose-400" : done ? "" : "text-neutral-400 font-normal"
        }`}
      >
        {center}
      </span>
      <span className="flex-1 flex items-center gap-1.5 min-w-0 font-medium">
        {m.awayFlag && <span className="shrink-0" aria-hidden>{m.awayFlag}</span>}
        <TeamBadge logoUrl={m.awayLogo} size={20} className="bg-white rounded-sm" />
        <span className="truncate">{m.awayName}</span>
      </span>
      <span className="ml-auto flex items-center gap-1.5 shrink-0">
        {m.isFriendly && (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
            친선
          </span>
        )}
        <span
          className={`text-xs tabular-nums whitespace-nowrap ${
            live ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-neutral-400"
          }`}
        >
          {right}
        </span>
      </span>
    </span>
  );
  return m.externalId ? (
    <Link
      href={`/live/${linkLeague}/${m.externalId}`}
      prefetch={false}
      className="block hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition"
    >
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

function DateGroups({ rows, league }: { rows: FixtureRow[]; league: string }) {
  const groups: { label: string; matches: FixtureRow[] }[] = [];
  let cur = "";
  for (const m of rows) {
    const { dateKey, label } = kstParts(m.startTime);
    if (dateKey !== cur) {
      groups.push({ label, matches: [] });
      cur = dateKey;
    }
    groups[groups.length - 1].matches.push(m);
  }
  return (
    <div className="space-y-5">
      {groups.map((g, i) => (
        <div key={`${g.label}-${i}`}>
          <h3 className="text-xs font-bold text-neutral-500 mb-1.5 px-1">{g.label}</h3>
          <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] divide-y divide-neutral-100 dark:divide-neutral-800/70 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            {g.matches.map((m) => (
              <MatchRow key={m.id} m={m} league={league} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LeagueFixturesView({
  league,
  rows,
  rounds,
  initialRound,
  teams,
}: {
  league: string;
  rows: FixtureRow[];
  /** 오름차순 라운드 목록. 친선이 있으면 맨 앞에 FRIENDLY_KEY. */
  rounds: number[];
  initialRound: number;
  teams: { id: number; name: string }[];
}) {
  const [round, setRound] = useState(initialRound);
  const [teamId, setTeamId] = useState<number | null>(null);

  // 팀을 고르면 라운드를 건너뛰고 그 팀의 시즌 전체 일정을 보여준다 (공식 리그 사이트와 같은 동작).
  const shown = useMemo(() => {
    if (teamId != null) {
      return rows.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
    }
    return rows.filter((m) => (m.round ?? FRIENDLY_KEY) === round);
  }, [rows, round, teamId]);

  const idx = rounds.indexOf(round);
  const label = (r: number) => (r === FRIENDLY_KEY ? "친선" : `${r}R`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* 라운드 이동 — 팀 필터 중에는 의미가 없어 숨긴다 */}
        {teamId == null && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => idx > 0 && setRound(rounds[idx - 1])}
              disabled={idx <= 0}
              className="h-8 w-8 rounded-lg text-sm font-bold text-neutral-500 ring-1 ring-black/5 transition hover:bg-neutral-100 disabled:opacity-30 dark:ring-white/10 dark:hover:bg-white/10"
              aria-label="이전 라운드"
            >
              ‹
            </button>
            <select
              value={round}
              onChange={(e) => setRound(Number(e.target.value))}
              className="h-8 rounded-lg bg-white px-2 text-sm font-semibold ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10"
              aria-label="라운드 선택"
            >
              {rounds.map((r) => (
                <option key={r} value={r}>
                  {r === FRIENDLY_KEY ? "프리시즌 친선" : `${r}라운드`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => idx >= 0 && idx < rounds.length - 1 && setRound(rounds[idx + 1])}
              disabled={idx < 0 || idx >= rounds.length - 1}
              className="h-8 w-8 rounded-lg text-sm font-bold text-neutral-500 ring-1 ring-black/5 transition hover:bg-neutral-100 disabled:opacity-30 dark:ring-white/10 dark:hover:bg-white/10"
              aria-label="다음 라운드"
            >
              ›
            </button>
          </div>
        )}

        <select
          value={teamId ?? ""}
          onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}
          className="h-8 rounded-lg bg-white px-2 text-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10"
          aria-label="팀 선택"
        >
          <option value="">전체 팀</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {teamId != null && (
          <button
            type="button"
            onClick={() => setTeamId(null)}
            className="h-8 rounded-lg px-3 text-xs font-semibold text-neutral-500 ring-1 ring-black/5 transition hover:bg-neutral-100 dark:ring-white/10 dark:hover:bg-white/10"
          >
            팀 필터 해제
          </button>
        )}

        <span className="ml-auto text-xs text-neutral-400">
          {teamId != null ? `시즌 전체 ${shown.length}경기` : `${label(round)} ${shown.length}경기`}
        </span>
      </div>

      {/* 라운드 칩 — 넓은 화면에서 한눈에 건너뛰기 */}
      {teamId == null && rounds.length > 1 && (
        <div className="hidden sm:flex gap-1 overflow-x-auto pb-1">
          {rounds.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRound(r)}
              className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition ${
                r === round
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 ring-1 ring-black/5 hover:bg-neutral-100 dark:ring-white/10 dark:hover:bg-white/10"
              }`}
            >
              {label(r)}
            </button>
          ))}
        </div>
      )}

      {shown.length > 0 ? (
        <DateGroups rows={shown} league={league} />
      ) : (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500">
          표시할 경기가 없습니다.
        </div>
      )}
      <p className="text-[11px] text-neutral-400">한국시간 · 킥오프는 중계 편성에 따라 바뀔 수 있습니다.</p>
    </div>
  );
}
