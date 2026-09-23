// 축구 선수 스탯 마스터 표 — 리그별 현재 시즌 전 선수, 셀마다 리그 백분위(규정 = 분 40%), 합계·90분당, 포지션·팀·검색, 정렬, 비교 2명.
// 야구 표(/baseball/stats)와 같은 문법. 서버 렌더 + 쿼리스트링. 계산: src/lib/sports/soccer/stats-table.ts · 로더: stats-data.ts
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Table2 } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { formatStat, sortStatRows, type StatColumn, type StatRow } from "@/lib/sports/baseball/stats-table";
import { buildSoccerStatRows, columnsForPos, type SoccerPos, type SoccerUnit } from "@/lib/sports/soccer/stats-table";
import { getSoccerStatsData, SOCCER_STATS_LEAGUES, type SoccerStatsLeague } from "@/lib/sports/soccer/stats-data";

export const dynamic = "force-dynamic";

const PER = 50;
const POS_KO: Record<SoccerPos, string> = { ALL: "필드 전체", G: "GK", D: "DF", M: "MF", F: "FW" };
const UNIT_KO: Record<SoccerUnit, string> = { total: "합계", per90: "90분당" };
type SP = { league?: string; pos?: string; unit?: string; team?: string; q?: string; sort?: string; dir?: string; page?: string; qual?: string; cmp?: string };

function parse(sp: SP) {
  const league: SoccerStatsLeague = (SOCCER_STATS_LEAGUES as readonly string[]).includes(sp.league ?? "") ? (sp.league as SoccerStatsLeague) : "EPL";
  const pos: SoccerPos = (["G", "D", "M", "F"] as string[]).includes(sp.pos ?? "") ? (sp.pos as SoccerPos) : "ALL";
  const unit: SoccerUnit = sp.unit === "per90" ? "per90" : "total";
  const cols = columnsForPos(pos);
  const defaultSort = pos === "G" ? "saves" : "goals";
  const sort = cols.some((c) => c.key === sp.sort) || sp.sort === "name" ? (sp.sort as string) : defaultSort;
  const sortCol = cols.find((c) => c.key === sort);
  const dir: "asc" | "desc" = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : sortCol?.lowerIsBetter ? "asc" : "desc";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const qual = sp.qual !== "0";
  const cmp = (sp.cmp ?? "").split(",").filter(Boolean).slice(0, 2);
  return { league, pos, unit, team: sp.team ?? "", q: (sp.q ?? "").trim(), sort, dir, page, qual, cmp, defaultSort };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { league, pos, unit } = parse(await searchParams);
  const lg = LEAGUE_DISPLAY[league] ?? league;
  return {
    title: `${lg} ${POS_KO[pos]} 선수 스탯 표 — 시즌 기록·리그 백분위${unit === "per90" ? " (90분당)" : ""}`,
    description: `${lg} 선수 전원의 시즌 골·도움·슈팅·키패스·태클·평점을 한 표에서 정렬·검색하고 셀마다 리그 백분위를 확인하는 스코어베이스 축구 스탯 표.`,
    alternates: { canonical: `/soccer/stats?league=${league}${pos !== "ALL" ? `&pos=${pos}` : ""}` },
  };
}

export default async function SoccerStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const p = parse(await searchParams);
  const data = await getSoccerStatsData(p.league);
  const cols = columnsForPos(p.pos);
  const built = buildSoccerStatRows(data.rows, p.pos, p.unit);
  const teams = [...new Set(built.rows.map((r) => r.team).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  let rows = built.rows;
  if (p.qual) rows = rows.filter((r) => r.qualified);
  if (p.team) rows = rows.filter((r) => r.team === p.team);
  if (p.q) { const q = p.q.toLowerCase(); rows = rows.filter((r) => r.name.toLowerCase().includes(q)); }
  rows = sortStatRows(rows, p.sort, p.dir);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const safePage = Math.min(p.page, pages);
  const pageRows = rows.slice((safePage - 1) * PER, safePage * PER);
  const cmpRows = p.cmp.map((k) => built.rows.find((r) => r.key === k)).filter((r): r is StatRow => !!r);
  const lgName = LEAGUE_DISPLAY[p.league] ?? p.league;

  const url = (o: Partial<ReturnType<typeof parse>> & { page?: number; cmp?: string[] }) => {
    const n = { ...p, ...o };
    const qs = new URLSearchParams();
    qs.set("league", n.league);
    if (n.pos !== "ALL") qs.set("pos", n.pos);
    if (n.unit !== "total") qs.set("unit", n.unit);
    if (n.team) qs.set("team", n.team);
    if (n.q) qs.set("q", n.q);
    const ds = n.pos === "G" ? "saves" : "goals";
    if (n.sort !== ds) qs.set("sort", n.sort);
    if (o.dir) qs.set("dir", o.dir);
    if (!n.qual) qs.set("qual", "0");
    if ((n.page ?? 1) > 1) qs.set("page", String(n.page));
    if (n.cmp?.length) qs.set("cmp", n.cmp.join(","));
    return `/soccer/stats?${qs}`;
  };
  const photoOf = (r: StatRow) => data.rows.find((x) => x.playerId === r.key)?.photo ?? null;
  const posOf = (r: StatRow) => data.rows.find((x) => x.playerId === r.key)?.pos ?? null;

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${on ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-white dark:text-neutral-300 dark:hover:bg-white/10"}`;
  const pctCls = (pct: number | null) =>
    pct == null ? "text-neutral-300 dark:text-neutral-600" : pct >= 80 ? "text-rose-600 dark:text-rose-400 font-bold" : pct >= 60 ? "text-rose-500/80 dark:text-rose-300/80" : pct >= 40 ? "text-neutral-500" : "text-neutral-400 dark:text-neutral-500";
  const cellBg = (pct: number | null) => (pct == null ? "" : pct >= 80 ? "bg-rose-50 dark:bg-rose-500/10" : pct >= 60 ? "bg-rose-50/50 dark:bg-rose-500/5" : "");

  return (
    <div className="relative min-h-screen">
      <AmbientGlow />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Player Stats
        </div>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
          <Table2 className="h-7 w-7 text-neutral-400" aria-hidden="true" /> 축구 선수 스탯
        </h1>
        <p className="mt-1 text-sm text-neutral-500 break-keep">
          {data.season} 시즌 {lgName} {POS_KO[p.pos]}. 셀 아래 숫자는 규정 표본 안 리그 백분위(높을수록 상위, 실점·경고는 낮을수록 상위).
          규정 = 리그 최다 출전 분의 40% 이상({built.minMinutes}분, {built.qualifiedCount}명).
          {data.ratingCoverage < 0.3 && " 이 리그는 경기 로그 평점이 거의 없어 평점 열이 비어 있다."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Link href="/baseball/stats" className="rounded-full border border-neutral-200 px-3 py-1 font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]">야구 스탯 표</Link>
          <Link href="/transfers?view=power" className="rounded-full border border-neutral-200 px-3 py-1 font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]">선수 랭킹</Link>
          <Link href="/soccer" className="rounded-full border border-neutral-200 px-3 py-1 font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]">축구 허브</Link>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {SOCCER_STATS_LEAGUES.map((l) => <Link key={l} href={url({ league: l, team: "", page: 1, cmp: [] })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${l === p.league ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white" : "text-neutral-600 ring-black/10 hover:bg-white dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"}`}>{LEAGUE_DISPLAY[l] ?? l}</Link>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/10">{(["ALL", "F", "M", "D", "G"] as SoccerPos[]).map((x) => <Link key={x} href={url({ pos: x, sort: x === "G" ? "saves" : "goals", page: 1, cmp: [] })} className={chip(x === p.pos)}>{POS_KO[x]}</Link>)}</div>
          <div className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/10">{(["total", "per90"] as SoccerUnit[]).map((u) => <Link key={u} href={url({ unit: u, page: 1 })} className={chip(u === p.unit)}>{UNIT_KO[u]}</Link>)}</div>
          <Link href={url({ qual: !p.qual, page: 1 })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${p.qual ? "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400" : "text-neutral-500 ring-black/10 dark:ring-white/15"}`}>{p.qual ? "규정 선수만" : "전체 선수"}</Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action="/soccer/stats" className="flex items-center gap-1.5">
            <input type="hidden" name="league" value={p.league} />
            {p.pos !== "ALL" && <input type="hidden" name="pos" value={p.pos} />}
            {p.unit !== "total" && <input type="hidden" name="unit" value={p.unit} />}
            {!p.qual && <input type="hidden" name="qual" value="0" />}
            <input name="q" defaultValue={p.q} placeholder="선수 검색" className="w-40 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-800 dark:bg-white/[0.04]" />
            <button type="submit" className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900">검색</button>
          </form>
          <div className="flex flex-wrap gap-1 text-[11px]">
            <Link href={url({ team: "", page: 1 })} className={`rounded-full px-2 py-0.5 ring-1 ${!p.team ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white" : "text-neutral-500 ring-black/10 dark:ring-white/15"}`}>전체</Link>
            {teams.map((t) => <Link key={t} href={url({ team: t, page: 1 })} className={`rounded-full px-2 py-0.5 ring-1 ${p.team === t ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white" : "text-neutral-500 ring-black/10 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"}`}>{t}</Link>)}
          </div>
          <span className="ml-auto text-xs text-neutral-500">{rows.length}명 · {safePage}/{pages} 페이지</span>
        </div>

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
                  <span className="text-xs font-semibold text-neutral-500">{c.label}</span>
                  {cmpRows.map((r) => {
                    const cell = r.cells[c.key];
                    return (
                      <span key={r.key} className="flex items-center gap-2 tabular-nums">
                        <span className="w-14 font-semibold">{formatStat(cell.value, c, p.unit === "per90" ? "pergame" : "total")}</span>
                        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10"><span className="absolute inset-y-0 left-0 rounded-full bg-rose-500/80 dark:bg-rose-400/80" style={{ width: `${cell.pct ?? 0}%` }} /></span>
                        <span className={`w-8 text-right text-[11px] ${pctCls(cell.pct)}`}>{cell.pct ?? "—"}</span>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="sticky top-0 z-10 bg-white/95 text-[11px] tracking-wide text-neutral-500 backdrop-blur dark:bg-neutral-950/90">
              <tr>
                <th className="w-8 px-2 py-2.5 text-right font-semibold">#</th>
                <th className="px-2 py-2.5 text-left font-semibold"><SortLink label="선수" k="name" p={p} url={url} /></th>
                {cols.map((c) => <th key={c.key} className="px-2 py-2.5 text-right font-semibold"><SortLink label={c.label} k={c.key} p={p} url={url} col={c} /></th>)}
                <th className="w-14 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {pageRows.map((r, i) => {
                const photo = photoOf(r), inCmp = p.cmp.includes(r.key), pos = posOf(r);
                return (
                  <tr key={r.key} className={`${inCmp ? "bg-rose-50/60 dark:bg-white/[0.05]" : "hover:bg-neutral-50 dark:hover:bg-white/[0.03]"} ${r.qualified ? "" : "opacity-70"}`}>
                    <td className="px-2 py-1.5 text-right text-xs tabular-nums text-neutral-400">{(safePage - 1) * PER + i + 1}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">{photo && <img src={photo} alt="" className="h-full w-full object-cover object-top" loading="lazy" />}</span>
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate font-semibold"><Link href={`/transfers/${r.key}`} className="hover:underline underline-offset-4">{r.name}</Link></span>
                          <span className="block truncate text-[11px] text-neutral-500">{r.team}{pos ? ` · ${pos}` : ""}{!r.qualified && " · 규정 미달"}</span>
                        </span>
                      </div>
                    </td>
                    {cols.map((c) => {
                      const cell = r.cells[c.key];
                      return (
                        <td key={c.key} className={`px-2 py-1.5 text-right tabular-nums ${cellBg(cell.pct)}`}>
                          <span className="block font-semibold">{formatStat(cell.value, c, p.unit === "per90" ? "pergame" : "total")}</span>
                          <span className={`block text-[10px] leading-none ${pctCls(cell.pct)}`}>{cell.pct ?? "—"}</span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right">
                      <Link href={url({ cmp: inCmp ? p.cmp.filter((k) => k !== r.key) : [...p.cmp, r.key].slice(-2) })} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${inCmp ? "bg-rose-500 text-white ring-rose-500" : "text-neutral-500 ring-black/10 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"}`}>{inCmp ? "담김" : "비교"}</Link>
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && <tr><td colSpan={cols.length + 3} className="px-4 py-10 text-center text-sm text-neutral-500">조건에 맞는 선수가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
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
          출처: TheSports 시즌 기록(하루 단위 갱신)·경기 로그 평점(시즌 시작 7/1 이후 전 대회, 10분 이상 출전 분 가중). 백분위는 같은 리그·같은 포지션 그룹의 규정 선수끼리 비교한 값이며, 규정 미달 선수는 표에 남기되 백분위를 매기지 않는다.
          90분당은 합계 계열(골·도움·슈팅·유효슛·키패스·태클·인터셉트·경고·세이브·실점)만 출전 분으로 환산한 값이다. xG 는 리그별 소스가 달라 열에서 뺐다.
        </p>
      </div>
    </div>
  );
}

function SortLink({ label, k, p, url, col }: { label: string; k: string; p: { sort: string; dir: "asc" | "desc" }; url: (o: { sort?: string; dir?: "asc" | "desc"; page?: number }) => string; col?: StatColumn }) {
  const active = p.sort === k;
  const goodDir: "asc" | "desc" = k === "name" ? "asc" : col?.lowerIsBetter ? "asc" : "desc";
  const next: "asc" | "desc" = active ? (p.dir === "asc" ? "desc" : "asc") : goodDir;
  return (
    <Link href={url({ sort: k, dir: next, page: 1 })} className={`inline-flex items-center gap-0.5 hover:text-neutral-800 dark:hover:text-neutral-200 ${active ? "text-rose-600 dark:text-rose-400" : ""}`}>
      {label}
      {active && (p.dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
    </Link>
  );
}
