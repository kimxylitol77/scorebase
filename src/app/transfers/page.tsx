// 시장가치 랭킹 — TheSports market value 실데이터.
// 카테고리: 전체 / 리그별 / 팀별 / 국가별 / 포지션별. 기본 = 전체(빅5 통합). 행 클릭 → /transfers/[id].
import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import TransfersFilterBar from "./TransfersFilterBar";
import { toKoreanTeamName } from "@/lib/team-names";
import rawDetailPos from "../../../data/player-positions.json";
import rawOverrides from "../../../data/player-overrides.json";
import rawPhotos from "../../../data/player-photos.json";

export const dynamic = "force-dynamic";

// SEO — 선수 몸값/이적시장 키워드 + 스코어베이스 브랜드
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ league?: string }> }): Promise<Metadata> {
  const sp = await searchParams;
  const lgLabel = sp.league && LEAGUES[sp.league] ? LEAGUES[sp.league] : null;
  const scope = lgLabel ? `${lgLabel} ` : "유럽 빅5 ";
  const title = `${scope}선수 몸값 랭킹 · 이적시장 시장가치 | 스코어베이스`;
  const description = `${scope}리그 선수 시장가치(몸값) 랭킹과 변동 추이, 이적 기록, 커리어·시즌별 성적까지. 스코어베이스에서 선수 몸값을 한눈에.`;
  return {
    title,
    description,
    keywords: ["선수 몸값", "시장가치", "이적시장", "축구 이적", "선수 시장가치", "스코어베이스", "빅5 리그"],
    openGraph: { title, description, type: "website" },
    alternates: { canonical: "/transfers" },
  };
}

const LEAGUES: Record<string, string> = {
  EPL: "EPL",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
};
const LEAGUE_LIST = Object.entries(LEAGUES).map(([code, label]) => ({ code, label }));
const FIVE = Object.keys(LEAGUES);
// 세부 포지션 — 라인업 x/y 도출(data/player-positions.json). 없으면 coarse(G/D/M/F)로 fallback.
const DETAIL_POS = rawDetailPos as Record<string, string>;
// Wikidata 보강 — ts player id → { 교정 한글명, 국적(ko), 국기 }
const OVERRIDES = rawOverrides as Record<string, { nameKo?: string; country?: string; flag?: string }>;
// 선수 사진 (TheSports season player.logo, 빅5 ~2.6k). DB photoUrl(라인업) 보다 커버리지 높아 우선.
const PHOTOS = rawPhotos as Record<string, string>;
const POS_CODES = ["GK", "CB", "FB", "DM", "CM", "AM", "W", "ST"];
function posCodeOf(id: string, coarse: string | null | undefined): string | null {
  if (DETAIL_POS[id]) return DETAIL_POS[id];
  return coarse === "G" ? "GK" : coarse === "M" ? "MF" : coarse === "D" ? "DF" : coarse === "F" ? "FW" : null;
}
const PER = 20;

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
const DESC_KO: Record<string, string> = { Free: "자유이적", Loan: "임대", "End of loan": "임대복귀", "Loan return": "임대복귀", Retired: "은퇴", Unknown: "" };

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
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; league?: string; team?: string; pos?: string; country?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const view = ["all", "league", "team", "country", "pos", "latest"].includes(sp.view || "") ? sp.view! : "all";
  const isLatest = view === "latest";
  const league = sp.league && LEAGUES[sp.league] ? sp.league : "";
  const team = sp.team || "";
  const pos = sp.pos && POS_CODES.includes(sp.pos) ? sp.pos : "";
  const country = sp.country || "";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const cutoff = Math.floor(Date.now() / 1000) - 18 * 30 * 86400; // 18개월 활성

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
  } else if (view === "league" && league) {
    where = { league, currentValue: { not: null } };
  }

  const raw = isLatest ? [] : await prisma.playerMarketValue.findMany({ where, orderBy: { currentValue: "desc" } });
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
        value: Math.round((r.currentValue || 0) / 1e6),
        age: r.age,
        posCode: posCodeOf(r.id, tsp?.position),
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

  const transferTotal = isLatest
    ? await prisma.footballTransfer.count({ where: { league: { in: FIVE }, transferTime: { not: null } } })
    : 0;
  const totalCount = isLatest ? transferTotal : enriched.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER));
  const safePage = Math.min(page, totalPages);
  const data = isLatest ? [] : enriched.slice((safePage - 1) * PER, safePage * PER).map((e, i) => ({ ...e, rank: (safePage - 1) * PER + i + 1 }));

  // ── 최신 이적 (view=latest) — transferTime 내림차순 + 페이지네이션 ──
  let transferData: TransferCard[] = [];
  if (isLatest) {
    const rows = await prisma.footballTransfer.findMany({
      where: { league: { in: FIVE }, transferTime: { not: null } },
      orderBy: { transferTime: "desc" },
      skip: (safePage - 1) * PER,
      take: PER,
    });
    const tids = [...new Set(rows.map((r) => r.playerId))];
    const tplayers = await prisma.theSportsPlayer.findMany({
      where: { id: { in: tids } },
      select: { id: true, nameKo: true, name: true, photoUrl: true, position: true },
    });
    const tpMap = new Map(tplayers.map((p) => [p.id, p]));
    transferData = rows.map((r) => {
      const tsp = tpMap.get(r.playerId);
      const ov = OVERRIDES[r.playerId];
      return {
        id: r.id,
        playerId: r.playerId,
        name: ov?.nameKo || tsp?.nameKo || tsp?.name || "선수",
        posCode: posCodeOf(r.playerId, tsp?.position),
        photo: PHOTOS[r.playerId] || tsp?.photoUrl || null,
        fromTeam: toKoreanTeamName(r.fromTeamName || undefined) || r.fromTeamName || "—",
        toTeam: toKoreanTeamName(r.toTeamName || undefined) || r.toTeamName || "—",
        time: r.transferTime || 0,
        fee: r.transferFee || 0,
        desc: r.transferDesc || null,
        league: r.league,
      };
    });
  }

  // 제목
  const selectedLabel =
    isLatest ? "최신 이적"
      : view === "league" && league ? LEAGUES[league]
        : view === "team" && team ? teamOptions.find((t) => String(t.id) === team)?.name || "팀"
          : view === "pos" && pos ? pos
            : view === "country" && country ? country
              : "전체";

  // 페이지네이션 URL (필터 유지)
  const pageUrl = (n: number) => {
    const params = new URLSearchParams();
    if (view !== "all") params.set("view", view);
    if (league) params.set("league", league);
    if (team) params.set("team", team);
    if (pos) params.set("pos", pos);
    if (country) params.set("country", country);
    if (n !== 1) params.set("page", String(n));
    const qs = params.toString();
    return `/transfers${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <p className="text-sm text-neutral-500 mb-1">이적시장 · 시장가치</p>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{isLatest ? "🔄 최신 이적" : `💰 ${selectedLabel} 시장가치`}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        {isLatest ? (
          <>유럽 빅5 리그 <strong className="text-neutral-700 dark:text-neutral-300">선수 이적 현황</strong> · 최신순 · {totalCount.toLocaleString()}건.</>
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
          leagues={LEAGUE_LIST}
          teams={teamOptions}
          countries={countryOptions}
        />
      </div>

      {/* 리스트 — 최신 이적 or 몸값 랭킹 */}
      {isLatest ? (
        transferData.length === 0 ? (
          <p className="text-sm text-neutral-500 py-20 text-center">이적 데이터를 수집하는 중입니다.</p>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 divide-y divide-neutral-100 dark:divide-neutral-800/70 mt-4">
            {transferData.map((t) => (
              <Link
                key={t.id}
                href={`/transfers/${t.playerId}`}
                className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
              >
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
                  </div>
                  <div className="text-xs text-neutral-500 truncate flex items-center gap-1 mt-0.5">
                    <span className="truncate">{t.fromTeam}</span>
                    <span className="shrink-0 text-neutral-400">→</span>
                    <span className="truncate font-semibold text-neutral-700 dark:text-neutral-300">{t.toTeam}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 leading-tight w-[64px]">
                  <div className="text-[11px] text-neutral-400 tabular-nums">{fmtDate(t.time)}</div>
                  {t.fee > 0 ? (
                    <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">€{Math.round(t.fee / 1e6)}M</div>
                  ) : t.desc && DESC_KO[t.desc] ? (
                    <div className="text-[11px] font-semibold text-neutral-500">{DESC_KO[t.desc]}</div>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )
      ) : data.length === 0 ? (
        <p className="text-sm text-neutral-500 py-20 text-center">조건에 맞는 선수가 없습니다.</p>
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
      <p className="mt-4 text-xs text-neutral-400 text-center">{safePage}/{totalPages} 페이지 · 스코어베이스 {isLatest ? "이적시장" : "선수 몸값"} 데이터</p>
    </main>
  );
}
