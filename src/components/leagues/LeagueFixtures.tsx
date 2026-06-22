// 리그 일정·결과 — 리그 페이지 "일정" 탭 콘텐츠. 최근 10일 + 향후 14일 매치를 날짜별로.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { fifaFlag, isNationalTeamLeague } from "@/lib/sports/fifa-rankings";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function kstParts(d: Date) {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return {
    dateKey: `${k.getUTCFullYear()}-${k.getUTCMonth() + 1}-${k.getUTCDate()}`,
    label: `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${DAYS[k.getUTCDay()]})`,
    time: `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`,
  };
}

export default async function LeagueFixtures({ league }: { league: string }) {
  const now = new Date();
  // 타이트한 날짜창 대신 "최근 결과 + 다음 일정" — 시즌 사이·휴식기에도 유용하게.
  const sel = {
    id: true,
    externalId: true,
    startTime: true,
    status: true,
    homeScore: true,
    awayScore: true,
    homeTeam: { select: { name: true } },
    awayTeam: { select: { name: true } },
  } as const;
  const [recent, upcoming] = await Promise.all([
    prisma.match.findMany({ where: { league, status: "FINISHED" }, orderBy: { startTime: "desc" }, take: 18, select: sel }),
    prisma.match.findMany({
      where: { league, status: { in: ["SCHEDULED", "LIVE"] }, startTime: { gte: new Date(now.getTime() - 86400_000) } },
      orderBy: { startTime: "asc" },
      take: 18,
      select: sel,
    }),
  ]);
  const matches = [...recent.reverse(), ...upcoming]; // 과거(오름차순) → 미래
  const showFlag = isNationalTeamLeague(league); // 국가대항(월드컵 등)만 국기 표시

  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
        표시할 일정이 없습니다. 경기가 가까워지면 자동으로 채워집니다.
      </div>
    );
  }

  // 날짜별 그룹 (KST)
  const groups: { label: string; matches: typeof matches }[] = [];
  let curKey = "";
  for (const m of matches) {
    const { dateKey, label } = kstParts(m.startTime);
    if (dateKey !== curKey) {
      groups.push({ label, matches: [] });
      curKey = dateKey;
    }
    groups[groups.length - 1].matches.push(m);
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <h3 className="text-xs font-bold text-neutral-500 mb-1.5 px-1">{g.label}</h3>
          <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] divide-y divide-neutral-100 dark:divide-neutral-800/70 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            {g.matches.map((m) => {
              const h = toKoreanTeamName(m.homeTeam.name, league);
              const a = toKoreanTeamName(m.awayTeam.name, league);
              const hFlag = showFlag ? fifaFlag(m.homeTeam.name, h) : "";
              const aFlag = showFlag ? fifaFlag(m.awayTeam.name, a) : "";
              const live = m.status === "LIVE";
              const done = m.status === "FINISHED";
              const center = live || done ? `${m.homeScore ?? 0} - ${m.awayScore ?? 0}` : "vs";
              const right = live ? "🔴 LIVE" : done ? "종료" : kstParts(m.startTime).time;
              const inner = (
                <span className="flex items-center gap-2 text-sm px-3 py-2.5">
                  <span className="flex-1 flex items-center justify-end gap-1.5 min-w-0 font-medium">
                    <span className="truncate">{h}</span>
                    {hFlag && <span className="shrink-0" aria-hidden>{hFlag}</span>}
                  </span>
                  <span className={`w-14 text-center tabular-nums font-bold shrink-0 ${live ? "text-rose-600 dark:text-rose-400" : done ? "" : "text-neutral-400 font-normal"}`}>
                    {center}
                  </span>
                  <span className="flex-1 flex items-center gap-1.5 min-w-0 font-medium">
                    {aFlag && <span className="shrink-0" aria-hidden>{aFlag}</span>}
                    <span className="truncate">{a}</span>
                  </span>
                  <span className={`ml-auto text-xs tabular-nums whitespace-nowrap shrink-0 ${live ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-neutral-400"}`}>
                    {right}
                  </span>
                </span>
              );
              return m.externalId ? (
                <Link key={m.id} href={`/live/${league}/${m.externalId}`} prefetch={false} className="block hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition">
                  {inner}
                </Link>
              ) : (
                <div key={m.id}>{inner}</div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-neutral-400">한국시간 · 최근 결과 + 다음 일정</p>
    </div>
  );
}
