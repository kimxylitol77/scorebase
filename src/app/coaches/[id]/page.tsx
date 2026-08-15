// /coaches/[id] — 감독 상세 페이지. id = TheSports coach id.
// 데이터: data/team-coaches.json(현직 스냅샷 — ts coach/list) + data/coach-careers.json
// (Wikidata P6087 감독 경력 + P54 선수 시절 + 국적) + 라인업 cache(최근 실제 포메이션).
// 갱신: scripts/build-team-coaches.ts → scripts/build-coach-careers.ts 순서 재실행.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy, Award, ShoppingBag, UserRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import AmbientGlow from "@/components/AmbientGlow";
import rawCoaches from "../../../../data/team-coaches.json";
import rawCareers from "../../../../data/coach-careers.json";
import rawHonors from "../../../../data/coach-honors.json";
import rawCoachPhotos from "../../../../data/coach-photos.json";
import TacticalManagerSection from "@/components/TacticalManagerSection";
import type { TacticalManagerContext } from "@/lib/tactical/manager-aggregate";
import TeamRecentLineup, { type LineupPlayer } from "@/components/teams/TeamRecentLineup";
import { toKoreanPlayerName } from "@/lib/player-names";
import { formatDateKo } from "@/lib/format";

// ISR — 감독 정보·경력은 거의 불변. 10분 캐시.
export const revalidate = 600;

interface CoachSnap {
  id?: string; name: string; nameKo: string | null; logo: string | null; age: number | null;
  nationality: string | null; preferredFormation: string | null; joined: number | null; contractUntil: number | null;
}
interface CareerRow { club: string; start: number | null; end: number | null }
interface CoachCareer {
  nameKo: string | null; country: string | null; flag: string | null;
  coachCareer: CareerRow[]; playerCareer: CareerRow[];
}

interface HonorRow { club: string; comp: string; compKo: string | null; seasons: string[] }

const COACHES = rawCoaches as Record<string, CoachSnap>;
const CAREERS = rawCareers as Record<string, CoachCareer>;
// 우승 기록 — 영문 위키 Honours(Manager) 파싱. 생성: scripts/build-coach-honors.ts
const HONORS = rawHonors as Record<string, HonorRow[]>;
// 라인업 감독 사전 — team-coaches nameKo 누락분 한글명 폴백 (키 = 감독 id)
const COACH_PHOTOS = rawCoachPhotos as Record<string, { nameKo?: string }>;
const LEAGUE_LABEL: Record<string, string> = {
  EPL: "EPL", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1",
  K_LEAGUE_1: "K리그1", SAUDI_PL: "사우디 프로리그", MLS: "MLS", WORLD_CUP: "FIFA 월드컵 2026",
};
// 국가대표 리그 — 팀 링크를 /national-teams 로 (클럽은 /transfers 스쿼드·/teams)
const NATL = new Set(["WORLD_CUP", "WC_QUAL", "EURO_QUAL", "UEFA_NL", "AFCON", "CONCACAF_GOLD", "INTL_FRIENDLY"]);

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
  const name = career?.nameKo || c.snap.nameKo || COACH_PHOTOS[id]?.nameKo || c.snap.name;
  const title = `${name} 감독 프로필 · 경력`;
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
  const name = career?.nameKo || snap.nameKo || COACH_PHOTOS[id]?.nameKo || snap.name;

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

  // 최근 5경기 실제 포메이션 + 최근 선발 라인업 (현 팀).
  // 라인업 피치는 전 소속 시절 "전술 연구"와 나란히 현 팀 전술을 보여주기 위한 것
  // (부임 직후엔 전술 글이 전 소속팀 것뿐이라 현 팀 맥락이 통째로 비었다 — 2026-08-15 사용자 요청).
  const recentFormations: string[] = [];
  let curLineup: { formation: string | null; xi: string[]; oppKo: string; dateLabel: string } | null = null;
  if (ourTeamId != null) {
    const recent = await prisma.match.findMany({
      where: { status: "FINISHED", OR: [{ homeTeamId: ourTeamId }, { awayTeamId: ourTeamId }] },
      orderBy: { startTime: "desc" },
      take: 10,
      select: {
        homeTeamId: true,
        startTime: true,
        lineupHome: true,
        lineupAway: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        theSportsCache: { select: { lineup: true } },
      },
    }).catch(() => []);
    for (const m of recent) {
      const lu = m.theSportsCache?.lineup as { home_formation?: string; away_formation?: string } | null;
      const isHome = m.homeTeamId === ourTeamId;
      const f = isHome ? lu?.home_formation : lu?.away_formation;
      if (f && recentFormations.length < 5) recentFormations.push(f);
      if (!curLineup) {
        try {
          const raw = isHome ? m.lineupHome : m.lineupAway;
          const parsed = raw ? (JSON.parse(raw) as { formation?: string | null; startXI?: string[] }) : null;
          if (Array.isArray(parsed?.startXI) && parsed.startXI.length >= 11) {
            const opp = isHome ? m.awayTeam : m.homeTeam;
            const kst = new Date(m.startTime.getTime() + 9 * 3600_000);
            curLineup = {
              formation: parsed.formation ?? null,
              xi: parsed.startXI.slice(0, 11),
              oppKo: toKoreanTeamName(opp.name) || opp.name,
              dateLabel: `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`,
            };
          }
        } catch {
          // 파싱 안 되는 라인업은 없는 것으로
        }
      }
    }
  }
  // 선발 11명 한글명 — 팀 페이지와 동일 규칙 (DB nameKo 우선, 동명이인 충돌 시 미확정)
  let curLineupPlayers: LineupPlayer[] = [];
  if (curLineup) {
    const koRows = await prisma.theSportsPlayer.findMany({
      where: { name: { in: curLineup.xi } },
      select: { name: true, nameKo: true },
    }).catch(() => []);
    const koMap = new Map<string, string | null>();
    for (const r of koRows) {
      koMap.set(r.name, koMap.has(r.name) && koMap.get(r.name) !== r.nameKo ? null : r.nameKo);
    }
    curLineupPlayers = curLineup.xi.map((n) => ({
      name: n,
      ko: koMap.get(n) ?? (toKoreanPlayerName(n) !== n ? toKoreanPlayerName(n) || null : null),
    }));
  }
  // 전술 연구 — 이 감독을 다룬 TACTICAL 아티클 누적 (글=시점 스냅샷, 이 페이지=위키형 허브).
  // 매칭은 감독 이름 기준(팀 기준이면 전임 감독 시즌 글이 새 감독 페이지에 붙는 오류).
  // 이름 표기 차(Pep/Josep)는 성 일치 + 현 소속팀 일치로 보정. DRAFT 는 공개 404 라
  // 프로덕션은 PUBLISHED 만 — 개발 환경에서만 DRAFT 포함(검수 전 확인용).
  const normPerson = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  let tacticalCtx: TacticalManagerContext | null = null;
  const tacticalArticles: Array<{ slug: string; title: string; publishedAt: Date | null; seasonLabel: string }> = [];
  // 다른 감독 전술 연구 — 시리즈 크로스 링크 (팀당 최신 1편)
  const otherManagerArticles: Array<{ slug: string; coachKo: string; teamKo: string }> = [];
  {
    const rows = await prisma.article.findMany({
      where: {
        type: "TACTICAL",
        status: process.env.NODE_ENV === "production" ? "PUBLISHED" : { in: ["PUBLISHED", "DRAFT"] },
        tacticalContext: { not: null },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      select: { slug: true, title: true, publishedAt: true, tacticalContext: true },
      take: 60,
    }).catch(() => []);
    const me = normPerson(snap.name);
    const myLast = me.split(" ").pop();
    const seenTeams = new Set<number>();
    for (const r of rows) {
      try {
        const ctx = JSON.parse(r.tacticalContext!) as TacticalManagerContext;
        const other = normPerson(ctx.coach.name);
        const match = other === me || (other.split(" ").pop() === myLast && ctx.team.tsId === teamTsId);
        if (match) {
          tacticalArticles.push({ slug: r.slug, title: r.title, publishedAt: r.publishedAt, seasonLabel: ctx.seasonLabel });
          if (!tacticalCtx) tacticalCtx = ctx; // 최신 글의 집계를 대시보드로
        } else if (!seenTeams.has(ctx.team.id) && otherManagerArticles.length < 8) {
          seenTeams.add(ctx.team.id);
          otherManagerArticles.push({ slug: r.slug, coachKo: ctx.coach.nameKo, teamKo: ctx.team.nameKo });
        }
      } catch {
        // 손상 JSON — 아카이브에서 제외
      }
    }
  }

  const formationSummary = (() => {
    if (!recentFormations.length) return null;
    const cnt = new Map<string, number>();
    for (const f of recentFormations) cnt.set(f, (cnt.get(f) || 0) + 1);
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([f, c]) => (c > 1 ? `${f} ×${c}` : f)).join(" · ");
  })();

  // 우승 기록 (클럽 등장 순 그룹) + 총 트로피 수
  const honors = HONORS[id] ?? [];
  const honorsByClub: Array<{ club: string; rows: HonorRow[] }> = [];
  for (const h of honors) {
    const g = honorsByClub.find((x) => x.club === h.club);
    if (g) g.rows.push(h);
    else honorsByClub.push({ club: h.club, rows: [h] });
  }
  // 총 트로피 수 = 팀 트로피만 (개인 수상 제외)
  const trophyTotal = honors.filter((h) => h.club !== "Individual").reduce((s, h) => s + h.seasons.length, 0);

  // 재임 중 주요 영입 — 부임 이후 현 팀 도착 이적 TOP (이적료 순, 커버 리그만 데이터 존재)
  // ts joined 없으면(예: 엔리케) Wikidata 경력의 현직 시작연도 7/1 로 근사 (감독 교체는 대부분 여름)
  const curStintStart = (career?.coachCareer ?? []).find((r) => r.end == null)?.start ?? null;
  const joinedTs = snap.joined || (curStintStart ? Date.UTC(curStintStart, 6, 1) / 1000 : null);
  let signings: Array<{ playerId: string; name: string; fromTeam: string | null; fee: number; time: number }> = [];
  if (joinedTs) {
    const rows = await prisma.footballTransfer.findMany({
      where: { toTeamId: teamTsId, transferTime: { gte: joinedTs }, transferFee: { gt: 0 } },
      orderBy: { transferFee: "desc" },
      take: 8,
    }).catch(() => []);
    const pids = [...new Set(rows.map((r) => r.playerId))];
    const players = pids.length
      ? await prisma.theSportsPlayer.findMany({
          where: { id: { in: pids } },
          select: { id: true, nameKo: true, name: true },
        }).catch(() => [])
      : [];
    const pMap = new Map(players.map((p) => [p.id, p]));
    const seen = new Set<string>();
    signings = rows
      .filter((r) => { const k = `${r.playerId}|${r.transferFee}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 5)
      .map((r) => ({
        playerId: r.playerId,
        name: pMap.get(r.playerId)?.nameKo || pMap.get(r.playerId)?.name || "선수",
        fromTeam: r.fromTeamName ? toKoreanTeamName(r.fromTeamName) || r.fromTeamName : null,
        fee: Math.round((r.transferFee || 0) / 1e6),
        time: r.transferTime || 0,
      }));
  }

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
  // === 우승 트로피를 경력 구간에 배치 — "어디서 어떤 우승" 이 타임라인에서 바로 보이게 ===
  // honors 클럽명은 영문(위키 Honours), career 는 한글(Wikidata ko) → 연도를 1차 신호로,
  // 전환 연도처럼 구간이 겹치면 클럽명 유사도(양방향 normalize 포함)로 판별.
  const seasonEndYear = (s: string): number | null => {
    const m = /^(\d{4})(?:[–-](\d{2,4}))?/.exec(s.trim());
    if (!m) return null;
    const a = Number(m[1]);
    if (!m[2]) return a;
    const b = m[2].length === 2 ? Math.floor(a / 100) * 100 + Number(m[2]) : Number(m[2]);
    return b < a ? b + 100 : b; // "1999–00" → 2000
  };
  // Wikidata 가 재계약을 행으로 쪼개는 것 정리 — 인접 동일 클럽 구간 병합
  const mergedRows: CareerRow[] = [];
  for (const r of coachRows) {
    const last = mergedRows[mergedRows.length - 1];
    if (last && norm(last.club) === norm(r.club) && (r.start ?? 0) <= (last.end ?? 9999) + 1) {
      last.end = last.end == null || r.end == null ? null : Math.max(last.end, r.end);
      if (r.start != null && (last.start == null || r.start < last.start)) last.start = r.start;
    } else {
      mergedRows.push({ ...r });
    }
  }
  type StintTrophy = { comp: string; compKo: string | null; seasons: string[] };
  type TimelineRow = CareerRow & { trophies: StintTrophy[] };
  const tlRows: TimelineRow[] = mergedRows.map((r) => ({ ...r, trophies: [] }));
  const unplacedHonors: HonorRow[] = []; // 구간 매칭 실패분 — 클럽명 보존해 별도 표기
  for (const h of honors) {
    if (h.club === "Individual") continue;
    const buckets = new Map<number, string[]>();
    const unplaced: string[] = [];
    for (const s of h.seasons) {
      const y = seasonEndYear(s);
      let idx = -1;
      if (y != null) {
        const cands = tlRows
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => (r.start ?? -9999) <= y && y <= (r.end ?? 9999));
        if (cands.length === 1) idx = cands[0].i;
        else if (cands.length > 1) {
          const hn = norm(toKoreanTeamName(h.club) || h.club);
          const en = norm(h.club);
          const byName = cands.find(({ r }) => {
            const rn = norm(r.club);
            return rn.includes(hn) || hn.includes(rn) || rn.includes(en) || en.includes(rn);
          });
          idx = (byName ?? cands[cands.length - 1]).i;
        }
      }
      if (idx >= 0) buckets.set(idx, [...(buckets.get(idx) ?? []), s]);
      else unplaced.push(s);
    }
    for (const [idx, seasons] of buckets) {
      tlRows[idx].trophies.push({ comp: h.comp, compKo: h.compKo, seasons });
    }
    if (unplaced.length) unplacedHonors.push({ ...h, seasons: unplaced });
  }
  const coachTimeline = [...tlRows].reverse(); // 최신 위
  const individualHonors = honors.filter((h) => h.club === "Individual");

  return (
    <article className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <AmbientGlow />
      <Link
        href={
          ourTeamId != null
            ? teamLeague && NATL.has(teamLeague)
              ? `/national-teams/${ourTeamId}`
              : `/transfers?view=team&team=${ourTeamId}`
            : "/transfers"
        }
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-x-0.5 hover:text-neutral-900 dark:hover:text-white break-keep"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> {teamName ? (teamLeague && NATL.has(teamLeague) ? `${teamName} 대표팀` : `${teamName} 스쿼드`) : "이적시장"}
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
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 감독 프로필
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name}</h1>
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
              href={ourTeamId != null ? (teamLeague && NATL.has(teamLeague) ? `/national-teams/${ourTeamId}` : `/teams/${ourTeamId}`) : "#"}
              className="text-sm text-neutral-500 flex items-center gap-1.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-neutral-900 dark:hover:text-white w-fit"
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

      {/* 현 소속팀 전술 — 포메이션 요약 + 최근 선발 라인업 피치 */}
      {(snap.preferredFormation || formationSummary || curLineupPlayers.length === 11) && (
        <section>
          {teamName && <h2 className="text-lg font-semibold mb-3 break-keep">현재 전술 — {teamName}</h2>}
          <div className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-white/[0.04] p-4 sm:p-5 flex items-center gap-8 flex-wrap">
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
          </div>
          {curLineup && curLineupPlayers.length === 11 && (
            <div className="mt-3">
              <div className="mb-2 text-xs text-neutral-400">
                최근 선발 라인업 · {curLineup.dateLabel} vs {curLineup.oppKo}
                {curLineup.formation ? ` · ${curLineup.formation}` : ""}
              </div>
              <TeamRecentLineup formation={curLineup.formation} players={curLineupPlayers} />
            </div>
          )}
        </section>
      )}

      {/* 전술 연구 — 시즌 집계 대시보드 + 글 아카이브 (감독 축 위키형 허브, 글이 늘수록 누적).
          부임 직후엔 최신 글이 전 소속팀 시즌 집계다 — 제목·안내로 "어느 팀 시절"인지 못박는다
          (첼시 알론소 페이지에 레알 대시보드가 무라벨로 떠 버그로 오인, 2026-08-15). */}
      {tacticalCtx && (
        <section>
          <h2 className="text-lg font-semibold mb-1 break-keep">
            전술 연구
            {tacticalCtx.team.tsId !== teamTsId ? ` — ${tacticalCtx.team.nameKo} 시절` : ""}
          </h2>
          {tacticalCtx.team.tsId !== teamTsId && (
            <p className="mb-3 text-xs text-neutral-400 break-keep">
              현 소속({teamName ?? "현 팀"}) 부임 전 {tacticalCtx.team.nameKo} {tacticalCtx.seasonLabel} 시즌 전술 집계입니다.
              {teamName ? ` ${teamName} 전술 연구는 새 시즌 데이터가 쌓이면 발행됩니다.` : ""}
            </p>
          )}
          <TacticalManagerSection ctx={tacticalCtx} />
          {tacticalArticles.length > 0 && (
            <ul className="mt-4 space-y-2">
              {tacticalArticles.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/articles/${a.slug}`}
                    prefetch={false}
                    className="group flex items-baseline justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-white/[0.04] hover:border-blue-300 dark:hover:border-blue-800"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold group-hover:underline break-keep">{a.title}</span>
                    <span className="shrink-0 text-[11px] text-neutral-400 tabular-nums">
                      {a.seasonLabel}{a.publishedAt ? ` · ${formatDateKo(a.publishedAt)}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {otherManagerArticles.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-neutral-400">다른 감독 전술 연구</div>
              <div className="flex flex-wrap gap-1.5">
                {otherManagerArticles.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/articles/${a.slug}`}
                    prefetch={false}
                    className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:border-blue-300 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:border-blue-800"
                  >
                    {a.coachKo} · {a.teamKo}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 감독 경력 타임라인 — 재임 구간 안에 우승 트로피 표시 (어디서 어떤 우승인지 한눈에) */}
      {coachTimeline.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 break-keep">
            감독 경력{" "}
            {trophyTotal > 0 && (
              <span className="inline-flex items-center gap-1 text-sm font-normal text-neutral-400">
                <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden /> 우승 총 <span className="font-bold text-amber-600 dark:text-amber-400">{trophyTotal}</span>회
              </span>
            )}
          </h2>
          <div className="relative pl-4 space-y-4 before:absolute before:left-[3px] before:top-2 before:bottom-2 before:w-px before:bg-neutral-200 dark:before:bg-neutral-800">
            {coachTimeline.map((r, i) => {
              const stintCount = r.trophies.reduce((s, t) => s + t.seasons.length, 0);
              return (
                <div key={i} className="relative">
                  <span
                    className={`absolute -left-[17px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-neutral-950 ${
                      r.end == null ? "bg-cyan-500" : stintCount > 0 ? "bg-amber-400" : "bg-neutral-300 dark:bg-neutral-600"
                    }`}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-neutral-400 tabular-nums w-[84px] shrink-0">{yrRange(r.start, r.end)}</span>
                    <span className={`font-semibold ${r.end == null ? "" : "text-neutral-600 dark:text-neutral-300"}`}>
                      {toKoreanTeamName(r.club) || r.club}
                    </span>
                    {r.end == null && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300">현직</span>
                    )}
                    {stintCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                        🏆 {stintCount}
                      </span>
                    )}
                  </div>
                  {r.trophies.length > 0 && (
                    <div className="mt-1.5 ml-6 sm:ml-[92px] space-y-1">
                      {r.trophies.map((t, j) => (
                        <div key={j} className="flex items-baseline gap-2 flex-wrap text-sm">
                          <span aria-hidden>🏆</span>
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            {t.compKo || t.comp}
                            {t.seasons.length > 1 && <span> ×{t.seasons.length}</span>}
                          </span>
                          <span className="text-xs text-neutral-500 tabular-nums">{t.seasons.join(" · ")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {unplacedHonors.length > 0 && (
            <div className="mt-3 ml-4 text-sm space-y-1">
              {unplacedHonors.map((h, i) => (
                <div key={i} className="flex items-baseline gap-2 flex-wrap text-neutral-500">
                  <span aria-hidden>🏆</span>
                  <span className="font-medium">{h.compKo || h.comp}</span>
                  <span className="text-xs">({toKoreanTeamName(h.club) || h.club})</span>
                  <span className="text-xs tabular-nums">{h.seasons.join(" · ")}</span>
                </div>
              ))}
            </div>
          )}
          {individualHonors.length > 0 && (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-white/[0.04] p-4">
              <div className="font-bold mb-2 text-sm inline-flex items-center gap-1.5"><Award className="h-4 w-4 text-amber-500" aria-hidden /> 개인 수상</div>
              <div className="space-y-1.5">
                {individualHonors.map((h, i) => (
                  <div key={i} className="flex items-baseline gap-2 flex-wrap text-sm">
                    <span className="font-semibold">
                      {h.compKo || h.comp}
                      {h.seasons.length > 1 && <span className="text-amber-600 dark:text-amber-400"> ×{h.seasons.length}</span>}
                    </span>
                    <span className="text-xs text-neutral-500 tabular-nums">{h.seasons.join(" · ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 경력 데이터가 없는 감독 — 우승 기록만이라도 클럽별 그룹으로 (폴백) */}
      {coachTimeline.length === 0 && honorsByClub.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 inline-flex items-center gap-1.5 break-keep">
            <Trophy className="h-4 w-4 text-amber-500" aria-hidden /> 우승 기록 <span className="text-sm font-normal text-neutral-400">총 {trophyTotal}회</span>
          </h2>
          <div className="space-y-4">
            {honorsByClub.map((g) => (
              <div key={g.club} className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-white/[0.04] p-4">
                <div className="font-bold mb-2 break-keep">{g.club === "Individual" ? (<span className="inline-flex items-center gap-1.5"><Award className="h-4 w-4 text-amber-500" aria-hidden /> 개인 수상</span>) : toKoreanTeamName(g.club) || g.club}</div>
                <div className="space-y-1.5">
                  {g.rows.map((h, i) => (
                    <div key={i} className="flex items-baseline gap-2 flex-wrap text-sm">
                      <span className="font-semibold">
                        {h.compKo || h.comp}
                        {h.seasons.length > 1 && <span className="text-amber-600 dark:text-amber-400"> ×{h.seasons.length}</span>}
                      </span>
                      <span className="text-xs text-neutral-500 tabular-nums">{h.seasons.join(" · ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 재임 중 주요 영입 — 우리 이적 DB (커버 리그만) */}
      {signings.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 inline-flex items-center gap-1.5 break-keep"><ShoppingBag className="h-4 w-4 text-cyan-500" aria-hidden /> 재임 중 주요 영입</h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-white/[0.04] divide-y divide-neutral-100 dark:divide-white/5">
            {signings.map((s) => (
              <Link key={`${s.playerId}-${s.fee}`} href={`/transfers/${s.playerId}`} className="flex items-center gap-3 px-4 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.06]">
                <span className="font-semibold truncate">{s.name}</span>
                {s.fromTeam && <span className="text-xs text-neutral-500 truncate">← {s.fromTeam}</span>}
                <span className="ml-auto font-bold text-cyan-600 dark:text-cyan-400 tabular-nums shrink-0">€{s.fee}M</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 선수 시절 */}
      {career?.playerCareer && career.playerCareer.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 inline-flex items-center gap-1.5 break-keep"><UserRound className="h-4 w-4 text-neutral-400" aria-hidden /> 선수 시절</h2>
          <div className="flex flex-wrap gap-1.5">
            {career.playerCareer.map((r, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full text-xs border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-white/[0.04] text-neutral-600 dark:text-neutral-300">
                {toKoreanTeamName(r.club) || r.club}
                <span className="text-neutral-400"> {yrRange(r.start, r.end)}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] text-neutral-400 leading-relaxed break-keep">
        ⓘ 현직·계약·선호 포메이션 = TheSports · 경력·국적 = Wikipedia/Wikidata · 최근 포메이션 = 스코어베이스 라인업 데이터.
      </p>
    </article>
  );
}
