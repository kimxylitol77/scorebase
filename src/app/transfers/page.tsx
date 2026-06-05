// 시장가치 랭킹 — TheSports market value 실데이터. 20명씩 페이지네이션.
import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const LEAGUES: Record<string, string> = {
  EPL: "EPL",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
};
const SORTS = ["금액순", "포지션", "최근이적"];
const PER = 20;

const EUR_KRW = 1791.5;
function krw(eurM: number): string {
  const eok = (eurM * 1e6 * EUR_KRW) / 1e8;
  if (eok >= 10000) return (eok / 10000).toFixed(2) + "조";
  return Math.round(eok).toLocaleString() + "억";
}

// 페이지 번호 윈도우: 1 … (cur±2) … total
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

interface HistPt { market_value?: number }

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ league?: string; page?: string }> }) {
  const sp = await searchParams;
  const league = sp.league && LEAGUES[sp.league] ? sp.league : "EPL";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const totalCount = await prisma.playerMarketValue.count({ where: { league, currentValue: { not: null } } });
  const totalPages = Math.max(1, Math.ceil(totalCount / PER));
  const rows = await prisma.playerMarketValue.findMany({
    where: { league, currentValue: { not: null } },
    orderBy: { currentValue: "desc" },
    skip: (page - 1) * PER,
    take: PER,
  });
  const ids = rows.map((r) => r.id);
  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: ids } },
    select: { id: true, nameKo: true, name: true },
  });
  const nameMap = new Map(players.map((p) => [p.id, p.nameKo || p.name]));
  const teamIds = [...new Set(rows.map((r) => r.teamId).filter((x): x is string => !!x))];
  const tsT = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: teamIds } },
    select: { externalId: true, teamId: true },
  });
  const tsToOur = new Map(tsT.map((t) => [t.externalId, t.teamId]));
  const ourTeams = await prisma.team.findMany({
    where: { id: { in: [...new Set(tsToOur.values())] } },
    select: { id: true, name: true, logoUrl: true },
  });
  const teamMap = new Map(ourTeams.map((t) => [t.id, t]));

  const data = rows.map((r, i) => {
    const ourId = r.teamId ? tsToOur.get(r.teamId) : undefined;
    const team = ourId != null ? teamMap.get(ourId) : undefined;
    const hist = Array.isArray(r.history) ? (r.history as HistPt[]) : [];
    return {
      rank: (page - 1) * PER + i + 1,
      name: nameMap.get(r.id) || "선수",
      value: Math.round((r.currentValue || 0) / 1e6),
      age: r.age,
      teamName: team?.name || "—",
      teamLogo: team?.logoUrl || null,
      hist: hist.map((h) => (h?.market_value || 0) / 1e6).filter((v) => v > 0),
    };
  });

  const linkBase = `/transfers?league=${league}`;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <p className="text-sm text-neutral-500 mb-1">이적시장 · 시장가치</p>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">💰 {LEAGUES[league]} 시장가치</h1>
      <p className="mt-2 text-sm text-neutral-500">
        선수 몸값 랭킹과 <strong className="text-neutral-700 dark:text-neutral-300">변동 추이</strong>. TheSports 데이터 기반 · 총 {totalCount}명.
      </p>

      {/* 토글 메뉴 — 리그 선택 + 정렬 */}
      <div className="flex flex-wrap gap-2 mt-5">
        <details className="relative">
          <summary className="flex items-center gap-1.5 cursor-pointer list-none px-4 py-2 rounded-xl text-sm font-bold border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 [&::-webkit-details-marker]:hidden">
            <span className="text-cyan-600 dark:text-cyan-400">{LEAGUES[league]}</span>
            <span className="text-neutral-400 text-xs">▾</span>
          </summary>
          <div className="absolute z-20 mt-1.5 w-44 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden py-1">
            {Object.entries(LEAGUES).map(([code, label]) => (
              <Link
                key={code}
                href={`/transfers?league=${code}`}
                className={`block w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  code === league ? "font-bold text-cyan-600 dark:text-cyan-400" : "text-neutral-600 dark:text-neutral-300"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </details>

        <details className="relative">
          <summary className="flex items-center gap-1.5 cursor-pointer list-none px-4 py-2 rounded-xl text-sm font-bold border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 [&::-webkit-details-marker]:hidden">
            <span className="text-neutral-400 text-xs font-normal">정렬</span>
            <span>금액순</span>
            <span className="text-neutral-400 text-xs">▾</span>
          </summary>
          <div className="absolute z-20 mt-1.5 w-40 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden py-1">
            {SORTS.map((s, i) => (
              <button
                key={s}
                className={`block w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  i === 0 ? "font-bold text-cyan-600 dark:text-cyan-400" : "text-neutral-600 dark:text-neutral-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </details>
      </div>

      {/* 랭킹 리스트 */}
      {data.length === 0 ? (
        <p className="text-sm text-neutral-500 py-20 text-center">데이터가 없습니다.</p>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 divide-y divide-neutral-100 dark:divide-neutral-800/70 mt-4">
          {data.map((p) => {
            const prevV = p.hist.length >= 2 ? p.hist[p.hist.length - 2] : 0;
            const chg = prevV > 0 ? Math.round(((p.value - prevV) / prevV) * 100) : 0;
            const up = chg >= 0;
            return (
              <div key={p.rank} className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition">
                <div className={`w-7 text-center font-bold tabular-nums shrink-0 ${p.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{p.rank}</div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10 text-sm font-bold text-neutral-500 dark:text-neutral-400">
                  {p.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{p.name}</div>
                  <div className="text-xs text-neutral-500 truncate flex items-center gap-1">
                    {p.teamLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.teamLogo} alt="" className="w-3.5 h-3.5 object-contain inline-block" />
                    )}
                    {p.teamName}{p.age ? ` · ${p.age}세` : ""}
                  </div>
                </div>
                <Spark data={p.hist} />
                <div className="text-right w-[92px] shrink-0 leading-tight">
                  <div className="font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">€{p.value}M</div>
                  <div className="text-[11px] text-neutral-500 tabular-nums">{krw(p.value)}</div>
                  {p.hist.length >= 2 && (
                    <div className={`text-[11px] font-semibold tabular-nums ${up ? "text-emerald-500" : "text-rose-500"}`}>
                      {up ? "▲" : "▼"} {Math.abs(chg)}%
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-5">
          {page > 1 && (
            <Link href={`${linkBase}&page=${page - 1}`} className="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">‹</Link>
          )}
          {pageNums(page, totalPages).map((n, i) =>
            typeof n === "number" ? (
              <Link
                key={i}
                href={`${linkBase}&page=${n}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                  n === page
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
          {page < totalPages && (
            <Link href={`${linkBase}&page=${page + 1}`} className="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">›</Link>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-neutral-400 text-center">{page}/{totalPages} 페이지 · TheSports 몸값 데이터</p>
    </main>
  );
}
