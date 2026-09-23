// 야구 선수 스탯 마스터 표 — KBO·MLB·NPB 시즌 기록 전 선수, 셀마다 리그 백분위(규정 표본), 합계·경기당 전환,
// 팀·검색 필터, 열 정렬, 두 명 비교. databallr /stats 문법. 서버 렌더 + 쿼리스트링(클라이언트 JS 없음).
// 계산: src/lib/sports/baseball/stats-table.ts · 데이터: player-rankings.getBbLeagueData(BaseballPlayerSeasonStats, 매일 갱신)
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Table2 } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import { BB_LEAGUES, getBbLeagueData, type BbLeague, type BbRole } from "@/lib/sports/baseball/player-rankings";
import { buildStatRows, columnsFor, formatStat, sortStatRows, type StatColumn, type StatRow, type StatUnit } from "@/lib/sports/baseball/stats-table";
import { fetchMlbSeasonAdvancedCached } from "@/lib/sports/mlb-cache";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import StatsGlossary from "@/components/stats/StatsGlossary";
import StatsLeaders from "@/components/stats/StatsLeaders";
import StatsCards from "@/components/stats/StatsCards";
import StatsScatter from "@/components/stats/StatsScatter";
import { columnGroups, STATS_VIEW_KO, type StatsView, type StatsViewRow } from "@/components/stats/types";
import { npbPlayerPhoto } from "@/lib/sports/npb-player-ko";

export const dynamic = "force-dynamic";

const PER = 50;
const ROLE_KO: Record<BbRole, string> = { bat: "타자", pit: "투수" };
const UNIT_KO: Record<StatUnit, string> = { total: "합계", pergame: "경기당" };
type SP = { league?: string; role?: string; unit?: string; team?: string; q?: string; sort?: string; dir?: string; page?: string; qual?: string; cmp?: string; view?: string; x?: string; y?: string };

function parse(sp: SP) {
  const league: BbLeague = (BB_LEAGUES as string[]).includes(sp.league ?? "") ? (sp.league as BbLeague) : "KBO";
  const role: BbRole = sp.role === "pit" ? "pit" : "bat";
  const unit: StatUnit = sp.unit === "pergame" ? "pergame" : "total";
  const cols = columnsFor(role, league);
  const defaultSort = role === "bat" ? "ops" : "era";
  const sort = cols.some((c) => c.key === sp.sort) || sp.sort === "name" ? (sp.sort as string) : defaultSort;
  const sortCol = cols.find((c) => c.key === sort);
  const dir: "asc" | "desc" = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : sortCol?.lowerIsBetter ? "asc" : "desc";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const qual = sp.qual !== "0"; // 기본 = 규정 선수만
  const cmp = (sp.cmp ?? "").split(",").filter(Boolean).slice(0, 2);
  const view: StatsView = (["cards", "leaders", "scatter"] as string[]).includes(sp.view ?? "") ? (sp.view as StatsView) : "table";
  const x = cols.some((c) => c.key === sp.x) ? (sp.x as string) : role === "bat" ? "avg" : "era";
  const y = cols.some((c) => c.key === sp.y) ? (sp.y as string) : role === "bat" ? "ops" : "whip";
  return { league, role, unit, team: sp.team ?? "", q: (sp.q ?? "").trim(), sort, dir, page, qual, cmp, view, x, y };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { league, role, unit } = parse(await searchParams);
  const title = `${league} ${ROLE_KO[role]} 스탯 표 — 시즌 기록·리그 백분위${unit === "pergame" ? " (경기당)" : ""}`;
  return {
    title,
    description: `${league} ${ROLE_KO[role]} 전원의 시즌 기록을 한 표에서 정렬·검색하고 셀마다 리그 백분위를 확인하는 스코어베이스 야구 스탯 표.`,
    alternates: { canonical: `/baseball/stats?league=${league}&role=${role}` },
  };
}

export default async function BaseballStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const p = parse(await searchParams);
  const data = await getBbLeagueData(p.league);
  const cols = columnsFor(p.role, p.league);
  // MLB 만 statsapi 성분으로 확장 열(wOBA·ISO·BB%·K% / FIP·K%·BB%·HR/9). 실패하면 열은 남고 값은 "—".
  const adv = p.league === "MLB" ? await fetchMlbSeasonAdvancedCached(Number(data.season)).catch(() => undefined) : undefined;
  const built = buildStatRows(data.rows, p.role, p.unit, cols, adv);
  const teams = [...new Set(built.rows.map((r) => r.team))].sort((a, b) => a.localeCompare(b, "ko"));
  let rows = built.rows;
  if (p.qual) rows = rows.filter((r) => r.qualified);
  if (p.team) rows = rows.filter((r) => r.team === p.team);
  if (p.q) {
    const q = p.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || (r.nameEn ?? "").toLowerCase().includes(q));
  }
  rows = sortStatRows(rows, p.sort, p.dir);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const safePage = Math.min(p.page, pages);
  const pageRows = rows.slice((safePage - 1) * PER, safePage * PER);
  const cmpRows = p.cmp.map((k) => built.rows.find((r) => r.key === k)).filter((r): r is StatRow => !!r);

  const url = (o: Partial<ReturnType<typeof parse>> & { page?: number; cmp?: string[] }) => {
    const n = { ...p, ...o };
    const qs = new URLSearchParams();
    qs.set("league", n.league); qs.set("role", n.role);
    if (n.view !== "table") qs.set("view", n.view);
    if (n.view === "scatter") { qs.set("x", n.x); qs.set("y", n.y); }
    if (n.unit !== "total") qs.set("unit", n.unit);
    if (n.team) qs.set("team", n.team);
    if (n.q) qs.set("q", n.q);
    if (n.sort !== (n.role === "bat" ? "ops" : "era")) qs.set("sort", n.sort);
    if (o.dir) qs.set("dir", o.dir);
    if (!n.qual) qs.set("qual", "0");
    if ((n.page ?? 1) > 1) qs.set("page", String(n.page));
    if (n.cmp?.length) qs.set("cmp", n.cmp.join(","));
    return `/baseball/stats?${qs}`;
  };
  const photoOf = (r: StatRow) =>
    p.league === "KBO" && r.externalId ? kboPhotoUrl(r.externalId)
      : p.league === "MLB" && r.externalId ? `https://midfield.mlbstatic.com/v1/people/${r.externalId}/spots/120`
        : p.league === "NPB" && r.logId ? npbPlayerPhoto(r.logId) ?? null
          : null;
  const hrefOf = (r: StatRow) =>
    p.league === "KBO" && r.externalId ? `/players/${r.externalId}?league=KBO`
      : p.league === "MLB" && r.externalId ? `/players/${r.externalId}`
        : p.league === "NPB" && r.logId ? `/players/${r.logId}?league=NPB`
          : null;

  const viewRows: StatsViewRow[] = rows.map((r) => ({ ...r, photo: photoOf(r), href: hrefOf(r), sub: r.team }));
  const pageViewRows = viewRows.slice((safePage - 1) * PER, safePage * PER);
  const groups = columnGroups(cols);

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${on ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-white dark:text-neutral-300 dark:hover:bg-white/10"}`;
  const pctCls = (pct: number | null) =>
    pct == null ? "text-neutral-300 dark:text-neutral-600"
      : pct >= 80 ? "text-rose-600 dark:text-rose-400 font-bold"
        : pct >= 60 ? "text-rose-500/80 dark:text-rose-300/80"
          : pct >= 40 ? "text-neutral-500"
            : "text-neutral-400 dark:text-neutral-500";
  const cellBg = (pct: number | null) =>
    pct == null ? "" : pct >= 80 ? "bg-rose-50 dark:bg-rose-500/10" : pct >= 60 ? "bg-rose-50/50 dark:bg-rose-500/5" : "";

  return (
    <div className="relative min-h-screen">
      <AmbientGlow />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Player Stats
        </div>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
          <Table2 className="h-7 w-7 text-neutral-400" aria-hidden="true" /> 야구 선수 스탯
        </h1>
        <p className="mt-1 text-sm text-neutral-500 break-keep">
          {data.season} 시즌 {p.league} {ROLE_KO[p.role]} 전원. 셀 아래 숫자는 규정 표본 안 리그 백분위(높을수록 상위, ERA·WHIP·패는 낮을수록 상위).
          규정 = {p.role === "bat" ? `${built.minGames}경기 이상 출장` : "30이닝 이상"} ({built.qualifiedCount}명).
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Link href="/baseball/rankings" className="rounded-full border border-neutral-200 px-3 py-1 font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]">선수 랭킹</Link>
          <Link href="/baseball" className="rounded-full border border-neutral-200 px-3 py-1 font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]">야구 허브</Link>
          <Link href="/soccer/stats" className="rounded-full border border-neutral-200 px-3 py-1 font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]">축구 스탯 표</Link>
        </div>

        {/* 필터 필 */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/10">{BB_LEAGUES.map((l) => <Link key={l} href={url({ league: l, team: "", page: 1, cmp: [] })} className={chip(l === p.league)}>{l}</Link>)}</div>
          <div className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/10">{(["bat", "pit"] as BbRole[]).map((r) => <Link key={r} href={url({ role: r, sort: r === "bat" ? "ops" : "era", page: 1, cmp: [] })} className={chip(r === p.role)}>{ROLE_KO[r]}</Link>)}</div>
          <div className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/10">{(["total", "pergame"] as StatUnit[]).map((u) => <Link key={u} href={url({ unit: u, page: 1 })} className={chip(u === p.unit)}>{UNIT_KO[u]}</Link>)}</div>
          <Link href={url({ qual: !p.qual, page: 1 })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${p.qual ? "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400" : "text-neutral-500 ring-black/10 dark:ring-white/15"}`}>
            {p.qual ? "규정 선수만" : "전체 선수"}
          </Link>
          <div className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/10">{(Object.keys(STATS_VIEW_KO) as StatsView[]).map((v) => <Link key={v} href={url({ view: v, page: 1 })} className={chip(v === p.view)}>{STATS_VIEW_KO[v]}</Link>)}</div>
        </div>
        <StatsGlossary cols={cols} note={`백분위는 같은 리그·같은 역할의 규정 선수(${built.qualifiedCount}명) 안에서 나보다 못한 값의 비율. 동률은 절반만 센다.`} />

        {/* 팀·검색 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action="/baseball/stats" className="flex items-center gap-1.5">
            <input type="hidden" name="league" value={p.league} /><input type="hidden" name="role" value={p.role} />
            {p.unit !== "total" && <input type="hidden" name="unit" value={p.unit} />}
            {!p.qual && <input type="hidden" name="qual" value="0" />}
            {p.team && <input type="hidden" name="team" value={p.team} />}
            <input name="q" defaultValue={p.q} placeholder="선수 검색" className="w-40 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-800 dark:bg-white/[0.04]" />
            <button type="submit" className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900">검색</button>
          </form>
          <div className="flex flex-wrap gap-1 text-[11px]">
            <Link href={url({ team: "", page: 1 })} className={`rounded-full px-2 py-0.5 ring-1 ${!p.team ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white" : "text-neutral-500 ring-black/10 dark:ring-white/15"}`}>전체</Link>
            {teams.map((t) => <Link key={t} href={url({ team: t, page: 1 })} className={`rounded-full px-2 py-0.5 ring-1 ${p.team === t ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white" : "text-neutral-500 ring-black/10 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"}`}>{t}</Link>)}
          </div>
          <span className="ml-auto text-xs text-neutral-500">{rows.length}명 · {safePage}/{pages} 페이지</span>
        </div>

        {/* 비교 바 */}
        {cmpRows.length > 0 && (
          <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">선수 비교 {cmpRows.length < 2 && <span className="ml-1 text-xs font-normal text-neutral-500">한 명 더 담으면 나란히 봅니다</span>}</h2>
              <Link href={url({ cmp: [] })} className="text-xs text-neutral-500 hover:underline">비우기</Link>
            </div>
            <div className="mt-3 grid gap-x-6 gap-y-1.5 text-sm" style={{ gridTemplateColumns: `6rem repeat(${cmpRows.length}, minmax(0, 1fr))` }}>
              <span />
              {cmpRows.map((r) => <span key={r.key} className="truncate font-semibold">{r.name} <span className="text-xs font-normal text-neutral-500">{r.team}</span></span>)}
              {cols.map((c) => (
                <div key={c.key} className="contents">
                  <span className="text-xs font-semibold uppercase text-neutral-500">{c.label}</span>
                  {cmpRows.map((r) => {
                    const cell = r.cells[c.key];
                    return (
                      <span key={r.key} className="flex items-center gap-2 tabular-nums">
                        <span className="w-14 font-semibold">{formatStat(cell.value, c, p.unit)}</span>
                        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                          <span className="absolute inset-y-0 left-0 rounded-full bg-rose-500/80 dark:bg-rose-400/80" style={{ width: `${cell.pct ?? 0}%` }} />
                        </span>
                        <span className={`w-8 text-right text-[11px] ${pctCls(cell.pct)}`}>{cell.pct ?? "—"}</span>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        )}

        {p.view === "leaders" && <StatsLeaders rows={viewRows} cols={cols} unit={p.unit} />}
        {p.view === "cards" && <StatsCards rows={pageViewRows} cols={cols} unit={p.unit} startRank={(safePage - 1) * PER + 1} />}
        {p.view === "scatter" && <StatsScatter rows={viewRows} cols={cols} x={p.x} y={p.y} unit={p.unit} highlight={p.cmp} url={(o) => url({ view: "scatter", ...o })} />}

        {/* 표 */}
        {p.view === "table" && (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-white/95 text-[11px] uppercase tracking-wide text-neutral-500 backdrop-blur dark:bg-neutral-950/90">
              <tr className="text-[10px] tracking-[0.15em] text-neutral-400">
                <th colSpan={2} className="px-2 pt-2 text-left font-semibold">{data.season} · {p.league}</th>
                {groups.map((g) => <th key={g.group} colSpan={g.cols.length} className="border-l border-neutral-100 px-2 pt-2 text-center font-semibold dark:border-white/10">{g.group}</th>)}
                <th />
              </tr>
              <tr>
                <th className="w-8 px-2 py-2.5 text-right font-semibold">#</th>
                <th className="sticky left-0 z-20 bg-white/95 px-2 py-2.5 text-left font-semibold backdrop-blur dark:bg-neutral-950/90"><SortLink label="선수" k="name" p={p} url={url} /></th>
                {cols.map((c) => <th key={c.key} className="px-2 py-2.5 text-right font-semibold"><SortLink label={c.label} k={c.key} p={p} url={url} col={c} /></th>)}
                <th className="w-14 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {pageRows.map((r, i) => {
                const photo = photoOf(r), href = hrefOf(r);
                const inCmp = p.cmp.includes(r.key);
                return (
                  <tr key={r.key} className={`${inCmp ? "bg-rose-50/60 dark:bg-white/[0.05]" : "hover:bg-neutral-50 dark:hover:bg-white/[0.03]"} ${r.qualified ? "" : "opacity-70"}`}>
                    <td className="px-2 py-1.5 text-right text-xs tabular-nums text-neutral-400">{(safePage - 1) * PER + i + 1}</td>
                    <td className="sticky left-0 z-[1] bg-white/95 px-2 py-1.5 backdrop-blur dark:bg-neutral-950/90">
                      <div className="flex items-center gap-2.5">
                        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                          {photo && <img src={photo} alt="" className="h-full w-full object-cover object-top" loading="lazy" />}
                        </span>
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate font-semibold">{href ? <Link href={href} className="hover:underline underline-offset-4">{r.name}</Link> : r.name}</span>
                          <span className="block truncate text-[11px] text-neutral-500">{r.team}{!r.qualified && " · 규정 미달"}</span>
                        </span>
                      </div>
                    </td>
                    {cols.map((c) => {
                      const cell = r.cells[c.key];
                      return (
                        <td key={c.key} className={`px-2 py-1.5 text-right tabular-nums ${cellBg(cell.pct)}`}>
                          <span className="block font-semibold">{formatStat(cell.value, c, p.unit)}</span>
                          <span className={`block text-[10px] leading-none ${pctCls(cell.pct)}`}>{cell.pct ?? "—"}</span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right">
                      <Link href={url({ cmp: inCmp ? p.cmp.filter((k) => k !== r.key) : [...p.cmp, r.key].slice(-2) })} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${inCmp ? "bg-rose-500 text-white ring-rose-500" : "text-neutral-500 ring-black/10 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"}`}>
                        {inCmp ? "담김" : "비교"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && <tr><td colSpan={cols.length + 3} className="px-4 py-10 text-center text-sm text-neutral-500">조건에 맞는 선수가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        )}

        {pages > 1 && (p.view === "table" || p.view === "cards") && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - safePage) <= 2).map((n, i, arr) => (
              <span key={n} className="flex items-center gap-1.5">
                {i > 0 && arr[i - 1] !== n - 1 && <span className="text-neutral-400">…</span>}
                <Link href={url({ page: n })} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${n === safePage ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white" : "text-neutral-600 ring-black/10 hover:bg-white dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"}`}>{n}</Link>
              </span>
            ))}
          </div>
        )}
        <p className="mt-6 text-[11px] leading-relaxed text-neutral-400 break-keep">
          출처: KBO·NPB 공식, MLB Stats API (매일 갱신). 백분위는 같은 리그·같은 역할의 규정 선수끼리 비교한 값이며, 규정 미달 선수는 표에 남기되 백분위를 매기지 않는다.
          경기당은 합계 계열(안타·홈런·타점·이닝·탈삼진·승·패·세이브)만 출장 경기로 나눈 값이다.
          {p.league === "MLB" && " MLB 확장 열 wOBA(FanGraphs 선형가중치)·ISO·BB%·K% / FIP(상수 3.15 고정)·K%·BB%·HR/9 는 MLB Stats API 시즌 성분에서 계산."}
        </p>
      </div>
    </div>
  );
}

function SortLink({ label, k, p, url, col }: { label: string; k: string; p: { sort: string; dir: "asc" | "desc" }; url: (o: { sort?: string; dir?: "asc" | "desc"; page?: number }) => string; col?: StatColumn }) {
  const active = p.sort === k;
  // 첫 클릭 = 그 열의 "좋은 순"(낮을수록 좋은 열은 오름차순), 다시 클릭 = 반대
  const goodDir: "asc" | "desc" = k === "name" ? "asc" : col?.lowerIsBetter ? "asc" : "desc";
  const next: "asc" | "desc" = active ? (p.dir === "asc" ? "desc" : "asc") : goodDir;
  return (
    <Link href={url({ sort: k, dir: next, page: 1 })} className={`inline-flex items-center gap-0.5 hover:text-neutral-800 dark:hover:text-neutral-200 ${active ? "text-rose-600 dark:text-rose-400" : ""}`}>
      {label}
      {active && (p.dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
    </Link>
  );
}
