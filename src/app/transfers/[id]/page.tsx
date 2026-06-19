// 선수 개인페이지 (TheSports 기반) — 몸값 추이 + 변동 이력 + 이적 기록.
//   id = TheSports player id. PlayerMarketValue / TheSportsPlayer / FootballTransfer 만 사용 (api-football 안 씀).
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { toKoreanTeamName } from "@/lib/team-names";
import { fifaCountryKo } from "@/lib/sports/fifa-rankings";
import rawOverrides from "../../../../data/player-overrides.json";
import rawSeason from "../../../../data/player-season-stats.json";
import rawPhotos from "../../../../data/player-photos.json";
import rawWiki from "../../../../data/player-wiki-seasons.json";
import rawAbility from "../../../../data/player-ability.json";
import rawTeamLogos from "../../../../data/team-logos.json";
import rawWcSquads from "../../../../data/wc-national-squads.json";
import SeasonAccordion, { type SeasonEntry } from "./SeasonAccordion";
import CompetitionStatsSection from "@/components/transfers/CompetitionStatsSection";
import { DESC_KO, BADGE_CLS, SPECIAL_TEAM_KO, koTeam, badgeOf } from "../transfer-display";

interface CareerEntry { club: string; start: number | null; end: number | null; apps: number | null; goals: number | null; loan: boolean; nt: boolean; startTime?: number }
const OVERRIDES = rawOverrides as Record<string, { nameKo?: string; country?: string; flag?: string; career?: CareerEntry[]; pos?: string }>;

interface SeasonStat {
  lg: string; season: string; team: string | null; pos: string | null;
  matches: number | null; starts: number | null; goals: number | null; assists: number | null;
  minutes: number | null; shots: number | null; sot: number | null; keyPasses: number | null;
  passAcc: number | null; tackles: number | null; interceptions: number | null;
  yellow: number | null; red: number | null; saves: number | null;
}
const SEASON = rawSeason as Record<string, SeasonStat>;
// 선수 사진 (TheSports season player.logo). DB photoUrl(라인업)보다 커버리지 높아 우선.
const PHOTOS = rawPhotos as Record<string, string>;
// 과거 시즌 (Wikipedia Career statistics) — 시즌별 클럽 리그/총 출장·골
interface WikiSeasonRow { season: string; club: string; division: string; lApps: number; lGoals: number; tApps: number; tGoals: number }
const WIKI = rawWiki as Record<string, WikiSeasonRow[]>;
// 종합 능력치 (TheSports player/ability comprehensive, 10점=만점x10 아닌 0~100 종합)
const ABILITY = rawAbility as Record<string, number>;
// 팀마크 보강 — TeamSourceId→Team.logoUrl 미커버(비빅5 팀)를 ts team/additional 수집분으로 (피드와 동일)
const TEAM_LOGOS = rawTeamLogos as Record<string, string>;
// 선수 → 소속 국가대표 ts team id (WC 공식 스쿼드 역검색). 국가대표 경기 기록을 자국 경기로
// 한정 조회하기 위함 — 전세계 평가전 take 100 제한으로 누락되던 WC 미출전·평가전 위주 선수 구제.
const PLAYER_TO_NATL_TSID = new Map<string, string>();
for (const t of Object.values(rawWcSquads as Record<string, { tsId: string; squad: Array<{ id: string }> }>)) {
  for (const s of t.squad) PLAYER_TO_NATL_TSID.set(s.id, t.tsId);
}

export const dynamic = "force-dynamic";

const LEAGUE_LABEL: Record<string, string> = {
  EPL: "EPL",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  K_LEAGUE_1: "K리그1",
  SAUDI_PL: "사우디 프로리그",
  MLS: "MLS",
};
const POS_LABEL: Record<string, string> = { G: "GK", D: "DF", M: "MF", F: "FW" };

const EUR_KRW = 1791.5;
function krw(eurM: number): string {
  const eok = (eurM * 1e6 * EUR_KRW) / 1e8;
  if (eok >= 10000) return (eok / 10000).toFixed(2) + "조";
  return Math.round(eok).toLocaleString() + "억";
}
function fmtDate(unixSec?: number): string {
  if (!unixSec) return "—";
  const d = new Date(unixSec * 1000);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 클럽명 정규화 — 한국어 변환 후 소문자·FC류 토큰·공백 제거 (career club ↔ 이적기록 팀명 매칭용)
const CLUB_STOP = new Set(["fc", "afc", "cf", "sc", "cd", "ac", "club"]);
function normClub(s: string): string {
  return (toKoreanTeamName(s) || s).toLowerCase().split(/\s+/).filter((w) => !CLUB_STOP.has(w)).join("");
}
// 정규화된 클럽명 동일 판정 (정확 → 접두) — 커리어 행 로고·stale 보정 공통
const matchClub = (a: string, b: string) => !!a && !!b && (a === b || a.startsWith(b) || b.startsWith(a));

interface HistPt { market_time?: number; market_value?: number; team_id?: string; age?: number }

async function loadPlayer(id: string) {
  // mv(시장가치) 없어도 TheSportsPlayer 만 있으면 라이트 프로필 렌더 —
  // 확장 리그(K리그1·사우디·MLS)는 대부분 mv 미보유라 mv 필수면 피드 클릭이 404.
  const [mv, tsp] = await Promise.all([
    prisma.playerMarketValue.findUnique({ where: { id } }),
    prisma.theSportsPlayer.findUnique({
      where: { id },
      select: { nameKo: true, name: true, photoUrl: true, position: true },
    }),
  ]);
  if (!mv && !tsp) return null;
  return { mv, tsp };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await loadPlayer(id);
  if (!p) return { title: "선수 미발견" };
  const name = OVERRIDES[id]?.nameKo || p.tsp?.nameKo || p.tsp?.name || "선수";
  const val = p.mv?.currentValue ? Math.round(p.mv.currentValue / 1e6) : null;
  const photo = PHOTOS[id] || p.tsp?.photoUrl || null;
  // mv(시장가치) 없는 라이트 프로필은 몸값 문구 대신 프로필·이적 기록 중심 타이틀
  const title = p.mv
    ? `${name} 시장가치${val ? ` €${val}M` : ""} · 몸값 추이 | 스코어베이스`
    : `${name} 프로필 · 이적 기록 | 스코어베이스`;
  const description = p.mv
    ? `${name} 선수의 시장가치(몸값) 변동 추이와 이적 기록, 시즌별 성적·커리어. 스코어베이스 이적시장에서 ${name} 몸값을 한눈에.`
    : `${name} 선수의 프로필과 이적 기록, 시즌별 성적·커리어 — 스코어베이스 이적시장.`;
  return {
    title,
    description,
    keywords: [name, `${name} 몸값`, `${name} 시장가치`, "이적시장", "선수 몸값", "스코어베이스"],
    openGraph: { title, description, type: "profile", ...(photo ? { images: [{ url: photo }] } : {}) },
    alternates: { canonical: `/transfers/${id}` },
  };
}

// 면적 라인차트 (SVG) + 이적 시점 클럽 마크(곡선 위 절대배치 — preserveAspectRatio none 왜곡 회피)
function ValueChart({ points, markers = [] }: { points: { t: number; v: number }[]; markers?: { index: number; logo: string; name?: string }[] }) {
  if (points.length < 2) return null;
  const w = 640, h = 180, padX = 8, padTop = 16, padBot = 24;
  const vals = points.map((p) => p.v);
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = max - min || 1;
  const xy = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * (w - padX * 2);
    const y = padTop + (1 - (p.v - min) / span) * (h - padTop - padBot);
    return { x, y };
  });
  const line = xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${padX},${h - padBot} ${line} ${w - padX},${h - padBot}`;
  const up = vals[vals.length - 1] >= vals[0];
  const stroke = up ? "#06b6d4" : "#f87171";
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto block" preserveAspectRatio="none">
        <defs>
          <linearGradient id="vgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#vgrad)" />
        <polyline points={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {xy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={stroke} />
        ))}
      </svg>
      {markers.map((m, k) => {
        const p = xy[m.index];
        if (!p) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={k}
            src={m.logo}
            alt={m.name || ""}
            title={m.name || ""}
            className="absolute w-6 h-6 object-contain rounded-full bg-white ring-1 ring-black/15 shadow-sm p-0.5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${(p.x / w) * 100}%`, top: `${(p.y / h) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

function yrRange(s: number | null, e: number | null): string {
  if (s == null && e == null) return "—";
  const ss = s != null ? String(s) : "?";
  if (e == null) return `${ss}–현재`;
  return s === e ? ss : `${ss}–${e}`;
}

interface ValuePoint { time: number; v: number; age?: number | null; chg: number | null; team?: string | null }

// 커리어 + 몸값 변동 병합 타임라인 (Wikidata P54 클럽 이력 × TheSports 몸값 history).
//  클럽 시기별로 그 기간의 시장가치 변동을 묶어 한 타임라인에 표시. 시니어 국가대표는 상단 요약.
//  클럽 로고 = 그 시기 몸값 포인트의 ts team_id 를 tsLogo 로 해소(우리 Team DB, 빅5 위주).
function CareerTimeline({ entries, hist, tsLogo, tsName = {}, clubLogos = {}, arrivals = [] }: { entries: CareerEntry[]; hist: ValuePoint[]; tsLogo: Record<string, string>; tsName?: Record<string, string>; clubLogos?: Record<string, string>; arrivals?: { year: number; teamId: string }[] }) {
  // 현 소속(end=null) 우선 → 그다음 최근 시작순. (Wikidata 등록일 기준이라 임대가 본클럽보다
  //  start 가 늦는 경우가 있어 단순 역순으로는 현 소속이 묻힘 → 진행중 먼저)
  const clubs = [...entries.filter((e) => !e.nt)].sort((a, b) => {
    const ao = a.end == null ? 1 : 0, bo = b.end == null ? 1 : 0;
    return ao !== bo ? bo - ao : (b.start ?? 0) - (a.start ?? 0);
  });
  const nts = [...entries.filter((e) => e.nt)].sort((a, b) => (b.apps ?? 0) - (a.apps ?? 0));
  if (!clubs.length && !nts.length) return null;

  // 몸값 변동을 클럽 시기에 배정 — 연도 기준. 우선순위: 시작 늦은(최근) > 임대 > 긴 기간.
  //  (잘츠부르크2019-20↔도르트문트2020-22 의 2020→도르트문트 / 본팀↔임대→임대 /
  //   본팀↔유스리저브 같은해 시작→긴 기간=본팀, 유스가 시니어 포인트 뺏는 것 방지)
  //  startTime(이적 발효 unix초, stale 보정 합성 행) 보유 행은 발효 전 포인트를 받지 않음.
  const bestIdx = (vpTime: number): number => {
    const year = new Date(vpTime * 1000).getUTCFullYear();
    let best = -1, bS = -Infinity, bL = 0, bSpan = -1;
    clubs.forEach((c, i) => {
      if (c.startTime && vpTime < c.startTime) return;
      const st = c.start ?? -Infinity, en = c.end ?? 9999;
      if (year < st || year > en) return;
      const span = en - st, lr = c.loan ? 1 : 0;
      if (best === -1 || st > bS || (st === bS && (lr > bL || (lr === bL && span > bSpan)))) { best = i; bS = st; bL = lr; bSpan = span; }
    });
    if (best === -1) { let nd = Infinity; clubs.forEach((c, i) => { const d = Math.abs((c.start ?? 9999) - year); if (d < nd) { nd = d; best = i; } }); }
    return best;
  };
  const byClub: ValuePoint[][] = clubs.map(() => []);
  if (clubs.length) for (const vp of hist) { const idx = bestIdx(vp.time); if (idx >= 0) byClub[idx].push(vp); }
  byClub.forEach((arr) => arr.sort((a, b) => b.time - a.time));
  // 클럽 행 로고 — 1) 이적기록 팀명 매칭(정확→접두) 2) 그 시기 몸값 포인트 로고(팀명 일치 시만).
  //  포인트만 쓰면 이적 발표~몸값 갱신 사이 새 클럽 행에 직전 클럽 로고가 붙고(예: 바르샤 행에 뉴캐슬 마크),
  //  연도 단위 배정이라 임대 행에 본클럽 포인트가 섞임(예: 프레스턴 행에 에버턴) → 이름 불일치 로고는 숨김.
  const logoFor = (i: number): string | null => {
    const cn = normClub(clubs[i].club);
    // 1) 이적기록 도착팀 중 클럽 시작연도 최근접(±1) — career 클럽명이 Wikidata 음역이라
    //    우리 팀명과 표기가 달라도(함부르거↔함부르크·로스앤젤레스↔LAFC) 시간축으로 정확히 연결.
    //    이적 도착 team_id 는 명시적이라 이름매칭·연도경계 오염을 모두 회피.
    const cy = clubs[i].start;
    if (cy != null) {
      let best: string | null = null, bd = 2;
      for (const a of arrivals) {
        if (!tsLogo[a.teamId]) continue;
        const d = Math.abs(a.year - cy);
        if (d < bd) { bd = d; best = a.teamId; }
      }
      if (best) return tsLogo[best];
    }
    // 2) 이적기록 팀명 → 로고 (정확/접두 이름 매칭)
    if (cn) {
      if (clubLogos[cn]) return clubLogos[cn];
      for (const [k, v] of Object.entries(clubLogos)) if (matchClub(k, cn)) return v;
    }
    // 3) 그 시기 몸값 포인트 team_id — 이름 일치 시만 (임대 본클럽·연도경계 오염 방지)
    for (const vp of byClub[i]) if (vp.team && tsLogo[vp.team] && cn && matchClub(normClub(tsName[vp.team] || ""), cn)) return tsLogo[vp.team];
    return null;
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">커리어 & 몸값 변동</h2>
      <p className="text-xs text-neutral-500 mb-3">클럽별 이력과 그 시기의 시장가치 변동.</p>
      {nts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {nts.map((n, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-xs">
              <span className="text-neutral-500">🏳️ {n.club}</span>
              {n.apps != null && <span className="font-semibold tabular-nums">{n.apps}경기</span>}
              {n.goals != null && <span className="text-cyan-600 dark:text-cyan-400 font-semibold tabular-nums">{n.goals}골</span>}
            </span>
          ))}
        </div>
      )}
      {clubs.length > 0 && (
        <div className="relative border-l border-neutral-200 dark:border-neutral-800 ml-1.5">
          {clubs.map((c, i) => {
            const logo = logoFor(i);
            return (
            <div key={i} className="relative pl-5 py-2.5">
              <span className={`absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-neutral-950 ${c.end == null ? "bg-cyan-500" : "bg-neutral-300 dark:bg-neutral-600"}`} />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-neutral-400 tabular-nums w-[68px] shrink-0">{yrRange(c.start, c.end)}</span>
                {logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="w-5 h-5 object-contain shrink-0" />
                )}
                <span className="font-semibold">{c.club}</span>
                {c.loan && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">임대</span>}
                {(c.apps != null || c.goals != null) && (
                  <span className="ml-auto text-xs text-neutral-500 tabular-nums shrink-0">
                    {c.apps != null ? `${c.apps}경기` : ""}{c.goals != null ? ` · ${c.goals}골` : ""}
                  </span>
                )}
              </div>
              {byClub[i].length > 0 && (
                <div className="mt-2 ml-1 pl-3 border-l border-dashed border-neutral-200 dark:border-neutral-800 space-y-1">
                  {byClub[i].map((vp, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs">
                      <span className="text-neutral-400 tabular-nums w-12 shrink-0">{fmtDate(vp.time)}</span>
                      <span className="font-semibold text-cyan-600 dark:text-cyan-400 tabular-nums">€{vp.v}M</span>
                      {vp.chg != null && vp.chg !== 0 && (
                        <span className={`tabular-nums ${vp.chg > 0 ? "text-emerald-500" : "text-rose-500"}`}>{vp.chg > 0 ? "▲" : "▼"}{Math.abs(vp.chg)}%</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default async function PlayerTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await loadPlayer(id);
  if (!p) notFound();
  const { mv, tsp } = p;

  const name = OVERRIDES[id]?.nameKo || tsp?.nameKo || tsp?.name || "선수";
  const ov = OVERRIDES[id];
  const career = ov?.career || [];
  const season = SEASON[id];
  const photoUrl = PHOTOS[id] || tsp?.photoUrl || null;
  const ability = ABILITY[id] ?? null;

  // 시즌별 성적 — 현 시즌(TheSports 상세) + 과거 시즌(Wikipedia). 시즌별 collapsible.
  const normSeason = (s: string) => s.replace(/[–—]/g, "-");
  const wikiBySeason = new Map<string, WikiSeasonRow[]>();
  for (const w of WIKI[id] || []) { const a = wikiBySeason.get(w.season) || []; a.push(w); wikiBySeason.set(w.season, a); }
  const seasonEntries: SeasonEntry[] = [];
  if (season) seasonEntries.push({ kind: "rich", label: `${season.season} 시즌`, sub: season.team ? toKoreanTeamName(season.team) || season.team : null, stat: season });
  const curNorm = season ? normSeason(season.season) : null;
  for (const sk of [...wikiBySeason.keys()].sort((a, b) => normSeason(b).localeCompare(normSeason(a)))) {
    if (curNorm && normSeason(sk) === curNorm) continue;
    const rows = wikiBySeason.get(sk)!.map((w) => ({ club: toKoreanTeamName(w.club) || w.club, lApps: w.lApps, lGoals: w.lGoals, tApps: w.tApps, tGoals: w.tGoals }));
    seasonEntries.push({ kind: "wiki", label: `${sk} 시즌`, sub: rows.length === 1 ? rows[0].club : `${rows.length}개 클럽`, rows });
  }
  const value = mv?.currentValue ? Math.round(mv.currentValue / 1e6) : null;
  const league = mv?.league && LEAGUE_LABEL[mv.league] ? mv.league : null;

  // 팀 resolve (ts → 우리 Team). 한 ts 가 여러 Team 에 매핑되면 해당 리그 Team 우선(동명 클럽 방지).
  let teamName = "—", teamLogo: string | null = null, ourTeamId: number | null = null;
  if (mv?.teamId) {
    const tss = await prisma.teamSourceId.findMany({
      where: { source: "thesports", externalId: mv.teamId },
      select: { teamId: true },
    });
    if (tss.length) {
      const teams = await prisma.team.findMany({
        where: { id: { in: tss.map((t) => t.teamId) } },
        select: { id: true, name: true, logoUrl: true, league: true },
      });
      const team = teams.find((t) => t.league === mv.league) || teams[0];
      if (team) { teamName = toKoreanTeamName(team.name) || team.name; teamLogo = team.logoUrl; ourTeamId = team.id; }
    }
  }

  // 몸값 이력 (연대순 정렬 — 차트/마커/타임라인 공통)
  const hist = (Array.isArray(mv?.history) ? (mv.history as HistPt[]) : [])
    .filter((h) => (h?.market_value || 0) > 0 && h?.market_time)
    .sort((a, b) => (a.market_time || 0) - (b.market_time || 0));
  const points = hist.map((h) => ({ t: h.market_time!, v: (h.market_value || 0) / 1e6 }));
  const peak = points.length ? Math.max(...points.map((p) => p.v)) : value || 0;
  // 직전 시점 대비 변동(%). 유스 초기값 대비 "전체" 는 수천% 라 무의미 → 직전 대비만.
  const prevV = points.length >= 2 ? points[points.length - 2].v : 0;
  const recentChg = prevV > 0 && value != null ? Math.round(((value - prevV) / prevV) * 100) : 0;

  // 이적 기록 — 하단 표시 + 팀 로고 해소(커리어 행·차트 마커)에 함께 사용
  const transfers = await prisma.footballTransfer.findMany({
    where: { playerId: id },
    orderBy: { transferTime: "desc" },
    take: 30,
  });

  // 팀 로고 맵 (ts team_id → 우리 Team.logoUrl) — 몸값 history + 이적기록 from/to 해소(빅5 위주, 없으면 생략)
  const histTeamIds = [...new Set([
    ...hist.map((h) => h.team_id),
    ...transfers.flatMap((t) => [t.fromTeamId, t.toTeamId]),
  ].filter((x): x is string => !!x))];
  const tsLogo: Record<string, string> = {};
  const tsTeamName: Record<string, string> = {};
  if (histTeamIds.length) {
    const tss = await prisma.teamSourceId.findMany({ where: { source: "thesports", externalId: { in: histTeamIds } }, select: { externalId: true, teamId: true } });
    const teams = await prisma.team.findMany({ where: { id: { in: tss.map((t) => t.teamId) } }, select: { id: true, name: true, logoUrl: true, league: true } });
    const tById = new Map(teams.map((t) => [t.id, t]));
    // 한 ts id 가 여러 Team 이면 빅5 > UCL > 기타 — 동명 클럽 오매핑 방지(예: Barcelona ↔ Barcelona SC[COPA_LIB])
    const pri = (lg: string | null) => (lg && LEAGUE_LABEL[lg] ? 0 : lg === "UCL" ? 1 : 2);
    const bestPri: Record<string, number> = {};
    for (const t of tss) {
      const tm = tById.get(t.teamId);
      if (!tm?.logoUrl) continue;
      const p = pri(tm.league);
      if (tsLogo[t.externalId] && bestPri[t.externalId] <= p) continue;
      tsLogo[t.externalId] = tm.logoUrl;
      tsTeamName[t.externalId] = toKoreanTeamName(tm.name) || tm.name;
      bestPri[t.externalId] = p;
    }
  }
  // DB 미커버(비빅5 출신팀)는 정적 수집분으로 보강 — 피드와 동일 fallback
  for (const tid of histTeamIds) if (!tsLogo[tid] && TEAM_LOGOS[tid]) tsLogo[tid] = TEAM_LOGOS[tid];

  // mv 없는 라이트 프로필 — 현 소속을 최신 이적(도착)에서 유도
  if (teamName === "—" && transfers.length) {
    const cur = transfers.find((t) => t.toTeamName && !(t.toTeamName in SPECIAL_TEAM_KO));
    if (cur?.toTeamName) {
      teamName = koTeam(cur.toTeamName);
      if (cur.toTeamId && tsLogo[cur.toTeamId]) teamLogo = tsLogo[cur.toTeamId];
    }
  }

  // 커리어 행 로고용 — 이적기록 도착팀 연도→team_id (career 시작연도 최근접 매칭, 표기차·경계 무관)
  const arrivals = transfers
    .filter((t) => t.toTeamId && t.transferTime)
    .map((t) => ({ year: new Date(t.transferTime! * 1000).getUTCFullYear(), teamId: t.toTeamId! }));

  // 커리어 행 로고용 클럽명 → 로고 (이적기록 기반, 과거→최신 순회로 최신 이적이 우선)
  const clubLogos: Record<string, string> = {};
  for (const t of [...transfers].reverse()) {
    for (const [tid, tname] of [[t.fromTeamId, t.fromTeamName], [t.toTeamId, t.toTeamName]] as const) {
      if (tid && tname && tsLogo[tid]) clubLogos[normClub(tname)] = tsLogo[tid];
    }
  }

  // 커리어 stale 자동 보정 — Wikidata career 에 현 소속이 없으면(예: 람멘스 앤트워프→맨유)
  //  TheSports 현 소속(mv.teamId)으로의 "발효된" 이적을 근거로 현 클럽 행을 합성.
  //  ① 도착 ts id = mv.teamId 인 이적만 신뢰(이름 매칭 오류로 엉뚱한 행 합성 방지)
  //  ② 클럽명 후보(우리 DB 한글명·이적기록 팀명 변환)가 career 에 이미 있으면 보정 불필요
  //  ③ 완전이적은 기존 진행중(end=null) 행을 이적연도로 캡, 임대(type 7)는 본클럽 유지
  let careerView = career;
  if (career.length && mv?.teamId) {
    const nowSec = Math.floor(Date.now() / 1000);
    const arrival = transfers.find(
      (t) => t.toTeamId === mv.teamId && t.transferTime && t.transferTime <= nowSec && t.toTeamName && !(t.toTeamName in SPECIAL_TEAM_KO),
    );
    if (arrival?.transferTime) {
      const trYear = new Date(arrival.transferTime * 1000).getUTCFullYear();
      const curNames = [tsTeamName[mv.teamId], koTeam(arrival.toTeamName)].filter(Boolean).map((n) => normClub(n!));
      // 이름 비교는 부분 포함까지 허용 — "OGC 니스"↔"니스", "보루시아 묀헨글라트바흐"↔"묀헨글라트바흐"
      //  같은 접두 수식어 차이로 같은 클럽을 못 알아보고 중복 행을 합성하는 것 방지 (보수적 = 보정 스킵 쪽).
      const sameClub = (cn: string, n: string) => matchClub(cn, n) || (n.length >= 2 && cn.includes(n)) || (cn.length >= 2 && n.includes(cn));
      const covered = career.some(
        (c) => !c.nt && curNames.some((n) => sameClub(normClub(c.club), n)) && (c.end == null || c.end >= trYear),
      );
      // 진행중(end=null) 행이 이적연도 이후 시작이면 Wikidata 가 이미 이 이적을 반영한 것 —
      //  한글 표기 변형(인테르나치오날레↔인터 밀란, 브렌트퍼드↔브렌트포드)으로 covered 를
      //  놓친 케이스에서 같은 클럽 중복 행 합성 방지.
      const wikidataFresh = career.some((c) => !c.nt && c.end == null && c.start != null && c.start >= trYear);
      if (!covered && !wikidataFresh) {
        const isLoan = arrival.transferType === 1;
        careerView = career.map((c) => (!c.nt && c.end == null && !isLoan ? { ...c, end: trYear } : c));
        careerView.push({
          club: tsTeamName[mv.teamId] || koTeam(arrival.toTeamName),
          start: trYear,
          end: null,
          apps: null,
          goals: null,
          loan: isLoan,
          nt: false,
          startTime: arrival.transferTime,
        });
      }
    }
  }

  // 차트 이적 마커 (team_id 바뀌는 시점 = 이적/입단, 로고 있는 것만)
  const markers: { index: number; logo: string; name?: string }[] = [];
  let prevTeam: string | undefined;
  hist.forEach((h, i) => { if (h.team_id && h.team_id !== prevTeam) { prevTeam = h.team_id; if (tsLogo[h.team_id]) markers.push({ index: i, logo: tsLogo[h.team_id], name: tsTeamName[h.team_id] }); } });
  // 발표됐지만 몸값 history 미반영(발효 전)인 확정 이적 → 차트 끝점에 새 클럽 마커(예: 고든 2026-07-01 바르샤행)
  const lastH = hist[hist.length - 1];
  const pendingTr = lastH?.market_time
    ? [...transfers].reverse().find((t) => t.toTeamId && t.transferTime && t.transferTime > lastH.market_time! && t.toTeamId !== lastH.team_id && tsLogo[t.toTeamId])
    : undefined;
  if (pendingTr?.toTeamId) markers.push({ index: points.length - 1, logo: tsLogo[pendingTr.toTeamId], name: tsTeamName[pendingTr.toTeamId] });

  // 몸값 변동 포인트 (연대순 + 변동% + team) — 커리어 타임라인 병합용
  const valuePoints = hist.map((h, i) => {
    const v = Math.round((h.market_value || 0) / 1e6);
    const pv = i > 0 ? Math.round((hist[i - 1].market_value || 0) / 1e6) : 0;
    return { time: h.market_time!, v, age: h.age, chg: pv > 0 ? Math.round(((v - pv) / pv) * 100) : null, team: h.team_id };
  });

  // 국가대표 경기 기록 — 대회/연도 단위로 묶어 표시(과거 대회는 접힘·보존, 최신 펼침).
  //   월드컵 본선은 전부 읽고(대회당 ~70경기) 평가전은 최근 100. playerStats 는 Lightsail
  //   poller(~2분) push·force-dynamic → 실시간. cache 는 시간삭제 없어(중복 dedup 외) 영구 보존.
  // 선수 소속 국가대표팀 한정 — WC 공식 스쿼드 역검색으로 국가 ts team id → 우리 Team id.
  //  자국 경기만 조회해 평가전 전체를 포함(WC 미출전 백업·평가전 위주 선수 기록 누락 해결).
  //  동시에 전세계 평가전을 안 뒤져 더 가벼움. 미등록(비WC스쿼드) 선수는 take 100 폴백.
  const natlTsId = PLAYER_TO_NATL_TSID.get(id);
  const natlTeamIds = natlTsId
    ? [...new Set((await prisma.teamSourceId.findMany({ where: { source: "thesports", externalId: natlTsId }, select: { teamId: true } })).map((s) => s.teamId))]
    : [];
  const natlWhere = natlTeamIds.length ? { OR: [{ homeTeamId: { in: natlTeamIds } }, { awayTeamId: { in: natlTeamIds } }] } : {};
  const natlSelect = { id: true, league: true, startTime: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } }, homeScore: true, awayScore: true } as const;
  const [wcMatchRows, frMatchRows] = await Promise.all([
    prisma.match.findMany({ where: { league: "WORLD_CUP", status: "FINISHED", ...natlWhere }, orderBy: { startTime: "desc" }, select: natlSelect }),
    prisma.match.findMany({ where: { league: "INTL_FRIENDLY", status: "FINISHED", ...natlWhere }, orderBy: { startTime: "desc" }, ...(natlTeamIds.length ? {} : { take: 100 }), select: natlSelect }),
  ]);
  const natlMatchList = [...wcMatchRows, ...frMatchRows];
  const natlById = new Map(natlMatchList.map((m) => [m.id, m]));
  const natlCaches = natlMatchList.length
    ? await prisma.theSportsMatchCache.findMany({ where: { matchId: { in: natlMatchList.map((m) => m.id) } }, select: { matchId: true, playerStats: true } })
    : [];
  interface NatlGame { time: number; wc: boolean; year: number; home: string; away: string; hs: number | null; as: number | null; goals: number; assists: number; rating: number }
  const natlGames: NatlGame[] = [];
  const koNat = (n: string) => toKoreanTeamName(n) || fifaCountryKo(n) || n;
  for (const c of natlCaches) {
    const ps = c.playerStats as Array<{ player_id: string; goals?: number; assists?: number; rating?: number; minutes_played?: number }> | null;
    if (!Array.isArray(ps)) continue;
    const row = ps.find((s) => s.player_id === id);
    if (!row || (row.minutes_played ?? 0) === 0) continue; // 미출전 제외
    const m = natlById.get(c.matchId);
    if (!m) continue;
    natlGames.push({
      time: m.startTime.getTime(), wc: m.league === "WORLD_CUP", year: m.startTime.getUTCFullYear(),
      home: koNat(m.homeTeam.name), away: koNat(m.awayTeam.name), hs: m.homeScore, as: m.awayScore,
      goals: row.goals ?? 0, assists: row.assists ?? 0, rating: Number(row.rating) || 0,
    });
  }
  natlGames.sort((a, b) => b.time - a.time);
  // 대회/연도 그룹 ("{연도} 월드컵" / "{연도} 평가전") — 최신 연도·월드컵 우선, 최신만 펼침
  interface NatlGroup { label: string; wc: boolean; sort: number; games: NatlGame[]; goals: number; assists: number }
  const natlGroupMap = new Map<string, NatlGroup>();
  for (const g of natlGames) {
    const key = `${g.wc ? "wc" : "fr"}-${g.year}`;
    let grp = natlGroupMap.get(key);
    if (!grp) { grp = { label: `${g.year} ${g.wc ? "월드컵" : "평가전"}`, wc: g.wc, sort: g.year * 10 + (g.wc ? 1 : 0), games: [], goals: 0, assists: 0 }; natlGroupMap.set(key, grp); }
    grp.games.push(g); grp.goals += g.goals; grp.assists += g.assists;
  }
  const natlGroups = [...natlGroupMap.values()].sort((a, b) => b.sort - a.sort);
  const natlGameRow = (g: NatlGame, i: number) => {
    const d = new Date(g.time + 9 * 3600e3).toISOString().slice(5, 10).replace("-", ".");
    return (
      <div key={i} className="flex items-center gap-2 rounded-lg border border-neutral-200/70 dark:border-neutral-800/70 px-3 py-2 text-sm">
        <span className="text-xs text-neutral-400 tabular-nums shrink-0 w-11">{d}</span>
        <span className="truncate min-w-0 flex-1 text-neutral-600 dark:text-neutral-300">{g.home} <span className="font-bold tabular-nums text-neutral-900 dark:text-white">{g.hs}-{g.as}</span> {g.away}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {g.goals >= 3 && <span className="text-[10px] font-bold text-rose-500">해트트릭</span>}
          {g.goals > 0 && <span className="font-bold text-emerald-600 dark:text-emerald-400">⚽{g.goals}</span>}
          {g.assists > 0 && <span className="text-neutral-500 text-xs">🅰️{g.assists}</span>}
          {g.rating > 0 && <span className="text-amber-600 dark:text-amber-400 font-semibold text-xs">★{g.rating.toFixed(1)}</span>}
        </span>
      </div>
    );
  };

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <Link href={`/transfers${league ? `?league=${league}` : ""}`} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
        ← 이적시장
      </Link>

      {/* 헤더 */}
      <header className="flex items-center gap-4 flex-wrap">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl font-bold text-neutral-500 dark:text-neutral-400">{name.slice(0, 1)}</span>
          )}
        </div>
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{name}</h1>
            {(ov?.pos || tsp?.position) && (
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                {ov?.pos || POS_LABEL[tsp!.position!]}
              </span>
            )}
            {ability != null && (
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300" title="종합 능력치">
                ⭐ 종합 {ability}
              </span>
            )}
            {mv?.age != null && <span className="text-sm text-neutral-500">{mv.age}세</span>}
            {ov?.country && (
              <span className="flex items-center gap-1 text-sm text-neutral-500">
                {ov.flag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ov.flag} alt="" className="w-4 h-3 object-cover rounded-[1px]" />
                )}
                {ov.country}
              </span>
            )}
          </div>
          <Link
            href={ourTeamId != null ? `/teams/${ourTeamId}` : "#"}
            className="text-sm text-neutral-500 flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition w-fit"
          >
            {teamLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={teamLogo} alt="" className="w-4 h-4 object-contain" />
            )}
            {teamName}
            {league && <span className="text-neutral-400">· {LEAGUE_LABEL[league]}</span>}
          </Link>
        </div>
        {value != null && (
          <div className="ml-auto text-right leading-tight">
            <div className="text-xs text-neutral-400">현재 시장가치</div>
            <div className="text-2xl sm:text-3xl font-black text-cyan-600 dark:text-cyan-400 tabular-nums">€{value}M</div>
            <div className="text-xs text-neutral-500 tabular-nums">{krw(value)}</div>
            {points.length >= 2 && (
              <div className={`text-xs font-semibold tabular-nums ${recentChg >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {recentChg >= 0 ? "▲" : "▼"} {Math.abs(recentChg)}% <span className="text-neutral-400 font-normal">최근</span>
              </div>
            )}
          </div>
        )}
      </header>

      {/* 국가대표 경기 기록 — 대회/연도 단위로 묶어 접기(최신 펼침, 과거 대회 보존). force-dynamic 실시간 */}
      {natlGroups.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">국가대표 경기 기록</h2>
          {natlGroups.map((grp, gi) => (
            <details key={grp.label} open={gi === 0} className="group rounded-xl border border-neutral-200/70 dark:border-neutral-800/70 overflow-hidden">
              <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                <span className={`font-bold ${grp.wc ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-700 dark:text-neutral-200"}`}>{grp.wc ? "🏆 " : ""}{grp.label}</span>
                <span className="text-xs text-neutral-500">{grp.games.length}경기 · ⚽{grp.goals} 🅰️{grp.assists}</span>
                <span className="ml-auto text-neutral-400 text-xs transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="px-2.5 pb-2.5 pt-0.5 space-y-1.5">{grp.games.map(natlGameRow)}</div>
            </details>
          ))}
        </section>
      )}

      {/* 현 시즌 대회별 스탯 (af) — 축구 선수 페이지 단일화: /players 의 대회별 정보를
          여기로 통합 (2026-06-10). ts→af 매핑 없으면 자동 미표시. */}
      <CompetitionStatsSection tsId={id} league={mv?.league ?? null} />

      {/* 시즌별 성적 — 현 시즌(TheSports 상세) + 과거 시즌(Wikipedia). 시즌별 접기/펼치기 */}
      {seasonEntries.length > 0 && <SeasonAccordion seasons={seasonEntries} />}

      {/* 몸값 추이 차트 */}
      {points.length >= 2 && (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">시장가치 추이</h2>
            <span className="text-xs text-neutral-400">최고 €{Math.round(peak)}M</span>
          </div>
          <ValueChart points={points} markers={markers} />
        </section>
      )}

      {/* 커리어 & 몸값 변동 — 커리어 데이터 있으면 병합 타임라인, 없으면 단순 변동이력 테이블 */}
      {careerView.length > 0 ? (
        <CareerTimeline entries={careerView} hist={valuePoints} tsLogo={tsLogo} tsName={tsTeamName} clubLogos={clubLogos} arrivals={arrivals} />
      ) : hist.length >= 1 ? (
        <section>
          <h2 className="text-lg font-semibold mb-3">변동 이력 ({hist.length})</h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">시점</th>
                  <th className="text-right px-3 py-2 font-medium">시장가치</th>
                  <th className="text-right px-3 py-2 font-medium">원화</th>
                  <th className="text-right px-3 py-2 font-medium">나이</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {[...hist].reverse().map((h, i) => {
                  const v = Math.round((h.market_value || 0) / 1e6);
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{fmtDate(h.market_time)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-cyan-600 dark:text-cyan-400">€{v}M</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-500">{krw(v)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-500">{h.age ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* 이적 기록 */}
      <section>
        <h2 className="text-lg font-semibold mb-3">이적 기록 ({transfers.length})</h2>
        {transfers.length === 0 ? (
          <p className="text-sm text-neutral-500">이적 기록이 아직 없습니다.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800/70">
            {transfers.map((t) => {
              const badge = badgeOf(t);
              return (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <span className="text-xs text-neutral-400 tabular-nums w-16 shrink-0">{fmtDate(t.transferTime ?? undefined)}</span>
                <span className="truncate text-neutral-500 flex items-center gap-1 min-w-0">
                  {t.fromTeamId && tsLogo[t.fromTeamId] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tsLogo[t.fromTeamId]} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
                  )}
                  <span className="truncate">{koTeam(t.fromTeamName)}</span>
                </span>
                <span className="text-neutral-400 shrink-0">→</span>
                <span className="truncate font-semibold flex items-center gap-1 min-w-0">
                  {t.toTeamId && tsLogo[t.toTeamId] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tsLogo[t.toTeamId]} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
                  )}
                  <span className="truncate">{koTeam(t.toTeamName)}</span>
                </span>
                {badge && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${BADGE_CLS[badge] || "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"}`}>{badge}</span>
                )}
                {t.transferFee != null && t.transferFee > 0 ? (
                  <span className="ml-auto text-xs font-semibold text-cyan-600 dark:text-cyan-400 shrink-0">€{Math.round(t.transferFee / 1e6)}M</span>
                ) : t.transferDesc && DESC_KO[t.transferDesc] ? (
                  <span className="ml-auto text-[11px] font-semibold text-neutral-500 shrink-0">{DESC_KO[t.transferDesc]}</span>
                ) : null}
              </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 시장가치·이적·현 시즌 성적 = 스코어베이스 데이터 · 국적·커리어·과거 시즌 = Wikipedia·Wikidata. 원화는 €1 = ₩{EUR_KRW.toLocaleString()} 기준 환산.
      </p>
    </article>
  );
}
