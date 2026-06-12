// 시장가치 랭킹 — TheSports market value 실데이터.
// 카테고리: 전체 / 리그별 / 팀별 / 국가별 / 포지션별 / 최신 이적 / 빅딜 / 팀별 IN·OUT + 선수·팀 검색(q).
// 기본 = 전체(빅5 통합) — 상단 마켓 무브(급상승·급락·빅딜) 요약. 행 클릭 → /transfers/[id].
import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import TransfersFilterBar from "./TransfersFilterBar";
import { toKoreanTeamName } from "@/lib/team-names";
import rawDetailPos from "../../../data/player-positions.json";
import rawOverrides from "../../../data/player-overrides.json";
import rawPhotos from "../../../data/player-photos.json";
import rawTeamLogos from "../../../data/team-logos.json";
import rawSquads from "../../../data/team-squads.json";
import rawCoaches from "../../../data/team-coaches.json";
import { DESC_KO, BADGE_CLS, koTeam, badgeOf } from "./transfer-display";
import SquadBestXI, { pickBestXI } from "./SquadBestXI";

export const dynamic = "force-dynamic";

// SEO — 선수 몸값/이적시장 키워드 + 스코어베이스 브랜드. view 별 타이틀 분기.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ league?: string; view?: string; q?: string; team?: string }> }): Promise<Metadata> {
  const sp = await searchParams;
  const win = transferWindow();
  const lgLabel = sp.league && LEAGUES[sp.league] ? LEAGUES[sp.league] : null;
  let title: string, description: string, canonical = "/transfers";
  let teamKeywords: string[] = [];
  if (sp.view === "team" && sp.team && Number.isFinite(Number(sp.team))) {
    // 팀 스쿼드 — "맨유 스쿼드" 류 검색 수요 타깃. 팀명 DB 조회.
    const t = await prisma.team.findUnique({ where: { id: Number(sp.team) }, select: { name: true } });
    const nm = t ? toKoreanTeamName(t.name) || t.name : null;
    if (nm) {
      title = `${nm} 스쿼드 · 선수단 몸값 랭킹 | 스코어베이스`;
      description = `${nm} 선수단 시장가치 총정리 — 스쿼드 총 가치와 베스트11, 선수별 몸값·변동 추이·포지션·연령까지 한눈에. 스코어베이스 이적시장.`;
      canonical = `/transfers?view=team&team=${Number(sp.team)}`;
      teamKeywords = [`${nm} 스쿼드`, `${nm} 선수단`, `${nm} 선수 몸값`];
    } else {
      title = "팀 스쿼드 · 선수단 몸값 랭킹 | 스코어베이스";
      description = "유럽 빅5 리그 팀별 선수단 시장가치(몸값) 랭킹 — 스코어베이스 이적시장.";
    }
  } else if (sp.view === "squads") {
    const scope = lgLabel ? `${lgLabel} ` : "유럽 빅5 ";
    title = `${scope}팀 스쿼드 가치 랭킹 · 선수단 총액 | 스코어베이스`;
    description = `${scope}리그 팀별 스쿼드 시장가치 총액 랭킹. 선수단 가치·평균 연령·최고가 선수를 팀 단위로 비교 — 스코어베이스 이적시장.`;
    canonical = lgLabel ? `/transfers?view=squads&league=${sp.league}` : "/transfers?view=squads";
  } else if (sp.view === "bigdeals") {
    title = `${win.label} 빅딜 랭킹 · 이적료 TOP | 스코어베이스`;
    description = `${win.label} 유럽 빅5 리그 최고 이적료 랭킹. 확정 이적 빅딜을 이적료 순으로 한눈에 — 스코어베이스 이적시장.`;
    canonical = "/transfers?view=bigdeals";
  } else if (sp.view === "inout") {
    title = `팀별 영입·방출 IN/OUT · ${win.label} | 스코어베이스`;
    description = `${win.label} 유럽 빅5 리그 팀별 영입(IN)·방출(OUT) 현황과 이적 지출·수입·순지출 총정리 — 스코어베이스 이적시장.`;
    canonical = "/transfers?view=inout";
  } else if (sp.view === "latest") {
    const scope = lgLabel || "유럽 빅5·K리그1·사우디·MLS";
    title = `최신 축구 이적 현황 · ${lgLabel || "주요 리그"} | 스코어베이스`;
    description = `${scope} 선수 이적 소식을 최신순으로. 이적료·임대·자유이적까지 매일 업데이트 — 스코어베이스 이적시장.`;
    canonical = lgLabel ? `/transfers?view=latest&league=${sp.league}` : "/transfers?view=latest";
  } else {
    const scope = lgLabel ? `${lgLabel} ` : "유럽 빅5 ";
    title = `${scope}선수 몸값 랭킹 · 이적시장 시장가치 | 스코어베이스`;
    description = `${scope}리그 선수 시장가치(몸값) 랭킹과 변동 추이, 이적 기록, 커리어·시즌별 성적까지. 스코어베이스에서 선수 몸값을 한눈에.`;
  }
  return {
    title,
    description,
    keywords: [...teamKeywords, "선수 몸값", "시장가치", "이적시장", "축구 이적", "이적료", "선수 시장가치", "스코어베이스", "빅5 리그"],
    openGraph: { title, description, type: "website" },
    alternates: { canonical },
    ...(sp.q ? { robots: { index: false } } : {}), // 검색 결과 페이지는 색인 제외
  };
}

const LEAGUES: Record<string, string> = {
  EPL: "EPL",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  K_LEAGUE_1: "K리그1",
  SAUDI_PL: "사우디 프로리그",
  MLS: "MLS",
};
const LEAGUE_LIST = Object.entries(LEAGUES).map(([code, label]) => ({ code, label }));
// 빅5 — 시장가치 기반 뷰(머니파워·스쿼드 가치·IN/OUT·팀 옵션) 범위.
// 확장 리그(K리그1·사우디·MLS)는 PlayerMarketValue 커버리지가 얇아(17~179명) 피드·빅딜만 노출.
const FIVE = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
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
const COACHES = rawCoaches as Record<string, { id?: string; name: string; nameKo: string | null; logo: string | null; age: number | null; nationality: string | null; preferredFormation: string | null; joined: number | null; contractUntil: number | null }>;
const POS_CODES = ["GK", "CB", "FB", "DM", "CM", "AM", "W", "ST"];
// 포지션 우선순위: Wikidata P413(검증된 주 포지션) > 라인업 x/y 추정 > ts coarse
function posCodeOf(id: string, coarse: string | null | undefined): string | null {
  if (OVERRIDES[id]?.pos) return OVERRIDES[id].pos!;
  if (DETAIL_POS[id]) return DETAIL_POS[id];
  return coarse === "G" ? "GK" : coarse === "M" ? "MF" : coarse === "D" ? "DF" : coarse === "F" ? "FW" : null;
}
const PER = 20;

// 이적창 윈도우 — 6~9월 = 그해 여름창(6/1~), 12~2월 = 겨울창(12/1~), 그 외 = 최근 90일.
// to = 창 종료 상한: 여름 이적은 7/1 발효(시즌 전환일)로 기록되는 행이 다수라 미래 발효도
// 창 내면 표시하되, 연말·내년 "임대 복귀 예정" 노이즈는 잘라낸다.
function transferWindow(): { label: string; from: number; to: number } {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  if (m >= 6 && m <= 9) return { label: `${y} 여름 이적시장`, from: Date.UTC(y, 5, 1) / 1000, to: Date.UTC(y, 9, 1) / 1000 };
  if (m === 12) return { label: `${y + 1} 겨울 이적시장`, from: Date.UTC(y, 11, 1) / 1000, to: Date.UTC(y + 1, 2, 1) / 1000 };
  if (m <= 2) return { label: `${y} 겨울 이적시장`, from: Date.UTC(y - 1, 11, 1) / 1000, to: Date.UTC(y, 2, 1) / 1000 };
  return { label: "최근 90일", from: Math.floor(now.getTime() / 1000) - 90 * 86400, to: Math.floor(now.getTime() / 1000) + 30 * 86400 };
}

const EUR_KRW = 1791.5;
function krw(eurM: number): string {
  const eok = (eurM * 1e6 * EUR_KRW) / 1e8;
  if (eok >= 10000) return (eok / 10000).toFixed(2) + "조";
  return Math.round(eok).toLocaleString() + "억";
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

// 이적일 → 날짜 그룹 헤더 "7월 1일 (수)" / 타년도 "2025년 12월 30일 (화)" (UTC 고정 — Vercel/로컬 동일)
function fmtDateHeader(unix: number): string {
  const d = new Date(unix * 1000);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  const y = d.getUTCFullYear();
  const cur = new Date().getUTCFullYear();
  const base = `${y !== cur ? `${y}년 ` : ""}${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${wd})`;
  // 미래 발효(7/1 시즌 전환 등) 그룹은 헤더에 명시 — "이미 일어난 이적"으로 오독 방지
  return unix * 1000 > Date.now() ? `${base} 발효 예정` : base;
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
}

interface TsPlayerLite { nameKo: string | null; name: string | null; photoUrl: string | null; position: string | null }
interface TransferRow {
  id: string; playerId: string; fromTeamName: string | null; toTeamName: string | null;
  fromTeamId: string | null; toTeamId: string | null;
  transferTime: number | null; transferFee: number | null; transferDesc: string | null; league: string | null;
  transferType: number | null;
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
function toCard(r: TransferRow, tpMap: Map<string, TsPlayerLite>, teamLogos?: Map<string, string>): TransferCard {
  const tsp = tpMap.get(r.playerId);
  const ov = OVERRIDES[r.playerId];
  return {
    id: r.id,
    playerId: r.playerId,
    name: ov?.nameKo || tsp?.nameKo || tsp?.name || "선수",
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
    country: ov?.country || null,
    fromLogo: (r.fromTeamId && teamLogos?.get(r.fromTeamId)) || null,
    toLogo: (r.toTeamId && teamLogos?.get(r.toTeamId)) || null,
  };
}

// 마켓 무브 요약 카드 (급상승/급락/빅딜 공통 틀)
function PulseCard({ title, hint, more, children }: { title: string; hint?: string; more?: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 p-3.5">
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
    <Link href={href} className="flex items-center gap-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900/40 rounded-lg px-1.5 py-1 -mx-1.5 transition">
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

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; league?: string; team?: string; pos?: string; country?: string; page?: string; q?: string; mode?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const view = ["all", "league", "team", "country", "pos", "latest", "bigdeals", "inout", "squads"].includes(sp.view || "") ? sp.view! : "all";
  const isLatest = view === "latest";
  const isBigdeals = view === "bigdeals";
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
  const cutoff = Math.floor(Date.now() / 1000) - 18 * 30 * 86400; // 18개월 활성
  const win = transferWindow();

  // ── 팀 옵션 (빅5 전체에서 distinct, 인원수) ──
  const teamGroups = await prisma.playerMarketValue.groupBy({
    by: ["teamId"],
    where: { league: { in: FIVE }, currentValue: { not: null }, teamId: { not: null } },
    _count: { _all: true },
  });
  const allTsTeamIds = teamGroups.map((g) => g.teamId).filter((x): x is string => !!x);
  const tsT = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: allTsTeamIds } },
    select: { externalId: true, teamId: true },
  });
  // 한 ts팀 id 가 여러 Team 에 매핑된 경우(예: FC 바르셀로나 ts → 바르셀로나 LALIGA·UCL·Barcelona SC 에콰도르)
  // 빅5 리그 Team 을 우선 선택 — 엉뚱한 동명 클럽 표시 방지.
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
  for (const g of teamGroups) {
    const our = g.teamId ? tsToOur.get(g.teamId) : undefined;
    if (our != null) teamCount.set(our, (teamCount.get(our) || 0) + g._count._all);
  }
  const teamOptions = [...teamCount.entries()]
    .map(([id, count]) => ({ id, name: toKoreanTeamName(teamMeta.get(id)?.name) || teamMeta.get(id)?.name || "", count }))
    .filter((t) => t.name)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

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
  let where: Record<string, unknown> = { league: { in: FIVE }, currentValue: { not: null } };
  if (view === "team" && team) {
    const tsForTeam = await prisma.teamSourceId.findMany({
      where: { source: "thesports", teamId: Number(team) },
      select: { externalId: true },
    });
    where = { league: { in: FIVE }, currentValue: { not: null }, teamId: { in: tsForTeam.map((t) => t.externalId) } };
  } else if ((view === "league" || view === "squads") && league) {
    where = { league, currentValue: { not: null } };
  }

  const raw = isFeed || isInout ? [] : await prisma.playerMarketValue.findMany({ where, orderBy: { currentValue: "desc" } });
  const ids = raw.map((r) => r.id);
  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: ids } },
    select: { id: true, nameKo: true, name: true, photoUrl: true, position: true },
  });
  const pMap = new Map(players.map((p) => [p.id, p]));

  // enrich + 18개월 활성 필터
  let enriched = raw
    .map((r) => {
      const ourId = r.teamId ? tsToOur.get(r.teamId) : undefined;
      const tm = ourId != null ? teamMeta.get(ourId) : undefined;
      const tsp = pMap.get(r.id);
      const ov = OVERRIDES[r.id];
      const hist = Array.isArray(r.history) ? (r.history as Hist[]) : [];
      const last = hist[hist.length - 1];
      return {
        id: r.id,
        name: ov?.nameKo || tsp?.nameKo || tsp?.name || "선수",
        nameEn: tsp?.name || null,
        value: Math.round((r.currentValue || 0) / 1e6),
        age: r.age,
        ourTeamId: ourId ?? null,
        posCode: posCodeOf(r.id, tsp?.position),
        number: (r.teamId && SQUADS[r.teamId]?.squad.find((s) => s.id === r.id)?.number) || null,
        league: r.league,
        country: ov?.country || null,
        countryFlag: ov?.flag || null,
        teamName: toKoreanTeamName(tm?.name) || tm?.name || "—",
        teamLogo: tm?.logoUrl || null,
        photo: PHOTOS[r.id] || tsp?.photoUrl || null,
        lastTime: last?.market_time ?? 0,
        hist: hist.map((h) => (h?.market_value || 0) / 1e6).filter((v) => v > 0),
      };
    })
    .filter((e) => e.lastTime >= cutoff);

  // 동일 표시명+팀 중복 제거 (TheSports 중복 선수 레코드 — 예: 패트릭 도르구 2건).
  // raw 가 가치순(desc)이라 첫 등장 = 최고가 → 그것만 유지.
  const dedupSeen = new Set<string>();
  enriched = enriched.filter((e) => { const k = `${e.name}|${e.teamName}`; if (dedupSeen.has(k)) return false; dedupSeen.add(k); return true; });

  // 이름 데이터 없는 선수(name="선수" fallback)는 랭킹에서 제외 — TheSports player API
  // 미인가로 이름 backfill 불가. 라인업 등장/플랜 추가로 이름이 생기면 자동 재노출됨.
  enriched = enriched.filter((e) => e.name !== "선수");

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
  if (isInout) {
    const big5Teams = await prisma.team.findMany({ where: { league: { in: FIVE } }, select: { id: true, name: true, logoUrl: true, league: true } });
    const tsRows = await prisma.teamSourceId.findMany({
      where: { source: "thesports", teamId: { in: big5Teams.map((t) => t.id) } },
      select: { externalId: true, teamId: true },
    });
    const extToOur = new Map(tsRows.map((t) => [t.externalId, t.teamId]));
    const extIds = tsRows.map((t) => t.externalId);
    const trs = await prisma.footballTransfer.findMany({
      where: { transferTime: { gte: win.from }, OR: [{ toTeamId: { in: extIds } }, { fromTeamId: { in: extIds } }] },
      select: { toTeamId: true, fromTeamId: true, transferFee: true },
    });
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
        return { teamId: id, name: toKoreanTeamName(tm.name) || tm.name, logo: tm.logoUrl, league: tm.league, ...a, rank: 0 };
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
          name: toKoreanTeamName(tm?.name) || tm?.name || "—",
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
  const squadSummary =
    view === "team" && team && Number.isFinite(teamIdNum) && enriched.length > 0
      ? (() => {
          const tm = teamMeta.get(teamIdNum);
          const total = enriched.reduce((s, e) => s + e.value, 0);
          const ages = enriched.filter((e) => e.age);
          return {
            name: toKoreanTeamName(tm?.name) || tm?.name || "팀",
            logo: tm?.logoUrl || null,
            league: tm?.league || null,
            total,
            avgAge: ages.length ? Math.round((ages.reduce((s, e) => s + (e.age || 0), 0) / ages.length) * 10) / 10 : null,
            cnt: enriched.length,
          };
        })()
      : null;
  const bestXI = squadSummary ? pickBestXI(enriched) : null;

  // ── 감독 + 최근 5경기 실제 포메이션 (view=team) ──
  let coach: (typeof COACHES)[string] | null = null;
  const recentFormations: string[] = [];
  if (squadSummary) {
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
  // 포메이션 분포 — 최빈 순 "4-3-3 ×3" 형식
  const formationSummary = (() => {
    if (!recentFormations.length) return null;
    const cnt = new Map<string, number>();
    for (const f of recentFormations) cnt.set(f, (cnt.get(f) || 0) + 1);
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([f, c]) => (c > 1 ? `${f} ×${c}` : f)).join(" · ");
  })();
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
        ...(tFilter === "loan" ? { transferType: { in: [2, 7] } } : {}),
      },
      // 같은 발효일(7/1 무더기) 안에서는 최근 수집(발표)분 먼저
      orderBy: [{ transferTime: "desc" }, { updatedAt: "desc" }],
    });
    const pids = [...new Set(rows.map((r) => r.playerId))];
    const tplayers = await prisma.theSportsPlayer.findMany({
      where: { id: { in: pids } },
      select: { id: true, nameKo: true, name: true, photoUrl: true, position: true },
    });
    const tpMap = new Map(tplayers.map((p) => [p.id, p]));
    const logoMap = await buildTeamLogoMap(rows);
    latestMainCards = rows.map((r) => toCard(r, tpMap, logoMap)).filter((c) => c.name !== "선수" || c.fee > 0);
    dateCounts = new Map();
    for (const c of latestMainCards) { const k = fmtDateHeader(c.time); dateCounts.set(k, (dateCounts.get(k) || 0) + 1); }
  }

  const feedScope = league ? [league] : FEED_LEAGUES;
  const feedWhere = isBigdeals
    ? { league: { in: feedScope }, transferTime: { gte: win.from }, transferFee: { gt: 0 } }
    : {
        league: { in: feedScope },
        // 전체 이력(latest mode=all)도 창 종료 이후의 미래 발효 예정 행은 제외
        transferTime: { not: null, lte: win.to },
        ...(tFilter === "fee" ? { transferFee: { gt: 0 } } : {}),
        ...(tFilter === "loan" ? { transferType: { in: [2, 7] } } : {}),
      };
  const transferTotal = isBigdeals || latestAll ? await prisma.footballTransfer.count({ where: feedWhere }) : 0;
  const totalCount = latestMainCards ? latestMainCards.length : isFeed ? transferTotal : isInout ? inoutTotal : isSquads ? squadsTotal : enriched.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER));
  const safePage = Math.min(page, totalPages);
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
      orderBy: isBigdeals ? { transferFee: "desc" } : { transferTime: "desc" },
      skip: (safePage - 1) * PER,
      take: PER,
    });
    const tids = [...new Set(rows.map((r) => r.playerId))];
    const tplayers = await prisma.theSportsPlayer.findMany({
      where: { id: { in: tids } },
      select: { id: true, nameKo: true, name: true, photoUrl: true, position: true },
    });
    const tpMap = new Map(tplayers.map((p) => [p.id, p]));
    const logoMap = await buildTeamLogoMap(rows);
    transferData = rows.map((r) => toCard(r, tpMap, logoMap));
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

  // 제목
  const selectedLabel =
    isLatest ? "최신 이적"
      : view === "league" && league ? LEAGUES[league]
        : view === "team" && team ? teamOptions.find((t) => String(t.id) === team)?.name || "팀"
          : view === "pos" && pos ? pos
            : view === "country" && country ? country
              : "전체";
  const heading = isBigdeals
    ? `💸 ${win.label} 빅딜`
    : isInout
      ? "🔁 팀별 IN/OUT"
      : isSquads
        ? `🏟️ ${league ? `${LEAGUES[league]} ` : ""}팀 스쿼드 가치`
        : isLatest
          ? "🔄 최신 이적"
          : qSearch
            ? `🔍 "${qSearch}" 검색`
            : squadSummary
              ? `💰 ${squadSummary.name} 스쿼드`
              : `💰 ${selectedLabel} 시장가치`;

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
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <p className="text-sm text-neutral-500 mb-1">이적시장 · 시장가치</p>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{heading}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        {isBigdeals ? (
          <>{league ? LEAGUES[league] : "주요 리그"} <strong className="text-neutral-700 dark:text-neutral-300">이적료 TOP</strong> · {win.label} · {totalCount.toLocaleString()}건.</>
        ) : isInout ? (
          <>{win.label} <strong className="text-neutral-700 dark:text-neutral-300">팀별 영입·방출</strong> · 영입 지출순 · {totalCount}팀.</>
        ) : isSquads ? (
          <>{league ? LEAGUES[league] : "유럽 빅5"} 리그 <strong className="text-neutral-700 dark:text-neutral-300">팀별 스쿼드 시장가치 총액</strong> 랭킹 · {totalCount}팀.</>
        ) : squadSummary ? (
          <><strong className="text-neutral-700 dark:text-neutral-300">{squadSummary.name}</strong> 선수단 몸값 랭킹 · 시장가치순 · {squadSummary.cnt}명.</>
        ) : isLatest ? (
          latestAll ? (
            <>{league ? LEAGUES[league] : "유럽 빅5·K리그1·사우디·MLS"} <strong className="text-neutral-700 dark:text-neutral-300">전체 이적 이력</strong> · 최신순 · {totalCount.toLocaleString()}건.</>
          ) : (
            <>{win.label} <strong className="text-neutral-700 dark:text-neutral-300">주요 이적</strong> · 이름·이적료 확인분 · {totalCount.toLocaleString()}건.</>
          )
        ) : (
          <>선수 몸값 랭킹과 <strong className="text-neutral-700 dark:text-neutral-300">변동 추이</strong> · 유럽 빅5 리그 · {totalCount}명.</>
        )}
      </p>

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
      {squadSummary && (
        <>
          <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 p-4 mt-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {squadSummary.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={squadSummary.logo} alt={squadSummary.name} className="w-12 h-12 object-contain shrink-0" />
              )}
              <div className="min-w-0">
                <div className="font-bold text-lg truncate">{squadSummary.name}</div>
                <div className="text-xs text-neutral-500">
                  {squadSummary.league && LEAGUES[squadSummary.league] ? `${LEAGUES[squadSummary.league]} · ` : ""}스쿼드 {squadSummary.cnt}명
                  {squadSummary.avgAge ? ` · 평균 ${squadSummary.avgAge}세` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 ml-auto">
              <div className="text-right leading-tight">
                <div className="text-[11px] text-neutral-400">스쿼드 총 가치</div>
                <div className="font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">€{squadSummary.total.toLocaleString()}M</div>
                <div className="text-[11px] text-neutral-500 tabular-nums">{krw(squadSummary.total)}</div>
              </div>
              <Link
                href={`/teams/${teamIdNum}`}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition shrink-0"
              >
                팀 페이지 →
              </Link>
            </div>
          </div>
          {/* 감독 · 전술 카드 — ts coach/list(선호 포메이션) + 라인업 cache(최근 실제 포메이션) */}
          {coach && (
            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 p-4 mt-3 flex items-center gap-3 flex-wrap">
              <Link
                href={coach.id ? `/coaches/${coach.id}` : "#"}
                className="flex items-center gap-3 min-w-0 group"
              >
                <div className="w-12 h-12 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden shrink-0 flex items-center justify-center">
                  {coach.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coach.logo} alt={coach.nameKo || coach.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg">🧑‍💼</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-neutral-400">감독</div>
                  <div className="font-bold truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition">
                    {coach.nameKo || coach.name}
                    {coach.age ? <span className="font-normal text-sm text-neutral-500"> · {coach.age}세</span> : null}
                    {coach.nationality ? <span className="font-normal text-sm text-neutral-500"> · {coach.nationality}</span> : null}
                  </div>
                  {(coach.joined || coach.contractUntil) && (
                    <div className="text-xs text-neutral-500">
                      {coach.joined ? `${fmtYm(coach.joined)} 부임` : ""}
                      {coach.joined && coach.contractUntil ? " · " : ""}
                      {coach.contractUntil ? `계약 ~${fmtYm(coach.contractUntil)}` : ""}
                      <span className="text-cyan-600 dark:text-cyan-400"> · 프로필 →</span>
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-5 ml-auto text-right">
                {coach.preferredFormation && (
                  <div className="leading-tight">
                    <div className="text-[11px] text-neutral-400">선호 포메이션</div>
                    <div className="font-bold tabular-nums">{coach.preferredFormation}</div>
                  </div>
                )}
                {formationSummary && (
                  <div className="leading-tight">
                    <div className="text-[11px] text-neutral-400">최근 {recentFormations.length}경기</div>
                    <div className="font-bold tabular-nums">{formationSummary}</div>
                  </div>
                )}
              </div>
            </div>
          )}
          {bestXI && <SquadBestXI slots={bestXI} teamName={squadSummary.name} />}
        </>
      )}

      {/* 마켓 무브 — 급상승·급락·빅딜 요약 (전체 view 1페이지) */}
      {showPulse && (rising.length > 0 || falling.length > 0 || pulseDeals.length > 0) && (
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          {rising.length > 0 && (
            <PulseCard title="📈 급상승" hint="직전 업데이트 대비">
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
            <PulseCard title="📉 급락" hint="직전 업데이트 대비">
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
            <PulseCard title="💸 빅딜" more={{ href: "/transfers?view=bigdeals", label: "전체 →" }}>
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

      {/* 리스트 — 이적 피드(최신/빅딜) or 팀별 IN/OUT or 몸값 랭킹 */}
      {isFeed ? (
        transferData.length === 0 ? (
          <p className="text-sm text-neutral-500 py-20 text-center">{isBigdeals ? "아직 집계된 빅딜이 없습니다." : "이적 데이터를 수집하는 중입니다."}</p>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 divide-y divide-neutral-100 dark:divide-neutral-800/70 mt-4">
            {transferData.map((t, ti) => {
              const rank = (safePage - 1) * PER + ti + 1;
              // 날짜 그룹 헤더 (최신 이적만) — 이전 행과 날짜 다를 때 섹션 구분
              const dh = isLatest ? fmtDateHeader(t.time) : null;
              const prevDh = isLatest && ti > 0 ? fmtDateHeader(transferData[ti - 1].time) : null;
              return (
              <Fragment key={t.id}>
                {dh && dh !== prevDh && (
                  <div className="px-3 sm:px-4 py-1.5 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-neutral-900/60">
                    {dh}{dateCounts?.get(dh) ? ` · ${dateCounts.get(dh)}건` : ""}
                  </div>
                )}
              <Link
                href={`/transfers/${t.playerId}`}
                className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
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
                      <div className="text-[11px] text-neutral-400 tabular-nums">{fmtDate(t.time)}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[11px] text-neutral-400 tabular-nums">{fmtDate(t.time)}</div>
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
        )
      ) : isInout ? (
        inoutData.length === 0 ? (
          <p className="text-sm text-neutral-500 py-20 text-center">집계할 이적 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 divide-y divide-neutral-100 dark:divide-neutral-800/70 mt-4">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-neutral-900/60">
              <div className="w-6 sm:w-7 shrink-0" />
              <div className="flex-1">팀</div>
              <div className="w-[80px] sm:w-[104px] text-right shrink-0">IN · 지출</div>
              <div className="hidden sm:block w-[104px] text-right shrink-0">OUT · 수입</div>
              <div className="w-[60px] sm:w-[72px] text-right shrink-0">순지출</div>
            </div>
            {inoutData.map((t) => {
              const net = t.inFee - t.outFee;
              const feeM = (v: number) => { const m = v / 1e6; return m >= 10 ? String(Math.round(m)) : String(Math.round(m * 10) / 10); };
              return (
                <Link
                  key={t.teamId}
                  href={`/teams/${t.teamId}`}
                  className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
                >
                  <div className={`w-6 sm:w-7 text-center font-bold tabular-nums shrink-0 ${t.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{t.rank}</div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {t.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold truncate">{t.name}</div>
                      <div className="text-[11px] text-neutral-500">{LEAGUES[t.league] || t.league}</div>
                    </div>
                  </div>
                  <div className="w-[80px] sm:w-[104px] text-right leading-tight shrink-0">
                    <div className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{t.inCnt}명</div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">{t.inFee > 0 ? `€${feeM(t.inFee)}M` : "—"}</div>
                  </div>
                  <div className="hidden sm:block w-[104px] text-right leading-tight shrink-0">
                    <div className="text-sm font-bold tabular-nums text-neutral-500">{t.outCnt}명</div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">{t.outFee > 0 ? `€${feeM(t.outFee)}M` : "—"}</div>
                  </div>
                  <div className={`w-[60px] sm:w-[72px] text-right text-sm font-bold tabular-nums shrink-0 ${net > 0 ? "text-rose-500" : net < 0 ? "text-emerald-500" : "text-neutral-400"}`}>
                    {net === 0 ? "—" : net > 0 ? `-€${feeM(net)}M` : `+€${feeM(Math.abs(net))}M`}
                  </div>
                </Link>
              );
            })}
          </div>
        )
      ) : isSquads ? (
        squadsData.length === 0 ? (
          <p className="text-sm text-neutral-500 py-20 text-center">집계할 시장가치 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 divide-y divide-neutral-100 dark:divide-neutral-800/70 mt-4">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-neutral-900/60">
              <div className="w-6 sm:w-7 shrink-0" />
              <div className="flex-1">팀</div>
              <div className="hidden sm:block w-[120px] text-right shrink-0">최고가 선수</div>
              <div className="w-[44px] text-right shrink-0">인원</div>
              <div className="w-[86px] sm:w-[96px] text-right shrink-0">총 가치</div>
            </div>
            {squadsData.map((t) => (
              <Link
                key={t.teamId}
                href={`/transfers?view=team&team=${t.teamId}`}
                className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
              >
                <div className={`w-6 sm:w-7 text-center font-bold tabular-nums shrink-0 ${t.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{t.rank}</div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {t.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-bold truncate">{t.name}</div>
                    <div className="text-[11px] text-neutral-500">
                      {LEAGUES[t.league] || t.league}
                      {t.avgAge ? ` · 평균 ${t.avgAge}세` : ""}
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
        <p className="text-sm text-neutral-500 py-20 text-center">{qSearch ? `"${qSearch}" 검색 결과가 없습니다.` : "조건에 맞는 선수가 없습니다."}</p>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 divide-y divide-neutral-100 dark:divide-neutral-800/70 mt-4">
          {data.map((p) => {
            const prevV = p.hist.length >= 2 ? p.hist[p.hist.length - 2] : 0;
            const chg = prevV > 0 ? Math.round(((p.value - prevV) / prevV) * 100) : 0;
            const up = chg >= 0;
            return (
              <Link
                key={p.id}
                href={`/transfers/${p.id}`}
                className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
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
                    {p.teamName}{p.league && view !== "league" ? ` · ${LEAGUES[p.league] || p.league}` : ""}{p.age ? ` · ${p.age}세` : ""}
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
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-5">
          {safePage > 1 && (
            <Link href={pageUrl(safePage - 1)} className="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">‹</Link>
          )}
          {pageNums(safePage, totalPages).map((n, i) =>
            typeof n === "number" ? (
              <Link
                key={i}
                href={pageUrl(n)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                  n === safePage
                    ? "bg-cyan-600 text-white border-cyan-600"
                    : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {n}
              </Link>
            ) : (
              <span key={i} className="px-1 text-neutral-400">…</span>
            ),
          )}
          {safePage < totalPages && (
            <Link href={pageUrl(safePage + 1)} className="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">›</Link>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-neutral-400 text-center">{safePage}/{totalPages} 페이지 · 스코어베이스 {isFeed || isInout ? "이적시장" : "선수 몸값"} 데이터</p>
    </main>
  );
}
