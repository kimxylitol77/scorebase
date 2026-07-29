// 리그 일정·결과 — 리그 페이지 "일정" 탭 콘텐츠.
// 라운드를 읽을 수 있는 리그(빅5 등)는 시즌 전체를 라운드별로 보여주고(LeagueFixturesView),
// 라운드 정보가 없는 리그(MLS·컵 등)는 기존대로 최근 결과 + 다음 일정 목록으로 보여준다.
// 어느 경로든 크로스소스 중복 매치는 dedupeFixtures 로 접어 카드가 두 장 뜨는 것을 막는다.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { fifaFlag, isNationalTeamLeague } from "@/lib/sports/fifa-rankings";
import { SOCCER_LEAGUES, NATIONAL_TEAM_LEAGUES } from "@/lib/sports/sport-leagues";
import { currentSeasonStart } from "@/lib/predict/season-window";
import { parseRound, dedupeFixtures, hasUsableRounds } from "@/lib/sports/fixture-rounds";
import TeamBadge from "@/components/TeamBadge";
import LeagueFixturesView, { FRIENDLY_KEY, type FixtureRow } from "./LeagueFixturesView";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function kstParts(d: Date) {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return {
    dateKey: `${k.getUTCFullYear()}-${k.getUTCMonth() + 1}-${k.getUTCDate()}`,
    label: `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${DAYS[k.getUTCDay()]})`,
    time: `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`,
  };
}

const sel = {
  id: true,
  externalId: true,
  startTime: true,
  status: true,
  homeScore: true,
  awayScore: true,
  homeTeamId: true,
  awayTeamId: true,
  raw: true,
  homeTeam: { select: { name: true, logoUrl: true } },
  awayTeam: { select: { name: true, logoUrl: true } },
} as const;

type MatchRow = {
  id: number;
  externalId: string;
  startTime: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: number;
  awayTeamId: number;
  raw: string | null;
  homeTeam: { name: string; logoUrl: string | null };
  awayTeam: { name: string; logoUrl: string | null };
};

type Prepared = MatchRow & { round: number | null; isApiFootball: boolean; isFriendly: boolean };

/** raw 파싱 + 친선 표시를 붙인다. dedupeFixtures 입력 형태. */
function prepare(rows: MatchRow[], isFriendly: boolean): Prepared[] {
  return rows.map((m) => ({
    ...m,
    round: isFriendly ? null : parseRound(m.raw),
    // af 원본은 최상위가 {"fixture":{...}} — 다른 소스 raw 안에 우연히 섞인 "fixture" 를
    // 잡지 않도록 시작 위치로 판별한다(fd 는 {"area":…}, ESPN 은 {"id":"4018…"}).
    isApiFootball: !!m.raw && /^\s*\{\s*"fixture"\s*:/.test(m.raw),
    isFriendly,
  }));
}

export default async function LeagueFixtures({ league }: { league: string }) {
  const now = new Date();
  const showFlag = isNationalTeamLeague(league); // 국가대항(월드컵 등)만 국기 표시
  // 프리시즌 클럽 친선 — 이 리그 소속 팀이 뛰는 CLUB_FRIENDLY 매치(친선은 팀이 도메스틱 리그 행 유지 →
  // 팀 id 조인). 클럽 소프트리그에만 노출(국가대항·친선 리그 자체 제외).
  const isClubSoccer =
    SOCCER_LEAGUES.has(league) && !NATIONAL_TEAM_LEAGUES.has(league) && league !== "CLUB_FRIENDLY";

  const loadFriendlies = async (since: Date) => {
    if (!isClubSoccer) return [];
    const teamIds = (
      await prisma.team.findMany({ where: { league }, select: { id: true } })
    ).map((t) => t.id);
    if (!teamIds.length) return [];
    return prisma.match.findMany({
      where: {
        league: "CLUB_FRIENDLY",
        startTime: { gte: since },
        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
      },
      orderBy: { startTime: "asc" },
      select: sel,
    });
  };

  // ── 라운드 경로 — 시즌 전체를 한 번에 읽어 라운드별로 나눈다.
  const seasonStart = currentSeasonStart(league);
  if (seasonStart) {
    const [seasonMatches, friendlyMatches] = await Promise.all([
      prisma.match.findMany({
        where: { league, startTime: { gte: seasonStart } },
        orderBy: { startTime: "asc" },
        select: sel,
      }),
      loadFriendlies(seasonStart),
    ]);
    const regular = dedupeFixtures(prepare(seasonMatches, false));
    if (hasUsableRounds(regular)) {
      const friendlies = dedupeFixtures(prepare(friendlyMatches, true));
      const all = [...friendlies, ...regular].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
      );
      const rows: FixtureRow[] = all.map((m) => {
        const h = toKoreanTeamName(m.homeTeam.name, league);
        const a = toKoreanTeamName(m.awayTeam.name, league);
        return {
          id: m.id,
          externalId: m.externalId,
          startTime: m.startTime.toISOString(),
          status: m.status,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          round: m.isFriendly ? FRIENDLY_KEY : m.round,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeName: h,
          awayName: a,
          homeFlag: showFlag ? fifaFlag(m.homeTeam.name, h) : "",
          awayFlag: showFlag ? fifaFlag(m.awayTeam.name, a) : "",
          homeLogo: showFlag ? null : m.homeTeam.logoUrl,
          awayLogo: showFlag ? null : m.awayTeam.logoUrl,
          isFriendly: m.isFriendly,
        };
      });

      const rounds = [...new Set(rows.map((r) => r.round ?? FRIENDLY_KEY))].sort((x, y) => x - y);
      // 기본 선택 = 아직 안 끝난 가장 이른 "정규" 경기의 라운드. 프리시즌 친선은 명시적으로 골라야
      // 보이게 둔다 — 개막 직전에 일정 탭을 열면 보고 싶은 건 개막 라운드다.
      const next = regular.find((m) => m.status !== "FINISHED" && m.startTime >= now);
      const lastRegular = rounds.filter((r) => r !== FRIENDLY_KEY).pop();
      const initialRound = next?.round ?? lastRegular ?? FRIENDLY_KEY;

      // 팀 필터 목록 — 이 시즌 정규 일정에 실제로 등장하는 팀만.
      const teamMap = new Map<number, string>();
      for (const m of regular) {
        teamMap.set(m.homeTeamId, toKoreanTeamName(m.homeTeam.name, league));
        teamMap.set(m.awayTeamId, toKoreanTeamName(m.awayTeam.name, league));
      }
      const teams = [...teamMap.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((x, y) => x.name.localeCompare(y.name, "ko"));

      return (
        <LeagueFixturesView
          league={league}
          rows={rows}
          rounds={rounds}
          initialRound={initialRound}
          teams={teams}
        />
      );
    }
  }

  // ── 폴백 경로 — 라운드를 못 읽는 리그(MLS·컵 등). 최근 결과 + 다음 일정.
  const [recent, upcoming, friendlyRows] = await Promise.all([
    prisma.match.findMany({
      where: { league, status: "FINISHED" },
      orderBy: { startTime: "desc" },
      take: 18,
      select: sel,
    }),
    prisma.match.findMany({
      where: {
        league,
        status: { in: ["SCHEDULED", "LIVE"] },
        startTime: { gte: new Date(now.getTime() - 86400_000) },
      },
      orderBy: { startTime: "asc" },
      take: 18,
      select: sel,
    }),
    loadFriendlies(new Date(now.getTime() - 3 * 86400_000)),
  ]);

  type Row = Prepared;
  const upcomingRows: Row[] = dedupeFixtures([
    ...prepare(upcoming, false),
    ...prepare(friendlyRows.slice(0, 12), true),
  ]);
  // 지난 경기 결과 = 기본 접힘(<details>), 최신순.
  const pastRows: Row[] = dedupeFixtures(prepare(recent, false)).reverse();

  if (upcomingRows.length === 0 && pastRows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
        표시할 일정이 없습니다. 경기가 가까워지면 자동으로 채워집니다.
      </div>
    );
  }

  // 날짜별 그룹 (KST)
  const groupByDate = (rows: Row[]) => {
    const g: { label: string; matches: Row[] }[] = [];
    let cur = "";
    for (const m of rows) {
      const { dateKey, label } = kstParts(m.startTime);
      if (dateKey !== cur) {
        g.push({ label, matches: [] });
        cur = dateKey;
      }
      g[g.length - 1].matches.push(m);
    }
    return g;
  };
  const upcomingGroups = groupByDate(upcomingRows);
  const pastGroups = groupByDate(pastRows);

  // 공통 매치 행 렌더 — 정규 일정 + 친선 동일 렌더. 친선은 우측에 "친선" 배지, 링크는 CLUB_FRIENDLY.
  const renderRow = (m: Row) => {
    const linkLeague = m.isFriendly ? "CLUB_FRIENDLY" : league;
    const h = toKoreanTeamName(m.homeTeam.name, league);
    const a = toKoreanTeamName(m.awayTeam.name, league);
    const hFlag = showFlag ? fifaFlag(m.homeTeam.name, h) : "";
    const aFlag = showFlag ? fifaFlag(m.awayTeam.name, a) : "";
    const hLogo = showFlag ? null : m.homeTeam.logoUrl; // 국가대항은 국기, 클럽리그는 로고
    const aLogo = showFlag ? null : m.awayTeam.logoUrl;
    const live = m.status === "LIVE";
    const done = m.status === "FINISHED";
    const center = live || done ? `${m.homeScore ?? 0} - ${m.awayScore ?? 0}` : "vs";
    const right = live ? "🔴 LIVE" : done ? "종료" : kstParts(m.startTime).time;
    const inner = (
      <span className="flex items-center gap-2 text-sm px-3 py-2.5">
        <span className="flex-1 flex items-center justify-end gap-1.5 min-w-0 font-medium">
          <span className="truncate">{h}</span>
          {hFlag && <span className="shrink-0" aria-hidden>{hFlag}</span>}
          <TeamBadge logoUrl={hLogo} size={20} className="bg-white rounded-sm" />
        </span>
        <span className={`w-14 text-center tabular-nums font-bold shrink-0 ${live ? "text-rose-600 dark:text-rose-400" : done ? "" : "text-neutral-400 font-normal"}`}>
          {center}
        </span>
        <span className="flex-1 flex items-center gap-1.5 min-w-0 font-medium">
          {aFlag && <span className="shrink-0" aria-hidden>{aFlag}</span>}
          <TeamBadge logoUrl={aLogo} size={20} className="bg-white rounded-sm" />
          <span className="truncate">{a}</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {m.isFriendly && (
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">친선</span>
          )}
          <span className={`text-xs tabular-nums whitespace-nowrap ${live ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-neutral-400"}`}>
            {right}
          </span>
        </span>
      </span>
    );
    return m.externalId ? (
      <Link key={m.id} href={`/live/${linkLeague}/${m.externalId}`} prefetch={false} className="block hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition">
        {inner}
      </Link>
    ) : (
      <div key={m.id}>{inner}</div>
    );
  };

  const renderGroup = (g: { label: string; matches: Row[] }) => (
    <div key={g.label}>
      <h3 className="text-xs font-bold text-neutral-500 mb-1.5 px-1">{g.label}</h3>
      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] divide-y divide-neutral-100 dark:divide-neutral-800/70 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        {g.matches.map((m) => renderRow(m))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {upcomingGroups.length > 0 ? (
        upcomingGroups.map(renderGroup)
      ) : (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500">
          다가오는 경기가 아직 없습니다. 일정이 확정되면 자동으로 채워집니다.
        </div>
      )}

      {/* 지난 시즌·최근 경기 결과 — 기본 접힘. 이번 시즌 일정을 위에 두고 과거는 접어 정리. */}
      {pastGroups.length > 0 && (
        <details className="group rounded-2xl bg-white/60 ring-1 ring-black/5 dark:bg-white/[0.02] dark:ring-white/10">
          <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 px-4 py-3 text-xs font-bold text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-300">
            <span className="text-[10px] transition group-open:rotate-90" aria-hidden>▶</span>
            지난 경기 결과 <span className="font-normal text-neutral-400">({pastRows.length})</span>
          </summary>
          <div className="space-y-5 px-2 pb-3">{pastGroups.map(renderGroup)}</div>
        </details>
      )}
      <p className="text-[11px] text-neutral-400">한국시간 · 다가오는 일정{friendlyRows.length > 0 ? " · 프리시즌 친선 포함" : ""}</p>
    </div>
  );
}
