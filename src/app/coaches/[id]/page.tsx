// /coaches/[id] — 감독 상세 페이지. id = TheSports coach id.
// 데이터: data/team-coaches.json(현직 스냅샷 — ts coach/list) + data/coach-careers.json
// (Wikidata P6087 감독 경력 + P54 선수 시절 + 국적) + 라인업 cache(최근 실제 포메이션).
// 갱신: scripts/build-team-coaches.ts → scripts/build-coach-careers.ts 순서 재실행.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import rawCoaches from "../../../../data/team-coaches.json";
import rawCareers from "../../../../data/coach-careers.json";

export const dynamic = "force-dynamic";

interface CoachSnap {
  id?: string; name: string; nameKo: string | null; logo: string | null; age: number | null;
  nationality: string | null; preferredFormation: string | null; joined: number | null; contractUntil: number | null;
}
interface CareerRow { club: string; start: number | null; end: number | null }
interface CoachCareer {
  nameKo: string | null; country: string | null; flag: string | null;
  coachCareer: CareerRow[]; playerCareer: CareerRow[];
}

const COACHES = rawCoaches as Record<string, CoachSnap>;
const CAREERS = rawCareers as Record<string, CoachCareer>;
const LEAGUE_LABEL: Record<string, string> = {
  EPL: "EPL", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1",
  K_LEAGUE_1: "K리그1", SAUDI_PL: "사우디 프로리그", MLS: "MLS",
};

// coach id → 현 소속 ts team id (team-coaches.json 이 팀 키 구조라 역인덱스)
const TEAM_BY_COACH: Record<string, string> = {};
for (const [tid, c] of Object.entries(COACHES)) if (c.id) TEAM_BY_COACH[c.id] = tid;

const fmtYm = (ts: number | null) =>
  ts ? `${new Date(ts * 1000).getUTCFullYear()}.${new Date(ts * 1000).getUTCMonth() + 1}` : null;
const yrRange = (s: number | null, e: number | null) =>
  `${s ?? "?"}–${e ?? "현재"}`;

function coachOf(id: string): { snap: CoachSnap; teamTsId: string } | null {
  const teamTsId = TEAM_BY_COACH[id];
  if (!teamTsId) return null;
  return { snap: COACHES[teamTsId], teamTsId };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = coachOf(id);
  if (!c) return { title: "감독 미발견" };
  const career = CAREERS[id];
  const name = career?.nameKo || c.snap.nameKo || c.snap.name;
  const title = `${name} 감독 프로필 · 경력 | 스코어베이스`;
  const description = `${name} 감독의 커리어 — 역임 클럽 타임라인, 선호 포메이션, 부임·계약 정보${career?.playerCareer?.length ? "와 선수 시절" : ""}. 스코어베이스.`;
  return {
    title,
    description,
    keywords: [name, `${name} 감독`, `${name} 경력`, "감독 프로필", "스코어베이스"],
    openGraph: { title, description, type: "profile", ...(c.snap.logo ? { images: [{ url: c.snap.logo }] } : {}) },
    alternates: { canonical: `/coaches/${id}` },
  };
}

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{8,20}$/i.test(id)) notFound();
  const found = coachOf(id);
  if (!found) notFound();
  const { snap, teamTsId } = found;
  const career = CAREERS[id] ?? null;
  const name = career?.nameKo || snap.nameKo || snap.name;

  // 현 소속팀 resolve (ts → 우리 Team) — 로고·리그·팀 페이지 링크
  let teamName: string | null = null, teamLogo: string | null = null, ourTeamId: number | null = null, teamLeague: string | null = null;
  const tss = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: teamTsId },
    select: { teamId: true },
  }).catch(() => []);
  if (tss.length) {
    const teams = await prisma.team.findMany({
      where: { id: { in: tss.map((t) => t.teamId) } },
      select: { id: true, name: true, logoUrl: true, league: true },
    }).catch(() => []);
    const team = teams.find((t) => LEAGUE_LABEL[t.league]) || teams[0];
    if (team) {
      teamName = toKoreanTeamName(team.name) || team.name;
      teamLogo = team.logoUrl;
      ourTeamId = team.id;
      teamLeague = team.league;
    }
  }

  // 최근 5경기 실제 포메이션 (현 팀)
  const recentFormations: string[] = [];
  if (ourTeamId != null) {
    const recent = await prisma.match.findMany({
      where: { status: "FINISHED", OR: [{ homeTeamId: ourTeamId }, { awayTeamId: ourTeamId }] },
      orderBy: { startTime: "desc" },
      take: 10,
      select: { homeTeamId: true, theSportsCache: { select: { lineup: true } } },
    }).catch(() => []);
    for (const m of recent) {
      const lu = m.theSportsCache?.lineup as { home_formation?: string; away_formation?: string } | null;
      const f = m.homeTeamId === ourTeamId ? lu?.home_formation : lu?.away_formation;
      if (f) recentFormations.push(f);
      if (recentFormations.length >= 5) break;
    }
  }
  const formationSummary = (() => {
    if (!recentFormations.length) return null;
    const cnt = new Map<string, number>();
    for (const f of recentFormations) cnt.set(f, (cnt.get(f) || 0) + 1);
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([f, c]) => (c > 1 ? `${f} ×${c}` : f)).join(" · ");
  })();

  // 감독 경력 — Wikidata 가 현 부임을 아직 반영 못했으면 ts joined 로 현 팀 행 합성
  const norm = (s: string) => s.replace(/\s|FC|CF|AFC|SC/gi, "").toLowerCase();
  let coachRows: CareerRow[] = career?.coachCareer ?? [];
  if (teamName) {
    const joinedYr = snap.joined ? new Date(snap.joined * 1000).getUTCFullYear() : null;
    const covered = coachRows.some(
      (r) => (norm(r.club).includes(norm(teamName!)) || norm(teamName!).includes(norm(r.club))) && (r.end == null || (joinedYr != null && r.end >= joinedYr)),
    );
    if (!covered) {
      // 진행중(end=null) 기존 행은 부임연도로 캡
      coachRows = coachRows.map((r) => (r.end == null && joinedYr != null ? { ...r, end: joinedYr } : r));
      coachRows.push({ club: teamName, start: joinedYr, end: null });
    }
  }
  const coachTimeline = [...coachRows].reverse(); // 최신 위

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <Link href={ourTeamId != null ? `/transfers?view=team&team=${ourTeamId}` : "/transfers"} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
        ← {teamName ? `${teamName} 스쿼드` : "이적시장"}
      </Link>

      {/* 헤더 */}
      <header className="flex items-center gap-4 flex-wrap">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
          {snap.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snap.logo} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl">🧑‍💼</span>
          )}
        </div>
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{name}</h1>
            <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">감독</span>
            {snap.age != null && <span className="text-sm text-neutral-500">{snap.age}세</span>}
            {career?.country && (
              <span className="flex items-center gap-1 text-sm text-neutral-500">
                {career.flag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={career.flag} alt="" className="w-4 h-3 object-cover rounded-[1px]" />
                )}
                {career.country}
              </span>
            )}
          </div>
          {teamName && (
            <Link
              href={ourTeamId != null ? `/teams/${ourTeamId}` : "#"}
              className="text-sm text-neutral-500 flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition w-fit"
            >
              {teamLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={teamLogo} alt="" className="w-4 h-4 object-contain" />
              )}
              {teamName}
              {teamLeague && LEAGUE_LABEL[teamLeague] && <span className="text-neutral-400">· {LEAGUE_LABEL[teamLeague]}</span>}
            </Link>
          )}
          {(snap.joined || snap.contractUntil) && (
            <div className="text-xs text-neutral-500">
              {snap.joined ? `${fmtYm(snap.joined)} 부임` : ""}
              {snap.joined && snap.contractUntil ? " · " : ""}
              {snap.contractUntil ? `계약 ~${fmtYm(snap.contractUntil)}` : ""}
            </div>
          )}
        </div>
      </header>

      {/* 전술 */}
      {(snap.preferredFormation || formationSummary) && (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5 flex items-center gap-8 flex-wrap">
          {snap.preferredFormation && (
            <div className="leading-tight">
              <div className="text-[11px] text-neutral-400 mb-0.5">선호 포메이션</div>
              <div className="text-xl font-black tabular-nums">{snap.preferredFormation}</div>
            </div>
          )}
          {formationSummary && (
            <div className="leading-tight">
              <div className="text-[11px] text-neutral-400 mb-0.5">최근 {recentFormations.length}경기 실제 포메이션</div>
              <div className="text-xl font-black tabular-nums">{formationSummary}</div>
            </div>
          )}
        </section>
      )}

      {/* 감독 경력 타임라인 */}
      {coachTimeline.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">감독 경력</h2>
          <div className="relative pl-4 space-y-3 before:absolute before:left-[3px] before:top-2 before:bottom-2 before:w-px before:bg-neutral-200 dark:before:bg-neutral-800">
            {coachTimeline.map((r, i) => (
              <div key={i} className="relative">
                <span className={`absolute -left-[17px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-neutral-950 ${r.end == null ? "bg-cyan-500" : "bg-neutral-300 dark:bg-neutral-600"}`} />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-neutral-400 tabular-nums w-[84px] shrink-0">{yrRange(r.start, r.end)}</span>
                  <span className={`font-semibold ${r.end == null ? "" : "text-neutral-600 dark:text-neutral-300"}`}>
                    {toKoreanTeamName(r.club) || r.club}
                  </span>
                  {r.end == null && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300">현직</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 선수 시절 */}
      {career?.playerCareer && career.playerCareer.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">선수 시절</h2>
          <div className="flex flex-wrap gap-1.5">
            {career.playerCareer.map((r, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full text-xs border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300">
                {toKoreanTeamName(r.club) || r.club}
                <span className="text-neutral-400"> {yrRange(r.start, r.end)}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] text-neutral-400 leading-relaxed">
        ⓘ 현직·계약·선호 포메이션 = TheSports · 경력·국적 = Wikipedia/Wikidata · 최근 포메이션 = 스코어베이스 라인업 데이터.
      </p>
    </article>
  );
}
