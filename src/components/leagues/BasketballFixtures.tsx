// 농구 리그(NBA/KBL/WKBL) 일정 탭 — 이번 시즌 위(펼침) + 지난 시즌 접기(기본 접힘).
// NBA 는 서머리그(league=NBA_SL)를 이번 시즌 상단에 함께 노출한다.
// 축구 LeagueFixtures 와 별개(농구 전용) — 국기 없음, 시즌 분리·접기 추가.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import TeamBadge from "@/components/TeamBadge";
import CollapsibleSection from "@/components/live/CollapsibleSection";
import {
  basketballSeasonLabelFromStart,
  basketballSeasonStartYear,
} from "@/lib/sports/basketball-season";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const PAST_SEASON_LIMIT = 120; // 지난 시즌은 최근 N경기까지만 (DOM 과부하 방지)

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
  league: true,
  externalId: true,
  startTime: true,
  status: true,
  homeScore: true,
  awayScore: true,
  homeTeam: { select: { name: true, logoUrl: true } },
  awayTeam: { select: { name: true, logoUrl: true } },
} as const;

type Row = {
  id: number;
  league: string;
  externalId: string;
  startTime: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { name: string; logoUrl: string | null };
  awayTeam: { name: string; logoUrl: string | null };
};

/** 날짜별 그룹 카드 렌더 (KST). displayLeague = 링크/팀명 정규화용 리그 코드. */
function renderGroups(matches: Row[], displayLeague: string) {
  const groups: { label: string; matches: Row[] }[] = [];
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
      {groups.map((g, gi) => (
        <div key={`${g.label}-${gi}`}>
          <h3 className="text-xs font-bold text-neutral-500 mb-1.5 px-1">{g.label}</h3>
          <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] divide-y divide-neutral-100 dark:divide-neutral-800/70 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            {g.matches.map((m) => {
              const isSummer = m.league === "NBA_SL";
              const h = toKoreanTeamName(m.homeTeam.name, displayLeague);
              const a = toKoreanTeamName(m.awayTeam.name, displayLeague);
              const live = m.status === "LIVE";
              const done = m.status === "FINISHED";
              const center = live || done ? `${m.homeScore ?? 0} - ${m.awayScore ?? 0}` : "vs";
              const right = live ? "🔴 LIVE" : done ? "종료" : kstParts(m.startTime).time;
              const inner = (
                <span className="flex items-center gap-2 text-sm px-3 py-2.5">
                  {isSummer && (
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                      서머
                    </span>
                  )}
                  <span className="flex-1 flex items-center justify-end gap-1.5 min-w-0 font-medium">
                    <span className="truncate">{h}</span>
                    <TeamBadge logoUrl={m.homeTeam.logoUrl} size={20} className="bg-white rounded-sm" />
                  </span>
                  <span className={`w-14 text-center tabular-nums font-bold shrink-0 ${live ? "text-rose-600 dark:text-rose-400" : done ? "" : "text-neutral-400 font-normal"}`}>
                    {center}
                  </span>
                  <span className="flex-1 flex items-center gap-1.5 min-w-0 font-medium">
                    <TeamBadge logoUrl={m.awayTeam.logoUrl} size={20} className="bg-white rounded-sm" />
                    <span className="truncate">{a}</span>
                  </span>
                  <span className={`ml-auto text-xs tabular-nums whitespace-nowrap shrink-0 ${live ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-neutral-400"}`}>
                    {right}
                  </span>
                </span>
              );
              // 서머리그는 전용 라이브 라우트가 없어 링크 미연결. 정규 경기만 상세로.
              return m.externalId && !isSummer ? (
                <Link key={m.id} href={`/live/${displayLeague.toLowerCase()}/${m.externalId}`} prefetch={false} className="block hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition">
                  {inner}
                </Link>
              ) : (
                <div key={m.id}>{inner}</div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function BasketballFixtures({ league }: { league: string }) {
  const leagues = league === "NBA" ? ["NBA", "NBA_SL"] : [league];
  const now = new Date();
  // 조회 상한 — 이번 + 과거 3시즌(약 4년). 오래된 아카이브까지 매 요청 fetch 하지 않도록.
  const floor = new Date(now.getTime() - 4 * 365 * 86400_000);
  const all = (await prisma.match.findMany({
    where: { league: { in: leagues }, startTime: { gte: floor } },
    orderBy: { startTime: "asc" },
    select: sel,
  })) as Row[];

  const currentStart = basketballSeasonStartYear(now);
  const currentLabel = basketballSeasonLabelFromStart(currentStart);

  // 시즌 시작연도별 그룹 (desc = 최신 먼저)
  const bySeason = new Map<number, Row[]>();
  for (const m of all) {
    const sy = basketballSeasonStartYear(m.startTime);
    if (!bySeason.has(sy)) bySeason.set(sy, []);
    bySeason.get(sy)!.push(m);
  }
  const seasonYears = [...bySeason.keys()].sort((x, y) => y - x);
  const pastYears = seasonYears.filter((y) => y < currentStart);

  const current = bySeason.get(currentStart) ?? [];

  return (
    <div className="space-y-6">
      {/* 이번 시즌 — 항상 상단, 펼침 */}
      <section>
        <div className="flex items-center gap-2 mb-2 px-1">
          <h2 className="text-sm font-black tracking-tight">{currentLabel} 시즌</h2>
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">이번 시즌</span>
        </div>
        {current.length > 0 ? (
          renderGroups(current, league)
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
            {currentLabel} 시즌 일정은 아직 공개되지 않았습니다. 개막이 가까워지면 자동으로 채워집니다.
          </div>
        )}
      </section>

      {/* 지난 시즌들 — 접힘 */}
      {pastYears.map((sy) => {
        const rows = (bySeason.get(sy) ?? [])
          .slice()
          .reverse() // 최근 경기 먼저
          .slice(0, PAST_SEASON_LIMIT);
        const label = basketballSeasonLabelFromStart(sy);
        return (
          <CollapsibleSection
            key={sy}
            title={`${label} 시즌`}
            hint={`지난 시즌 기록 · 최근 ${Math.min(rows.length, PAST_SEASON_LIMIT)}경기`}
            defaultOpen={false}
          >
            {renderGroups(rows, league)}
          </CollapsibleSection>
        );
      })}

      <p className="text-[11px] text-neutral-400">한국시간 · 시즌별 일정·결과</p>
    </div>
  );
}
