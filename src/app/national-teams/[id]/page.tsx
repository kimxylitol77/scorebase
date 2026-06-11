// 국가대표팀 페이지 — 월드컵 대비. ts team id 로 국가 통합(WORLD_CUP+INTL_FRIENDLY 등).
// 헤더(국기·FIFA랭킹·감독) + 최근 폼 + 다음 경기 + 스쿼드(라인업 누적).
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { fifaCountryKo, fifaFlag, getFifaRank } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import rawCoachNames from "../../../../data/coach-names.json";
import rawCoaches from "../../../../data/team-coaches.json";

export const dynamic = "force-dynamic";

const COACH_KO = rawCoachNames as Record<string, string>; // coachId → 한글명 (build-coach-names-haiku)
// 감독 스냅샷 (ts coach/list 정적 수집 — Vercel 은 ts 직접 호출 불가(IP whitelist)라 정적 json 사용)
// 키 = ts team id. 생성: scripts/build-team-coaches.ts (WC 국대 포함)
const COACHES = rawCoaches as Record<string, { id?: string; name: string; nameKo: string | null; logo: string | null; age: number | null; nationality: string | null; preferredFormation: string | null; joined: number | null; contractUntil: number | null }>;
const NATL = new Set(["WORLD_CUP", "WC_QUAL", "EURO_QUAL", "UEFA_NL", "AFCON", "CONCACAF_GOLD", "INTL_FRIENDLY", "U20_WC", "U17_WC", "OLYMPICS_FOOTBALL"]);
const POS_GROUPS: Array<[string, string]> = [["G", "골키퍼"], ["D", "수비수"], ["M", "미드필더"], ["F", "공격수"]];

interface SquadPlayer { id: string; name: string; position: string; shirt: number; photo: string; apps: number }

// 국가 통합 team id 들 (같은 ts team id → WORLD_CUP + INTL_FRIENDLY 등 row 합침)
async function unifyTeamIds(teamId: number): Promise<number[]> {
  const tsRow = await prisma.teamSourceId.findFirst({ where: { teamId, source: "thesports" }, select: { externalId: true } });
  if (!tsRow) return [teamId];
  const same = await prisma.teamSourceId.findMany({ where: { externalId: tsRow.externalId, source: "thesports" }, select: { teamId: true } });
  const ids = [...new Set(same.map((t) => t.teamId))];
  return ids.length ? ids : [teamId];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id: parseInt(id, 10) || 0 }, select: { name: true } });
  const ko = team ? toKoreanTeamName(team.name) || fifaCountryKo(team.name) || team.name : "국가대표";
  const title = `${ko} 축구 국가대표팀 — 스쿼드·감독·일정 | 스코어베이스`;
  const description = `${ko} 국가대표팀 소집 명단(스쿼드), 감독, 최근 경기 결과와 다음 일정, FIFA 랭킹을 한눈에. 2026 월드컵 대비 스코어베이스.`;
  return { title, description, alternates: { canonical: `/national-teams/${id}` }, openGraph: { title, description, type: "website" } };
}

export default async function NationalTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamId = parseInt(id, 10);
  if (!teamId) notFound();
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, league: true, logoUrl: true } });
  if (!team || !NATL.has(team.league)) notFound();

  const teamIds = await unifyTeamIds(teamId);
  const teamIdSet = new Set(teamIds);

  const matches = await prisma.match.findMany({
    where: { OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }] },
    orderBy: { startTime: "desc" },
    take: 40,
    select: {
      id: true, league: true, startTime: true, status: true,
      homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
    },
  });
  const now = Date.now();
  const past = matches.filter((m) => m.status === "FINISHED");
  const upcoming = matches.filter((m) => m.startTime.getTime() > now).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // 라인업 누적 → 스쿼드 + 감독 id
  const caches = await prisma.theSportsMatchCache.findMany({ where: { matchId: { in: matches.map((m) => m.id) } }, select: { matchId: true, lineup: true } });
  const squadMap = new Map<string, SquadPlayer>();
  let coachId: string | null = null;
  for (const c of caches) {
    if (!c.lineup) continue;
    const m = matches.find((x) => x.id === c.matchId);
    if (!m) continue;
    const side = teamIdSet.has(m.homeTeamId) ? "home" : "away";
    let obj: { coach_id?: Record<string, string>; lineup?: Record<string, Array<{ id: string; name: string; position: string; shirt_number: number; logo: string }>> };
    try { obj = typeof c.lineup === "string" ? JSON.parse(c.lineup) : (c.lineup as never); } catch { continue; }
    if (!coachId && obj.coach_id?.[side]) coachId = obj.coach_id[side];
    for (const p of obj.lineup?.[side] || []) {
      const ex = squadMap.get(p.id);
      if (ex) ex.apps++;
      else squadMap.set(p.id, { id: p.id, name: p.name, position: p.position, shirt: p.shirt_number, photo: p.logo, apps: 1 });
    }
  }
  const squad = [...squadMap.values()];

  const tsPlayers = squad.length
    ? await prisma.theSportsPlayer.findMany({ where: { id: { in: squad.map((p) => p.id) } }, select: { id: true, nameKo: true } })
    : [];
  const koName = new Map(tsPlayers.map((p) => [p.id, p.nameKo]));
  // 선수 페이지(/transfers/[id])는 PlayerMarketValue 있는 선수만 존재 → 그 선수만 링크(404 방지)
  const mvRows = squad.length
    ? await prisma.playerMarketValue.findMany({ where: { id: { in: squad.map((p) => p.id) } }, select: { id: true } })
    : [];
  const hasMv = new Set(mvRows.map((m) => m.id));

  // 감독 — 정적 json (키: ts team id). 라인업 coach_id 는 보조(과거 경기 기준이라 교체 직후 stale 가능).
  const tsRow = await prisma.teamSourceId.findFirst({
    where: { teamId, source: "thesports" },
    select: { externalId: true },
  });
  const coach = (tsRow && COACHES[tsRow.externalId]) || null;
  const koCountry = toKoreanTeamName(team.name) || fifaCountryKo(team.name) || team.name;
  const flag = fifaFlag(team.name);
  const fifaRank = getFifaRank(team.name, koCountry);

  const fmt = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(5, 10).replace("-", ".");
  const oppName = (m: (typeof matches)[number]) => {
    const opp = teamIdSet.has(m.homeTeamId) ? m.awayTeam.name : m.homeTeam.name;
    return toKoreanTeamName(opp) || fifaCountryKo(opp) || opp;
  };
  const form = past.slice(0, 6).map((m) => {
    const isHome = teamIdSet.has(m.homeTeamId);
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    if (gf == null || ga == null) return { r: "?", c: "bg-neutral-300" };
    return gf > ga ? { r: "승", c: "bg-emerald-500" } : gf < ga ? { r: "패", c: "bg-rose-500" } : { r: "무", c: "bg-neutral-400" };
  });

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      {/* 브레드크럼 — 허브·48개국 목록으로 연결 (고아 페이지 방지) */}
      <nav className="mb-3 text-xs text-neutral-500 flex items-center gap-1.5">
        <Link href="/world-cup" className="hover:underline" prefetch={false}>
          🏆 2026 월드컵
        </Link>
        <span>›</span>
        <Link href="/national-teams" className="hover:underline" prefetch={false}>
          출전국 48개국
        </Link>
      </nav>
      {/* 헤더 */}
      <div className="rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-600 to-sky-500 p-6 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <span className="text-6xl leading-none" aria-hidden>{flag || "🏳️"}</span>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{koCountry}</h1>
            <p className="text-white/70 text-sm mt-0.5">
              {team.name}{fifaRank ? <span className="ml-2 font-semibold text-white/90">FIFA {fifaRank}위</span> : null}
            </p>
          </div>
        </div>
        {coach && (
          <Link
            href={coach.id ? `/coaches/${coach.id}` : "#"}
            className="mt-5 flex items-center gap-3 bg-white/10 rounded-2xl p-3 backdrop-blur-sm hover:bg-white/15 transition"
          >
            {coach.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coach.logo} alt={coach.name} className="w-14 h-14 rounded-full object-cover bg-white/20 ring-2 ring-white/30" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white/20 grid place-items-center text-xl">👔</div>
            )}
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-white/60">감독</div>
              <div className="font-bold text-lg leading-tight truncate">
                {coach.nameKo || (coach.id && COACH_KO[coach.id]) || (coachId && COACH_KO[coachId]) || coach.name}
              </div>
              <div className="text-xs text-white/70">
                {coach.nationality}{coach.age ? ` · ${coach.age}세` : ""}{coach.preferredFormation ? ` · 선호 ${coach.preferredFormation}` : ""}
                <span className="text-white/90"> · 프로필 →</span>
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* 최근 폼 */}
      {form.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-neutral-500 mb-2">최근 폼</h2>
          <div className="flex gap-1.5">
            {form.map((f, i) => (
              <span key={i} className={`w-8 h-8 rounded-lg ${f.c} text-white text-xs font-bold grid place-items-center`}>{f.r}</span>
            ))}
          </div>
        </section>
      )}

      {/* 다음 경기 */}
      {upcoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-neutral-500 mb-2">다음 경기</h2>
          <div className="space-y-2">
            {upcoming.slice(0, 5).map((m) => (
              <Link key={m.id} href={`/scores?sport=soccer&date=${new Date(m.startTime.getTime() + 9 * 3600e3).toISOString().slice(0, 10)}`}
                className="flex items-center justify-between rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-neutral-400 tabular-nums shrink-0">{fmt(m.startTime)}</span>
                  <span className="font-semibold truncate">vs {oppName(m)}</span>
                </div>
                <span className="text-[10px] font-bold text-neutral-400 shrink-0">{LEAGUE_DISPLAY[m.league] ?? m.league}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 스쿼드 — 라인업 누적 (포지션 그룹) */}
      {squad.length > 0 ? (
        <section className="mt-6">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-bold text-neutral-500">스쿼드 <span className="text-neutral-400 font-normal">({squad.length}명)</span></h2>
            <span className="text-[11px] text-neutral-400">최근 소집 라인업 기준</span>
          </div>
          {POS_GROUPS.map(([code, label]) => {
            const players = squad.filter((p) => p.position === code).sort((a, b) => b.apps - a.apps);
            if (!players.length) return null;
            return (
              <div key={code} className="mt-3">
                <h3 className="text-xs font-bold text-neutral-400 mb-2">{label}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {players.map((p) => {
                    const cardCls = "flex items-center gap-2.5 rounded-xl border border-neutral-200/70 dark:border-neutral-800/70 p-2";
                    const inner = (
                      <>
                        <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden shrink-0 grid place-items-center">
                          {p.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.photo} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <span className="text-xs font-bold text-neutral-400">{p.shirt || "?"}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{koName.get(p.id) || p.name}</div>
                          <div className="text-[11px] text-neutral-400">#{p.shirt}</div>
                        </div>
                      </>
                    );
                    return hasMv.has(p.id) ? (
                      <Link
                        key={p.id}
                        href={`/transfers/${p.id}`}
                        className={`${cardCls} hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition`}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div key={p.id} className={cardCls}>{inner}</div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <p className="mt-6 text-sm text-neutral-500 text-center py-8">아직 소집 라인업 데이터가 없습니다. 경기가 임박하면 업데이트됩니다.</p>
      )}
    </main>
  );
}
