// 스탯 마스터 표 공용 탐색기(서버 컴포넌트) — 야구·축구·하키·농구·e스포츠 페이지가 데이터와 필 구성만 넘긴다.
// 표/카드/리더/산점도 뷰, 열 묶음 헤더, 용어 설명, 정렬, 팀 칩, 검색, 규정 토글, 비교 2명, 페이지네이션을 여기서 처리.
// 상태는 전부 쿼리스트링(view·sort·dir·page·qual·cmp·team·q·x·y) — 클라이언트 JS 없음.
import Link from "next/link";
import { ArrowDown, ArrowUp, Table2 } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import { formatStat, sortStatRows, type StatColumn, type StatRow, type StatUnit } from "@/lib/sports/baseball/stats-table";
import { jsonLdScript } from "@/lib/seo/jsonld";
import StatsGlossary from "./StatsGlossary";
import StatsLeaders from "./StatsLeaders";
import StatsCards from "./StatsCards";
import StatsScatter from "./StatsScatter";
import { cellBg, columnGroups, pctCls, STATS_VIEW_KO, type StatsView, type StatsViewRow } from "./types";

const PER = 50;

export interface PillGroup {
  /** 쿼리 파라미터 이름 */
  param: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  /** 바꾸면 초기화할 파라미터 (팀·비교 등) */
  resets?: string[];
  /** 스타일: 필 그룹(기본) / 칩 나열(리그처럼 많을 때) */
  style?: "pills" | "chips";
}

export interface StatsExplorerProps {
  basePath: string;
  eyebrow: string;
  title: string;
  /** 제목 아래 한 줄 (시즌·리그·규정 설명) */
  subtitle: string;
  /** 상단 이동 링크 */
  links: Array<{ href: string; label: string }>;
  pills: PillGroup[];
  /** 현재 파라미터 전체 (url 재구성용). pills 의 param 도 포함 */
  params: Record<string, string>;
  cols: StatColumn[];
  rows: StatRow[];
  unit: StatUnit;
  /** 행 → 사진·링크·부제 */
  decorate: (r: StatRow) => { photo: string | null; href: string | null; sub: string };
  defaultSort: string;
  scatterDefault: { x: string; y: string };
  qualifiedCount: number;
  glossaryNote?: string;
  footnote: string;
  /** 페이지가 만든 JSON-LD(BreadcrumbList·Dataset) — 검색·AI 인용용 */
  jsonLd?: unknown[];
  /** 표 좌상단 라벨 (시즌 · 리그) */
  corner: string;
}

export default function StatsExplorer(p: StatsExplorerProps) {
  const q = (p.params.q ?? "").trim();
  const team = p.params.team ?? "";
  const qual = p.params.qual !== "0";
  const view: StatsView = (["cards", "leaders", "scatter"] as string[]).includes(p.params.view ?? "") ? (p.params.view as StatsView) : "table";
  const sort = p.cols.some((c) => c.key === p.params.sort) || p.params.sort === "name" ? (p.params.sort as string) : p.defaultSort;
  const sortCol = p.cols.find((c) => c.key === sort);
  const dir: "asc" | "desc" = p.params.dir === "asc" || p.params.dir === "desc" ? (p.params.dir as "asc" | "desc") : sortCol?.lowerIsBetter ? "asc" : "desc";
  const page = Math.max(1, parseInt(p.params.page ?? "1") || 1);
  const cmp = (p.params.cmp ?? "").split(",").filter(Boolean).slice(0, 2);
  const x = p.cols.some((c) => c.key === p.params.x) ? (p.params.x as string) : p.scatterDefault.x;
  const y = p.cols.some((c) => c.key === p.params.y) ? (p.params.y as string) : p.scatterDefault.y;

  const teams = [...new Set(p.rows.map((r) => r.team).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  let rows = p.rows;
  if (qual) rows = rows.filter((r) => r.qualified);
  if (team) rows = rows.filter((r) => r.team === team);
  if (q) { const s = q.toLowerCase(); rows = rows.filter((r) => r.name.toLowerCase().includes(s) || (r.nameEn ?? "").toLowerCase().includes(s)); }
  rows = sortStatRows(rows, sort, dir);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const safePage = Math.min(page, pages);
  const viewRows: StatsViewRow[] = rows.map((r) => ({ ...r, ...p.decorate(r) }));
  const pageRows = viewRows.slice((safePage - 1) * PER, safePage * PER);
  const cmpRows = cmp.map((k) => p.rows.find((r) => r.key === k)).filter((r): r is StatRow => !!r).map((r) => ({ ...r, ...p.decorate(r) }));
  const groups = columnGroups(p.cols);

  const url = (o: Record<string, string | number | string[] | undefined>) => {
    const n: Record<string, string> = { ...p.params, view, sort, dir, page: String(page), qual: qual ? "1" : "0", cmp: cmp.join(","), x, y, team, q };
    for (const [k, v] of Object.entries(o)) n[k] = Array.isArray(v) ? v.join(",") : v == null ? "" : String(v);
    const qs = new URLSearchParams();
    for (const g of p.pills) if (n[g.param]) qs.set(g.param, n[g.param]);
    if (n.view && n.view !== "table") qs.set("view", n.view);
    if (n.view === "scatter") { qs.set("x", n.x); qs.set("y", n.y); }
    if (n.team) qs.set("team", n.team);
    if (n.q) qs.set("q", n.q);
    if (n.sort && n.sort !== p.defaultSort) qs.set("sort", n.sort);
    if (o.dir) qs.set("dir", String(o.dir));
    if (n.qual === "0") qs.set("qual", "0");
    if (Number(n.page) > 1) qs.set("page", n.page);
    if (n.cmp) qs.set("cmp", n.cmp);
    return `${p.basePath}?${qs}`;
  };
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${on ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-white dark:text-neutral-300 dark:hover:bg-white/10"}`;
  const small = (on: boolean) =>
    `rounded-full px-2 py-0.5 text-[11px] ring-1 ${on ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white" : "text-neutral-500 ring-black/10 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"}`;
  const pillHref = (g: PillGroup, v: string) => {
    const o: Record<string, string | number> = { [g.param]: v, page: 1, cmp: "", sort: p.defaultSort };
    for (const r of g.resets ?? []) o[r] = "";
    return url(o);
  };

  return (
    <div className="relative min-h-screen">
      {p.jsonLd?.map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(d) }} />)}
      <AmbientGlow />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> {p.eyebrow}
        </div>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
          <Table2 className="h-7 w-7 text-neutral-400" aria-hidden="true" /> {p.title}
        </h1>
        <p className="mt-1 text-sm text-neutral-500 break-keep">{p.subtitle}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {p.links.map((l) => <Link key={l.href} href={l.href} className="rounded-full border border-neutral-200 px-3 py-1 font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]">{l.label}</Link>)}
        </div>

        {p.pills.filter((g) => g.style === "chips").map((g) => (
          <div key={g.param} className="mt-5 flex flex-wrap gap-1.5">
            {g.options.map((o) => <Link key={o.value} href={pillHref(g, o.value)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${o.value === g.value ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white" : "text-neutral-600 ring-black/10 hover:bg-white dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"}`}>{o.label}</Link>)}
          </div>
        ))}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.pills.filter((g) => g.style !== "chips").map((g) => (
            <div key={g.param} className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/10">
              {g.options.map((o) => <Link key={o.value} href={pillHref(g, o.value)} className={chip(o.value === g.value)}>{o.label}</Link>)}
            </div>
          ))}
          <Link href={url({ qual: qual ? "0" : "1", page: 1 })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${qual ? "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400" : "text-neutral-500 ring-black/10 dark:ring-white/15"}`}>{qual ? "규정 선수만" : "전체 선수"}</Link>
          <div className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/10">{(Object.keys(STATS_VIEW_KO) as StatsView[]).map((v) => <Link key={v} href={url({ view: v, page: 1 })} className={chip(v === view)}>{STATS_VIEW_KO[v]}</Link>)}</div>
        </div>
        <StatsGlossary cols={p.cols} note={p.glossaryNote} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={p.basePath} className="flex items-center gap-1.5">
            {p.pills.map((g) => g.value && <input key={g.param} type="hidden" name={g.param} value={g.value} />)}
            {!qual && <input type="hidden" name="qual" value="0" />}
            {view !== "table" && <input type="hidden" name="view" value={view} />}
            {team && <input type="hidden" name="team" value={team} />}
            <input name="q" defaultValue={q} placeholder="선수 검색" className="w-40 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-800 dark:bg-white/[0.04]" />
            <button type="submit" className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900">검색</button>
          </form>
          <div className="flex flex-wrap gap-1 text-[11px]">
            <Link href={url({ team: "", page: 1 })} className={small(!team)}>전체</Link>
            {teams.map((t) => <Link key={t} href={url({ team: t, page: 1 })} className={small(team === t)}>{t}</Link>)}
          </div>
          <span className="ml-auto text-xs text-neutral-500">{rows.length}명 · {safePage}/{pages} 페이지</span>
        </div>

        {cmpRows.length > 0 && (
          <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">선수 비교 {cmpRows.length < 2 && <span className="ml-1 text-xs font-normal text-neutral-500">한 명 더 담으면 나란히 봅니다</span>}</h2>
              <Link href={url({ cmp: "" })} className="text-xs text-neutral-500 hover:underline">비우기</Link>
            </div>
            <div className="mt-3 grid gap-x-6 gap-y-1.5 text-sm" style={{ gridTemplateColumns: `6rem repeat(${cmpRows.length}, minmax(0, 1fr))` }}>
              <span />
              {cmpRows.map((r) => <span key={r.key} className="truncate font-semibold">{r.name} <span className="text-xs font-normal text-neutral-500">{r.sub}</span></span>)}
              {p.cols.map((c) => (
                <div key={c.key} className="contents">
                  <span className="text-xs font-semibold text-neutral-500">{c.label}</span>
                  {cmpRows.map((r) => {
                    const cell = r.cells[c.key];
                    return (
                      <span key={r.key} className="flex items-center gap-2 tabular-nums">
                        <span className="w-14 font-semibold">{formatStat(cell?.value ?? null, c, p.unit)}</span>
                        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10"><span className="absolute inset-y-0 left-0 rounded-full bg-rose-500/80 dark:bg-rose-400/80" style={{ width: `${cell?.pct ?? 0}%` }} /></span>
                        <span className={`w-8 text-right text-[11px] ${pctCls(cell?.pct ?? null)}`}>{cell?.pct ?? "—"}</span>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "leaders" && <StatsLeaders rows={viewRows} cols={p.cols} unit={p.unit} />}
        {view === "cards" && <StatsCards rows={pageRows} cols={p.cols} unit={p.unit} startRank={(safePage - 1) * PER + 1} />}
        {view === "scatter" && <StatsScatter rows={viewRows} cols={p.cols} x={x} y={y} unit={p.unit} highlight={cmp} url={(o) => url({ view: "scatter", ...o })} />}

        {view === "table" && (
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10 bg-white/95 text-[11px] tracking-wide text-neutral-500 backdrop-blur dark:bg-neutral-950/90">
                <tr className="text-[10px] tracking-[0.15em] text-neutral-400">
                  <th colSpan={2} className="px-2 pt-2 text-left font-semibold">{p.corner}</th>
                  {groups.map((g) => <th key={g.group} colSpan={g.cols.length} className="border-l border-neutral-100 px-2 pt-2 text-center font-semibold dark:border-white/10">{g.group}</th>)}
                  <th />
                </tr>
                <tr>
                  <th className="w-8 px-2 py-2.5 text-right font-semibold">#</th>
                  <th className="sticky left-0 z-20 bg-white/95 px-2 py-2.5 text-left font-semibold backdrop-blur dark:bg-neutral-950/90"><SortLink label="선수" k="name" sort={sort} dir={dir} url={url} /></th>
                  {p.cols.map((c) => <th key={c.key} className="px-2 py-2.5 text-right font-semibold"><SortLink label={c.label} k={c.key} sort={sort} dir={dir} url={url} col={c} /></th>)}
                  <th className="w-14 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
                {pageRows.map((r, i) => {
                  const inCmp = cmp.includes(r.key);
                  return (
                    <tr key={r.key} className={`${inCmp ? "bg-rose-50/60 dark:bg-white/[0.05]" : "hover:bg-neutral-50 dark:hover:bg-white/[0.03]"} ${r.qualified ? "" : "opacity-70"}`}>
                      <td className="px-2 py-1.5 text-right text-xs tabular-nums text-neutral-400">{(safePage - 1) * PER + i + 1}</td>
                      <td className="sticky left-0 z-[1] bg-white/95 px-2 py-1.5 backdrop-blur dark:bg-neutral-950/90">
                        <div className="flex items-center gap-2.5">
                          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">{r.photo && <img src={r.photo} alt="" className="h-full w-full object-cover object-top" loading="lazy" />}</span>
                          <span className="min-w-0 leading-tight">
                            <span className="block truncate font-semibold">{r.href ? <Link href={r.href} className="hover:underline underline-offset-4">{r.name}</Link> : r.name}</span>
                            <span className="block truncate text-[11px] text-neutral-500">{r.sub}{!r.qualified && " · 규정 미달"}</span>
                          </span>
                        </div>
                      </td>
                      {p.cols.map((c) => {
                        const cell = r.cells[c.key];
                        return (
                          <td key={c.key} className={`px-2 py-1.5 text-right tabular-nums ${cellBg(cell?.pct ?? null)}`}>
                            <span className="block font-semibold">{formatStat(cell?.value ?? null, c, p.unit)}</span>
                            <span className={`block text-[10px] leading-none ${pctCls(cell?.pct ?? null)}`}>{cell?.pct ?? "—"}</span>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right">
                        <Link href={url({ cmp: inCmp ? cmp.filter((k) => k !== r.key) : [...cmp, r.key].slice(-2) })} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${inCmp ? "bg-rose-500 text-white ring-rose-500" : "text-neutral-500 ring-black/10 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"}`}>{inCmp ? "담김" : "비교"}</Link>
                      </td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 && <tr><td colSpan={p.cols.length + 3} className="px-4 py-10 text-center text-sm text-neutral-500">조건에 맞는 선수가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (view === "table" || view === "cards") && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - safePage) <= 2).map((n, i, arr) => (
              <span key={n} className="flex items-center gap-1.5">
                {i > 0 && arr[i - 1] !== n - 1 && <span className="text-neutral-400">…</span>}
                <Link href={url({ page: n })} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${n === safePage ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white" : "text-neutral-600 ring-black/10 hover:bg-white dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"}`}>{n}</Link>
              </span>
            ))}
          </div>
        )}
        <p className="mt-6 text-[11px] leading-relaxed text-neutral-400 break-keep">{p.footnote}</p>
      </div>
    </div>
  );
}

function SortLink({ label, k, sort, dir, url, col }: { label: string; k: string; sort: string; dir: "asc" | "desc"; url: (o: Record<string, string | number>) => string; col?: StatColumn }) {
  const active = sort === k;
  const goodDir: "asc" | "desc" = k === "name" ? "asc" : col?.lowerIsBetter ? "asc" : "desc";
  const next: "asc" | "desc" = active ? (dir === "asc" ? "desc" : "asc") : goodDir;
  return (
    <Link href={url({ sort: k, dir: next, page: 1 })} className={`inline-flex items-center gap-0.5 hover:text-neutral-800 dark:hover:text-neutral-200 ${active ? "text-rose-600 dark:text-rose-400" : ""}`}>
      {label}
      {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
    </Link>
  );
}
