// 시장가치 랭킹 — TheSports market value 실데이터.
// 필터: 리그 / 팀 / 포지션. 행 클릭 → 선수 개인페이지(/transfers/[id]).
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
// TheSports 포지션 코드 → 표시 라벨
const POS: { code: string; label: string }[] = [
  { code: "G", label: "GK" },
  { code: "D", label: "DF" },
  { code: "M", label: "MF" },
  { code: "F", label: "FW" },
];
const POS_LABEL: Record<string, string> = { G: "GK", D: "DF", M: "MF", F: "FW" };
const PER = 20;

const EUR_KRW = 1791.5;
function krw(eurM: number): string {
  const eok = (eurM * 1e6 * EUR_KRW) / 1e8;
  if (eok >= 10000) return (eok / 10000).toFixed(2) + "조";
  return Math.round(eok).toLocaleString() + "억";
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

interface HistPt { market_value?: number }

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; team?: string; pos?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const league = sp.league && LEAGUES[sp.league] ? sp.league : "EPL";
  const teamFilter = sp.team || "";
  const posFilter = sp.pos && POS_LABEL[sp.pos] ? sp.pos : "";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  // 리그 전체 행(≤919) 을 한 번에 — 팀/포지션 필터는 앱단에서 (소규모라 안전).
  // 최신성 필터: 마지막 몸값 갱신이 18개월 이내인 선수만 노출. stale 데이터(빅5 떠난·은퇴
  // 선수의 박제된 몸값, 예: 은퇴 크로스 €10M)를 랭킹에서 배제 → "현재 시장가치" 정합성 +
  // 이름 없는 비활성 선수 placeholder 대량 제거. history 마지막 원소 market_time 으로 판정.
  const cutoff = Math.floor(Date.now() / 1000) - 18 * 30 * 86400;
  const allRows = (
    await prisma.playerMarketValue.findMany({
      where: { league, currentValue: { not: null } },
      orderBy: { currentValue: "desc" },
    })
  ).filter((r) => {
    const h = Array.isArray(r.history) ? (r.history as { market_time?: number }[]) : [];
    const last = h[h.length - 1];
    return last?.market_time != null && last.market_time >= cutoff;
  });
  const ids = allRows.map((r) => r.id);
  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: ids } },
    select: { id: true, nameKo: true, name: true, photoUrl: true, position: true },
  });
  const pMap = new Map(players.map((p) => [p.id, p]));

  // ts team id → 우리 Team
  const teamIds = [...new Set(allRows.map((r) => r.teamId).filter((x): x is string => !!x))];
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

  // 행 enrich
  const enriched = allRows.map((r) => {
    const ourId = r.teamId ? tsToOur.get(r.teamId) : undefined;
    const team = ourId != null ? teamMap.get(ourId) : undefined;
    const tsp = pMap.get(r.id);
    const hist = Array.isArray(r.history) ? (r.history as HistPt[]) : [];
    return {
      id: r.id,
      name: tsp?.nameKo || tsp?.name || "선수",
      value: Math.round((r.currentValue || 0) / 1e6),
      age: r.age,
      position: tsp?.position || null,
      ourTeamId: ourId ?? null,
      teamName: team?.name || "—",
      teamLogo: team?.logoUrl || null,
      photo: tsp?.photoUrl || null,
      hist: hist.map((h) => (h?.market_value || 0) / 1e6).filter((v) => v > 0),
    };
  });

  // 팀 드롭다운 목록 (리그 내 등장 팀 + 인원수)
  const teamCount = new Map<number, { name: string; count: number }>();
  for (const e of enriched) {
    if (e.ourTeamId != null) {
      const cur = teamCount.get(e.ourTeamId) || { name: e.teamName, count: 0 };
      cur.count++;
      teamCount.set(e.ourTeamId, cur);
    }
  }
  const teamList = [...teamCount.entries()]
    .map(([id, v]) => ({ id, name: v.name, count: v.count }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  // 필터 적용
  let filtered = enriched;
  if (teamFilter) filtered = filtered.filter((e) => String(e.ourTeamId) === teamFilter);
  if (posFilter) filtered = filtered.filter((e) => e.position === posFilter);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER));
  const safePage = Math.min(page, totalPages);
  const data = filtered.slice((safePage - 1) * PER, safePage * PER).map((e, i) => ({
    ...e,
    rank: (safePage - 1) * PER + i + 1,
  }));

  // URL 빌더 — 현재 필터 유지, over 로 덮어쓰기(undefined = 해제)
  const buildUrl = (over: { league?: string; team?: string; pos?: string; page?: string }) => {
    const merged: { league?: string; team?: string; pos?: string; page?: string } = {
      league, team: teamFilter, pos: posFilter, ...over,
    };
    const params = new URLSearchParams();
    if (merged.league) params.set("league", merged.league);
    if (merged.team) params.set("team", merged.team);
    if (merged.pos) params.set("pos", merged.pos);
    if (merged.page && merged.page !== "1") params.set("page", merged.page);
    const qs = params.toString();
    return `/transfers${qs ? `?${qs}` : ""}`;
  };

  const teamLabel = teamFilter ? teamList.find((t) => String(t.id) === teamFilter)?.name : null;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <p className="text-sm text-neutral-500 mb-1">이적시장 · 시장가치</p>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">💰 {LEAGUES[league]} 시장가치</h1>
      <p className="mt-2 text-sm text-neutral-500">
        선수 몸값 랭킹과 <strong className="text-neutral-700 dark:text-neutral-300">변동 추이</strong>. TheSports 데이터 기반 · 최근 18개월 활성 {totalCount}명.
      </p>

      {/* 필터 — 리그 / 팀 */}
      <div className="flex flex-wrap gap-2 mt-5">
        <details className="relative">
          <summary className="flex items-center gap-1.5 cursor-pointer list-none px-4 py-2 rounded-xl text-sm font-bold border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 [&::-webkit-details-marker]:hidden">
            <span className="text-neutral-400 text-xs font-normal">리그</span>
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
            <span className="text-neutral-400 text-xs font-normal">팀</span>
            <span className={teamLabel ? "text-cyan-600 dark:text-cyan-400" : ""}>{teamLabel || "전체"}</span>
            <span className="text-neutral-400 text-xs">▾</span>
          </summary>
          <div className="absolute z-20 mt-1.5 w-56 max-h-80 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl py-1">
            <Link
              href={buildUrl({ team: undefined, page: undefined })}
              className={`block px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${!teamFilter ? "font-bold text-cyan-600 dark:text-cyan-400" : "text-neutral-600 dark:text-neutral-300"}`}
            >
              전체 팀
            </Link>
            {teamList.map((t) => (
              <Link
                key={t.id}
                href={buildUrl({ team: String(t.id), page: undefined })}
                className={`flex justify-between gap-2 px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  String(t.id) === teamFilter ? "font-bold text-cyan-600 dark:text-cyan-400" : "text-neutral-600 dark:text-neutral-300"
                }`}
              >
                <span className="truncate">{t.name}</span>
                <span className="text-xs text-neutral-400 shrink-0">{t.count}</span>
              </Link>
            ))}
          </div>
        </details>
      </div>

      {/* 포지션 칩 */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        <Link
          href={buildUrl({ pos: undefined, page: undefined })}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
            !posFilter ? "bg-cyan-600 text-white border-cyan-600" : "border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          전체
        </Link>
        {POS.map((p) => (
          <Link
            key={p.code}
            href={buildUrl({ pos: p.code, page: undefined })}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
              posFilter === p.code ? "bg-cyan-600 text-white border-cyan-600" : "border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* 랭킹 리스트 */}
      {data.length === 0 ? (
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
                className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
              >
                <div className={`w-7 text-center font-bold tabular-nums shrink-0 ${p.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{p.rank}</div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{p.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate flex items-center gap-1.5">
                    {p.name}
                    {p.position && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-500 shrink-0">
                        {POS_LABEL[p.position]}
                      </span>
                    )}
                  </div>
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
              </Link>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-5">
          {safePage > 1 && (
            <Link href={buildUrl({ page: String(safePage - 1) })} className="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">‹</Link>
          )}
          {pageNums(safePage, totalPages).map((n, i) =>
            typeof n === "number" ? (
              <Link
                key={i}
                href={buildUrl({ page: String(n) })}
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
            <Link href={buildUrl({ page: String(safePage + 1) })} className="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">›</Link>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-neutral-400 text-center">{safePage}/{totalPages} 페이지 · TheSports 몸값 데이터</p>
    </main>
  );
}
