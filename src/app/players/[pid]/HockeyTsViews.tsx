// KHL 선수 상세 — 헤더(khl-players.json 프로필) + 2탭(개요=시즌 기록·리그 순위 / 경기별). 기록은 종료 경기 캐시 detailLive.players 집계.
// ts 시즌 선수 통계 API 가 미인가라 /hockey/stats 와 같은 집계(getTsHockeyStatsData)를 쓰고, 경기별은 소속 팀 경기 캐시에서 이 선수 행만 뽑는다.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { khlPlayerInfo, khlPlayerName, khlAge } from "@/lib/sports/khl-players";
import { getTsHockeyStatsData } from "@/lib/sports/hockey/stats-data";
import { toKoreanTeamName } from "@/lib/team-names";
import { matchLiveHref } from "@/lib/links/match-live-link";
import AmbientGlow from "@/components/AmbientGlow";
import ShareCardButton from "@/components/ShareCardButton";
import { ChevronLeft } from "lucide-react";
import PlayerTabs from "./PlayerTabs";

const POS_KO: Record<string, string> = { F: "포워드", D: "디펜스", G: "골리" };
const toi = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${accent ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30" : "bg-neutral-50 dark:bg-white/[0.04]"}`}>
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-neutral-400">{sub}</div>}
    </div>
  );
}
function Th({ children, left }: { children: ReactNode; left?: boolean }) {
  return <th className={`px-2.5 py-2 font-medium whitespace-nowrap ${left ? "text-left" : "text-right"}`}>{children}</th>;
}
function Td({ children, accent, muted, left }: { children: ReactNode; accent?: boolean; muted?: boolean; left?: boolean }) {
  return <td className={`px-2.5 py-2 tabular-nums whitespace-nowrap ${left ? "text-left" : "text-right"} ${accent ? "font-bold" : ""} ${muted ? "text-neutral-400" : ""}`}>{children}</td>;
}
const Card = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">{children}</div>
);

interface GameRow {
  externalId: string; date: Date; home: boolean; oppKo: string; our: number | null; opp: number | null;
  goalie: boolean; g: number; a: number; pm: number; sog: number; toi: number; saves: number; svPct: number | null;
}

/** 소속 팀의 이번 시즌 종료 경기 캐시에서 이 선수 행만 뽑는다 (이적 전 경기는 빠진다 — 시즌 합계는 리그 전체 집계라 포함). */
async function khlGameLog(pid: string, teamId: number, seasonStart: Date): Promise<GameRow[]> {
  const matches = await prisma.match.findMany({
    where: {
      league: "KHL", status: "FINISHED", startTime: { gte: seasonStart }, theSportsCache: { isNot: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: {
      externalId: true, startTime: true, homeTeamId: true, homeScore: true, awayScore: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
      theSportsCache: { select: { detailLive: true } },
    },
    orderBy: { startTime: "desc" },
  });
  type Row = { id: string; stats: Array<[number, number]> };
  const out: GameRow[] = [];
  for (const m of matches) {
    const dl = m.theSportsCache?.detailLive as { players?: { home?: Row[]; away?: Row[] } } | null;
    const home = m.homeTeamId === teamId;
    const r = (dl?.players?.[home ? "home" : "away"] ?? []).find((x) => x?.id === pid);
    if (!r || !Array.isArray(r.stats)) continue;
    const s = (k: number) => r.stats.find(([c]) => c === k)?.[1] ?? 0;
    const t = s(23);
    const goalie = s(20) === 1;
    if (goalie && t <= 0) continue; // 벤치 골리 — 출전 아님 (시즌 집계와 같은 규칙)
    const pctRaw = s(25);
    out.push({
      externalId: m.externalId, date: m.startTime, home,
      oppKo: toKoreanTeamName(home ? m.awayTeam.name : m.homeTeam.name, "KHL"),
      our: home ? m.homeScore : m.awayScore, opp: home ? m.awayScore : m.homeScore,
      goalie, g: s(26), a: s(27), pm: s(56), sog: s(28), toi: t, saves: s(24),
      svPct: pctRaw > 0 ? (pctRaw > 1 ? pctRaw / 100 : pctRaw) : null,
    });
  }
  return out;
}

export async function KhlPlayerView({ pid }: { pid: string }) {
  if (!/^[a-z0-9]{10,20}$/.test(pid)) notFound();
  const info = khlPlayerInfo(pid);
  const data = await getTsHockeyStatsData("KHL");
  const rows = data.rows.filter((r) => r.tsId === pid);
  if (!info && rows.length === 0) notFound();

  const name = info ? khlPlayerName(info) : pid;
  const skater = rows.find((r) => r.pos !== "G") ?? null;
  const goalieRow = rows.find((r) => r.pos === "G") ?? null;
  const isGoalie = info?.pos === "G" || (!skater && !!goalieRow);
  const team = info?.teamId
    ? await prisma.team.findUnique({ where: { id: info.teamId }, select: { id: true, name: true, logoUrl: true } })
    : null;
  const teamKo = team ? toKoreanTeamName(team.name, "KHL") : skater?.team ?? goalieRow?.team ?? "";
  const startYear = Number(data.seasonLabel.slice(0, 4));
  const games = team ? await khlGameLog(pid, team.id, new Date(Date.UTC(startYear, 7, 1))) : [];

  // 리그 순위 — 스케이터는 포인트·골·도움, 골리는 선방률(3경기 이상). 동률은 같은 순위.
  const rankOf = (pool: typeof data.rows, v: (r: (typeof data.rows)[number]) => number | null | undefined, mine: number | null | undefined) =>
    mine == null ? null : pool.filter((r) => (v(r) ?? -Infinity) > mine).length + 1;
  const skaters = data.rows.filter((r) => r.pos !== "G");
  const goalies = data.rows.filter((r) => r.pos === "G" && (r.gp ?? 0) >= 3);

  const age = khlAge(info?.birth);
  const facts: Array<[string, string]> = [
    ["포지션", POS_KO[info?.pos ?? ""] ?? "—"],
    ["신장 · 체중", [info?.height ? `${info.height}cm` : null, info?.weight ? `${info.weight}kg` : null].filter(Boolean).join(" · ") || "—"],
    ["생년월일", info?.birth ? `${info.birth.replace(/-/g, ".")}${age != null ? ` (${age}세)` : ""}` : "—"],
    ["국적", info?.natKo ?? info?.nat ?? "—"],
  ];

  const seasonNote = `${data.seasonLabel} 정규시즌 · 종료 경기 기록 집계 · 6시간마다 갱신`;
  const overview = (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500 break-keep">{seasonNote}</p>
      {skater || goalieRow ? (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500"><tr><Th left>부문</Th><Th>기록</Th><Th>리그 순위</Th></tr></thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {skater && (
                <>
                  <tr><Td left>포인트</Td><Td accent>{skater.points ?? 0}</Td><Td muted>{rankOf(skaters, (r) => r.points, skater.points)}위 / {skaters.length}명</Td></tr>
                  <tr><Td left>골</Td><Td accent>{skater.goals ?? 0}</Td><Td muted>{rankOf(skaters, (r) => r.goals, skater.goals)}위</Td></tr>
                  <tr><Td left>도움</Td><Td accent>{skater.assists ?? 0}</Td><Td muted>{rankOf(skaters, (r) => r.assists, skater.assists)}위</Td></tr>
                  <tr><Td left>+/-</Td><Td accent>{signed(skater.plusMinus ?? 0)}</Td><Td muted>{rankOf(skaters, (r) => r.plusMinus, skater.plusMinus)}위</Td></tr>
                  <tr><Td left>유효슛</Td><Td accent>{skater.shots ?? 0}</Td><Td muted>{rankOf(skaters, (r) => r.shots, skater.shots)}위</Td></tr>
                </>
              )}
              {goalieRow && (
                <>
                  <tr><Td left>선방률</Td><Td accent>{goalieRow.savePct != null ? goalieRow.savePct.toFixed(3) : "—"}</Td><Td muted>{(goalieRow.gp ?? 0) >= 3 ? `${rankOf(goalies, (r) => r.savePct, goalieRow.savePct)}위 / ${goalies.length}명` : "3경기 미만"}</Td></tr>
                  <tr><Td left>세이브</Td><Td accent>{goalieRow.saves ?? 0}</Td><Td muted>—</Td></tr>
                  <tr><Td left>경기당 실점</Td><Td accent>{goalieRow.gaa != null ? goalieRow.gaa.toFixed(2) : "—"}</Td><Td muted>—</Td></tr>
                </>
              )}
            </tbody>
          </table>
        </Card>
      ) : <p className="text-sm text-neutral-500">이번 시즌 출전 기록이 아직 없습니다.</p>}
      <p className="text-[11px] text-neutral-400 break-keep">ⓘ 공식 시즌 통계가 아니라 경기별 기록을 합산한 값이라 KHL 공식 수치와 조금 다를 수 있습니다. 출처 TheSports.</p>
    </div>
  );

  const gameLog = games.length === 0 ? <p className="text-sm text-neutral-500">{team ? `${teamKo} 소속으로 뛴 이번 시즌 경기 기록이 아직 없습니다.` : "소속 팀 정보가 없습니다."}</p> : (
    <Card>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <Th left>날짜</Th><Th left>상대</Th><Th>결과</Th>
            {isGoalie ? (<><Th>세이브</Th><Th>선방률</Th><Th>출전 시간</Th></>) : (<><Th>골</Th><Th>도움</Th><Th>+/-</Th><Th>유효슛</Th><Th>출전 시간</Th></>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
          {games.map((g) => {
            const res = g.our == null || g.opp == null ? "—" : `${g.our > g.opp ? "승" : "패"} ${g.our}-${g.opp}`;
            return (
              <tr key={g.externalId}>
                <Td left muted>{g.date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" })}</Td>
                <Td left><Link href={matchLiveHref("KHL", g.externalId)} className="hover:underline">{g.home ? "vs" : "@"} {g.oppKo}</Link></Td>
                <Td>{res}</Td>
                {isGoalie ? (
                  <><Td accent>{g.saves}</Td><Td>{g.svPct != null ? g.svPct.toFixed(3) : "—"}</Td><Td muted>{toi(g.toi)}</Td></>
                ) : (
                  <><Td accent={g.g > 0}>{g.g}</Td><Td accent={g.a > 0}>{g.a}</Td><Td muted>{signed(g.pm)}</Td><Td muted>{g.sog}</Td><Td muted>{toi(g.toi)}</Td></>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/hockey" className="hover:underline">하키</Link><span>›</span>
        <Link href="/leagues/KHL" className="hover:underline">KHL</Link>
        {team && (<><span>›</span><Link href={`/teams/${team.id}`} className="hover:underline">{teamKo}</Link></>)}
        <span>›</span><span className="text-neutral-700 dark:text-neutral-300">{name}</span>
      </nav>
      <header className="flex flex-wrap items-start gap-5">
        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-neutral-100 dark:bg-neutral-800 overflow-hidden ring-1 ring-black/5 dark:ring-white/10 shrink-0 flex items-center justify-center">
          {info?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={info.photo} alt={name} className="w-full h-full object-cover object-top" />
          ) : <span className="text-2xl font-bold text-neutral-400">{name.slice(0, 1)}</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/leagues/KHL" className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white"><ChevronLeft className="h-5 w-5" /></Link>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{name}</h1>
            {info?.no != null && <span className="text-lg font-bold text-neutral-400 tabular-nums">No.{info.no}</span>}
            <ShareCardButton />
          </div>
          {info?.ko && <p className="text-sm text-neutral-500">{info.en}</p>}
          <div className="text-sm text-neutral-500 flex items-center gap-2 flex-wrap">
            {team ? (
              <Link href={`/teams/${team.id}`} className="inline-flex items-center gap-1.5 font-semibold text-neutral-700 dark:text-neutral-200 hover:underline">
                {team.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logoUrl} alt="" className="w-5 h-5 object-contain" />
                )}
                {teamKo}
              </Link>
            ) : <span>{teamKo}</span>}
            <span>· KHL</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-neutral-50 dark:bg-white/[0.04] px-3 py-1.5">
                <div className="text-[10px] text-neutral-500">{k}</div>
                <div className="text-sm font-semibold break-keep">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </header>
      {skater && !isGoalie && (
        <section className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <Stat label={`${data.seasonLabel} 포인트`} value={String(skater.points ?? 0)} sub={`${skater.gp}경기`} accent />
          <Stat label="골" value={String(skater.goals ?? 0)} />
          <Stat label="도움" value={String(skater.assists ?? 0)} />
          <Stat label="+/-" value={signed(skater.plusMinus ?? 0)} />
          <Stat label="유효슛" value={String(skater.shots ?? 0)} sub={skater.shootingPct != null ? `슈팅 성공률 ${skater.shootingPct.toFixed(1)}%` : undefined} />
          <Stat label="평균 출전" value={toi((skater.toiPerGame ?? 0) * 60)} sub="분:초" />
        </section>
      )}
      {goalieRow && isGoalie && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label={`${data.seasonLabel} 선방률`} value={goalieRow.savePct != null ? goalieRow.savePct.toFixed(3) : "—"} sub={`${goalieRow.gp}경기`} accent />
          <Stat label="세이브" value={String(goalieRow.saves ?? 0)} sub={`피유효슛 ${goalieRow.shotsAgainst ?? 0}`} />
          <Stat label="경기당 실점" value={goalieRow.gaa != null ? goalieRow.gaa.toFixed(2) : "—"} />
          <Stat label="실점" value={String((goalieRow.shotsAgainst ?? 0) - (goalieRow.saves ?? 0))} />
        </section>
      )}
      <PlayerTabs
        tabs={[
          { key: "overview", label: "개요", content: overview },
          { key: "games", label: `경기별${games.length ? ` (${games.length})` : ""}`, content: gameLog },
        ]}
      />
    </div>
  );
}
