// 선수 개인페이지 (TheSports 기반) — 몸값 추이 + 변동 이력 + 이적 기록.
//   id = TheSports player id. PlayerMarketValue / TheSportsPlayer / FootballTransfer 만 사용 (api-football 안 씀).
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GOOGLE_NOINDEX } from "@/lib/seo-robots";
import { ArrowLeft, Star, Trophy, Users } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import { toKoreanTeamName } from "@/lib/team-names";
import { fifaCountryKo } from "@/lib/sports/fifa-rankings";
import rawOverrides from "../../../../data/player-overrides.json";
import rawSeason from "../../../../data/player-season-stats.json";
import rawDetailPos from "../../../../data/player-positions-detail.json";
import type { PosCode } from "@/lib/players/grid-position";
import rawPhotos from "../../../../data/player-photos.json";
import rawWiki from "../../../../data/player-wiki-seasons.json";
import rawAbility from "../../../../data/player-ability.json";
import rawTeamLogos from "../../../../data/team-logos.json";
import rawWcSquads from "../../../../data/wc-national-squads.json";
import rawPlayerBlogLinks from "../../../../data/player-blog-links.json";
import rawPlayerHeatmaps from "../../../../data/player-heatmap-analysis.json";
import rawMatchHeatmaps from "../../../../data/player-match-heatmaps.json";
import SeasonAccordion, { type SeasonEntry } from "./SeasonAccordion";
import PlayerSeasonOverview from "./PlayerSeasonOverview";
import PlayerAdvancedStats from "./PlayerAdvancedStats";
import PlayerHeatmapAnalysis, { type PlayerHeatmapData } from "./PlayerHeatmapAnalysis";
import PlayerMatchHeatmaps, { type MatchHeatmapRow } from "./PlayerMatchHeatmaps";
import PlayerBioPanel from "./PlayerBioPanel";
import PlayerCareerTable from "./PlayerCareerTable";
import { getPlayerCareerByTs } from "./career-data";
import PlayerTabs from "./PlayerTabs";
import { WC_STAR_SLUG_PREFIX } from "@/lib/sports/thesports/wc-star-report";
import CompetitionStatsSection, { getSoccerPlayerBio, type CompRow } from "@/components/transfers/CompetitionStatsSection";
import { DESC_KO, BADGE_CLS, SPECIAL_TEAM_KO, koTeam, badgeOf } from "../transfer-display";

interface CareerEntry { club: string; start: number | null; end: number | null; apps: number | null; goals: number | null; loan: boolean; nt: boolean; startTime?: number }
const OVERRIDES = rawOverrides as Record<string, { nameKo?: string; country?: string; flag?: string; career?: CareerEntry[]; pos?: string }>;

interface SeasonStat {
  lg: string; season: string; team: string | null; pos: string | null;
  matches: number | null; starts: number | null; goals: number | null; assists: number | null;
  minutes: number | null; shots: number | null; sot: number | null; keyPasses: number | null;
  passAcc: number | null; tackles: number | null; interceptions: number | null;
  yellow: number | null; red: number | null; saves: number | null;
  // 상세 스탯 (build-ts-af-player-map 확장분 — 재빌드 전 기존 항목은 undefined)
  blocks?: number | null; dribbles?: number | null; dribbleAtt?: number | null;
  dribbledPast?: number | null; duelsWon?: number | null; duelsTotal?: number | null;
  foulsDrawn?: number | null; foulsCommitted?: number | null;
}
const SEASON = rawSeason as Record<string, SeasonStat>;
const DETAIL_POS = rawDetailPos as Record<string, { primary: PosCode; others: PosCode[]; apps: number }>;

// 상세 스탯 순위 바용 백분위 — 같은 포지션군(F/M/D/G) + 최소 450분 대비 90분당 값 순위.
// 반칙·제쳐짐 등 invert 스탯은 낮을수록 높은 백분위. 비율(정확도·성공률)은 원값 순위.
const PCT_STATS: Array<{ key: string; field: keyof SeasonStat; ratio?: [keyof SeasonStat, keyof SeasonStat]; invert?: boolean; pctType: "per90" | "ratio" }> = [
  { key: "goals", field: "goals", pctType: "per90" },
  { key: "shots", field: "shots", pctType: "per90" },
  { key: "sot", field: "sot", pctType: "per90" },
  { key: "shotAcc", field: "sot", ratio: ["sot", "shots"], pctType: "ratio" },
  { key: "assists", field: "assists", pctType: "per90" },
  { key: "keyPasses", field: "keyPasses", pctType: "per90" },
  { key: "passAcc", field: "passAcc", pctType: "ratio" },
  { key: "dribbles", field: "dribbles", pctType: "per90" },
  { key: "dribbleRate", field: "dribbles", ratio: ["dribbles", "dribbleAtt"], pctType: "ratio" },
  { key: "duelsWon", field: "duelsWon", pctType: "per90" },
  { key: "duelRate", field: "duelsWon", ratio: ["duelsWon", "duelsTotal"], pctType: "ratio" },
  { key: "tackles", field: "tackles", pctType: "per90" },
  { key: "interceptions", field: "interceptions", pctType: "per90" },
  { key: "blocks", field: "blocks", pctType: "per90" },
  { key: "dribbledPast", field: "dribbledPast", pctType: "per90", invert: true },
  { key: "foulsDrawn", field: "foulsDrawn", pctType: "per90" },
  { key: "foulsCommitted", field: "foulsCommitted", pctType: "per90", invert: true },
  { key: "yellow", field: "yellow", pctType: "per90", invert: true },
  { key: "red", field: "red", pctType: "per90", invert: true },
];

function coarsePos(pos: string | null): string {
  const p = (pos ?? "").toUpperCase()[0];
  return ["F", "M", "D", "G"].includes(p) ? p : "M";
}

function computeStatPercentiles(target: SeasonStat): Record<string, number> {
  const grp = coarsePos(target.pos);
  const peers = Object.values(SEASON).filter(
    (s) => coarsePos(s.pos) === grp && (s.minutes ?? 0) >= 450,
  );
  const valOf = (s: SeasonStat, spec: (typeof PCT_STATS)[number]): number | null => {
    if (spec.pctType === "ratio") {
      if (spec.ratio) {
        const a = s[spec.ratio[0]] as number | null, b = s[spec.ratio[1]] as number | null;
        return a != null && b != null && b > 0 ? a / b : null;
      }
      const v = s[spec.field] as number | null;
      return v ?? null;
    }
    const raw = s[spec.field] as number | null;
    const mins = s.minutes ?? 0;
    return raw != null && mins > 0 ? (raw / mins) * 90 : null;
  };
  const out: Record<string, number> = {};
  for (const spec of PCT_STATS) {
    const tv = valOf(target, spec);
    if (tv == null) continue;
    const vals = peers.map((p) => valOf(p, spec)).filter((v): v is number => v != null);
    if (vals.length < 10) { out[spec.key] = 50; continue; }
    const below = vals.filter((v) => v <= tv).length;
    let p = Math.round((below / vals.length) * 100);
    if (spec.invert) p = 100 - p;
    out[spec.key] = Math.max(0, Math.min(100, p));
  }
  return out;
}
// 선수 사진 (TheSports season player.logo). DB photoUrl(라인업)보다 커버리지 높아 우선.
const PHOTOS = rawPhotos as Record<string, string>;
// 과거 시즌 (Wikipedia Career statistics) — 시즌별 클럽 리그/총 출장·골
interface WikiSeasonRow { season: string; club: string; division: string; lApps: number; lGoals: number; tApps: number; tGoals: number }
const WIKI = rawWiki as Record<string, WikiSeasonRow[]>;
// 종합 능력치 (TheSports player/ability comprehensive, 10점=만점x10 아닌 0~100 종합)
const ABILITY = rawAbility as Record<string, number>;
const HEATMAP_ANALYSIS = rawPlayerHeatmaps as Record<string, PlayerHeatmapData>;
// 경기별 원시 터치 좌표 (build-player-match-heatmaps.ts 수집)
const MATCH_HEATMAPS = rawMatchHeatmaps as unknown as Record<string, { seasonLabel: string; matches: MatchHeatmapRow[] }>;
// 팀마크 보강 — TeamSourceId→Team.logoUrl 미커버(비빅5 팀)를 ts team/additional 수집분으로 (피드와 동일)
const TEAM_LOGOS = rawTeamLogos as Record<string, string>;
// 선수 → 소속 국가대표 ts team id (WC 공식 스쿼드 역검색). 국가대표 경기 기록을 자국 경기로
// 한정 조회하기 위함 — 전세계 평가전 take 100 제한으로 누락되던 WC 미출전·평가전 위주 선수 구제.
const PLAYER_TO_NATL_TSID = new Map<string, string>();
for (const t of Object.values(rawWcSquads as Record<string, { tsId: string; squad: Array<{ id: string }> }>)) {
  for (const s of t.squad) PLAYER_TO_NATL_TSID.set(s.id, t.tsId);
}

// ISR — 몸값·이적·시즌 기록은 분 단위로 바뀌지 않음. 서울 엣지 캐시로 페이지 이동 가속(5분 재생성).
export const revalidate = 300;

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
    ? `${name} 시장가치${val ? ` €${val}M` : ""} · 몸값 추이`
    : `${name} 프로필 · 이적 기록`;
  const description = p.mv
    ? `${name} 선수의 시장가치(몸값) 변동 추이와 이적 기록, 시즌별 성적·커리어. 스코어베이스 이적시장에서 ${name} 몸값을 한눈에.`
    : `${name} 선수의 프로필과 이적 기록, 시즌별 성적·커리어 — 스코어베이스 이적시장.`;
  return {
    title,
    description,
    keywords: [name, `${name} 몸값`, `${name} 시장가치`, "이적시장", "선수 몸값", "스코어베이스"],
    openGraph: { title, description, type: "profile", ...(photo ? { images: [{ url: photo }] } : {}) },
    alternates: { canonical: `/transfers/${id}` },
    // 시장가치 데이터 없는 라이트 프로필은 thin → 구글 색인 제외(빙 등은 유지).
    ...(!p.mv && { robots: GOOGLE_NOINDEX }),
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

interface PlayerEventRow { id: string; type: string; occurredAt: Date; title: string }
// 근황 이벤트 유형 → 배지 라벨·색 + 타임라인 점 색.
const EV_META: Record<string, { label: string; badge: string; dot: string }> = {
  TRANSFER: { label: "이적", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  LOAN: { label: "임대", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
  VALUE_UP: { label: "몸값", badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300", dot: "bg-cyan-500" },
  VALUE_DOWN: { label: "몸값", badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", dot: "bg-rose-500" },
  INJURY: { label: "부상", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-500" },
  RETURN: { label: "복귀", badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", dot: "bg-green-500" },
};

// 근황 타임라인 — 이적·몸값·부상 이벤트를 최신순으로. 최근 8건 노출 + 나머지 접기.
//  occurredAt 은 UTC 저장, getUTC* 로 결정적 표기(하이드레이션 불일치 방지).
function RecentTimeline({ events }: { events: PlayerEventRow[] }) {
  if (!events.length) return null;
  const fmt = (d: Date) => `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
  const row = (e: PlayerEventRow) => {
    const m = EV_META[e.type] ?? { label: "기록", badge: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300", dot: "bg-neutral-400" };
    return (
      <div key={e.id} className="relative pl-5 py-2">
        <span className={`absolute -left-[5px] top-3.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-neutral-950 ${m.dot}`} />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-neutral-400 tabular-nums w-[84px] shrink-0">{fmt(e.occurredAt)}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${m.badge}`}>{m.label}</span>
          <span className="text-sm">{e.title}</span>
        </div>
      </div>
    );
  };
  const head = events.slice(0, 8), rest = events.slice(8);
  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">근황</h2>
      <p className="text-xs text-neutral-500 mb-3">이적·몸값·부상 등 최근 기록. 매주 자동 갱신.</p>
      <div className="relative border-l border-black/10 dark:border-white/10 ml-1.5">
        {head.map(row)}
        {rest.length > 0 && (
          <details className="group">
            <summary className="pl-5 py-2 text-xs text-cyan-600 dark:text-cyan-400 cursor-pointer select-none list-none marker:hidden hover:underline">
              이전 기록 {rest.length}건 더보기
            </summary>
            {rest.map(row)}
          </details>
        )}
      </div>
    </section>
  );
}

// 커리어 + 몸값 변동 병합 타임라인 (Wikidata P54 클럽 이력 × TheSports 몸값 history).
//  클럽 시기별로 그 기간의 시장가치 변동을 묶어 한 타임라인에 표시. 시니어 국가대표는 상단 요약.
//  클럽 로고 = 그 시기 몸값 포인트의 ts team_id 를 tsLogo 로 해소(우리 Team DB, 빅5 위주).
function CareerTimeline({ entries, hist, tsLogo, tsName = {}, tsOurId = {}, clubTeamId = {}, arrivals = [] }: { entries: CareerEntry[]; hist: ValuePoint[]; tsLogo: Record<string, string>; tsName?: Record<string, string>; tsOurId?: Record<string, number>; clubTeamId?: Record<string, string>; arrivals?: { year: number; teamId: string }[] }) {
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
  // 클럽 행 → ts team_id 해소 (로고·팀 링크 공통). 이름 일치를 최우선 —
  //  연도만으로 배정하면 같은 해 여러 클럽(본팀↔임대 반복)에서 로고가 뒤섞임
  //  (예: 첼시 행에 노팅엄 마크). 이름 매칭이 실패할 때만 연도를 fallback 으로.
  const sameClub = (a: string, b: string) =>
    matchClub(a, b) || (b.length >= 2 && a.includes(b)) || (a.length >= 2 && b.includes(a));
  const teamIdFor = (i: number): string | null => {
    const cn = normClub(clubs[i].club);
    const cy = clubs[i].start;
    // 1) 이적 도착팀 중 이름 일치(음역차 허용). 같은 클럽 재입단은 시작연도 최근접으로 택1.
    if (cn) {
      let best: string | null = null, bd = Infinity;
      for (const a of arrivals) {
        if (!tsLogo[a.teamId] || !sameClub(cn, normClub(tsName[a.teamId] || ""))) continue;
        const d = cy != null ? Math.abs(a.year - cy) : 0;
        if (d < bd) { bd = d; best = a.teamId; }
      }
      if (best) return best;
    }
    // 2) 이적기록 클럽명 → team_id (정확/접두 이름 매칭) — from-only(유스 등) 클럽 커버
    if (cn) {
      if (clubTeamId[cn]) return clubTeamId[cn];
      for (const [k, v] of Object.entries(clubTeamId)) if (matchClub(k, cn)) return v;
    }
    // 3) 그 시기 몸값 포인트 team_id — 이름 일치 시만 (임대 본클럽·연도경계 오염 방지)
    for (const vp of byClub[i]) if (vp.team && tsLogo[vp.team] && cn && sameClub(cn, normClub(tsName[vp.team] || ""))) return vp.team;
    // 4) 최후: 시작연도 최근접(±1) 이적 — career 클럽명이 음역이라 이름 매칭이 안 될 때만
    //    (함부르거↔함부르크·로스앤젤레스↔LAFC). 모호하므로 마지막 순위.
    if (cy != null) {
      let best: string | null = null, bd = 2;
      for (const a of arrivals) { if (!tsLogo[a.teamId]) continue; const d = Math.abs(a.year - cy); if (d < bd) { bd = d; best = a.teamId; } }
      if (best) return best;
    }
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
        <div className="relative border-l border-black/10 dark:border-white/10 ml-1.5">
          {clubs.map((c, i) => {
            const tid = teamIdFor(i);
            const logo = tid ? tsLogo[tid] : null;
            const href = tid && tsOurId[tid] != null ? `/teams/${tsOurId[tid]}` : null;
            const logoEl = logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="w-5 h-5 object-contain shrink-0" />
            ) : null;
            return (
            <div key={i} className="relative pl-5 py-2.5">
              <span className={`absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-neutral-950 ${c.end == null ? "bg-cyan-500" : "bg-neutral-300 dark:bg-neutral-600"}`} />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-neutral-400 tabular-nums w-[68px] shrink-0">{yrRange(c.start, c.end)}</span>
                {href ? (
                  <Link href={href} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    {logoEl}
                    <span className="font-semibold hover:underline">{c.club}</span>
                  </Link>
                ) : (
                  <>
                    {logoEl}
                    <span className="font-semibold">{c.club}</span>
                  </>
                )}
                {c.loan && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">임대</span>}
                {(c.apps != null || c.goals != null) && (
                  <span className="ml-auto text-xs text-neutral-500 tabular-nums shrink-0">
                    {c.apps != null ? `${c.apps}경기` : ""}{c.goals != null ? ` · ${c.goals}골` : ""}
                  </span>
                )}
              </div>
              {byClub[i].length > 0 && (
                <div className="mt-2 ml-1 pl-3 border-l border-dashed border-black/10 dark:border-white/10 space-y-1">
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
  const heatmapAnalysis = HEATMAP_ANALYSIS[id] ?? null;
  const matchHeatmaps = MATCH_HEATMAPS[id] ?? null;

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
  // af 선수 프로필(생년월일·키·몸무게) — 헤더 신체 + 대회별 스탯 공유 캐시. ts→af 매핑 없으면 null
  const afProfile = await getSoccerPlayerBio(id, league);

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
  const tsOurId: Record<string, number> = {}; // ts team_id → 우리 Team.id (커리어 행·헤더 팀 링크용)
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
      tsOurId[t.externalId] = tm.id;
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

  // 현 소속 stale 보정 — mv.teamId(TheSports 몸값 피드의 현 소속)는 완전이적 발효를 며칠 늦게 반영.
  //  가장 최근 "완료된" 이적이 완전이적(임대 type 1 제외)이고 도착팀이 mv.teamId 와 다르면 그쪽이 진짜 현 소속.
  //  (예: 첼시→맨유 이적 발효됐는데 몸값 피드는 아직 첼시로 남아 헤더가 첼시 표시)
  //  ⚠ 최신 이적이 임대면 보정 안 함 — 임대 중엔 몸값 피드(임대 클럽)를 그대로 신뢰(본팀 오표시 방지).
  {
    const nowSec = Math.floor(Date.now() / 1000);
    const latest = transfers.find(
      (t) => t.transferTime && t.transferTime <= nowSec && t.toTeamId && t.toTeamName && !(t.toTeamName in SPECIAL_TEAM_KO),
    );
    if (latest?.toTeamId && latest.transferType !== 1 && latest.toTeamId !== mv?.teamId) {
      teamName = koTeam(latest.toTeamName!);
      teamLogo = tsLogo[latest.toTeamId] ?? teamLogo;
      ourTeamId = tsOurId[latest.toTeamId] ?? null;
    }
  }

  // 커리어 행 로고용 — 이적기록 도착팀 연도→team_id (career 시작연도 최근접 매칭, 표기차·경계 무관)
  const arrivals = transfers
    .filter((t) => t.toTeamId && t.transferTime)
    .map((t) => ({ year: new Date(t.transferTime! * 1000).getUTCFullYear(), teamId: t.toTeamId! }));

  // 커리어 행 클럽명 → ts team_id (이적기록 from/to, 과거→최신 순회로 최신 이적 우선).
  //  team_id 를 담아 로고(tsLogo)·팀 링크(tsOurId)를 함께 해소.
  const clubTeamId: Record<string, string> = {};
  for (const t of [...transfers].reverse()) {
    for (const [tid, tname] of [[t.fromTeamId, t.fromTeamName], [t.toTeamId, t.toTeamName]] as const) {
      if (tid && tname && tsLogo[tid]) clubTeamId[normClub(tname)] = tid;
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
  const natlSelect = { id: true, league: true, startTime: true, homeTeamId: true, awayTeamId: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } }, homeScore: true, awayScore: true } as const;
  const [wcMatchRows, frMatchRows] = await Promise.all([
    prisma.match.findMany({ where: { league: "WORLD_CUP", status: "FINISHED", ...natlWhere }, orderBy: { startTime: "desc" }, select: natlSelect }),
    prisma.match.findMany({ where: { league: "INTL_FRIENDLY", status: "FINISHED", ...natlWhere }, orderBy: { startTime: "desc" }, ...(natlTeamIds.length ? {} : { take: 100 }), select: natlSelect }),
  ]);
  const natlMatchList = [...wcMatchRows, ...frMatchRows];
  const natlById = new Map(natlMatchList.map((m) => [m.id, m]));
  const natlCaches = natlMatchList.length
    ? await prisma.theSportsMatchCache.findMany({ where: { matchId: { in: natlMatchList.map((m) => m.id) } }, select: { matchId: true, playerStats: true } })
    : [];
  interface NatlGame { time: number; wc: boolean; year: number; home: string; away: string; hs: number | null; as: number | null; goals: number; assists: number; rating: number; keyPasses: number; shots: number; tackles: number; interceptions: number; result: "W" | "L" | "D" | null }
  const natlGames: NatlGame[] = [];
  const koNat = (n: string) => toKoreanTeamName(n) || fifaCountryKo(n) || n;
  for (const c of natlCaches) {
    const ps = c.playerStats as Array<{ player_id: string; goals?: number; assists?: number; rating?: number; minutes_played?: number; key_passes?: number; shots?: number; tackles?: number; interceptions?: number }> | null;
    if (!Array.isArray(ps)) continue;
    const row = ps.find((s) => s.player_id === id);
    if (!row || (row.minutes_played ?? 0) === 0) continue; // 미출전 제외
    const m = natlById.get(c.matchId);
    if (!m) continue;
    // 승무패 — 선수 소속 국대팀이 홈/원정 어느 쪽인지로 판정 (natlTeamIds 있을 때만)
    const isHome = natlTeamIds.length ? natlTeamIds.includes(m.homeTeamId) : null;
    let result: "W" | "L" | "D" | null = null;
    if (isHome != null && m.homeScore != null && m.awayScore != null) {
      const my = isHome ? m.homeScore : m.awayScore;
      const opp = isHome ? m.awayScore : m.homeScore;
      result = my > opp ? "W" : my < opp ? "L" : "D";
    }
    natlGames.push({
      time: m.startTime.getTime(), wc: m.league === "WORLD_CUP", year: m.startTime.getUTCFullYear(),
      home: koNat(m.homeTeam.name), away: koNat(m.awayTeam.name), hs: m.homeScore, as: m.awayScore,
      goals: row.goals ?? 0, assists: row.assists ?? 0, rating: Number(row.rating) || 0,
      keyPasses: row.key_passes ?? 0, shots: row.shots ?? 0, tackles: row.tackles ?? 0, interceptions: row.interceptions ?? 0,
      result,
    });
  }
  natlGames.sort((a, b) => b.time - a.time);
  // 월드컵 시즌 합산 — 현 시즌 대회별 스탯에 추가 (natlGames 의 WC 경기 집계)
  const wcGamesPlayed = natlGames.filter((g) => g.wc);
  const wcRated = wcGamesPlayed.filter((g) => g.rating > 0);
  const wcCompRow: CompRow | null = wcGamesPlayed.length
    ? {
        leagueName: "World Cup",
        logo: "https://media.api-sports.io/football/leagues/1.png",
        appearances: wcGamesPlayed.length,
        goals: wcGamesPlayed.reduce((s, g) => s + g.goals, 0),
        assists: wcGamesPlayed.reduce((s, g) => s + g.assists, 0),
        rating: wcRated.length ? wcRated.reduce((s, g) => s + g.rating, 0) / wcRated.length : null,
      }
    : null;
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
  const RES_CLS: Record<string, string> = {
    W: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    L: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    D: "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
  };
  const natlGameRow = (g: NatlGame, i: number) => {
    const d = new Date(g.time + 9 * 3600e3).toISOString().slice(5, 10).replace("-", ".");
    const chips: [string, number][] = [["도움", g.assists], ["키패스", g.keyPasses], ["슛", g.shots], ["태클", g.tackles], ["인터셉트", g.interceptions]];
    return (
      <div key={i} className="rounded-lg ring-1 ring-black/5 dark:ring-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-xs text-neutral-400 tabular-nums shrink-0 w-11">{d}</span>
          {g.result && (
            <span className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${RES_CLS[g.result]}`}>{g.result}</span>
          )}
          <span className="truncate min-w-0 flex-1 text-neutral-600 dark:text-neutral-300">{g.home} <span className="font-bold tabular-nums text-neutral-900 dark:text-white">{g.hs}-{g.as}</span> {g.away}</span>
          {g.goals >= 3 && <span className="text-[10px] font-bold text-rose-500 shrink-0">해트트릭</span>}
          {g.goals > 0 && <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">⚽{g.goals}</span>}
          {g.rating > 0 && <span className="text-amber-600 dark:text-amber-400 font-semibold text-xs shrink-0">★{g.rating.toFixed(1)}</span>}
        </div>
        {chips.some(([, v]) => v > 0) && (
          <div className="flex flex-wrap gap-1 mt-1.5 pl-[52px]">
            {chips.filter(([, v]) => v > 0).map(([k, v]) => (
              <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                {k} {v}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  // 이 선수 관련 글 — STAR 리포트(slug=world-cup-star-{date}-{playerId} → -id 로 끝남)
  const relatedArticles = await prisma.article.findMany({
    where: { status: "PUBLISHED", slug: { startsWith: WC_STAR_SLUG_PREFIX, endsWith: `-${id}` } },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, publishedAt: true },
    take: 12,
  });

  // 수동 작성 블로그 글 — data/player-blog-links.json 에 선수id → slug 등재하면 노출.
  const blogSlugs = (rawPlayerBlogLinks as Record<string, string[]>)[id] ?? [];
  const relatedBlogs = blogSlugs.length
    ? await prisma.blog.findMany({
        where: { slug: { in: blogSlugs } },
        orderBy: { publishedAt: "desc" },
        select: { slug: true, title: true, publishedAt: true },
      })
    : [];

  // 근황 이벤트 (이적·몸값·부상) — 최신순. collect-player-events cron 이 주간 적재.
  const playerEvents = await prisma.playerEvent.findMany({
    where: { playerId: id },
    orderBy: { occurredAt: "desc" },
    take: 60,
    select: { id: true, type: true, occurredAt: true, title: true },
  });

  // 경력 (API-Football 시즌별 대회별 스탯) — af 매핑 있으면. 없으면 WIKI 시즌 폴백.
  const careerGroups = await getPlayerCareerByTs(id);

  return (
    <article className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <AmbientGlow />
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/transfers${league ? `?league=${league}` : ""}`}
          className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden /> 이적시장
        </Link>
        <Link
          href={`/compare?a=${id}`}
          className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-600 ring-1 ring-cyan-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-cyan-400"
        >
          <Users className="h-3 w-3" aria-hidden /> 비교하기
        </Link>
      </div>

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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name}</h1>
            {(DETAIL_POS[id]?.primary || ov?.pos || tsp?.position) && (
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                {DETAIL_POS[id]?.primary || ov?.pos || POS_LABEL[tsp!.position!]}
              </span>
            )}
            {ability != null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300" title="종합 능력치">
                <Star className="h-3 w-3" aria-hidden /> 종합 {ability}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* 바이오 + 포지션 패널 (정보 왼쪽 / 포지션 오른쪽) */}
      <PlayerBioPanel
        age={mv?.age ?? null}
        birthDate={afProfile?.birthDate ?? null}
        height={afProfile?.height ?? null}
        weight={afProfile?.weight ?? null}
        country={ov?.country ?? null}
        flag={ov?.flag ?? null}
        natlHref={natlTeamIds.length > 0 ? `/national-teams/${natlTeamIds[0]}` : null}
        teamName={teamName}
        teamLogo={teamLogo ?? null}
        leagueLabel={league ? LEAGUE_LABEL[league] : null}
        teamHref={ourTeamId != null ? `/teams/${ourTeamId}` : null}
        valueEur={value ?? null}
        valueKrw={value != null ? krw(value) : null}
        recentChg={points.length >= 2 ? recentChg : null}
        positions={DETAIL_POS[id] ? { primary: DETAIL_POS[id].primary, others: DETAIL_POS[id].others } : null}
        posCode={tsp?.position ?? null}
      />

      {/* 탭 — 개요 / 시즌별 / 경기 / 이적 (buildup IA). 헤더·출처는 탭 밖 고정 */}
      <PlayerTabs
        tabs={[
          {
            key: "overview",
            label: "개요",
            content: (
              <>
                {heatmapAnalysis && (
                  <PlayerHeatmapAnalysis name={name} data={heatmapAnalysis} />
                )}
                {/* 시즌 상세 기록 — 레이더 + 90분당 + 슈팅/패스/수비 */}
                {season && (season.minutes ?? 0) > 0 && (
                  <PlayerSeasonOverview name={name} stat={season} />
                )}
                {/* 시즌 성적 상세 — FotMob식 카테고리별 스탯 + 포지션 백분위 순위 바 (펼치기) */}
                {season && (season.minutes ?? 0) > 0 && (
                  <PlayerAdvancedStats stat={season} pct={computeStatPercentiles(season)} />
                )}
                {/* 현 시즌 대회별 스탯 (af). ts→af 매핑 없으면 자동 미표시 */}
                <CompetitionStatsSection tsId={id} league={mv?.league ?? null} extraRows={wcCompRow ? [wcCompRow] : []} />
                {/* 몸값 추이 차트 */}
                {points.length >= 2 && (
                  <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
                    <div className="flex items-baseline justify-between mb-3">
                      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">시장가치 추이</h2>
                      <span className="text-xs text-neutral-400">최고 €{Math.round(peak)}M</span>
                    </div>
                    <ValueChart points={points} markers={markers} />
                  </section>
                )}
                {/* 커리어 & 몸값 변동 — 시장가치 추이 바로 아래 (개요) */}
                {careerView.length > 0 ? (
                  <CareerTimeline entries={careerView} hist={valuePoints} tsLogo={tsLogo} tsName={tsTeamName} tsOurId={tsOurId} clubTeamId={clubTeamId} arrivals={arrivals} />
                ) : hist.length >= 1 ? (
                  <section>
                    <h2 className="text-lg font-semibold mb-3">변동 이력 ({hist.length})</h2>
                    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">시점</th>
                            <th className="text-right px-3 py-2 font-medium">시장가치</th>
                            <th className="text-right px-3 py-2 font-medium">원화</th>
                            <th className="text-right px-3 py-2 font-medium">나이</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 dark:divide-white/5">
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
              </>
            ),
          },
          ...(careerGroups.length > 0
            ? [{ key: "career", label: "경력", content: <PlayerCareerTable groups={careerGroups} /> }]
            : seasonEntries.length > 0
            ? [{ key: "seasons", label: "시즌별", content: <SeasonAccordion seasons={seasonEntries} /> }]
            : []),
          ...(natlGroups.length > 0
            ? [{
                key: "matches",
                label: "경기",
                content: (
                  <section className="space-y-2">
                    {natlGroups.map((grp, gi) => (
                      <details key={grp.label} open={gi === 0} className="group rounded-xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
                        <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                          <span className={`inline-flex items-center gap-1.5 font-bold ${grp.wc ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-700 dark:text-neutral-200"}`}>{grp.wc && <Trophy className="h-3.5 w-3.5" aria-hidden />}{grp.label}</span>
                          <span className="text-xs text-neutral-500">{grp.games.length}경기 · ⚽{grp.goals} 🅰️{grp.assists}</span>
                          <span className="ml-auto text-neutral-400 text-xs transition-transform group-open:rotate-180">▾</span>
                        </summary>
                        <div className="px-2.5 pb-2.5 pt-0.5 space-y-1.5">{grp.games.map(natlGameRow)}</div>
                      </details>
                    ))}
                  </section>
                ),
              }]
            : []),
          {
            key: "transfers",
            label: "이적",
            content: (
              <>
      {/* 근황 — 이적·몸값·부상 최근 기록 (이적 탭 최상단) */}
      {playerEvents.length > 0 && <RecentTimeline events={playerEvents} />}

      {/* 이적 기록 */}
      <section>
        <h2 className="text-lg font-semibold mb-3">이적 기록 ({transfers.length})</h2>
        {transfers.length === 0 ? (
          <p className="text-sm text-neutral-500">이적 기록이 아직 없습니다.</p>
        ) : (
          <div className="overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/10 divide-y divide-black/5 dark:divide-white/5">
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
              </>
            ),
          },
          ...(matchHeatmaps && matchHeatmaps.matches.length > 0
            ? [{
                key: "heatmap",
                label: "히트맵",
                content: (
                  <PlayerMatchHeatmaps
                    name={name}
                    seasonLabel={matchHeatmaps.seasonLabel}
                    matches={matchHeatmaps.matches}
                    seasonData={heatmapAnalysis}
                  />
                ),
              }]
            : []),
        ]}
      />

      {/* 이 선수 관련 글 — STAR 리포트 등 (선수 페이지 → 글 바로가기) */}
      {(relatedArticles.length > 0 || relatedBlogs.length > 0) && (
        <section>
          <h2 className="text-lg font-semibold mb-3">{name} 관련 글 ({relatedArticles.length + relatedBlogs.length})</h2>
          <div className="overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/10 divide-y divide-black/5 dark:divide-white/5">
            {relatedBlogs.map((b) => (
              <Link
                key={b.slug}
                href={`/blog/${b.slug}`}
                className="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">분석</span>
                <span className="truncate font-semibold min-w-0 flex-1">{b.title}</span>
                <span className="ml-auto shrink-0 text-xs text-neutral-400 tabular-nums">{fmtDate(b.publishedAt ? Math.floor(b.publishedAt.getTime() / 1000) : undefined)}</span>
              </Link>
            ))}
            {relatedArticles.map((a) => (
              <Link
                key={a.slug}
                href={`/articles/${a.slug}`}
                className="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400">STAR</span>
                <span className="truncate font-semibold min-w-0 flex-1">{a.title}</span>
                <span className="ml-auto shrink-0 text-xs text-neutral-400 tabular-nums">{fmtDate(a.publishedAt ? Math.floor(a.publishedAt.getTime() / 1000) : undefined)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 시장가치·이적·현 시즌 성적 = 스코어베이스 데이터 · 국적·커리어·과거 시즌 = Wikipedia·Wikidata. 원화는 €1 = ₩{EUR_KRW.toLocaleString()} 기준 환산.
      </p>
    </article>
  );
}
