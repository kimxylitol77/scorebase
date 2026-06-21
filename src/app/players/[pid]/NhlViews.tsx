// NHL 선수 상세 — 축구·야구·NBA 식 탭(개요/시즌기록/경기). NHL 공식 API(api-web.nhle.com).
// 스플릿은 landing 에 없어 NPB 처럼 3탭. 골리(G)·스케이터(F/D) 분기.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  fetchNhlPlayerLanding,
  fetchNhlPlayerGameLog,
  fetchGoalieGameLog,
  type NhlPlayerLanding,
  type NhlSeasonRow,
  type NhlPlayerGameLog,
  type NhlGoalieGameLog,
} from "@/lib/sports/nhl-api";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { ChevronLeft } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerTabs from "./PlayerTabs";
import NhlSeasonOverview from "./NhlSeasonOverview";

/* ---------- 공통 헬퍼 ---------- */

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${
        accent
          ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30"
          : "bg-neutral-50 dark:bg-white/[0.04]"
      }`}
    >
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

const numStr = (n: number | undefined): string => (n == null ? "—" : String(n));
const pct3 = (n: number | undefined): string => (n == null ? "—" : n.toFixed(3)); // SV% 0.912
const dec2 = (n: number | undefined): string => (n == null ? "—" : n.toFixed(2)); // GAA 2.45

type Tab = { key: string; label: string; content: ReactNode };
const tabsOf = (arr: (Tab | false | null | undefined)[]): Tab[] =>
  arr.filter((t): t is Tab => Boolean(t));

/* ---------- 시즌기록 탭 ---------- */

function Th({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <th className={`px-2.5 py-2 text-right font-medium whitespace-nowrap ${accent ? "text-blue-600 dark:text-blue-400" : ""}`}>
      {children}
    </th>
  );
}
function Td({ children, accent, muted }: { children: ReactNode; accent?: boolean; muted?: boolean }) {
  return (
    <td className={`px-2.5 py-2 text-right tabular-nums whitespace-nowrap ${accent ? "font-bold" : ""} ${muted ? "text-neutral-400" : ""}`}>
      {children}
    </td>
  );
}

type TeamInfo = { id: number; logo: string | null };

function TeamCell({ team, info }: { team: string; info?: TeamInfo }) {
  const ko = toKoreanTeamName(team) || team;
  const inner = (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {info?.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.logo} alt="" className="w-4 h-4 object-contain shrink-0" />
      )}
      <span className="truncate">{ko}</span>
    </span>
  );
  return info ? (
    <Link href={`/teams/${info.id}`} className="hover:text-neutral-900 dark:hover:text-white transition">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function NhlSeasonTable({ rows, isGoalie, teamMap }: { rows: NhlSeasonRow[]; isGoalie: boolean; teamMap: Map<string, TeamInfo> }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">시즌 기록이 없습니다.</p>;
  const ordered = rows.slice().reverse(); // 최신 시즌이 위로
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium sticky left-0 bg-neutral-50 dark:bg-white/[0.04]">시즌</th>
            <th className="px-2.5 py-2 text-left font-medium whitespace-nowrap">팀</th>
            <Th>GP</Th>
            {isGoalie ? (
              <>
                <Th>W</Th>
                <Th>L</Th>
                <Th>OT</Th>
                <Th accent>SV%</Th>
                <Th accent>GAA</Th>
                <Th>SHO</Th>
              </>
            ) : (
              <>
                <Th>G</Th>
                <Th>A</Th>
                <Th accent>PTS</Th>
                <Th>+/-</Th>
                <Th>PIM</Th>
                <Th>SOG</Th>
                <Th>TOI</Th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {ordered.map((r, i) => (
            <tr key={`${r.season}-${r.team}-${i}`}>
              <td className="px-3 py-2 text-left font-semibold tabular-nums sticky left-0 bg-white dark:bg-neutral-900">{r.label}</td>
              <td className="px-2.5 py-2 text-left text-xs text-neutral-500 whitespace-nowrap max-w-[160px]">
                <TeamCell team={r.team} info={teamMap.get(r.team)} />
              </td>
              <Td muted>{r.gp}</Td>
              {isGoalie ? (
                <>
                  <Td>{numStr(r.wins)}</Td>
                  <Td>{numStr(r.losses)}</Td>
                  <Td muted>{numStr(r.otLosses)}</Td>
                  <Td accent>{pct3(r.savePctg)}</Td>
                  <Td accent>{dec2(r.gaa)}</Td>
                  <Td muted>{numStr(r.shutouts)}</Td>
                </>
              ) : (
                <>
                  <Td>{r.goals}</Td>
                  <Td>{r.assists}</Td>
                  <Td accent>{r.points}</Td>
                  <Td muted>{r.plusMinus > 0 ? `+${r.plusMinus}` : r.plusMinus}</Td>
                  <Td muted>{r.pim}</Td>
                  <Td muted>{r.shots}</Td>
                  <Td muted>{r.toi || "—"}</Td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 경기 탭 ---------- */

function NhlSkaterGames({ games }: { games: NhlPlayerGameLog[] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">일자</th>
            <th className="text-left px-2 py-2 font-medium">상대</th>
            <th className="text-right px-2 py-2 font-medium">G</th>
            <th className="text-right px-2 py-2 font-medium">A</th>
            <th className="text-right px-2 py-2 font-medium">PTS</th>
            <th className="text-right px-2 py-2 font-medium">+/-</th>
            <th className="text-right px-2 py-2 font-medium">SOG</th>
            <th className="text-right px-3 py-2 font-medium">TOI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {games.map((g, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{g.gameDate}</td>
              <td className="px-2 py-2 truncate">
                {g.homeRoadFlag === "H" ? "vs " : "@ "}
                {g.opponentAbbrev}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{g.goals}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.assists}</td>
              <td className="px-2 py-2 text-right tabular-nums font-semibold">{g.points}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.plusMinus ?? "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.shots}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.toi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NhlGoalieGames({ games }: { games: NhlGoalieGameLog[] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">일자</th>
            <th className="text-left px-2 py-2 font-medium">상대</th>
            <th className="text-right px-2 py-2 font-medium">결과</th>
            <th className="text-right px-2 py-2 font-medium">SA</th>
            <th className="text-right px-2 py-2 font-medium">GA</th>
            <th className="text-right px-2 py-2 font-medium">SV</th>
            <th className="text-right px-2 py-2 font-medium">SV%</th>
            <th className="text-right px-3 py-2 font-medium">TOI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {games.map((g, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{g.date}</td>
              <td className="px-2 py-2 truncate">
                {g.isHome ? "vs " : "@ "}
                {g.opponent}
              </td>
              <td className="px-2 py-2 text-right">
                {g.decision ? (
                  <span
                    className={`inline-block w-5 text-center text-[10px] font-bold rounded ${
                      g.decision === "W"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                    }`}
                  >
                    {g.decision}
                  </span>
                ) : (
                  <span className="text-xs text-neutral-400">—</span>
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{g.shotsAgainst}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.goalsAgainst}</td>
              <td className="px-2 py-2 text-right tabular-nums font-semibold">{g.saves}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.savePctg != null ? g.savePctg.toFixed(3) : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.toi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
 * 메인 뷰
 * ==========================================================*/

function SkaterOverview({ profile, seasonStart }: { profile: NhlPlayerLanding; seasonStart: number }) {
  const c = profile.career;
  return (
    <>
      <NhlSeasonOverview profile={profile} seasonStart={seasonStart} />
      {c && c.gamesPlayed != null && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">통산 (career)</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="GP" value={numStr(c.gamesPlayed)} />
            <Stat label="G" value={numStr(c.goals)} accent />
            <Stat label="A" value={numStr(c.assists)} accent />
            <Stat label="PTS" value={numStr(c.points)} accent />
            <Stat label="+/-" value={numStr(c.plusMinus)} />
            <Stat label="SOG" value={numStr(c.shots)} />
          </div>
        </section>
      )}
    </>
  );
}

function GoalieOverview({ profile, seasonStart }: { profile: NhlPlayerLanding; seasonStart: number }) {
  const c = profile.career;
  return (
    <>
      <NhlSeasonOverview profile={profile} seasonStart={seasonStart} />
      {c && c.gamesPlayed != null && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">통산 (career)</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="GP" value={numStr(c.gamesPlayed)} />
            <Stat label="W" value={numStr(c.wins)} accent />
            <Stat label="L" value={numStr(c.losses)} />
            <Stat label="SV%" value={pct3(c.savePctg)} accent />
            <Stat label="GAA" value={dec2(c.goalsAgainstAvg)} accent />
            <Stat label="SHO" value={numStr(c.shutouts)} />
          </div>
        </section>
      )}
    </>
  );
}

export async function NhlPlayerView({ pid }: { pid: string }) {
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const profile = await fetchNhlPlayerLanding(id);
  if (!profile) notFound();

  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const seasonStart = m >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const seasonStr = `${seasonStart}${seasonStart + 1}`;
  const isGoalie = profile.position === "G";

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const nameKo = toKoreanPlayerName(fullName) || fullName;
  const teamKo = profile.teamFullName ? toKoreanTeamName(profile.teamFullName) || profile.teamFullName : "";
  const seasons = profile.seasons ?? [];
  const awards = profile.awards ?? [];
  // 시즌기록 팀 로고/링크 — DB NHL Team(영문 name 매칭)으로 logoUrl·팀페이지 id.
  const nhlTeams = seasons.length
    ? await prisma.team.findMany({ where: { league: "NHL" }, select: { id: true, name: true, logoUrl: true } })
    : [];
  const teamMap = new Map<string, TeamInfo>(nhlTeams.map((t) => [t.name, { id: t.id, logo: t.logoUrl }]));

  // 경기 탭 — 골리는 SV%·GAA 게임로그, 스케이터는 G·A·PTS.
  let gamesContent: ReactNode = null;
  if (isGoalie) {
    const g = await fetchGoalieGameLog(id, Number(seasonStr), 2);
    if (g.length > 0) gamesContent = <NhlGoalieGames games={g} />;
  } else {
    const g = await fetchNhlPlayerGameLog(id, seasonStr, 2, 10);
    if (g.length > 0) gamesContent = <NhlSkaterGames games={g} />;
  }

  const overview = (
    <>
      {isGoalie ? (
        <GoalieOverview profile={profile} seasonStart={seasonStart} />
      ) : (
        <SkaterOverview profile={profile} seasonStart={seasonStart} />
      )}
      {awards.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">수상 이력</h2>
          <div className="flex flex-wrap gap-2">
            {awards.map((a) => (
              <span
                key={a.name}
                className="px-2.5 py-1 rounded-md text-sm border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"
              >
                {a.name}
                {a.count > 1 ? ` ${a.count}회` : ""}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );

  return (
    <article className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />
      <header className="space-y-3">
        <Link
          href="/leagues/NHL"
          className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden /> NHL
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {profile.headshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.headshot}
              alt={nameKo}
              width={96}
              height={96}
              className="rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
          )}
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{nameKo}</h1>
              {profile.position && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {profile.position}
                </span>
              )}
              {profile.jerseyNumber != null && <span className="text-sm text-neutral-500">#{profile.jerseyNumber}</span>}
            </div>
            <div className="text-sm text-neutral-500">
              {teamKo ? `${teamKo} · ` : ""}
              {profile.shootsCatches ? `${profile.shootsCatches} · ` : ""}
              {profile.birthCountry ?? ""}
            </div>
            <div className="text-[11px] text-neutral-400">
              NHL 공식 API · {seasonStart}-{String(seasonStart + 1).slice(2)} 시즌
              {profile.draftYear ? ` · ${profile.draftYear} 드래프트 ${profile.draftOverall}순위` : ""}
            </div>
          </div>
        </div>
      </header>

      <PlayerTabs
        tabs={tabsOf([
          { key: "overview", label: "개요", content: overview },
          seasons.length > 0 && {
            key: "seasons",
            label: "시즌기록",
            content: <NhlSeasonTable rows={seasons} isGoalie={isGoalie} teamMap={teamMap} />,
          },
          gamesContent && {
            key: "games",
            label: "경기",
            content: gamesContent,
          },
        ])}
      />

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: NHL 공식 API (api-web.nhle.com) · 시즌별·통산·수상 포함.
      </p>
    </article>
  );
}
