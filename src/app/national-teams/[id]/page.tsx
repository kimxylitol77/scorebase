// 국가대표팀 페이지 — 월드컵 대비. ts team id 로 국가 통합(WORLD_CUP+INTL_FRIENDLY 등).
// 헤더(국기·FIFA랭킹·감독) + 최근 폼 + 다음 경기 + 스쿼드(라인업 누적).
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { fifaCountryKo, fifaFlag, getFifaRank } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY, NATIONAL_TEAM_LEAGUES } from "@/lib/sports/sport-leagues";
import GoalHeatmap from "@/components/charts/GoalHeatmap";
import type { GoalLineGoal } from "@/components/charts/GoalSceneViz";
import { getWcGroupStandings } from "@/lib/sports/world-cup-standings";
import { getTeamGroup } from "@/lib/predict/world-cup-elos";
import AmbientGlow from "@/components/AmbientGlow";
import { Trophy, Goal } from "lucide-react";
import rawCoachNames from "../../../../data/coach-names.json";
import rawCoaches from "../../../../data/team-coaches.json";
import rawWcSquads from "../../../../data/wc-national-squads.json";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site-url"; // www 강제 정규화(apex 새어나감 방지)

// ISR — 스쿼드·일정·조별 순위 5분 캐시(WC 라이브 결과는 /world-cup·/standings 가 정본).
export const revalidate = 300;

const COACH_KO = rawCoachNames as Record<string, string>; // coachId → 한글명 (build-coach-names-haiku)
// 감독 스냅샷 (ts coach/list 정적 수집 — Vercel 은 ts 직접 호출 불가(IP whitelist)라 정적 json 사용)
// 키 = ts team id. 생성: scripts/build-team-coaches.ts (WC 국대 포함)
const COACHES = rawCoaches as Record<string, { id?: string; name: string; nameKo: string | null; logo: string | null; age: number | null; nationality: string | null; preferredFormation: string | null; joined: number | null; contractUntil: number | null }>;
// 국대 리그 판별은 sport-leagues 의 NATIONAL_TEAM_LEAGUES 공용 — /teams 리다이렉트와 동일 기준
const NATL = NATIONAL_TEAM_LEAGUES;
const POS_GROUPS: Array<[string, string]> = [["G", "골키퍼"], ["D", "수비수"], ["M", "미드필더"], ["F", "공격수"]];

interface SquadPlayer { id: string; name: string; position: string; shirt: number; photo: string; apps: number }

// 월드컵 공식 26인 스쿼드 (ts team/squad/list, build-wc-national-squads.ts) — tsId → squad
const WC_SQUAD_BY_TSID = new Map(
  Object.values(
    rawWcSquads as Record<string, { tsId: string; squad: Array<{ id: string; name: string; position: string | null; number: number | null }> }>,
  ).map((t) => [t.tsId, t.squad] as const),
);

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
  // 빙 검색어 패턴("{국가} 축구 팀" / "{국가} 축구 국가대표팀")을 타이틀·키워드에 정확 매칭 —
  // 빙은 exact-match 키워드와 meta 를 구글보다 직접 반영한다.
  const title = `${ko} 축구 국가대표팀 — 스쿼드·감독·일정·FIFA 랭킹`;
  const description = `${ko} 축구 국가대표팀(${ko} 축구 팀) 정보 — 최신 소집 명단(스쿼드), 감독, 최근 경기 결과와 다음 일정, FIFA 랭킹을 한눈에. 2026 북중미 월드컵 경기 결과·기록 포함, 스코어베이스.`;
  const keywords = [
    `${ko} 축구 팀`,
    `${ko} 축구 국가대표팀`,
    `${ko} 대표팀`,
    `${ko} 스쿼드`,
    `${ko} 감독`,
    `${ko} FIFA 랭킹`,
    `${ko} 월드컵`,
    ...(team && team.name !== ko ? [`${team.name} national team`] : []),
  ];
  return {
    title,
    description,
    keywords,
    alternates: { canonical: `/national-teams/${id}` },
    openGraph: { title, description, type: "website" },
  };
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
  const caches = await prisma.theSportsMatchCache.findMany({ where: { matchId: { in: matches.map((m) => m.id) } }, select: { matchId: true, lineup: true, goalLine: true, playerStats: true } });
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
  // 공식 26인 스쿼드(data/wc-national-squads.json) 우선 — 라인업은 출전자만이라 후보가 빠짐.
  // 공식 명단에 라인업 사진·출전수를 병합(미출전자는 등번호 표시). 미수집국은 라인업 fallback.
  const tsRow = await prisma.teamSourceId.findFirst({
    where: { teamId, source: "thesports" },
    select: { externalId: true },
  });
  const officialSquad = tsRow ? WC_SQUAD_BY_TSID.get(tsRow.externalId) : null;
  const squad: SquadPlayer[] = officialSquad
    ? officialSquad.map((s) => {
        const li = squadMap.get(s.id);
        return { id: s.id, name: s.name, position: s.position ?? "", shirt: s.number ?? 0, photo: li?.photo ?? "", apps: li?.apps ?? 0 };
      })
    : [...squadMap.values()];
  const isOfficialSquad = !!officialSquad;

  const tsPlayers = squad.length
    ? await prisma.theSportsPlayer.findMany({ where: { id: { in: squad.map((p) => p.id) } }, select: { id: true, nameKo: true } })
    : [];
  const koName = new Map(tsPlayers.map((p) => [p.id, p.nameKo]));
  // 선수 페이지(/transfers/[id])는 TheSportsPlayer 있으면 렌더 — mv(시장가치) 없는 국대 선수는
  // 국가대표 경기 기록·프로필 중심 라이트 페이지가 된다. tsp 있는 선수만 링크해 404 방지.
  const hasTsp = new Set(tsPlayers.map((p) => p.id));

  // 선수 기여 — playerStats(자국 team_id) 골·도움을 대회별(월드컵 본선 / 평가전)로 분리 누적
  const tsExt = tsRow?.externalId;
  const matchLeague = new Map(matches.map((m) => [m.id, m.league]));
  interface PStat { wcG: number; wcA: number; frG: number; frA: number; ratings: number[]; minutes: number; games: number }
  const statMap = new Map<string, PStat>();
  if (tsExt) {
    for (const c of caches) {
      const ps = c.playerStats as Array<{ player_id: string; team_id?: string; goals?: number; assists?: number; rating?: number; minutes_played?: number }> | null;
      if (!Array.isArray(ps)) continue;
      const isWc = matchLeague.get(c.matchId) === "WORLD_CUP";
      for (const s of ps) {
        if (!s.player_id || s.team_id !== tsExt) continue;
        const a = statMap.get(s.player_id) ?? { wcG: 0, wcA: 0, frG: 0, frA: 0, ratings: [] as number[], minutes: 0, games: 0 };
        if (isWc) { a.wcG += s.goals ?? 0; a.wcA += s.assists ?? 0; }
        else { a.frG += s.goals ?? 0; a.frA += s.assists ?? 0; }
        const r = Number(s.rating) || 0;
        if (r > 0) a.ratings.push(r);
        const min = s.minutes_played ?? 0;
        a.minutes += min;
        if (min > 0) a.games += 1;
        statMap.set(s.player_id, a);
      }
    }
  }
  const statOf = (pid: string) => {
    const a = statMap.get(pid);
    if (!a) return null;
    const avgRating = a.ratings.length ? +(a.ratings.reduce((s, r) => s + r, 0) / a.ratings.length).toFixed(2) : 0;
    return { wcG: a.wcG, wcA: a.wcA, frG: a.frG, frA: a.frA, goals: a.wcG + a.frG, assists: a.wcA + a.frA, avgRating, games: a.games };
  };
  // 핵심 선수 = 기여 상위 (월드컵 본선 골 우선: 본선골 3 + 평가전골 2 + 도움 1)
  const keyPlayers = squad
    .map((p) => ({ p, st: statOf(p.id) }))
    .filter((x): x is { p: SquadPlayer; st: NonNullable<ReturnType<typeof statOf>> } => !!x.st && (x.st.goals > 0 || x.st.assists > 0))
    .sort((a, b) => b.st.wcG * 3 + b.st.frG * 2 + b.st.wcA + b.st.frA - (a.st.wcG * 3 + a.st.frG * 2 + a.st.wcA + a.st.frA) || b.st.avgRating - a.st.avgRating)
    .slice(0, 5);

  // 감독 — 정적 json (키: ts team id). tsRow 는 위 스쿼드 결정에서 재사용.
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

  // 골 위치 히트맵 — 국가 득점 슈터 좌표 누적 (away 골은 공격 방향 오른쪽으로 정규화)
  const goalSpots: { x: number; y: number }[] = [];
  for (const c of caches) {
    const goals = (c.goalLine as GoalLineGoal[] | null) ?? [];
    if (goals.length === 0) continue;
    const m = matches.find((x) => x.id === c.matchId);
    if (!m) continue;
    const belong = teamIdSet.has(m.homeTeamId) ? 1 : 2;
    for (const g of goals) {
      const sh = g.pass?.find((p) => p.shooter === 1);
      if (!sh || sh.belong !== belong) continue;
      let x = parseFloat(sh.x);
      const y = parseFloat(sh.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (belong === 2) x = 100 - x;
      goalSpots.push({ x, y });
    }
  }

  // 월드컵 조별 순위 — 이 팀이 속한 조의 순위표 (DB Match FINISHED 집계)
  const group = getTeamGroup(team.name);
  const groupStandings = group ? await getWcGroupStandings() : null;
  const groupRows = (group && groupStandings?.get(group)) || [];
  const groupNameToId = new Map<string, number>();
  if (groupRows.length) {
    const trows = await prisma.team.findMany({ where: { name: { in: groupRows.map((r) => r.team) }, league: { in: [...NATL] } }, select: { id: true, name: true } });
    for (const t of trows) if (!groupNameToId.has(t.name)) groupNameToId.set(t.name, t.id);
  }

  // SportsTeam 구조화 데이터 — 빙·구글이 "국가대표 축구팀" 엔티티로 인식하게.
  const teamJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: `${koCountry} 축구 국가대표팀`,
    alternateName: team.name,
    sport: "Soccer",
    url: `${SITE_URL}/national-teams/${team.id}`,
    ...(team.logoUrl ? { logo: team.logoUrl } : {}),
  };
  // BreadcrumbList — SERP 에 "월드컵 › 출전국" 경로 노출 (노출 대비 클릭 0 페이지의 CTR 보강).
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "2026 월드컵", item: `${SITE_URL}/world-cup` },
      { "@type": "ListItem", position: 2, name: "출전국 48개국", item: `${SITE_URL}/national-teams` },
      { "@type": "ListItem", position: 3, name: `${koCountry} 축구 국가대표팀`, item: `${SITE_URL}/national-teams/${team.id}` },
    ],
  };

  return (
    <main className="relative max-w-3xl mx-auto px-4 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(teamJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }} />
      <AmbientGlow />
      {/* 브레드크럼 — 허브·48개국 목록으로 연결 (고아 페이지 방지) */}
      <nav className="mb-3 text-xs text-neutral-500 flex items-center gap-1.5">
        <Link href="/world-cup" className="inline-flex items-center gap-1 hover:underline" prefetch={false}>
          <Trophy className="h-3.5 w-3.5" aria-hidden /> 2026 월드컵
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/90 ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden /> 국가대표
            </span>
            {/* H1 에 빙 검색어("{국가} 축구 국가대표팀") 포함 — 국가명은 크게, 키워드는 작게 */}
            <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
              {koCountry}
              <span className="ml-2 align-middle text-base sm:text-lg font-semibold text-white/80">축구 국가대표팀</span>
            </h1>
            <p className="text-white/70 text-sm mt-1">
              {team.name}{fifaRank ? <span className="ml-2 font-semibold text-white/90">FIFA {fifaRank}위</span> : null}
            </p>
          </div>
        </div>
        {coach && (
          <Link
            href={coach.id ? `/coaches/${coach.id}` : "#"}
            className="mt-5 flex items-center gap-3 bg-white/10 rounded-2xl p-3 backdrop-blur-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white/15"
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

      {/* 골 위치 히트맵 (goal/line 누적) */}
      {goalSpots.length >= 3 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-neutral-500 mb-2"><Goal className="inline h-4 w-4 mr-1 text-rose-500 align-[-2px]" aria-hidden /> 골 위치 히트맵 <span className="text-neutral-400 font-normal">· 시즌 {goalSpots.length}골</span></h2>
          <GoalHeatmap spots={goalSpots} teamName={koCountry} />
        </section>
      )}

      {/* 다음 경기 */}
      {upcoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-neutral-500 mb-2">다음 경기</h2>
          <div className="space-y-2">
            {upcoming.slice(0, 5).map((m) => (
              <Link key={m.id} href={`/scores?sport=soccer&date=${new Date(m.startTime.getTime() + 9 * 3600e3).toISOString().slice(0, 10)}`}
                className="flex items-center justify-between rounded-xl ring-1 ring-black/5 dark:ring-white/10 px-4 py-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
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

      {/* 핵심 선수 — 시즌 골·도움 기여 상위 */}
      {keyPlayers.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-neutral-500 mb-2">핵심 선수 <span className="text-neutral-400 font-normal">· 월드컵 본선 / 평가전 구분</span></h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {keyPlayers.map(({ p, st }) => {
              const inner = (
                <>
                  <div className="w-11 h-11 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden shrink-0 grid place-items-center">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-xs font-bold text-neutral-400">{p.shirt || "?"}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{koName.get(p.id) || p.name}</div>
                    <div className="text-[10px] flex items-center gap-x-2 gap-y-0.5 mt-0.5 flex-wrap">
                      {(st.wcG > 0 || st.wcA > 0) && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">🏆 본선 {st.wcG > 0 ? `⚽${st.wcG}` : ""}{st.wcG > 0 && st.wcA > 0 ? " " : ""}{st.wcA > 0 ? `🅰️${st.wcA}` : ""}</span>
                      )}
                      {(st.frG > 0 || st.frA > 0) && (
                        <span className="text-neutral-500">평가전 {st.frG > 0 ? `⚽${st.frG}` : ""}{st.frG > 0 && st.frA > 0 ? " " : ""}{st.frA > 0 ? `🅰️${st.frA}` : ""}</span>
                      )}
                      {st.avgRating > 0 && <span className="text-amber-600 dark:text-amber-400 font-semibold">★{st.avgRating}</span>}
                    </div>
                  </div>
                </>
              );
              const cls = "flex items-center gap-2.5 rounded-xl ring-1 ring-black/5 dark:ring-white/10 p-2";
              return hasTsp.has(p.id) ? (
                <Link key={p.id} href={`/transfers/${p.id}`} className={`${cls} transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:ring-black/10 dark:hover:ring-white/20 hover:bg-neutral-50 dark:hover:bg-white/[0.04]`}>
                  {inner}
                </Link>
              ) : (
                <div key={p.id} className={cls}>{inner}</div>
              );
            })}
          </div>
        </section>
      )}

      {/* 스쿼드 — 라인업 누적 (포지션 그룹) */}
      {squad.length > 0 ? (
        <section className="mt-6">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-bold text-neutral-500">스쿼드 <span className="text-neutral-400 font-normal">({squad.length}명)</span></h2>
            <span className="text-[11px] text-neutral-400">{isOfficialSquad ? "공식 소집 명단" : "최근 소집 라인업 기준"}</span>
          </div>
          {POS_GROUPS.map(([code, label]) => {
            const players = squad.filter((p) => p.position === code).sort((a, b) => b.apps - a.apps);
            if (!players.length) return null;
            return (
              <div key={code} className="mt-3">
                <h3 className="text-xs font-bold text-neutral-400 mb-2">{label}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {players.map((p) => {
                    const cardCls = "flex items-center gap-2.5 rounded-xl ring-1 ring-black/5 dark:ring-white/10 p-2";
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
                    return hasTsp.has(p.id) ? (
                      <Link
                        key={p.id}
                        href={`/transfers/${p.id}`}
                        className={`${cardCls} transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:ring-black/10 dark:hover:ring-white/20 hover:bg-neutral-50 dark:hover:bg-white/[0.04]`}
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

      {/* 조별 순위 — 이 팀이 속한 월드컵 조 (경기·승·무·패·득실·승점) */}
      {groupRows.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-neutral-500 mb-2">{group}조 순위</h2>
          <div className="rounded-xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
            <div className="grid grid-cols-[1.5rem_1fr_2rem_1.5rem_1.5rem_1.5rem_2.5rem_2.25rem] items-center gap-1 px-2.5 py-2 text-[11px] font-medium text-neutral-400 border-b border-black/5 dark:border-white/10">
              <span className="text-center">#</span>
              <span>팀</span>
              <span className="text-center">경기</span>
              <span className="text-center">승</span>
              <span className="text-center">무</span>
              <span className="text-center">패</span>
              <span className="text-center">득실</span>
              <span className="text-center">승점</span>
            </div>
            {groupRows.map((r) => {
              const isMe = r.team === team.name;
              const bar = r.posInGroup <= 2 ? "border-emerald-500" : r.posInGroup === 3 ? "border-amber-500" : "border-rose-400";
              const ko = toKoreanTeamName(r.team) || fifaCountryKo(r.team) || r.team;
              const tid = groupNameToId.get(r.team);
              const inner = (
                <>
                  <span className="text-center font-semibold text-neutral-500">{r.posInGroup}</span>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span aria-hidden>{fifaFlag(r.team) || "🏳️"}</span>
                    <span className="truncate font-semibold">{ko}</span>
                  </span>
                  <span className="text-center tabular-nums text-neutral-500">{r.played}</span>
                  <span className="text-center tabular-nums text-emerald-600 dark:text-emerald-400">{r.won}</span>
                  <span className="text-center tabular-nums text-neutral-400">{r.draw}</span>
                  <span className="text-center tabular-nums text-rose-500">{r.loss}</span>
                  <span className={`text-center tabular-nums font-medium ${r.gd > 0 ? "text-emerald-600 dark:text-emerald-400" : r.gd < 0 ? "text-rose-500" : "text-neutral-400"}`}>{r.gd > 0 ? `+${r.gd}` : r.gd}</span>
                  <span className="text-center tabular-nums font-bold">{r.pts}</span>
                </>
              );
              const cls = `grid grid-cols-[1.5rem_1fr_2rem_1.5rem_1.5rem_1.5rem_2.5rem_2.25rem] items-center gap-1 px-2.5 py-2.5 border-l-4 ${bar} ${isMe ? "bg-blue-50 dark:bg-blue-900/20" : ""}`;
              return tid && !isMe ? (
                <Link key={r.team} href={`/national-teams/${tid}`} className={`${cls} transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]`}>{inner}</Link>
              ) : (
                <div key={r.team} className={cls}>{inner}</div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-400">상위 2팀 32강 직행 · 각 조 3위는 와일드카드 경쟁</p>
        </section>
      )}
    </main>
  );
}
