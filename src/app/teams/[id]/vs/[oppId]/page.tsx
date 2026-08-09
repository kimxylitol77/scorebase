// 두 팀 상대전적(H2H) 페이지 — 축적된 Match 데이터의 역대 맞대결 열람 (위키형 데이터 축적 2단계).
// 리그·컵 구분 없이 두 팀이 맞붙은 모든 경기를 집계한다. 진입: 팀 페이지 "다가오는 경기" 상대전적 링크.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import TeamBadge from "@/components/TeamBadge";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 300;

// ISR — 빌드 프리렌더 0건, 요청 온 팀쌍만 생성 후 캐시.
export function generateStaticParams() {
  return [] as { id: string; oppId: string }[];
}

interface Props {
  params: Promise<{ id: string; oppId: string }>;
}

async function loadTeams(idRaw: string, oppRaw: string) {
  const aId = Number(idRaw);
  const bId = Number(oppRaw);
  if (!Number.isInteger(aId) || !Number.isInteger(bId) || aId === bId) return null;
  const [a, b] = await Promise.all([
    prisma.team.findUnique({ where: { id: aId }, select: { id: true, name: true, league: true, logoUrl: true } }),
    prisma.team.findUnique({ where: { id: bId }, select: { id: true, name: true, league: true, logoUrl: true } }),
  ]);
  if (!a || !b) return null;
  return { a, b };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, oppId } = await params;
  const t = await loadTeams(id, oppId);
  if (!t) return { title: "상대전적 | Scorebase" };
  const aKo = toKoreanTeamName(t.a.name, t.a.league);
  const bKo = toKoreanTeamName(t.b.name, t.b.league);
  const title = `${aKo} vs ${bKo} 상대전적 · 역대 맞대결`;
  // A vs B / B vs A 중복 콘텐츠 — 작은 id 순서를 canonical 로 고정
  const [lo, hi] = t.a.id < t.b.id ? [t.a.id, t.b.id] : [t.b.id, t.a.id];
  return {
    title,
    description: `${aKo}와 ${bKo}의 역대 맞대결 전적·최근 경기 결과·다가오는 일정을 데이터로 정리했습니다.`,
    alternates: { canonical: `${SITE_URL}/teams/${lo}/vs/${hi}` },
  };
}

export default async function HeadToHeadPage({ params }: Props) {
  const { id, oppId } = await params;
  const t = await loadTeams(id, oppId);
  if (!t) notFound();
  const { a, b } = t;
  const aKo = toKoreanTeamName(a.name, a.league);
  const bKo = toKoreanTeamName(b.name, b.league);

  const pairWhere = {
    OR: [
      { homeTeamId: a.id, awayTeamId: b.id },
      { homeTeamId: b.id, awayTeamId: a.id },
    ],
  };
  const [finished, upcoming] = await Promise.all([
    prisma.match.findMany({
      where: { ...pairWhere, status: "FINISHED" },
      orderBy: { startTime: "desc" },
      take: 100,
      select: { id: true, league: true, externalId: true, startTime: true, homeTeamId: true, homeScore: true, awayScore: true },
    }),
    prisma.match.findMany({
      where: { ...pairWhere, status: "SCHEDULED" },
      orderBy: { startTime: "asc" },
      take: 3,
      select: { id: true, league: true, startTime: true, homeTeamId: true },
    }),
  ]);
  if (finished.length === 0 && upcoming.length === 0) notFound();

  // 전적 집계 (a 기준) + 대회별 분해
  let aWins = 0, draws = 0, bWins = 0, aGoals = 0, bGoals = 0;
  const byLeague = new Map<string, { n: number; aW: number; d: number; bW: number }>();
  for (const m of finished) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const aIsHome = m.homeTeamId === a.id;
    const ag = aIsHome ? m.homeScore : m.awayScore;
    const bg = aIsHome ? m.awayScore : m.homeScore;
    aGoals += ag;
    bGoals += bg;
    let lg = byLeague.get(m.league);
    if (!lg) { lg = { n: 0, aW: 0, d: 0, bW: 0 }; byLeague.set(m.league, lg); }
    lg.n++;
    if (ag > bg) { aWins++; lg.aW++; }
    else if (ag < bg) { bWins++; lg.bW++; }
    else { draws++; lg.d++; }
  }
  const total = aWins + draws + bWins;
  const leagueRows = [...byLeague.entries()].sort((x, y) => y[1].n - x[1].n);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" });

  const TeamHead = ({ team, ko }: { team: typeof a; ko: string }) => (
    <Link href={`/teams/${team.id}`} className="flex flex-col items-center gap-2 min-w-0 hover:opacity-80 transition">
      <TeamBadge logoUrl={team.logoUrl} size={64} className="bg-white rounded-xl" />
      <span className="font-black text-lg text-center break-keep">{ko}</span>
    </Link>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* 헤더 */}
      <header className="space-y-4">
        <p className="text-xs text-neutral-500">
          <Link href={`/teams/${a.id}`} className="hover:underline">← {aKo} 팀 페이지</Link>
        </p>
        <div className="grid grid-cols-3 items-center gap-2">
          <TeamHead team={a} ko={aKo} />
          <div className="text-center">
            <div className="text-xs text-neutral-400 font-bold tracking-wider">상대전적</div>
            <div className="text-3xl font-black tabular-nums mt-1">
              {aWins} <span className="text-neutral-400 text-xl">-</span> {draws} <span className="text-neutral-400 text-xl">-</span> {bWins}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">승 - 무 - 승 · 총 {total}경기</div>
          </div>
          <TeamHead team={b} ko={bKo} />
        </div>
        {/* 승패 비율 바 */}
        {total > 0 && (
          <div className="flex h-2 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800">
            <div className="bg-emerald-500" style={{ width: `${(aWins / total) * 100}%` }} />
            <div className="bg-neutral-400 dark:bg-neutral-600" style={{ width: `${(draws / total) * 100}%` }} />
            <div className="bg-rose-500" style={{ width: `${(bWins / total) * 100}%` }} />
          </div>
        )}
        {total > 0 && (
          <p className="text-xs text-neutral-500 text-center tabular-nums">
            득점 {aKo} {aGoals} : {bGoals} {bKo}
          </p>
        )}
      </header>

      {/* 다가오는 맞대결 */}
      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">다가오는 맞대결</h2>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
            {upcoming.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="text-xs text-neutral-500 tabular-nums w-24">{fmtDate(m.startTime)}</span>
                <span className="text-xs text-neutral-400">{LEAGUE_DISPLAY[m.league] ?? m.league}</span>
                <span className="ml-auto text-xs text-neutral-500">
                  {m.homeTeamId === a.id ? `${aKo} 홈` : `${bKo} 홈`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 대회별 전적 */}
      {leagueRows.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">대회별 전적</h2>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-neutral-400">
                  <th className="px-4 py-2 text-left font-medium">대회</th>
                  <th className="px-2 py-2 text-right font-medium">경기</th>
                  <th className="px-2 py-2 text-right font-medium">{aKo} 승</th>
                  <th className="px-2 py-2 text-right font-medium">무</th>
                  <th className="px-4 py-2 text-right font-medium">{bKo} 승</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {leagueRows.map(([lg, r]) => (
                  <tr key={lg}>
                    <td className="px-4 py-2">{LEAGUE_DISPLAY[lg] ?? lg}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{r.n}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold">{r.aW}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{r.d}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold">{r.bW}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 역대 맞대결 */}
      {finished.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
            역대 맞대결 <span className="text-neutral-400 font-normal">({finished.length}경기)</span>
          </h2>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
            {finished.map((m) => {
              const aIsHome = m.homeTeamId === a.id;
              const homeKo = aIsHome ? aKo : bKo;
              const awayKo = aIsHome ? bKo : aKo;
              const hs = m.homeScore;
              const as_ = m.awayScore;
              const inner = (
                <>
                  <span className="text-xs text-neutral-500 tabular-nums w-24 shrink-0">{fmtDate(m.startTime)}</span>
                  <span className="text-[11px] text-neutral-400 w-24 truncate shrink-0 hidden sm:inline">{LEAGUE_DISPLAY[m.league] ?? m.league}</span>
                  <span className={`flex-1 text-right truncate ${hs != null && as_ != null && hs > as_ ? "font-bold" : "text-neutral-500"}`}>{homeKo}</span>
                  <span className="px-2 font-black tabular-nums shrink-0">
                    {hs ?? "-"} : {as_ ?? "-"}
                  </span>
                  <span className={`flex-1 truncate ${hs != null && as_ != null && as_ > hs ? "font-bold" : "text-neutral-500"}`}>{awayKo}</span>
                </>
              );
              const cls = "flex items-center gap-2 px-4 py-2.5 text-sm";
              return m.externalId ? (
                <Link key={m.id} href={`/live/${m.league}/${m.externalId}`} className={`${cls} transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04]`}>
                  {inner}
                </Link>
              ) : (
                <div key={m.id} className={cls}>{inner}</div>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-[11px] text-neutral-400">
        수집 개시(2025-06) 이후 경기 기준 자체 집계 · 리그·컵 대회를 모두 포함합니다.
      </p>
    </div>
  );
}
