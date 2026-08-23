// /en/transfers — 이적시장 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import TransfersFilterBar from "./TransfersFilterBar";
import { boundaryShare } from "@/lib/transfers/transfer-date";
import { koEnLanguages } from "@/lib/i18n/en";
import { leagueLogoUrl } from "@/lib/sports/league-logos";
import { ogPageImage } from "@/lib/seo/og";
import rawDetailPos from "../../../../data/player-positions.json";
import rawOverrides from "../../../../data/player-overrides.json";
import rawPhotos from "../../../../data/player-photos.json";
import rawTeamLogos from "../../../../data/team-logos.json";
import rawSquads from "../../../../data/team-squads.json";
import rawCoaches from "../../../../data/team-coaches.json";
import rawCoachPhotos from "../../../../data/coach-photos.json";
import { currentTsTeamId, squadPlayerIds } from "@/lib/transfers/current-team";
import { DESC_KO, BADGE_CLS, koTeam, badgeOf } from "./transfer-display";
import SquadBestXI, { pickBestXI } from "./SquadBestXI";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/en/PlayerValueTabs";
import { breadcrumbLd, datasetLd, jsonLdScript } from "@/lib/seo/jsonld";
import { Wallet, Banknote, ArrowLeftRight, Users, RefreshCw, Search, Sparkles, Zap, Newspaper, Gem, Award } from "lucide-react";

export const dynamic = "force-dynamic";

// SEO — 선수 몸값/이적시장 키워드 + 스코어베이스 브랜드. view 별 타이틀 분기.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ league?: string; view?: string; q?: string; team?: string }> }): Promise<Metadata> {
  const sp = await searchParams;
  const win = transferWindow();
  const lgLabel = sp.league && LEAGUES[sp.league] ? LEAGUES[sp.league] : null;
  let title: string, description: string, canonical = "/en/transfers";
  let teamKeywords: string[] = [];
  if (sp.view === "team" && sp.team && Number.isFinite(Number(sp.team))) {
    // 팀 스쿼드 — "맨유 스쿼드" 류 검색 수요 타깃. 팀명 DB 조회.
    const t = await prisma.team.findUnique({ where: { id: Number(sp.team) }, select: { name: true } });
    const nm = t ? t.name : null;
    if (nm) {
      title = `${nm} Squad — Player Market Values`;
      description = `${nm} squad market values — total value, best XI, and each player's value, position and age.`;
      canonical = `/en/transfers?view=team&team=${Number(sp.team)}`;
      teamKeywords = [`${nm} squad`, `${nm} squad`, `${nm} player values`];
    } else {
      title = "Squad Values — Club Market Value Ranking";
      description = "Squad market value ranking by club across Europe's big five.";
    }
  } else if (sp.view === "squads") {
    const scope = lgLabel ? `${lgLabel} ` : "Europe's big five ";
    title = `${scope}Squad Value Ranking — Total Club Value`;
    description = `${scope} total squad market value by club, with average age and most valuable player.`;
    canonical = lgLabel ? `/en/transfers?view=squads&league=${sp.league}` : "/en/transfers?view=squads";
  } else if (sp.view === "bigdeals") {
    title = `${win.label} Big Deals — Top Transfer Fees`;
    description = `${win.label} highest transfer fees across Europe's big five, ranked by fee.`;
    canonical = "/en/transfers?view=bigdeals";
  } else if (sp.view === "inout") {
    title = `Club Ins and Outs · ${win.label}`;
    description = `${win.label} ins and outs by club across Europe's big five, with spend, income and net spend.`;
    canonical = "/en/transfers?view=inout";
  } else if (sp.view === "latest") {
    const scope = lgLabel || "Europe's big five · K League 1 · Saudi · MLS";
    title = `Latest Football Transfers · ${lgLabel || "Top leagues"}`;
    description = `${scope} transfers, newest first. Fees, loans and free transfers, updated daily.`;
    canonical = lgLabel ? `/en/transfers?view=latest&league=${sp.league}` : "/en/transfers?view=latest";
  } else if (sp.view === "rumors") {
    title = "Imminent Transfers & Rumours — Here We Go Tracker";
    description = "Transfer reports at the agreed, medical and talks stages, filtered to credible sources only — the flow of a deal before it is official.";
    canonical = "/en/transfers?view=rumors";
  } else {
    const scope = lgLabel ? `${lgLabel} ` : "Europe's big five ";
    title = `${scope}Player Market Value Rankings — Transfer Market`;
    description = `${scope}league market value rankings with value trends, transfer records and season-by-season stats.`;
  }
  return {
    title,
    description,
    keywords: [...teamKeywords, "Player values", "Market value", "Transfers", "football transfers", "Fee", "player market value", "Scorebase", "Big five leagues"],
    openGraph: {
      title,
      description,
      type: "website",
      images: ogPageImage({ title: title.replace(/\s*\|\s*스코어베이스\s*$/, ""), subtitle: "Player values, market values and transfer records", tag: "Transfers" }),
    },
    alternates: {
      canonical,
      // 영어판(/en/transfers) hreflang — base 뷰에서만 상호 연결
      ...(canonical === "/transfers"
        ? { languages: koEnLanguages("/transfers", "/en/transfers") }
        : {}),
    },
    ...(sp.q ? { robots: { index: false } } : {}), // 검색 결과 페이지는 색인 제외
  };
}

const LEAGUES: Record<string, string> = {
  EPL: "EPL",
  LALIGA: "LaLiga",
  BUNDESLIGA: "Bundesliga",
  SERIE_A: "Serie A",
  LIGUE_1: "Ligue 1",
  K_LEAGUE_1: "K League 1",
  K_LEAGUE_2: "K League 2",
  SAUDI_PL: "Saudi Pro League",
  MLS: "MLS",
};
const LEAGUE_LIST = Object.entries(LEAGUES).map(([code, label]) => ({ code, label, logo: leagueLogoUrl(code) }));
// 임박·루머 단계 배지 — TransferRumor.stage (news-briefing 통합 러닝이 채움)
const RUMOR_STAGES: Record<string, { label: string; cls: string }> = {
  OFFICIAL: { label: "Official", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20" },
  HERE_WE_GO: { label: "Here we go · agreed", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20" },
  MEDICAL: { label: "Medical", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20" },
  TALKS: { label: "In talks", cls: "bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 ring-neutral-500/20" },
};
// 빅5 — 시장가치 기반 뷰(머니파워·스쿼드 가치·IN/OUT·팀 옵션) 범위.
// 확장 리그(K리그1·사우디·MLS)는 PlayerMarketValue 커버리지가 얇아(17~179명) 피드·빅딜만 노출.
const FIVE = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];

// 팀 필터 드롭다운 옵션 + 팀 메타/매핑 인덱스.
// 빅5 전 선수 groupBy(수천 row)는 무거운데 view 와 무관하게 매 요청 필요 →
// force-dynamic 이라도 이 데이터만 시장가치 수집 주기(주기적 cron)에 맞춰 30분 캐시.
// Map 은 직렬화 불가 → entries 배열로 반환, 호출부에서 재구성.
const getTransferTeamIndex = unstable_cache(
  async () => {
    // 소속은 공식 스쿼드 기준(currentTsTeamId) — PMV.teamId 만 보면 이적한 선수가 옛 팀에 남는다.
    const pmvRows = await prisma.playerMarketValue.findMany({
      where: { league: { in: FIVE }, currentValue: { not: null }, teamId: { not: null } },
      select: { id: true, teamId: true },
    });
    // 매핑 대상 ts 팀 = PMV 소속 ∪ 공식 스쿼드가 지목한 소속 ∪ 빅5 전 팀(신승격·명단만 있는 팀)
    const big5Ts = await prisma.teamSourceId.findMany({
      where: { source: "thesports", team: { league: { in: FIVE } } },
      select: { externalId: true, teamId: true },
    });
    const allTsTeamIds = [
      ...new Set([
        ...pmvRows.map((r) => r.teamId!),
        ...pmvRows.map((r) => currentTsTeamId(r.id, r.teamId)).filter((x): x is string => !!x),
        ...big5Ts.map((t) => t.externalId),
      ]),
    ];
    const tsT = await prisma.teamSourceId.findMany({
      where: { source: "thesports", externalId: { in: allTsTeamIds } },
      select: { externalId: true, teamId: true },
    });
    // 빅5 공식 스쿼드에 있는데 PMV.league 라벨은 아직 비빅5(이적 후 미갱신·미채움)인 선수 —
    // league 조건만으로는 후보에서 빠지므로 id 로 따로 끌어올 목록을 여기서 만들어 캐시한다.
    // notIn 은 NULL 을 걸러내므로(대부분이 league=null) OR 로 명시한다.
    const outsideLabelRows = await prisma.playerMarketValue.findMany({
      where: {
        id: { in: squadPlayerIds(big5Ts.map((t) => t.externalId)) },
        currentValue: { not: null },
        OR: [{ league: null }, { league: { notIn: FIVE } }],
      },
      select: { id: true, teamId: true },
    });
    // 한 ts팀 id 가 여러 Team 에 매핑된 경우 빅5 리그 Team 우선(엉뚱한 동명 클럽 방지).
    const candByTs = new Map<string, number[]>();
    for (const t of tsT) { const a = candByTs.get(t.externalId) || []; a.push(t.teamId); candByTs.set(t.externalId, a); }
    const ourTeamRows = await prisma.team.findMany({
      where: { id: { in: [...new Set(tsT.map((t) => t.teamId))] } },
      select: { id: true, name: true, logoUrl: true, league: true },
    });
    const teamMeta = new Map(ourTeamRows.map((t) => [t.id, t]));
    const FIVE_SET = new Set(FIVE);
    const tsToOur = new Map<string, number>();
    for (const [ext, idsArr] of candByTs) {
      const big5 = idsArr.find((id) => { const tm = teamMeta.get(id); return tm && FIVE_SET.has(tm.league); });
      tsToOur.set(ext, big5 ?? idsArr[0]);
    }
    const teamCount = new Map<number, number>();
    for (const r of [...pmvRows, ...outsideLabelRows]) {
      const ts = currentTsTeamId(r.id, r.teamId);
      const our = ts ? tsToOur.get(ts) : undefined;
      if (our != null && FIVE_SET.has(teamMeta.get(our)?.league || "")) {
        teamCount.set(our, (teamCount.get(our) || 0) + 1);
      }
    }
    const teamOptions = [...teamCount.entries()]
      .map(([id, count]) => ({ id, name: teamMeta.get(id)?.name || "", count }))
      .filter((t) => t.name)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return {
      teamOptions,
      teamMetaEntries: [...teamMeta.entries()],
      tsToOurEntries: [...tsToOur.entries()],
      outsideLabelIds: outsideLabelRows.map((r) => r.id),
    };
  },
  ["transfers-team-index"],
  { revalidate: 1800, tags: ["transfers-team-index"] },
);

// 몸값 랭킹 후보 행 — 페이지가 실제로 쓰는 파생 형태.
// PlayerMarketValue.history 는 행당 평균 18개 스냅샷이라 빅5 전체를 raw 로 당기면 9.2MB(그중 92%가 history)다.
// 소비처는 ① 마지막 스냅샷 시각(18개월 활성 컷오프) ② 가치 배열(스파크라인·등락률) 둘뿐 →
// 여기까지 미리 접어 0.64MB 로 줄인다. /scores 의 lineup·detailLive 파생 캐시와 같은 패턴.
interface PmvRow {
  id: string;
  teamId: string | null;
  currentValue: number | null;
  age: number | null;
  league: string | null;
  lastTime: number;
  hist: number[];
}

// history(Json) → 파생. lastTime 은 필터 전 마지막 원소 기준, hist 는 0 제외 — 원래 계산과 동일하게 유지.
function toPmvRows(raw: { id: string; teamId: string | null; currentValue: number | null; age: number | null; league: string | null; history: unknown }[]): PmvRow[] {
  return raw.map((r) => {
    const h = Array.isArray(r.history) ? (r.history as Hist[]) : [];
    return {
      id: r.id,
      teamId: r.teamId,
      currentValue: r.currentValue,
      age: r.age,
      league: r.league,
      lastTime: h[h.length - 1]?.market_time ?? 0,
      hist: h.map((x) => (x?.market_value || 0) / 1e6).filter((v) => v > 0),
    };
  });
}

// 기본 스코프(전체·포지션별·국가별, 그리고 league/team 미지정 뷰) 후보 — 몸값은 일일 증분 크론이라 30분 캐시.
// team·league 지정 뷰는 where 가 요청마다 달라 캐시 대상이 아니다(호출부에서 직접 조회).
const getPmvRowsDefault = unstable_cache(
  async (): Promise<PmvRow[]> => {
    const { outsideLabelIds } = await getTransferTeamIndex();
    const raw = await prisma.playerMarketValue.findMany({
      where: {
        currentValue: { not: null },
        OR: [{ league: { in: FIVE } }, { id: { in: outsideLabelIds } }],
      },
      orderBy: { currentValue: "desc" },
      select: { id: true, teamId: true, currentValue: true, age: true, league: true, history: true },
    });
    return toPmvRows(raw);
  },
  ["transfers-pmv-rows-default"],
  { revalidate: 1800, tags: ["transfers-pmv-rows-default"] },
);

// 이적 피드(최신·빅딜) 범위 — 전체 커버 리그.
const FEED_LEAGUES = Object.keys(LEAGUES);
// 세부 포지션 — 라인업 x/y 도출(data/player-positions.json). 없으면 coarse(G/D/M/F)로 fallback.
const DETAIL_POS = rawDetailPos as Record<string, string>;
// Wikidata 보강 — ts player id → { 교정 한글명, 국적(ko), 국기, 주 포지션(P413) }
const OVERRIDES = rawOverrides as Record<string, { nameKo?: string; country?: string; flag?: string; pos?: string }>;
// 선수 사진 (TheSports season player.logo, 빅5 ~2.6k). DB photoUrl(라인업) 보다 커버리지 높아 우선.
const PHOTOS = rawPhotos as Record<string, string>;
// 피드 팀마크 보강 — TeamSourceId→Team.logoUrl 미커버(비빅5 출신팀)를 ts team/additional 수집분으로.
// 생성: scripts/build-transfer-team-logos.ts (신규 팀 등장 시 재실행)
const TEAM_LOGOS = rawTeamLogos as Record<string, string>;
// 공식 스쿼드 (ts team/squad/list — 등번호·공식 coarse 포지션). 생성: scripts/build-team-squads.ts
const SQUADS = rawSquads as Record<string, { updatedAt: string; squad: Array<{ id: string; name: string; position: string | null; number: number | null }> }>;
// 감독 (ts coach/list — 선호 포메이션·부임·계약). 생성: scripts/build-team-coaches.ts
// 라인업 감독 사전 — team-coaches nameKo 누락분 한글명 폴백 (키 = 감독 id)
const COACHES = rawCoaches as Record<string, { id?: string; name: string; nameKo: string | null; logo: string | null; age: number | null; nationality: string | null; preferredFormation: string | null; joined: number | null; contractUntil: number | null }>;
const COACH_PHOTOS_KO = rawCoachPhotos as Record<string, { nameKo?: string }>;
const coachKoName = (c: { id?: string; name: string; nameKo: string | null }) => c.name;
const POS_CODES = ["GK", "CB", "FB", "DM", "CM", "AM", "W", "ST"];
// 포지션 우선순위: Wikidata P413(검증된 주 포지션) > 라인업 x/y 추정 > ts coarse
function posCodeOf(id: string, coarse: string | null | undefined): string | null {
  if (OVERRIDES[id]?.pos) return OVERRIDES[id].pos!;
  if (DETAIL_POS[id]) return DETAIL_POS[id];
  return coarse === "G" ? "GK" : coarse === "M" ? "MF" : coarse === "D" ? "DF" : coarse === "F" ? "FW" : null;
}
const PER = 20;
/**
 * 임박·루머 피드가 거슬러 올라가는 기간. 표시 문구도 이 값을 쓴다(따로 적으면 어긋난다).
 * 수집 잡의 보존 기간(src/jobs/extract-transfer-rumors.ts KEEP_DAYS)과 같아야 한다 —
 * 저쪽이 더 짧으면 여기서 아무리 길게 잡아도 데이터가 없다.
 */
const RUMOR_DAYS = 30;

// 이적창 윈도우 — 6~9월 = 그해 여름창(6/1~), 12~2월 = 겨울창(12/1~), 그 외 = 최근 90일.
// to = 창 종료 상한: 여름 이적은 7/1 발효(시즌 전환일)로 기록되는 행이 다수라 미래 발효도
// 창 내면 표시하되, 연말·내년 "임대 복귀 예정" 노이즈는 잘라낸다.
function transferWindow(): { label: string; from: number; to: number } {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  if (m >= 6 && m <= 9) return { label: `${y} summer window`, from: Date.UTC(y, 5, 1) / 1000, to: Date.UTC(y, 9, 1) / 1000 };
  if (m === 12) return { label: `${y + 1} winter window`, from: Date.UTC(y, 11, 1) / 1000, to: Date.UTC(y + 1, 2, 1) / 1000 };
  if (m <= 2) return { label: `${y} winter window`, from: Date.UTC(y - 1, 11, 1) / 1000, to: Date.UTC(y, 2, 1) / 1000 };
  return { label: "Last 90 days", from: Math.floor(now.getTime() / 1000) - 90 * 86400, to: Math.floor(now.getTime() / 1000) + 30 * 86400 };
}

const EUR_KRW = 1791.5;
function krw(eurM: number): string {
  const eok = (eurM * 1e6 * EUR_KRW) / 1e8;
  if (eok >= 10000) return (eok / 10000).toFixed(2) + "";
  return Math.round(eok).toLocaleString() + "";
}

// 이적일 (unix초) → "26.06.02"
function fmtDate(unix?: number | null): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
// TheSports transfer_desc → 한글 (이적료 없을 때 표시)
// 이적 표시 공통(DESC_KO·SPECIAL_TEAM_KO·BADGE_CLS·koTeam·badgeOf)은 transfer-display.ts 공유 —
// 선수 페이지(/transfers/[id]) 이적 기록과 동일 규칙.

// 소식일(행 첫 수집 시각, KST) → 그룹 헤더 — 최신 이적은 발효일이 아니라 "소식이 뜬 날" 기준.
// 발효일(transferTime)은 날짜 단위 무더기(7/1 시즌 전환)라 최신순 구분이 안 됨.
function fmtNewsHeader(unix: number): string {
  const d = new Date((unix + 9 * 3600) * 1000); // KST 보정 후 UTC getter 사용
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const y = d.getUTCFullYear();
  const cur = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  return `${y !== cur ? `${y}-` : ""}${d.getUTCMonth() + 1}-${d.getUTCDate()} (${wd})`;
}

// 발효일 셀 — 미래 발효는 "예정" 명시 (소식일 그룹 안에 섞여 들어오므로 카드에서 구분)
function fmtDateCell(unix: number): string {
  return unix * 1000 > Date.now() ? `${fmtDate(unix)} upcoming` : fmtDate(unix);
}

function pageNums(cur: number, total: number): (number | string)[] {
  const out: (number | string)[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= cur - 2 && i <= cur + 2)) out.push(i);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return <svg width={70} height={26} className="shrink-0 hidden sm:block" aria-hidden />;
  const w = 70, h = 26, pad = 3;
  const max = Math.max(...data), min = Math.min(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} className="shrink-0 hidden sm:block" aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

interface Hist { market_value?: number; market_time?: number }
interface TransferCard {
  id: string; playerId: string; name: string; posCode: string | null; photo: string | null;
  fromTeam: string; toTeam: string; time: number; fee: number; desc: string | null; league: string | null;
  ttype: number | null; badge: string | null;
  flag: string | null; country: string | null; fromLogo: string | null; toLogo: string | null;
  age: number | null;
  newsAt: number; // 소식일 — 행 첫 수집 시각 unix 초 (upsert 가 updatedAt 을 안 건드려 first-seen)
}

interface TsPlayerLite { nameKo: string | null; name: string | null; photoUrl: string | null; position: string | null }
interface TransferRow {
  id: string; playerId: string; fromTeamName: string | null; toTeamName: string | null;
  fromTeamId: string | null; toTeamId: string | null;
  transferTime: number | null; transferFee: number | null; transferDesc: string | null; league: string | null;
  transferType: number | null;
  updatedAt: Date;
}

// 피드 행의 ts 팀 id → 로고 URL. ① TeamSourceId→Team.logoUrl(빅5 우선 — 동명 클럽 방지)
// ② 미커버(비빅5 출신팀)는 TEAM_LOGOS 정적 사전 fallback.
async function buildTeamLogoMap(rows: Array<{ fromTeamId: string | null; toTeamId: string | null }>): Promise<Map<string, string>> {
  const ids = [...new Set(rows.flatMap((r) => [r.fromTeamId, r.toTeamId]).filter((x): x is string => !!x))];
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const srcRows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: ids } },
    select: { externalId: true, team: { select: { logoUrl: true, league: true } } },
  });
  const big5 = new Set(FIVE);
  const picked = new Map<string, boolean>(); // tsId → 채택분이 빅5인지
  for (const s of srcRows) {
    if (!s.team.logoUrl) continue;
    const isBig5 = big5.has(s.team.league);
    if (!map.has(s.externalId) || (isBig5 && !picked.get(s.externalId))) {
      map.set(s.externalId, s.team.logoUrl);
      picked.set(s.externalId, isBig5);
    }
  }
  for (const id of ids) if (!map.has(id) && TEAM_LOGOS[id]) map.set(id, TEAM_LOGOS[id]);
  return map;
}

// FootballTransfer row → 표시 카드 (이름 한글 우선 + 사진 + 포지션 + 유형 배지 + 국기·팀마크)
function toCard(r: TransferRow, tpMap: Map<string, TsPlayerLite>, teamLogos?: Map<string, string>, ageMap?: Map<string, number | null>): TransferCard {
  const tsp = tpMap.get(r.playerId);
  const ov = OVERRIDES[r.playerId];
  return {
    id: r.id,
    playerId: r.playerId,
    name: tsp?.name || "Player",
    posCode: posCodeOf(r.playerId, tsp?.position),
    photo: PHOTOS[r.playerId] || tsp?.photoUrl || null,
    fromTeam: koTeam(r.fromTeamName),
    toTeam: koTeam(r.toTeamName),
    time: r.transferTime || 0,
    fee: r.transferFee || 0,
    desc: r.transferDesc || null,
    league: r.league,
    ttype: r.transferType,
    badge: badgeOf(r),
    flag: ov?.flag || null,
    country: null,
    fromLogo: (r.fromTeamId && teamLogos?.get(r.fromTeamId)) || null,
    toLogo: (r.toTeamId && teamLogos?.get(r.toTeamId)) || null,
    age: ageMap?.get(r.playerId) ?? null,
    newsAt: Math.floor(r.updatedAt.getTime() / 1000),
  };
}

// 마켓 무브 요약 카드 (급상승/급락/빅딜 공통 틀)
function PulseCard({ title, hint, more, children }: { title: string; hint?: string; more?: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] p-3.5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold">{title}</h2>
        {more ? (
          <Link href={more.href} className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline">{more.label}</Link>
        ) : hint ? (
          <span className="text-[10px] text-neutral-400">{hint}</span>
        ) : null}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// 무브 카드 행 공통 — 작은 사진 + 이름 + 우측 수치
function PulseRow({ href, photo, name, right }: { href: string; photo: string | null; name: string; right: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-sm hover:bg-neutral-50 dark:hover:bg-white/[0.06] rounded-lg px-1.5 py-1 -mx-1.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400">{name.slice(0, 1)}</span>
        )}
      </div>
      <span className="flex-1 truncate font-semibold">{name}</span>
      {right}
    </Link>
  );
}

// 리그 코드 → 리그 로고 + 한글명 인라인 태그. 로고 없으면 이름만(폴백).
// 리스트(테이블 리그 컬럼·팀 부제)에서 텍스트만 있던 리그 표기에 마크를 붙인다.
function LeagueTag({ code, imgClass = "w-4 h-4" }: { code: string | null; imgClass?: string }) {
  if (!code) return <>—</>;
  const label = LEAGUES[code] || code;
  const logo = leagueLogoUrl(code);
  return (
    <span className="inline-flex items-center gap-1 min-w-0 align-middle">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className={`${imgClass} object-contain shrink-0`} />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; league?: string; team?: string; pos?: string; country?: string; page?: string; q?: string; mode?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const view = ["all", "league", "team", "country", "pos", "latest", "bigdeals", "inout", "squads", "rumors"].includes(sp.view || "") ? sp.view! : "all";
  const isLatest = view === "latest";
  const isBigdeals = view === "bigdeals";
  const isRumors = view === "rumors"; // 임박·루머 — TransferRumor(Tier1 소스+검증 게이트) 피드, 몸값 파이프라인 안 탐
  const isFeed = isLatest || isBigdeals; // 이적 피드형 (최신순/이적료순)
  const isInout = view === "inout";
  const isSquads = view === "squads"; // 팀 스쿼드 가치 랭킹 — enriched(18개월 활성·dedup 적용) 팀 단위 집계
  // 최신 이적: 기본 = 주요(이적창 윈도우 + 이름·이적료 확인분), mode=all = 전체 이력
  const latestAll = isLatest && sp.mode === "all";
  const tFilter = isLatest && ["fee", "loan"].includes(sp.t || "") ? sp.t! : "";
  let league = sp.league && LEAGUES[sp.league] ? sp.league : "";
  // 팀 스쿼드 가치는 PMV 커버리지 있는 빅5 만 — 확장 리그 코드는 빅5 전체로 fallback
  if (view === "squads" && league && !FIVE.includes(league)) league = "";
  const team = sp.team || "";
  const pos = sp.pos && POS_CODES.includes(sp.pos) ? sp.pos : "";
  const country = sp.country || "";
  const qSearch = (sp.q || "").trim().slice(0, 40);
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const cutoff = Math.floor(Date.now() / 1000) - 18 * 30 * 86400; // 18개월 활성
  const win = transferWindow();

  // ── 팀 옵션 + 팀 메타/매핑 (빅5 전체 groupBy — 30분 캐시, 위 getTransferTeamIndex) ──
  const { teamOptions, teamMetaEntries, tsToOurEntries, outsideLabelIds } = await getTransferTeamIndex();
  const teamMeta = new Map(teamMetaEntries);
  const tsToOur = new Map(tsToOurEntries);

  // ── 국가 옵션 (데이터 적재 전 = 빈 목록 → "수집 중") ──
  const countryAgg = new Map<string, { flag: string | null; count: number }>();
  for (const o of Object.values(OVERRIDES)) {
    if (o.country) {
      const c = countryAgg.get(o.country) || { flag: o.flag || null, count: 0 };
      c.count++; if (o.flag) c.flag = o.flag;
      countryAgg.set(o.country, c);
    }
  }
  const countryOptions = [...countryAgg.entries()]
    .map(([name, v]) => ({ name, flag: v.flag, count: v.count }))
    .sort((a, b) => b.count - a.count);

  // ── 후보 집합 where (view 별) ──
  // PMV 의 teamId·league 는 시장가치 스냅샷 시점 값이라 이적창 이동이 빠져 있다 →
  // 공식 스쿼드 명단 선수를 OR 로 함께 끌어오고, 실제 소속 판정은 아래 enrich 에서 한다.
  let where: Record<string, unknown> = {
    currentValue: { not: null },
    OR: [{ league: { in: FIVE } }, { id: { in: outsideLabelIds } }],
  };
  // 아래 두 분기(team·league 지정)만 where 가 요청별로 달라진다 = 파생 캐시 비대상.
  const usesDefaultWhere = !(view === "team" && team) && !((view === "league" || view === "squads") && league);
  if (view === "team" && team) {
    const tsForTeam = await prisma.teamSourceId.findMany({
      where: { source: "thesports", teamId: Number(team) },
      select: { externalId: true },
    });
    const extIds = tsForTeam.map((t) => t.externalId);
    where = {
      currentValue: { not: null },
      OR: [{ teamId: { in: extIds } }, { id: { in: squadPlayerIds(extIds) } }],
    };
  } else if ((view === "league" || view === "squads") && league) {
    const extOfLeague = [...tsToOur.entries()]
      .filter(([, ourId]) => teamMeta.get(ourId)?.league === league)
      .map(([ext]) => ext);
    where = {
      currentValue: { not: null },
      OR: [{ league }, { id: { in: squadPlayerIds(extOfLeague) } }],
    };
  }

  // 기본 스코프면 30분 파생 캐시(getPmvRowsDefault) — history 블랍이 핫패스에서 빠진다.
  // team·league 지정 뷰만 where 가 달라 직접 조회 후 같은 형태로 접는다.
  const raw: PmvRow[] = isFeed || isInout || isRumors
    ? []
    : usesDefaultWhere
      ? await getPmvRowsDefault()
      : toPmvRows(
          await prisma.playerMarketValue.findMany({
            where,
            orderBy: { currentValue: "desc" },
            select: { id: true, teamId: true, currentValue: true, age: true, league: true, history: true },
          }),
        );
  const ids = raw.map((r) => r.id);
  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: ids } },
    select: { id: true, nameKo: true, name: true, photoUrl: true, position: true },
  });
  const pMap = new Map(players.map((p) => [p.id, p]));

  // enrich + 18개월 활성 필터
  let enriched = raw
    .map((r) => {
      const tsTeam = currentTsTeamId(r.id, r.teamId); // 공식 스쿼드 우선 — null = 커버 리그 이탈
      const ourId = tsTeam ? tsToOur.get(tsTeam) : undefined;
      const tm = ourId != null ? teamMeta.get(ourId) : undefined;
      const tsp = pMap.get(r.id);
      const ov = OVERRIDES[r.id];
      return {
        id: r.id,
        name: tsp?.name || "Player",
        nameEn: tsp?.name || null,
        value: Math.round((r.currentValue || 0) / 1e6),
        age: r.age,
        ourTeamId: ourId ?? null,
        posCode: posCodeOf(r.id, tsp?.position),
        number: (tsTeam && SQUADS[tsTeam]?.squad.find((s) => s.id === r.id)?.number) || null,
        league: tm?.league || r.league,
        country: null,
        countryFlag: ov?.flag || null,
        teamName: tm?.name || "—",
        teamLogo: tm?.logoUrl || null,
        photo: PHOTOS[r.id] || tsp?.photoUrl || null,
        lastTime: r.lastTime,
        hist: r.hist,
      };
    })
    .filter((e) => e.lastTime >= cutoff)
    // 소속 미해석(= 공식 명단에서 빠짐 → 방출·비커버 리그 이적) 제외. 옛 팀에 남는 걸 막는다.
    .filter((e) => e.ourTeamId != null);

  // OR 로 넓게 끌어온 후보를 실제 소속 기준으로 되좁힌다 (PMV 의 낡은 teamId·league 대신).
  if (view === "team" && team) enriched = enriched.filter((e) => e.ourTeamId === Number(team));
  else if ((view === "league" || view === "squads") && league) enriched = enriched.filter((e) => e.league === league);
  else enriched = enriched.filter((e) => FIVE.includes(e.league || ""));

  // 동일 선수 중복 제거 (TheSports 가 한 선수에 복수 id 부여 — 예: "파트리크 도르구"·"패트릭 도르구").
  // 표시명이 음역차로 달라도 영문명 정규화(발음기호·대소문자·공백 무시)로 같은 선수를 잡는다.
  // 같은 키 중 공식 스쿼드(등번호 보유) 레코드 우선, 없으면 최고가(raw 가치 desc) 유지.
  const normEn = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, " ").replace(/\s+/g, " ").trim();
  const keyOf = (e: (typeof enriched)[number]) => {
    const en = normEn(e.nameEn || "");
    return en ? `en:${en}|${e.teamName}` : `ko:${e.name}|${e.teamName}`;
  };
  const bestByKey = new Map<string, (typeof enriched)[number]>();
  for (const e of enriched) {
    const k = keyOf(e);
    const cur = bestByKey.get(k);
    // 등번호(공식 스쿼드) 보유 레코드를 우선 승격. 동급이면 먼저 온(=고가) 것 유지.
    if (!cur || (e.number != null && cur.number == null)) bestByKey.set(k, e);
  }
  const keepSet = new Set(bestByKey.values());
  enriched = enriched.filter((e) => keepSet.has(e));

  // 이름 데이터 없는 선수(name="선수" fallback)는 랭킹에서 제외 — TheSports player API
  // 미인가로 이름 backfill 불가. 라인업 등장/플랜 추가로 이름이 생기면 자동 재노출됨.
  enriched = enriched.filter((e) => e.name !== "Player");

  if (view === "pos" && pos) enriched = enriched.filter((e) => e.posCode === pos);
  if (view === "country" && country) enriched = enriched.filter((e) => e.country === country);

  // 선수·팀 검색 (q) — 한글명·영문명·팀명 부분일치
  if (qSearch) {
    const qq = qSearch.toLowerCase();
    enriched = enriched.filter(
      (e) => e.name.toLowerCase().includes(qq) || (e.nameEn && e.nameEn.toLowerCase().includes(qq)) || e.teamName.toLowerCase().includes(qq),
    );
  }

  // ── 팀별 IN/OUT (view=inout) — 이적창 윈도우 내 빅5 팀 영입·방출 집계 ──
  interface InOutRow { teamId: number; name: string; logo: string | null; league: string; inCnt: number; inFee: number; outCnt: number; outFee: number; rank: number }
  let inoutData: InOutRow[] = [];
  let inoutTotal = 0;
  let inoutBoundary: ReturnType<typeof boundaryShare> | null = null;
  if (isInout) {
    const big5Teams = await prisma.team.findMany({ where: { league: { in: FIVE } }, select: { id: true, name: true, logoUrl: true, league: true } });
    const tsRows = await prisma.teamSourceId.findMany({
      where: { source: "thesports", teamId: { in: big5Teams.map((t) => t.id) } },
      select: { externalId: true, teamId: true },
    });
    const extToOur = new Map(tsRows.map((t) => [t.externalId, t.teamId]));
    const extIds = tsRows.map((t) => t.externalId);
    // 상한(win.to) 필수 — 다른 뷰와 동일 기준. 없으면 내년 6/30 발효 "임대 복귀 예정" 행이 섞인다.
    const trs = await prisma.footballTransfer.findMany({
      where: { transferTime: { gte: win.from, lte: win.to }, OR: [{ toTeamId: { in: extIds } }, { fromTeamId: { in: extIds } }] },
      select: { toTeamId: true, fromTeamId: true, transferFee: true, transferTime: true },
    });
    // 이 집계에서 시즌 전환일 일괄 기록분이 얼마인지 — 표 아래 기준 문구로 노출
    inoutBoundary = boundaryShare(trs);
    const agg = new Map<number, { inCnt: number; inFee: number; outCnt: number; outFee: number }>();
    const bump = (ourId: number | undefined, dir: "in" | "out", fee: number) => {
      if (ourId == null) return;
      const a = agg.get(ourId) || { inCnt: 0, inFee: 0, outCnt: 0, outFee: 0 };
      if (dir === "in") { a.inCnt++; a.inFee += fee; } else { a.outCnt++; a.outFee += fee; }
      agg.set(ourId, a);
    };
    for (const t of trs) {
      const fee = t.transferFee || 0;
      bump(t.toTeamId ? extToOur.get(t.toTeamId) : undefined, "in", fee);
      bump(t.fromTeamId ? extToOur.get(t.fromTeamId) : undefined, "out", fee);
    }
    const big5Meta = new Map(big5Teams.map((t) => [t.id, t]));
    const board = [...agg.entries()]
      .map(([id, a]) => {
        const tm = big5Meta.get(id)!;
        return { teamId: id, name: tm.name, logo: tm.logoUrl, league: tm.league, ...a, rank: 0 };
      })
      .sort((a, b) => b.inFee - a.inFee || b.inCnt - a.inCnt);
    inoutTotal = board.length;
    inoutData = board.slice((page - 1) * PER, page * PER);
  }

  // ── 팀 스쿼드 가치 랭킹 (view=squads) — enriched(활성·dedup·이름 필터 완료) 팀 단위 집계 ──
  interface SquadRow { teamId: number; name: string; logo: string | null; league: string; total: number; cnt: number; avgAge: number | null; topName: string; topValue: number; rank: number }
  let squadsData: SquadRow[] = [];
  let squadsTotal = 0;
  if (isSquads) {
    const byTeam = new Map<number, { total: number; cnt: number; ageSum: number; ageCnt: number; topName: string; topValue: number }>();
    for (const e of enriched) {
      if (e.ourTeamId == null) continue;
      // enriched 가 가치순(desc)이라 팀별 첫 등장 선수 = 최고가
      const a = byTeam.get(e.ourTeamId) || { total: 0, cnt: 0, ageSum: 0, ageCnt: 0, topName: e.name, topValue: e.value };
      a.total += e.value;
      a.cnt++;
      if (e.age) { a.ageSum += e.age; a.ageCnt++; }
      byTeam.set(e.ourTeamId, a);
    }
    const board = [...byTeam.entries()]
      .map(([id, a]) => {
        const tm = teamMeta.get(id);
        return {
          teamId: id,
          name: tm?.name || "—",
          logo: tm?.logoUrl || null,
          league: tm?.league || "",
          total: a.total,
          cnt: a.cnt,
          avgAge: a.ageCnt ? Math.round((a.ageSum / a.ageCnt) * 10) / 10 : null,
          topName: a.topName,
          topValue: a.topValue,
          rank: 0,
        };
      })
      .sort((a, b) => b.total - a.total);
    squadsTotal = board.length;
    squadsData = board.slice((page - 1) * PER, page * PER);
  }

  // ── 팀 스쿼드 요약 + 시장가치 Best XI (view=team) ──
  const teamIdNum = Number(team);
  // 팀 뷰 진입 여부 — 몸값 커버리지와 무관. 감독·전술 카드는 이 조건만 본다
  // (K리그1 46명·K리그2 4명뿐이라 squadSummary 에 묶어두면 감독이 통째로 안 뜬다).
  const isTeamView = view === "team" && !!team && Number.isFinite(teamIdNum);
  const squadSummary =
    isTeamView && enriched.length > 0
      ? (() => {
          const tm = teamMeta.get(teamIdNum);
          const total = enriched.reduce((s, e) => s + e.value, 0);
          const ages = enriched.filter((e) => e.age);
          return {
            name: tm?.name || "Club",
            logo: tm?.logoUrl || null,
            league: tm?.league || null,
            total,
            avgAge: ages.length ? Math.round((ages.reduce((s, e) => s + (e.age || 0), 0) / ages.length) * 10) / 10 : null,
            cnt: enriched.length,
          };
        })()
      : null;
  // ── 감독 + 최근 5경기 실제 포메이션 (view=team) ──
  let coach: (typeof COACHES)[string] | null = null;
  const recentFormations: string[] = [];
  if (isTeamView) {
    const tsIds = await prisma.teamSourceId.findMany({
      where: { source: "thesports", teamId: teamIdNum },
      select: { externalId: true },
    });
    for (const t of tsIds) {
      if (COACHES[t.externalId]) { coach = COACHES[t.externalId]; break; }
    }
    // 최근 종료 매치 라인업 cache 의 home/away_formation — 우리 팀 측만
    const recent = await prisma.match.findMany({
      where: { status: "FINISHED", OR: [{ homeTeamId: teamIdNum }, { awayTeamId: teamIdNum }] },
      orderBy: { startTime: "desc" },
      take: 10,
      select: { homeTeamId: true, theSportsCache: { select: { lineup: true } } },
    });
    for (const m of recent) {
      const lu = m.theSportsCache?.lineup as { home_formation?: string; away_formation?: string } | null;
      const f = m.homeTeamId === teamIdNum ? lu?.home_formation : lu?.away_formation;
      if (f) recentFormations.push(f);
      if (recentFormations.length >= 5) break;
    }
  }
  // 감독 전술 연구 글 — 이 팀 것이 발행돼 있으면 감독 카드에서 바로 연결 (역방향은 글 헤더의 스쿼드 링크)
  let tacticalArticle: { slug: string; title: string } | null = null;
  if (isTeamView) {
    const tmName = teamMeta.get(teamIdNum)?.name;
    if (tmName) {
      const tSlug = tmName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); // manager-article.teamSlug 와 동일 규칙
      tacticalArticle = await prisma.article.findFirst({
        where: { type: "TACTICAL", status: "PUBLISHED", slug: { contains: `manager-${tSlug}-` } },
        orderBy: { publishedAt: "desc" },
        select: { slug: true, title: true },
      });
    }
  }
  // 포메이션 분포 — 최빈 순. ranked[0] 이 Best XI 배치에 쓰는 실제 포메이션.
  const formationRanked = (() => {
    const cnt = new Map<string, number>();
    for (const f of recentFormations) cnt.set(f, (cnt.get(f) || 0) + 1);
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]);
  })();
  // "4-3-3 ×3" 형식
  const formationSummary = formationRanked.length
    ? formationRanked.map(([f, c]) => (c > 1 ? `${f} ×${c}` : f)).join(" · ")
    : null;
  // 최근 실제 포메이션 우선, 없으면 감독 선호. 둘 다 없으면 SquadBestXI 기본값.
  const xiFormation = formationRanked[0]?.[0] || coach?.preferredFormation || null;
  const bestXI = squadSummary ? pickBestXI(enriched, xiFormation) : null;
  const fmtYm = (ts: number | null) => (ts ? `${new Date(ts * 1000).getUTCFullYear()}.${new Date(ts * 1000).getUTCMonth() + 1}` : null);

  // ── 최신 이적 "주요" 모드 — 이적창 윈도우 전체 fetch → 이름·이적료 필터 → 메모리 페이지네이션 ──
  //   (익명 "선수" 행 ~35% 제거. 윈도우 행 수백~수천 수준이라 메모리 처리 가능. 전체 이력은 mode=all)
  let latestMainCards: TransferCard[] | null = null;
  let dateCounts: Map<string, number> | null = null;
  // 임대 복귀 "예정" 행은 transferTime 이 미래(연말·내년)로 들어와 최신순 최상단을 점령 —
  // 창 종료(win.to)까지만 표시: 7/1 발효 여름 이적(창 행 다수)은 포함, 연말·내년 복귀 예정은 제외
  if (isLatest && !latestAll) {
    const rows = await prisma.footballTransfer.findMany({
      where: {
        league: { in: league ? [league] : FEED_LEAGUES },
        transferTime: { gte: win.from, lte: win.to },
        ...(tFilter === "fee" ? { transferFee: { gt: 0 } } : {}),
        ...(tFilter === "loan" ? { transferType: { in: [1, 2] } } : {}),
      },
      // 소식순 — 발효일(transferTime)은 7/1 무더기라 최신 구분이 안 됨.
      // updatedAt = 첫 수집 시각(upsert 가 안 건드림) = 소식이 피드에 뜬 시점.
      orderBy: { updatedAt: "desc" },
    });
    const pids = [...new Set(rows.map((r) => r.playerId))];
    const tplayers = await prisma.theSportsPlayer.findMany({
      where: { id: { in: pids } },
      select: { id: true, nameKo: true, name: true, photoUrl: true, position: true },
    });
    const tpMap = new Map(tplayers.map((p) => [p.id, p]));
    // 나이 — PlayerMarketValue.age (playerId=PMV.id 동일 ts player id). 빅5 위주라 비커버 선수는 null.
    const ageRows = await prisma.playerMarketValue.findMany({ where: { id: { in: pids } }, select: { id: true, age: true } });
    const ageMap = new Map(ageRows.map((a) => [a.id, a.age]));
    const logoMap = await buildTeamLogoMap(rows);
    // [의도된 변경] 이전엔 `c.name !== "선수" || c.fee > 0` 로 고액(fee>0) 익명 이적을 노출했으나,
    // 누가 이적했는지 모르는 "선수 / — / —" 카드는 정보 가치가 없고 깨져 보여 제외로 전환.
    // bigdeals·AI브리핑 뷰와 동일 기준(이름 필수)으로 정합화. 이름이 주간 cron 으로 풀리면 자동 재노출.
    latestMainCards = rows.map((r) => toCard(r, tpMap, logoMap, ageMap)).filter((c) => c.name !== "Player");
    // 같은 소식일(KST) 안에서는 이적료 큰 순 — 빅딜이 그날 소식 상단에 오도록
    const newsDay = (c: TransferCard) => Math.floor((c.newsAt + 9 * 3600) / 86400);
    latestMainCards.sort((a, b) => newsDay(b) - newsDay(a) || b.fee - a.fee || b.newsAt - a.newsAt);
    dateCounts = new Map();
    for (const c of latestMainCards) { const k = fmtNewsHeader(c.newsAt); dateCounts.set(k, (dateCounts.get(k) || 0) + 1); }
  }

  const feedScope = league ? [league] : FEED_LEAGUES;
  // 빅딜 뷰 — 이름 없는 선수("선수 / — / —" 폴백) 행 제외. latest 주요 뷰(아래 filter)와 동일 정책.
  // 이름이 별도 테이블(TheSportsPlayer)이라 SQL join 으로 못 거르므로, 창 내 playerId(수백 규모)를
  // 먼저 뽑아 익명 id 만 notIn 으로 뺀다 — count 도 같은 where 를 써서 페이지 수가 정확하다.
  // 시즌 개막 후 라인업 등장 → player-names cron 이 이름을 채우면 자동 재노출.
  let bigdealsAnonPids: string[] = [];
  if (isBigdeals) {
    const winRows = await prisma.footballTransfer.findMany({
      where: { league: { in: feedScope }, transferTime: { gte: win.from }, transferFee: { gt: 0 } },
      select: { playerId: true },
      distinct: ["playerId"],
    });
    // toCard 의 이름 결정(ov.nameKo → tsp.nameKo → tsp.name)과 동일 기준으로 익명 판정
    const pids = winRows.map((r) => r.playerId).filter((p) => !OVERRIDES[p]?.nameKo);
    const tsRows = await prisma.theSportsPlayer.findMany({
      where: { id: { in: pids } },
      select: { id: true, name: true, nameKo: true },
    });
    const namedSet = new Set(tsRows.filter((p) => p.nameKo || p.name).map((p) => p.id));
    bigdealsAnonPids = pids.filter((p) => !namedSet.has(p));
  }
  const feedWhere = isBigdeals
    ? {
        league: { in: feedScope },
        transferTime: { gte: win.from },
        transferFee: { gt: 0 },
        ...(bigdealsAnonPids.length ? { playerId: { notIn: bigdealsAnonPids } } : {}),
      }
    : {
        league: { in: feedScope },
        // 전체 이력(latest mode=all)도 창 종료 이후의 미래 발효 예정 행은 제외
        transferTime: { not: null, lte: win.to },
        ...(tFilter === "fee" ? { transferFee: { gt: 0 } } : {}),
        ...(tFilter === "loan" ? { transferType: { in: [1, 2] } } : {}),
      };
  const transferTotal = isBigdeals || latestAll ? await prisma.footballTransfer.count({ where: feedWhere }) : 0;
  // ── 임박·루머 피드 (view=rumors) — TransferRumor 최근 RUMOR_DAYS 일 ──
  // 전체 건수를 먼저 세고(페이지 수 확정) 해당 페이지만 조회한다.
  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const rumorSince = new Date(Date.now() - RUMOR_DAYS * 86400 * 1000);
  const rumorWhere = { hidden: false, publishedAt: { gte: rumorSince } };
  const rumorTotal = isRumors ? await prisma.transferRumor.count({ where: rumorWhere }) : 0;
  const totalCount = latestMainCards ? latestMainCards.length : isFeed ? transferTotal : isInout ? inoutTotal : isSquads ? squadsTotal : isRumors ? rumorTotal : enriched.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER));
  const safePage = Math.min(page, totalPages);
  const rumorRows = isRumors
    ? (await prisma.transferRumor.findMany({
        where: rumorWhere,
        // id 타이브레이커 필수 — 같은 publishedAt 행이 실제로 있어(수집 배치 동시각),
        // 시각만으로 정렬하면 skip/take 경계에서 행이 두 페이지에 겹치거나 빠질 수 있다.
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: (safePage - 1) * PER,
        take: PER,
      })).filter((r) => !/[가-힣]/.test(r.sourceName)) // 한국 매체 출처는 영어판에서 제외
    : [];
  inoutData = inoutData.map((r, i) => ({ ...r, rank: (safePage - 1) * PER + i + 1 }));
  squadsData = squadsData.map((r, i) => ({ ...r, rank: (safePage - 1) * PER + i + 1 }));
  const data = isFeed || isInout || isSquads ? [] : enriched.slice((safePage - 1) * PER, safePage * PER).map((e, i) => ({ ...e, rank: (safePage - 1) * PER + i + 1 }));

  // ── 이적 피드 (latest 주요=메모리 / latest 전체·bigdeals=DB 페이지네이션) ──
  let transferData: TransferCard[] = [];
  if (latestMainCards) {
    transferData = latestMainCards.slice((safePage - 1) * PER, safePage * PER);
  } else if (isFeed) {
    const rows = await prisma.footballTransfer.findMany({
      where: feedWhere,
      // 전체 이력도 소식순 (latest 주요 뷰와 동일 기준 — DB 페이지네이션이라 일내 재정렬은 생략)
      orderBy: isBigdeals ? { transferFee: "desc" } : { updatedAt: "desc" },
      skip: (safePage - 1) * PER,
      take: PER,
    });
    const tids = [...new Set(rows.map((r) => r.playerId))];
    const tplayers = await prisma.theSportsPlayer.findMany({
      where: { id: { in: tids } },
      select: { id: true, nameKo: true, name: true, photoUrl: true, position: true },
    });
    const tpMap = new Map(tplayers.map((p) => [p.id, p]));
    // 나이 — PlayerMarketValue.age (playerId=PMV.id 동일 ts player id). 빅5 위주라 비커버 선수는 null.
    const ageRows = await prisma.playerMarketValue.findMany({ where: { id: { in: tids } }, select: { id: true, age: true } });
    const ageMap = new Map(ageRows.map((a) => [a.id, a.age]));
    const logoMap = await buildTeamLogoMap(rows);
    transferData = rows.map((r) => toCard(r, tpMap, logoMap, ageMap));
    // TheSports 중복 transfer 레코드 방어 — 같은 선수·행선지·이적료는 페이지 내 1건만
    if (isBigdeals) {
      const seen = new Set<string>();
      transferData = transferData.filter((t) => { const k = `${t.playerId}|${t.toTeam}|${t.fee}`; if (seen.has(k)) return false; seen.add(k); return true; });
    }
  }

  // ── 마켓 무브 요약 (전체 view 1페이지 상단) — 급상승·급락 TOP3 + 윈도우 빅딜 TOP3 ──
  type Mover = (typeof enriched)[number] & { chg: number };
  const showPulse = view === "all" && !qSearch && safePage === 1 && enriched.length > 0;
  let rising: Mover[] = [], falling: Mover[] = [];
  let pulseDeals: TransferCard[] = [];
  if (showPulse) {
    // 직전 업데이트 대비 변동% — 저가(€3M 미만) 출발은 노이즈라 제외
    const movers: Mover[] = enriched
      .filter((e) => e.hist.length >= 2 && e.hist[e.hist.length - 2] >= 3)
      .map((e) => { const prev = e.hist[e.hist.length - 2]; return { ...e, chg: Math.round(((e.value - prev) / prev) * 100) }; });
    rising = movers.filter((m) => m.chg > 0).sort((a, b) => b.chg - a.chg).slice(0, 3);
    falling = movers.filter((m) => m.chg < 0).sort((a, b) => a.chg - b.chg).slice(0, 3);
    const dealRows = await prisma.footballTransfer.findMany({
      where: { league: { in: FEED_LEAGUES }, transferTime: { gte: win.from }, transferFee: { gt: 0 } },
      orderBy: { transferFee: "desc" },
      take: 6,
    });
    const dIds = [...new Set(dealRows.map((r) => r.playerId))];
    const dPlayers = await prisma.theSportsPlayer.findMany({
      where: { id: { in: dIds } },
      select: { id: true, nameKo: true, name: true, photoUrl: true, position: true },
    });
    const dMap = new Map(dPlayers.map((p) => [p.id, p]));
    const dSeen = new Set<string>();
    pulseDeals = dealRows
      .filter((r) => { const k = `${r.playerId}|${r.toTeamId}|${r.transferFee}`; if (dSeen.has(k)) return false; dSeen.add(k); return true; })
      .slice(0, 3)
      .map((r) => toCard(r, dMap));
  }

  // ── AI 이적 브리핑 (최신 이적 view 1페이지 상단) — 주목 확정 이적 + haiku 한 줄 분석 ──
  interface BriefCard { id: string; playerId: string; name: string; fromTeam: string; toTeam: string; valueM: number; league: string; brief: string }
  let briefCards: BriefCard[] = [];
  if (isLatest && !qSearch && safePage === 1) {
    const bRows = await prisma.footballTransfer.findMany({
      where: { league: { in: feedScope }, aiBrief: { not: null }, transferTime: { gte: win.from, lte: win.to } },
      select: { id: true, playerId: true, fromTeamName: true, toTeamName: true, league: true, aiBrief: true },
    });
    const bIds = [...new Set(bRows.map((r) => r.playerId))];
    const [bPmv, bPlayers] = await Promise.all([
      prisma.playerMarketValue.findMany({ where: { id: { in: bIds } }, select: { id: true, currentValue: true } }),
      prisma.theSportsPlayer.findMany({ where: { id: { in: bIds } }, select: { id: true, nameKo: true, name: true } }),
    ]);
    const bVal = new Map(bPmv.map((p) => [p.id, p.currentValue ?? 0]));
    const bName = new Map(bPlayers.map((p) => [p.id, OVERRIDES[p.id]?.nameKo || p.nameKo || p.name || null]));
    const bSeen = new Set<string>();
    briefCards = bRows
      .map((r) => ({
        id: r.id,
        playerId: r.playerId,
        name: bName.get(r.playerId) || "",
        fromTeam: koTeam(r.fromTeamName),
        toTeam: koTeam(r.toTeamName),
        valueM: Math.round((bVal.get(r.playerId) ?? 0) / 1e6),
        league: r.league ?? "",
        brief: r.aiBrief ?? "",
      }))
      .filter((b) => b.name && b.name !== "Player" && b.brief)
      .sort((a, b) => b.valueM - a.valueM)
      .filter((b) => { const k = `${b.name}|${b.toTeam}`; if (bSeen.has(k)) return false; bSeen.add(k); return true; })
      .slice(0, 6);
  }

  // 제목
  const selectedLabel =
    isLatest ? "Latest transfers"
      : view === "league" && league ? LEAGUES[league]
        : view === "team" && team ? teamOptions.find((t) => String(t.id) === team)?.name || "Club"
          : view === "pos" && pos ? pos
            : view === "country" && country ? country
              : "All";
  const heading = isBigdeals
    ? `${win.label} big deals`
    : isInout
      ? "Club ins & outs"
      : isSquads
        ? `${league ? `${LEAGUES[league]} ` : ""}Squad values`
        : isLatest
          ? "Latest transfers"
          : isRumors
            ? "Imminent & rumours"
            : qSearch
              ? `"${qSearch}" search`
              : squadSummary
                ? `${squadSummary.name} squad`
                : `${selectedLabel} market value`;
  // 헤더 아이콘 — 장식 이모지를 lucide 라인 아이콘으로 (디자인 시스템)
  const HeadingIcon = isBigdeals
    ? Banknote
    : isInout
      ? ArrowLeftRight
      : isSquads
        ? Users
        : isLatest
          ? RefreshCw
          : isRumors
            ? Zap
            : qSearch
              ? Search
              : Wallet;

  // 페이지네이션 URL (필터 유지)
  const pageUrl = (n: number) => {
    const params = new URLSearchParams();
    if (view !== "all") params.set("view", view);
    if (league) params.set("league", league);
    if (team) params.set("team", team);
    if (pos) params.set("pos", pos);
    if (country) params.set("country", country);
    if (qSearch) params.set("q", qSearch);
    if (latestAll) params.set("mode", "all");
    if (tFilter) params.set("t", tFilter);
    if (n !== 1) params.set("page", String(n));
    const qs = params.toString();
    return `/transfers${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbLd([
              { name: "Home", path: "/" },
              { name: "Transfers", path: "/transfers" },
            ]),
            datasetLd({
              name: "Football transfer market data — values and transfers",
              description:
                "Market value rankings and transfer, loan and free-agent records across Europe's big five, K League 1, MLS and the Saudi Pro League.",
              path: "/transfers",
              variableMeasured: ["Market value", "Fee", "Transfer type"],
            }),
          ]),
        }}
      />
      <AmbientGlow />
      <PlayerValueTabs active="/transfers" className="mb-6" />
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Transfer market
      </span>
      <h1 className="mt-4 flex items-center gap-2.5 sm:gap-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
        <HeadingIcon className="w-7 h-7 sm:w-9 sm:h-9 lg:w-11 lg:h-11 text-rose-500 shrink-0" strokeWidth={2.25} aria-hidden />
        <span>{heading}</span>
      </h1>
      <p className="mt-3 text-sm text-neutral-500 break-keep">
        {isBigdeals ? (
          <>{league ? LEAGUES[league] : "Top leagues"} <strong className="text-neutral-700 dark:text-neutral-300">Top fees</strong> · {win.label} · {totalCount.toLocaleString()}.</>
        ) : isInout ? (
          <>{win.label} <strong className="text-neutral-700 dark:text-neutral-300">Ins and outs by club</strong> · by spend · {totalCount} clubs.</>
        ) : isSquads ? (
          <>{league ? LEAGUES[league] : "Europe's big five"} League <strong className="text-neutral-700 dark:text-neutral-300">Total squad market value by club</strong> ranking · {totalCount} clubs.</>
        ) : squadSummary ? (
          <><strong className="text-neutral-700 dark:text-neutral-300">{squadSummary.name}</strong> Squad value ranking · by market value · {squadSummary.cnt}.</>
        ) : isLatest ? (
          latestAll ? (
            <>{league ? LEAGUES[league] : "Europe's big five · K League 1 · Saudi · MLS"} <strong className="text-neutral-700 dark:text-neutral-300">All transfers</strong> · newest first · {totalCount.toLocaleString()}.</>
          ) : (
            <>{win.label} <strong className="text-neutral-700 dark:text-neutral-300">Key transfers</strong> · confirmed name and fee · {totalCount.toLocaleString()}.</>
          )
        ) : isRumors ? (
          <>Before official confirmation <strong className="text-neutral-700 dark:text-neutral-300">agreed (here we go), medical and talks</strong> stages · only credible sources (BBC, Sky, Romano) · last {RUMOR_DAYS} days · {totalCount}.</>
        ) : (
          <>Player market value rankings and <strong className="text-neutral-700 dark:text-neutral-300">value trends</strong> · Europe's big five · {totalCount}.</>
        )}
      </p>

      {/* 가치·랭킹 바로가기 — 발롱도르·가성비 구단을 몸값·가치 허브로 통합 */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/rankings/value-clubs"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 px-3.5 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
        >
          <Gem className="w-3.5 h-3.5" aria-hidden /> Value for money clubs
        </Link>
        <Link
          href="/ballon"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 px-3.5 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
        >
          <Award className="w-3.5 h-3.5" aria-hidden /> Ballon d'Or index
        </Link>
      </div>

      <div className="mt-5">
        <TransfersFilterBar
          view={view}
          league={league}
          team={team}
          pos={pos}
          country={country}
          search={qSearch}
          mode={latestAll ? "all" : ""}
          ttype={tFilter}
          leagues={LEAGUE_LIST}
          valueLeagues={LEAGUE_LIST.filter((l) => FIVE.includes(l.code))}
          teams={teamOptions}
          countries={countryOptions}
        />
      </div>

      {/* 팀 스쿼드 요약 + 시장가치 Best XI (view=team) */}
      {(squadSummary || coach) && (
        <>
          {squadSummary && (
          <div className="rounded-2xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none p-4 mt-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {squadSummary.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={squadSummary.logo} alt={squadSummary.name} className="w-12 h-12 object-contain shrink-0" />
              )}
              <div className="min-w-0">
                <div className="font-bold text-lg truncate">{squadSummary.name}</div>
                <div className="text-xs text-neutral-500">
                  {squadSummary.league && LEAGUES[squadSummary.league] ? `${LEAGUES[squadSummary.league]} · ` : ""}Squad {squadSummary.cnt}
                  {squadSummary.avgAge ? ` · average ${squadSummary.avgAge}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 ml-auto">
              <div className="text-right leading-tight">
                <div className="text-[11px] text-neutral-400">Total squad value</div>
                <div className="font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">€{squadSummary.total.toLocaleString()}M</div>
                <div className="text-[11px] text-neutral-500 tabular-nums">{krw(squadSummary.total)}</div>
              </div>
              <Link
                href={`/teams/${teamIdNum}`}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-neutral-300 dark:border-white/15 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 shrink-0"
              >
                Team page →
              </Link>
            </div>
          </div>
          )}
          {/* 감독 · 전술 카드 — ts coach/list(선호 포메이션) + 라인업 cache(최근 실제 포메이션) */}
          {coach && (
            <div className="rounded-2xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none p-4 mt-3 flex items-center gap-3 flex-wrap">
              <Link
                href={coach.id ? `/coaches/${coach.id}` : "#"}
                className="flex items-center gap-3 min-w-0 group"
              >
                <div className="w-12 h-12 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden shrink-0 flex items-center justify-center">
                  {coach.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coach.logo} alt={coachKoName(coach)} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg">🧑‍💼</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-neutral-400">Manager</div>
                  <div className="font-bold truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition">
                    {coachKoName(coach)}
                    {coach.age ? <span className="font-normal text-sm text-neutral-500"> · {coach.age}</span> : null}
                    {coach.nationality ? <span className="font-normal text-sm text-neutral-500"> · {coach.nationality}</span> : null}
                  </div>
                  {(coach.joined || coach.contractUntil) && (
                    <div className="text-xs text-neutral-500">
                      {coach.joined ? `${fmtYm(coach.joined)} appointed` : ""}
                      {coach.joined && coach.contractUntil ? " · " : ""}
                      {coach.contractUntil ? `contract to ${fmtYm(coach.contractUntil)}` : ""}
                      <span className="text-cyan-600 dark:text-cyan-400"> · profile →</span>
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-5 ml-auto text-right">
                {coach.preferredFormation && (
                  <div className="leading-tight">
                    <div className="text-[11px] text-neutral-400">Preferred formation</div>
                    <div className="font-bold tabular-nums">{coach.preferredFormation}</div>
                  </div>
                )}
                {formationSummary && (
                  <div className="leading-tight">
                    <div className="text-[11px] text-neutral-400">Recent {recentFormations.length} matches</div>
                    <div className="font-bold tabular-nums">{formationSummary}</div>
                  </div>
                )}
              </div>
              {tacticalArticle && (
                <Link
                  href={`/articles/${tacticalArticle.slug}`}
                  className="w-full mt-1 text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline truncate"
                >
                  Tactical study — {tacticalArticle.title} →
                </Link>
              )}
            </div>
          )}
          {bestXI && squadSummary && <SquadBestXI slots={bestXI} teamName={squadSummary.name} formation={xiFormation} />}
        </>
      )}

      {/* 마켓 무브 — 급상승·급락·빅딜 요약 (전체 view 1페이지) */}
      {showPulse && (rising.length > 0 || falling.length > 0 || pulseDeals.length > 0) && (
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          {rising.length > 0 && (
            <PulseCard title="📈 Biggest rises" hint="vs previous update">
              {rising.map((m) => (
                <PulseRow
                  key={m.id}
                  href={`/transfers/${m.id}`}
                  photo={m.photo}
                  name={m.name}
                  right={
                    <>
                      <span className="text-xs font-bold tabular-nums text-emerald-500 shrink-0">▲{m.chg}%</span>
                      <span className="text-xs text-neutral-500 tabular-nums w-12 text-right shrink-0">€{m.value}M</span>
                    </>
                  }
                />
              ))}
            </PulseCard>
          )}
          {falling.length > 0 && (
            <PulseCard title="📉 Biggest falls" hint="vs previous update">
              {falling.map((m) => (
                <PulseRow
                  key={m.id}
                  href={`/transfers/${m.id}`}
                  photo={m.photo}
                  name={m.name}
                  right={
                    <>
                      <span className="text-xs font-bold tabular-nums text-rose-500 shrink-0">▼{Math.abs(m.chg)}%</span>
                      <span className="text-xs text-neutral-500 tabular-nums w-12 text-right shrink-0">€{m.value}M</span>
                    </>
                  }
                />
              ))}
            </PulseCard>
          )}
          {pulseDeals.length > 0 && (
            <PulseCard title="💸 Big deals" more={{ href: "/transfers?view=bigdeals", label: "See all →" }}>
              {pulseDeals.map((d) => (
                <PulseRow
                  key={d.id}
                  href={`/transfers/${d.playerId}`}
                  photo={d.photo}
                  name={d.name}
                  right={
                    <>
                      <span className="text-[11px] text-neutral-500 truncate max-w-[76px] shrink-0">{d.toTeam}</span>
                      <span className="text-xs font-bold tabular-nums text-cyan-600 dark:text-cyan-400 shrink-0">€{Math.round(d.fee / 1e6)}M</span>
                    </>
                  }
                />
              ))}
            </PulseCard>
          )}
        </div>
      )}

      {/* AI 이적 브리핑 — 주목 확정 이적 + 한 줄 분석 (우리 데이터 강점) */}
      {briefCards.length > 0 && (
        <section className="mt-4 rounded-3xl border border-neutral-200/80 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-neutral-900 dark:text-white">
                <Sparkles className="h-4 w-4 text-rose-500" aria-hidden /> AI transfer briefing
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-white/40">
                {win.label} notable signings, analysed in one line each.
              </p>
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {briefCards.map((b) => (
              <Link
                key={b.id}
                href={`/transfers/${b.playerId}`}
                className="group block rounded-2xl bg-neutral-50 p-3.5 ring-1 ring-neutral-100 transition hover:ring-rose-200 dark:bg-white/[0.03] dark:ring-white/[0.06] dark:hover:ring-rose-400/30"
              >
                <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-white/40">
                  <span className="font-semibold text-neutral-900 dark:text-white">{b.name}</span>
                  {b.valueM > 0 && <span className="tabular-nums text-rose-600 dark:text-rose-400">€{b.valueM}M</span>}
                </div>
                <div className="mt-0.5 text-[12px] text-neutral-500 dark:text-white/45">
                  {b.fromTeam} <span className="text-neutral-300 dark:text-white/20">→</span> {b.toTeam}
                </div>
                <p className="mt-1.5 text-[13px] leading-snug text-neutral-700 dark:text-white/70">{b.brief}</p>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-neutral-400 dark:text-white/30">
            Based on confirmed transfers and market values. Undisclosed fees and contract terms are not included.
          </p>
        </section>
      )}

      {/* 임박·루머 (view=rumors) — 미확정 보도 피드, 확정 피드와 분리 */}
      {isRumors && (
        <>
          <div className="mt-4 rounded-2xl border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-[12px] leading-relaxed text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-200/80">
            Based on press reports and <strong>unconfirmed</strong> . Details can change or fall through before an official announcement; once confirmed they move to the <Link href="/transfers?view=latest" className="underline underline-offset-2">Latest transfers</Link> tab.
          </div>
          {/* 해외 브리핑 연결 — 루머 피드(한눈 스캔)와 브리핑 글(맥락·해설)은 같은 파이프라인의 두 얼굴 */}
          <Link
            href="/news"
            prefetch={false}
            className="mt-3 flex items-center gap-3 rounded-2xl border border-neutral-200/80 bg-white px-4 py-3 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07] transition"
          >
            <Newspaper className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden />
            <span className="text-[13px] font-semibold">Fuller context for these reports is in the briefing</span>
            <span className="ml-auto text-[12px] text-neutral-400 shrink-0">Read the briefing →</span>
          </Link>
          {rumorRows.length === 0 ? (
            <p className="text-sm text-neutral-500 py-20 text-center">Recent {RUMOR_DAYS} days — no imminent or rumour reports collected.</p>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none divide-y divide-neutral-100 dark:divide-white/5 mt-4">
              {rumorRows.map((r, ri) => {
                const dh = fmtNewsHeader(Math.floor(r.publishedAt.getTime() / 1000));
                const prevDh = ri > 0 ? fmtNewsHeader(Math.floor(rumorRows[ri - 1].publishedAt.getTime() / 1000)) : null;
                const st = RUMOR_STAGES[r.stage] ?? RUMOR_STAGES.TALKS;
                const from = r.fromTeam;
                const to = r.toTeam;
                return (
                  <Fragment key={r.id}>
                    {dh !== prevDh && (
                      <div className="px-3 sm:px-4 py-1.5 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-white/[0.03]">{dh}</div>
                    )}
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="block px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 shrink-0 ${st.cls}`}>{st.label}</span>
                        <span className="font-bold">{r.playerName}</span>
                        {r.fee && <span className="text-xs font-bold tabular-nums text-rose-600 dark:text-rose-400">{r.fee}</span>}
                        {r.league && LEAGUES[r.league] && <span className="text-[11px] text-neutral-400"><LeagueTag code={r.league} imgClass="w-3.5 h-3.5" /></span>}
                        <span className="ml-auto text-[11px] text-neutral-400 shrink-0">{r.sourceName} ↗</span>
                      </div>
                      {(from || to) && (
                        <div className="mt-0.5 text-[12px] text-neutral-500">
                          {from ?? "—"} <span className="text-neutral-300 dark:text-white/20">→</span> {to ?? "—"}
                        </div>
                      )}
                    </a>
                  </Fragment>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 리스트 — 이적 피드(최신/빅딜) or 팀별 IN/OUT or 몸값 랭킹 (루머 뷰는 위 전용 섹션만) */}
      {isRumors ? null : isFeed ? (
        transferData.length === 0 ? (
          <p className="text-sm text-neutral-500 py-20 text-center">{isBigdeals ? "No big deals recorded yet." : "Collecting transfer data."}</p>
        ) : (
          <>
          {/* 모바일·태블릿 — 카드 리스트 (기존 유지) */}
          <div className="lg:hidden overflow-hidden rounded-3xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none divide-y divide-neutral-100 dark:divide-white/5 mt-4">
            {transferData.map((t, ti) => {
              const rank = (safePage - 1) * PER + ti + 1;
              // 날짜 그룹 헤더 (최신 이적만) — 소식일(첫 수집) 기준, 이전 행과 다를 때 섹션 구분
              const dh = isLatest ? fmtNewsHeader(t.newsAt) : null;
              const prevDh = isLatest && ti > 0 ? fmtNewsHeader(transferData[ti - 1].newsAt) : null;
              return (
              <Fragment key={t.id}>
                {dh && dh !== prevDh && (
                  <div className="px-3 sm:px-4 py-1.5 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-white/[0.03]">
                    {dh}{dateCounts?.get(dh) ? ` · ${dateCounts.get(dh)}` : ""}
                  </div>
                )}
              <Link
                href={`/transfers/${t.playerId}`}
                className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              >
                {isBigdeals && (
                  <div className={`w-6 sm:w-7 text-center font-bold tabular-nums shrink-0 ${rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{rank}</div>
                )}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                  {t.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.photo} alt={t.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{t.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{t.name}</span>
                    {t.posCode && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-500 shrink-0">{t.posCode}</span>
                    )}
                    {t.badge && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${BADGE_CLS[t.badge] || "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"}`}>{t.badge}</span>
                    )}
                    {t.flag && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.flag} alt={t.country || ""} title={t.country || ""} className="w-4 h-3 object-cover rounded-[1px] shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5 min-w-0">
                    <span className="truncate flex items-center gap-1 min-w-0">
                      {t.fromLogo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.fromLogo} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
                      )}
                      <span className="truncate">{t.fromTeam}</span>
                    </span>
                    <span className="shrink-0 text-neutral-400">→</span>
                    <span className="truncate font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1 min-w-0">
                      {t.toLogo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.toLogo} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
                      )}
                      <span className="truncate">{t.toTeam}</span>
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0 leading-tight w-[64px]">
                  {isBigdeals ? (
                    <>
                      <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">€{Math.round(t.fee / 1e6)}M</div>
                      <div className="text-[11px] text-neutral-400 tabular-nums">{fmtDateCell(t.time)}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[11px] text-neutral-400 tabular-nums">{fmtDateCell(t.time)}</div>
                      {t.fee > 0 ? (
                        <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">€{Math.round(t.fee / 1e6)}M</div>
                      ) : t.desc && DESC_KO[t.desc] ? (
                        <div className="text-[11px] font-semibold text-neutral-500">{DESC_KO[t.desc]}</div>
                      ) : null}
                    </>
                  )}
                </div>
              </Link>
              </Fragment>
              );
            })}
          </div>

          {/* PC — 컬럼 테이블: 순위·이름·나이·포지션·소속팀(이적 전→후)·리그·국가·이적료 */}
          <div className="hidden lg:block overflow-hidden rounded-3xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none divide-y divide-neutral-100 dark:divide-white/5 mt-4">
            <div className="flex items-center gap-3 px-5 py-2.5 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-white/[0.03]">
              <div className="w-12 text-center shrink-0">Rank</div>
              <div className="flex-1 min-w-0">Name</div>
              <div className="w-12 text-center shrink-0">Age</div>
              <div className="w-16 text-center shrink-0">Position</div>
              <div className="w-64 shrink-0">Club</div>
              <div className="w-20 shrink-0">League</div>
              <div className="w-28 shrink-0">Country</div>
              <div className="w-28 text-right shrink-0">Fee</div>
            </div>
            {transferData.map((t, ti) => {
              const rank = (safePage - 1) * PER + ti + 1;
              const dh = isLatest ? fmtNewsHeader(t.newsAt) : null;
              const prevDh = isLatest && ti > 0 ? fmtNewsHeader(transferData[ti - 1].newsAt) : null;
              return (
                <Fragment key={t.id}>
                  {dh && dh !== prevDh && (
                    <div className="px-5 py-1.5 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-white/[0.03]">
                      {dh}{dateCounts?.get(dh) ? ` · ${dateCounts.get(dh)}` : ""}
                    </div>
                  )}
                  <Link
                    href={`/transfers/${t.playerId}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  >
                    {/* 순위 */}
                    <div className={`w-12 text-center font-bold tabular-nums shrink-0 ${rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{rank}</div>
                    {/* 이름 (+사진 +유형 배지) */}
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                        {t.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.photo} alt={t.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{t.name.slice(0, 1)}</span>
                        )}
                      </div>
                      <span className="font-bold truncate">{t.name}</span>
                      {t.badge && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${BADGE_CLS[t.badge] || "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"}`}>{t.badge}</span>
                      )}
                    </div>
                    {/* 나이 */}
                    <div className="w-12 text-center text-sm tabular-nums shrink-0 text-neutral-600 dark:text-neutral-300">{t.age ?? "—"}</div>
                    {/* 포지션 */}
                    <div className="w-16 text-center shrink-0">
                      {t.posCode ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-500">{t.posCode}</span>
                      ) : (
                        <span className="text-neutral-300 dark:text-neutral-600">—</span>
                      )}
                    </div>
                    {/* 소속팀 (이적 전→후) */}
                    <div className="w-64 shrink-0 flex items-center gap-1.5 min-w-0 text-sm">
                      <span className="flex items-center gap-1 min-w-0 flex-1 text-neutral-500">
                        {t.fromLogo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.fromLogo} alt="" className="w-4 h-4 object-contain shrink-0" />
                        )}
                        <span className="truncate">{t.fromTeam}</span>
                      </span>
                      <span className="shrink-0 text-neutral-400">→</span>
                      <span className="flex items-center gap-1 min-w-0 flex-1 font-semibold text-neutral-700 dark:text-neutral-300">
                        {t.toLogo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.toLogo} alt="" className="w-4 h-4 object-contain shrink-0" />
                        )}
                        <span className="truncate">{t.toTeam}</span>
                      </span>
                    </div>
                    {/* 리그 */}
                    <div className="w-20 shrink-0 text-sm text-neutral-500 dark:text-neutral-400 min-w-0"><LeagueTag code={t.league} /></div>
                    {/* 국가 */}
                    <div className="w-28 shrink-0 flex items-center gap-2 min-w-0">
                      {t.flag && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.flag} alt="" aria-hidden className="w-5 h-3.5 object-cover rounded-[1px] shrink-0" />
                      )}
                      <span className="text-sm text-neutral-600 dark:text-neutral-300 truncate">{t.country || "—"}</span>
                    </div>
                    {/* 이적료 (+날짜) */}
                    <div className="w-28 text-right shrink-0 leading-tight">
                      {t.fee > 0 ? (
                        <div className="font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">€{Math.round(t.fee / 1e6)}M</div>
                      ) : t.desc && DESC_KO[t.desc] ? (
                        <div className="text-xs font-semibold text-neutral-500">{DESC_KO[t.desc]}</div>
                      ) : (
                        <span className="text-neutral-300 dark:text-neutral-600">—</span>
                      )}
                      <div className="text-[11px] text-neutral-400 tabular-nums">{fmtDateCell(t.time)}</div>
                    </div>
                  </Link>
                </Fragment>
              );
            })}
          </div>
          </>
        )
      ) : isInout ? (
        inoutData.length === 0 ? (
          <p className="text-sm text-neutral-500 py-20 text-center">No transfer data to aggregate.</p>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none divide-y divide-neutral-100 dark:divide-white/5 mt-4">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-white/[0.03]">
              <div className="w-6 sm:w-7 shrink-0" />
              <div className="flex-1">Club</div>
              <div className="w-[80px] sm:w-[104px] text-right shrink-0">IN · spend</div>
              <div className="hidden sm:block w-[104px] text-right shrink-0">OUT · income</div>
              <div className="w-[60px] sm:w-[72px] text-right shrink-0">Net spend</div>
            </div>
            {inoutData.map((t) => {
              const net = t.inFee - t.outFee;
              const feeM = (v: number) => { const m = v / 1e6; return m >= 10 ? String(Math.round(m)) : String(Math.round(m * 10) / 10); };
              return (
                <Link
                  key={t.teamId}
                  href={`/teams/${t.teamId}`}
                  className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                >
                  <div className={`w-6 sm:w-7 text-center font-bold tabular-nums shrink-0 ${t.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{t.rank}</div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {t.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold truncate">{t.name}</div>
                      <div className="text-[11px] text-neutral-500"><LeagueTag code={t.league} imgClass="w-3.5 h-3.5" /></div>
                    </div>
                  </div>
                  <div className="w-[80px] sm:w-[104px] text-right leading-tight shrink-0">
                    <div className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{t.inCnt}</div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">{t.inFee > 0 ? `€${feeM(t.inFee)}M` : "—"}</div>
                  </div>
                  <div className="hidden sm:block w-[104px] text-right leading-tight shrink-0">
                    <div className="text-sm font-bold tabular-nums text-neutral-500">{t.outCnt}</div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">{t.outFee > 0 ? `€${feeM(t.outFee)}M` : "—"}</div>
                  </div>
                  <div className={`w-[60px] sm:w-[72px] text-right text-sm font-bold tabular-nums shrink-0 ${net > 0 ? "text-rose-500" : net < 0 ? "text-emerald-500" : "text-neutral-400"}`}>
                    {net === 0 ? "—" : net > 0 ? `-€${feeM(net)}M` : `+€${feeM(Math.abs(net))}M`}
                  </div>
                </Link>
              );
            })}
            {inoutBoundary && inoutBoundary.count > 0 && (
              <p className="px-3 sm:px-4 py-3 text-[11px] leading-relaxed text-neutral-500">
                basis. Transfer dates come from the source's <strong className="font-semibold">effective date</strong>, so some deals are recorded in bulk on the season boundary (30 June / 1 July). Here {inoutBoundary.count.toLocaleString()}
                {inoutBoundary.fee > 0 && ` · €${Math.round(inoutBoundary.fee / 1e6).toLocaleString()}M (${Math.round(inoutBoundary.feePct)}%)`}
                 of the fee total falls there. Those deals happened within the window and count toward the total, but do not read them as a daily distribution.
              </p>
            )}
          </div>
        )
      ) : isSquads ? (
        squadsData.length === 0 ? (
          <p className="text-sm text-neutral-500 py-20 text-center">No market value data to aggregate.</p>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none divide-y divide-neutral-100 dark:divide-white/5 mt-4">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-white/[0.03]">
              <div className="w-6 sm:w-7 shrink-0" />
              <div className="flex-1">Club</div>
              <div className="hidden sm:block w-[120px] text-right shrink-0">Most valuable</div>
              <div className="w-[44px] text-right shrink-0">Players</div>
              <div className="w-[86px] sm:w-[96px] text-right shrink-0">Total value</div>
            </div>
            {squadsData.map((t) => (
              <Link
                key={t.teamId}
                href={`/transfers?view=team&team=${t.teamId}`}
                className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              >
                <div className={`w-6 sm:w-7 text-center font-bold tabular-nums shrink-0 ${t.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{t.rank}</div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {t.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-bold truncate">{t.name}</div>
                    <div className="text-[11px] text-neutral-500 flex items-center gap-1 min-w-0">
                      <LeagueTag code={t.league} imgClass="w-3.5 h-3.5" />
                      {t.avgAge ? <span className="shrink-0">· average {t.avgAge}</span> : null}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block w-[120px] text-right leading-tight shrink-0 min-w-0">
                  <div className="text-xs font-semibold truncate">{t.topName}</div>
                  <div className="text-[11px] text-neutral-500 tabular-nums">€{t.topValue}M</div>
                </div>
                <div className="w-[44px] text-right text-sm font-bold tabular-nums text-neutral-500 shrink-0">{t.cnt}</div>
                <div className="w-[86px] sm:w-[96px] text-right leading-tight shrink-0">
                  <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">€{t.total.toLocaleString()}M</div>
                  <div className="text-[11px] text-neutral-500 tabular-nums">{krw(t.total)}</div>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : data.length === 0 ? (
        <p className="text-sm text-neutral-500 py-20 text-center">{qSearch ? `"${qSearch}" returned no results.` : "No players match these filters."}</p>
      ) : (
        <>
          {/* 모바일·태블릿 — 카드 리스트 (기존 유지) */}
          <div className="lg:hidden overflow-hidden rounded-3xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none divide-y divide-neutral-100 dark:divide-white/5 mt-4">
            {data.map((p) => {
              const prevV = p.hist.length >= 2 ? p.hist[p.hist.length - 2] : 0;
              const chg = prevV > 0 ? Math.round(((p.value - prevV) / prevV) * 100) : 0;
              const up = chg >= 0;
              return (
                <Link
                  key={p.id}
                  href={`/transfers/${p.id}`}
                  className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                >
                  <div className={`w-6 sm:w-7 text-center font-bold tabular-nums shrink-0 ${p.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{p.rank}</div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{p.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold flex items-center gap-1.5 min-w-0">
                      {view === "team" && p.number != null && (
                        <span className="text-xs font-bold text-neutral-400 tabular-nums shrink-0 w-6 text-right">{p.number}</span>
                      )}
                      <span className="truncate">{p.name}</span>
                      {p.posCode && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-500 shrink-0">
                          {p.posCode}
                        </span>
                      )}
                      {p.countryFlag && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.countryFlag} alt={p.country || ""} title={p.country || ""} className="w-4 h-3 object-cover rounded-[1px] shrink-0" />
                      )}
                      {p.country && (
                        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 shrink-0 hidden sm:inline">{p.country}</span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 truncate flex items-center gap-1">
                      {p.teamLogo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.teamLogo} alt="" className="w-3.5 h-3.5 object-contain inline-block" />
                      )}
                      <span className="truncate">{p.teamName}</span>
                      {p.league && view !== "league" && (
                        <><span className="shrink-0 text-neutral-300 dark:text-white/20">·</span><LeagueTag code={p.league} imgClass="w-3.5 h-3.5" /></>
                      )}
                      {p.age ? <span className="shrink-0">· {p.age}</span> : null}
                    </div>
                  </div>
                  <Spark data={p.hist} />
                  <div className="text-right w-[78px] sm:w-[92px] shrink-0 leading-tight">
                    <div className="font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">€{p.value}M</div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">{krw(p.value)}</div>
                    {p.hist.length >= 2 && (
                      <div className={`text-[11px] font-semibold tabular-nums ${up ? "text-emerald-500" : "text-rose-500"}`}>
                        {up ? "▲" : "▼"} {Math.abs(chg)}%
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* PC — 컬럼 테이블: 순위·이름·나이·포지션·소속팀·리그·국가·시장가치 */}
          <div className="hidden lg:block overflow-hidden rounded-3xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none divide-y divide-neutral-100 dark:divide-white/5 mt-4">
            <div className="flex items-center gap-3 px-5 py-2.5 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-white/[0.03]">
              <div className="w-12 text-center shrink-0">Rank</div>
              <div className="flex-1 min-w-0">Name</div>
              <div className="w-12 text-center shrink-0">Age</div>
              <div className="w-16 text-center shrink-0">Position</div>
              <div className="w-48 shrink-0">Club</div>
              <div className="w-24 shrink-0">League</div>
              <div className="w-32 shrink-0">Country</div>
              <div className="w-32 text-right shrink-0">Market value</div>
            </div>
            {data.map((p) => {
              const prevV = p.hist.length >= 2 ? p.hist[p.hist.length - 2] : 0;
              const chg = prevV > 0 ? Math.round(((p.value - prevV) / prevV) * 100) : 0;
              const up = chg >= 0;
              return (
                <Link
                  key={p.id}
                  href={`/transfers/${p.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                >
                  {/* 순위 */}
                  <div className={`w-12 text-center font-bold tabular-nums shrink-0 ${p.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{p.rank}</div>
                  {/* 이름 (+사진) */}
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photo} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{p.name.slice(0, 1)}</span>
                      )}
                    </div>
                    {view === "team" && p.number != null && (
                      <span className="text-xs font-bold text-neutral-400 tabular-nums shrink-0 w-5 text-right">{p.number}</span>
                    )}
                    <span className="font-bold truncate">{p.name}</span>
                  </div>
                  {/* 나이 */}
                  <div className="w-12 text-center text-sm tabular-nums shrink-0 text-neutral-600 dark:text-neutral-300">{p.age ?? "—"}</div>
                  {/* 포지션 */}
                  <div className="w-16 text-center shrink-0">
                    {p.posCode ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-500">{p.posCode}</span>
                    ) : (
                      <span className="text-neutral-300 dark:text-neutral-600">—</span>
                    )}
                  </div>
                  {/* 소속팀 */}
                  <div className="w-48 shrink-0 flex items-center gap-2 min-w-0">
                    {p.teamLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.teamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
                    )}
                    <span className="text-sm text-neutral-600 dark:text-neutral-300 truncate">{p.teamName}</span>
                  </div>
                  {/* 리그 */}
                  <div className="w-24 shrink-0 text-sm text-neutral-500 dark:text-neutral-400 min-w-0"><LeagueTag code={p.league} /></div>
                  {/* 국가 */}
                  <div className="w-32 shrink-0 flex items-center gap-2 min-w-0">
                    {p.countryFlag && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.countryFlag} alt="" aria-hidden className="w-5 h-3.5 object-cover rounded-[1px] shrink-0" />
                    )}
                    <span className="text-sm text-neutral-600 dark:text-neutral-300 truncate">{p.country || "—"}</span>
                  </div>
                  {/* 시장가치 */}
                  <div className="w-32 shrink-0 text-right leading-tight">
                    <div className="font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">€{p.value}M</div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">{krw(p.value)}</div>
                    {p.hist.length >= 2 && (
                      <div className={`text-[11px] font-semibold tabular-nums ${up ? "text-emerald-500" : "text-rose-500"}`}>
                        {up ? "▲" : "▼"} {Math.abs(chg)}%
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-5">
          {safePage > 1 && (
            <Link href={pageUrl(safePage - 1)} className="px-3.5 py-1.5 rounded-full text-sm ring-1 ring-black/10 dark:ring-white/15 text-neutral-500 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:hover:bg-white/10">‹</Link>
          )}
          {pageNums(safePage, totalPages).map((n, i) =>
            typeof n === "number" ? (
              <Link
                key={i}
                href={pageUrl(n)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  n === safePage
                    ? "bg-cyan-600 text-white ring-cyan-600 shadow-[0_8px_24px_-10px_rgba(8,145,178,0.6)]"
                    : "ring-black/10 dark:ring-white/15 text-neutral-600 dark:text-neutral-300 hover:-translate-y-0.5 hover:bg-white dark:hover:bg-white/10"
                }`}
              >
                {n}
              </Link>
            ) : (
              <span key={i} className="px-1 text-neutral-400">…</span>
            ),
          )}
          {safePage < totalPages && (
            <Link href={pageUrl(safePage + 1)} className="px-3.5 py-1.5 rounded-full text-sm ring-1 ring-black/10 dark:ring-white/15 text-neutral-500 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:hover:bg-white/10">›</Link>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-neutral-400 text-center">{safePage}/{totalPages} · Scorebase {isRumors ? "Imminent & rumours" : isFeed || isInout ? "Transfers" : "Player values"} Data</p>
    </main>
  );
}
